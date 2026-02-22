const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const flash = require('connect-flash');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { ensureAuthenticated } = require('../middleware/authMiddleware');
const { encryptFile, decryptFile } = require('../utils/encryption');
const generateSecureToken = () => crypto.randomBytes(32).toString('hex');
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const { auditLog } = require('../utils/logger');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = crypto.randomUUID();
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, uniqueSuffix + ext);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedMimeTypes = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'];

    if (allowedExtensions.includes(ext) && allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only PDF, PNG, JPG, JPEG, and TXT are allowed.'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: fileFilter
});

const handleUpload = (req, res, next) => {
    const uploadSingle = upload.single('document');
    uploadSingle(req, res, function (err) {
        if (err) {
            req.flash('error_msg', err.message);
            return res.redirect('/dashboard');
        }
        next();
    });
};

router.post('/upload', ensureAuthenticated, handleUpload, async (req, res) => {
    if (!req.file) {
        req.flash('error_msg', 'No file uploaded.');
        return res.redirect('/dashboard');
    }

    const { originalname: originalName, filename: storedName, path: tempPath } = req.file;
    const { folderId, expirationHours, encrypt } = req.body;
    const uploadedBy = req.session.userId;

    let isEncrypted = 0;
    let iv = null;

    try {
        if (encrypt === 'on') {
            const encryptedName = `${storedName}.enc`;
            const encryptedPath = path.join(__dirname, '../uploads/', encryptedName);
            iv = await encryptFile(tempPath, encryptedPath);
            fs.unlinkSync(tempPath); // Delete unencrypted temp file
            req.file.filename = encryptedName;
            isEncrypted = 1;
        }

        let finalHours = expirationHours ? parseInt(expirationHours) : null;
        if (expirationHours === 'custom' && req.body.customAmount && req.body.customUnit) {
            const amount = parseInt(req.body.customAmount);
            if (!isNaN(amount)) {
                switch (req.body.customUnit) {
                    case 'minutes': finalHours = amount / 60; break;
                    case 'hours': finalHours = amount; break;
                    case 'days': finalHours = amount * 24; break;
                    case 'months': finalHours = amount * 24 * 30; break;
                    case 'years': finalHours = amount * 24 * 365; break;
                }
            }
        }
        const expiresAt = (finalHours && !isNaN(finalHours)) ? new Date(Date.now() + finalHours * 3600 * 1000).toISOString() : null;

        db.run(`INSERT INTO files (original_name, stored_name, uploaded_by, folder_id, is_encrypted, encryption_iv, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [originalName, req.file.filename, uploadedBy, folderId || null, isEncrypted, iv, expiresAt],
            function (err) {
                if (err) {
                    fs.unlink(path.join(__dirname, '../uploads/', req.file.filename), () => { });
                    req.flash('error_msg', 'Database error.');
                    return res.redirect('/dashboard');
                }
                auditLog(uploadedBy, 'FILE_UPLOAD', `File: ${originalName} | Encrypted: ${isEncrypted}`, req);
                req.flash('success_msg', 'File uploaded successfully.');
                res.redirect('/dashboard');
            }
        );
    } catch (error) {
        console.error('Upload Error:', error);
        req.flash('error_msg', `Encryption failed: ${error.message}`);
        res.redirect('/dashboard');
    }
});

// Generate Temporary Signed URL
router.post('/generate-link/:id', ensureAuthenticated, (req, res) => {
    const fileId = req.params.id;
    const userId = req.session.userId;

    db.get('SELECT * FROM files WHERE id = ? AND uploaded_by = ?', [fileId, userId], (err, file) => {
        if (!file) {
            req.flash('error_msg', 'Unauthorized to generate link');
            return res.redirect('/dashboard');
        }

        const token = generateSecureToken();
        const hashed = hashToken(token);
        const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins

        console.log(`[LINK GEN] Generated Token: ${token}`);
        console.log(`[LINK GEN] Storing Hash: ${hashed}`);

        db.run('INSERT INTO download_tokens (file_id, token_hash, expires_at) VALUES (?, ?, ?)',
            [fileId, hashed, expires], (insertErr) => {
                if (insertErr) {
                    console.error("Token Insert Error:", insertErr);
                    req.flash('error_msg', 'Could not create link');
                    return res.redirect('/dashboard');
                }
                const link = `${req.protocol}://${req.get('host')}/files/temp-download?token=${token}`;
                req.session.generatedLink = link;
                res.redirect('/dashboard');
            });
    });
});

