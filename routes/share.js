const express = require('express');
const router = express.Router();
const db = require('../database');
const { ensureAuthenticated } = require('../middleware/authMiddleware');
const { auditLog } = require('../utils/logger');

router.use(ensureAuthenticated);

// Share file
router.post('/file', (req, res) => {
    const { fileId, username, permission } = req.body;
    const ownerId = req.session.userId;

    if (!fileId || !username) {
        req.flash('error_msg', 'Missing file or username');
        return res.redirect('/dashboard');
    }

    // Validate ownership
    db.get('SELECT id, original_name FROM files WHERE id = ? AND uploaded_by = ?', [fileId, ownerId], (err, file) => {
        if (err || !file) {
            req.flash('error_msg', 'File not found or you are not the owner');
            return res.redirect('/dashboard');
        }

        // Find user to share with
        db.get('SELECT id FROM users WHERE username = ?', [username], (err, targetUser) => {
            if (err || !targetUser) {
                req.flash('error_msg', `User "${username}" not found`);
                return res.redirect('/dashboard');
            }

            if (targetUser.id === ownerId) {
                req.flash('error_msg', 'You cannot share a file with yourself');
                return res.redirect('/dashboard');
            }

            // Check if already shared
            db.get(`SELECT id FROM file_shares WHERE file_id = ? AND shared_with_id = ?`, [fileId, targetUser.id], (err, existingShare) => {
                if (existingShare) {
                    // Update existing
                    db.run(`UPDATE file_shares SET permission = ? WHERE id = ?`, [permission || 'view', existingShare.id], (updErr) => {
                        if (updErr) {
                            console.error("Share Update Error:", updErr);
                            req.flash('error_msg', 'Could not update share');
                        } else {
                            req.flash('success_msg', `Updated permissions for ${username}`);
                        }
                        return res.redirect('/dashboard');
                    });
                } else {
                    // Insert new
                    db.run(`INSERT INTO file_shares (file_id, shared_with_id, permission) VALUES (?, ?, ?)`,
                        [fileId, targetUser.id, permission || 'view'], (insertErr) => {
                            if (insertErr) {
                                console.error("Share Insert Error:", insertErr);
                                req.flash('error_msg', 'Could not share file');
                                return res.redirect('/dashboard');
                            }

                            // Create notification
                            db.run(`INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)`,
                                [targetUser.id, `${req.session.username} shared "${file.original_name}" with you. <a href="/share/shared-with-me">View shared files</a>.`, 'share']);

                            auditLog(ownerId, 'FILE_SHARE', `Shared file ${file.original_name} (${fileId}) with ${username}`, req);
                            req.flash('success_msg', `File shared successfully with ${username}`);
                            return res.redirect('/dashboard');
                        });
                }
            });
        });
    });
});

// View shared files
router.get('/shared-with-me', (req, res) => {
    const userId = req.session.userId;
    db.all(`
        SELECT f.*, u.username as owner_name, s.permission, s.shared_at 
        FROM files f 
        JOIN file_shares s ON f.id = s.file_id 
        JOIN users u ON f.uploaded_by = u.id
        WHERE s.shared_with_id = ?`, [userId], (err, files) => {
        res.render('share/shared-with-me', { title: 'Shared With Me', files });
    });
});

// Secure View Only
router.get('/view/:id', (req, res) => {
    const fileId = req.params.id;
    const userId = req.session.userId;

    // Check if the user has at least 'view' permission for this file
    db.get(`
        SELECT f.*, s.permission, u.username as owner_name 
        FROM files f
        JOIN file_shares s ON f.id = s.file_id
        JOIN users u ON f.uploaded_by = u.id
        WHERE f.id = ? AND s.shared_with_id = ?
    `, [fileId, userId], (err, file) => {
        if (err || !file) {
            req.flash('error_msg', 'File not found or access denied');
            return res.redirect('/share/shared-with-me');
        }

        // We will pass the file details to the secure-view template.
        // For actual viewing, if it's an image we might want it inline, but for now we'll just show it.
        res.render('share/secure-view', {
            title: 'Secure View: ' + file.original_name,
            file,
            // To render the file, we can provide a secure temporary link or a direct stream.
            // Since this is view only, let's pass a signed URL or stream it directly via another route?
            // Wait, we can stream the file content via a specific endpoint, or just put it in an iframe.
            // Let's create an endpoint that streams the raw content securely if access is validated.
        });
    });
});

// Endpoint to stream the file content securely for the viewer
router.get('/stream/:id', (req, res) => {
    const fileId = req.params.id;
    const userId = req.session.userId;

    db.get(`
        SELECT f.* 
        FROM files f
        JOIN file_shares s ON f.id = s.file_id
        WHERE f.id = ? AND s.shared_with_id = ?
    `, [fileId, userId], (err, file) => {
        if (err || !file) {
            return res.status(403).send('Access denied');
        }

        const path = require('path');
        const fs = require('fs');
        const filePath = path.join(__dirname, '../uploads', file.stored_name);

        if (!fs.existsSync(filePath)) {
            return res.status(404).send('File not found');
        }

        // Explicitly set the MIME type so the browser renders it as an image/PDF rather than generic data
        res.type(file.original_name);
        res.setHeader('Content-Disposition', 'inline; filename="' + file.original_name + '"');

        if (file.is_encrypted) {
            // Decrypt and stream as a buffer directly to response
            const { getDecryptedStream } = require('../utils/encryption');
            const stream = getDecryptedStream(filePath, file.encryption_iv);

            stream.on('error', (err) => {
                console.error('[STREAM ERROR]', err);
                if (!res.headersSent) res.status(500).send('Streaming error');
            });
            stream.pipe(res);
        } else {
            // Stream directly
            const readStream = fs.createReadStream(filePath);
            readStream.on('error', (err) => {
                console.error('[STREAM ERROR]', err);
                if (!res.headersSent) res.status(500).send('Streaming error');
            });
            readStream.pipe(res);
        }
    });
});

module.exports = router;