// Temp Download (Signed URL)
router.get('/temp-download', async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).send('Missing token');

    const hashed = hashToken(token);
    const now = new Date().toISOString();

    console.log(`[DOWNLOAD DEBUG] Token: ${token}`);
    console.log(`[DOWNLOAD DEBUG] Hashed: ${hashed}`);
    console.log(`[DOWNLOAD DEBUG] Now: ${now}`);

    db.get(`
        SELECT f.*, t.id as tokenId, t.token_hash, t.expires_at, t.is_used 
        FROM files f 
        JOIN download_tokens t ON f.id = t.file_id 
        WHERE t.token_hash = ? AND t.is_used = 0`, [hashed], async (err, file) => {

        if (err) console.error("[DOWNLOAD DEBUG] DB Error:", err);
        if (!file) {
            // Let's do a loose lookup to see what actually exists
            db.get(`SELECT * FROM download_tokens WHERE token_hash = ?`, [hashed], (err2, looseToken) => {
                console.log(`[DOWNLOAD DEBUG] Loose Token Lookup for Hash ${hashed}:`, looseToken);
            });
            return res.status(403).send('Invalid or expired link');
        }

        // Check Expiry separately to isolate bugs
        if (new Date(file.expires_at) < new Date(now)) {
            console.log(`[DOWNLOAD DEBUG] Token expired. Exp: ${file.expires_at} Now: ${now}`);
            return res.status(403).send('Invalid or expired link');
        }

        // Mark token as used
        db.run('UPDATE download_tokens SET is_used = 1 WHERE id = ?', [file.tokenId]);

        const filePath = path.join(__dirname, '../uploads', file.stored_name);
        if (file.is_encrypted) {
            const decPath = path.join(__dirname, '../uploads', `dec_${file.stored_name}`);
            await decryptFile(filePath, decPath, file.encryption_iv);
            res.download(decPath, file.original_name, () => fs.unlinkSync(decPath));
        } else {
            res.download(filePath, file.original_name);
        }
    });
});

router.get('/download/:id', ensureAuthenticated, async (req, res) => {
    const { id: fileId } = req.params;
    const { userId, role: userRole } = req.session;

    db.get(`
        SELECT f.*, s.permission 
        FROM files f 
        LEFT JOIN file_shares s ON f.id = s.file_id AND s.shared_with_id = ?
        WHERE f.id = ?`, [userId, fileId], async (err, file) => {
        if (!file || (file.uploaded_by !== userId && userRole !== 'admin' && !file.permission)) {
            req.flash('error_msg', 'Unauthorized.');
            return res.redirect('back');
        }

        const filePath = path.join(__dirname, '../uploads', file.stored_name);
        auditLog(userId, 'FILE_DOWNLOAD', `File: ${file.original_name}`, req);

        if (file.is_encrypted) {
            try {
                const decPath = path.join(__dirname, '../uploads', `dec_${file.stored_name}`);
                await decryptFile(filePath, decPath, file.encryption_iv);
                res.download(decPath, file.original_name, (err) => {
                    if (fs.existsSync(decPath)) fs.unlinkSync(decPath);
                });
            } catch (e) {
                req.flash('error_msg', 'Decryption failed.');
                res.redirect('back');
            }
        } else {
            res.download(filePath, file.original_name);
        }
    });
});

router.post('/delete/:id', ensureAuthenticated, (req, res) => {
    const { id: fileId } = req.params;
    const userId = req.session.userId;

    db.get('SELECT * FROM files WHERE id = ? AND uploaded_by = ?', [fileId, userId], (err, file) => {
        if (!file) {
            req.flash('error_msg', 'File not found or unauthorized.');
            return res.redirect('/dashboard');
        }

        const filePath = path.join(__dirname, '../uploads', file.stored_name);
        db.run('DELETE FROM files WHERE id = ?', [fileId], (err) => {
            if (err) {
                req.flash('error_msg', 'Failed to delete file from database.');
            } else {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
                auditLog(userId, 'FILE_DELETE', `Deleted file: ${file.original_name}`, req);
                req.flash('success_msg', 'File deleted successfully.');
            }
            res.redirect('/dashboard');
        });
    });
});

module.exports = router;
