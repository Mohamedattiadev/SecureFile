const express = require('express');
const router = express.Router();
const db = require('../database');
const { ensureAuthenticated } = require('../middleware/authMiddleware');
const { auditLog } = require('../utils/logger');

router.use(ensureAuthenticated);

// Create Folder
router.post('/create', (req, res) => {
    const { name, parentId } = req.body;
    const userId = req.session.userId;

    db.run(`INSERT INTO folders (name, owner_id, parent_id) VALUES (?, ?, ?)`,
        [name, userId, parentId || null], function (err) {
            if (err) {
                req.flash('error_msg', 'Could not create folder');
            } else {
                auditLog(userId, 'FOLDER_CREATE', `Name: ${name}`, req);
                req.flash('success_msg', 'Folder created');
            }
            res.redirect('/dashboard');
        });
});

// View Folder
router.get('/:id', (req, res) => {
    const folderId = req.params.id;
    const userId = req.session.userId;

    db.get(`SELECT * FROM folders WHERE id = ? AND owner_id = ?`, [folderId, userId], (err, folder) => {
        if (!folder) return res.redirect('/dashboard');

        db.all(`SELECT * FROM folders WHERE parent_id = ? AND owner_id = ?`, [folderId, userId], (err, subfolders) => {
            db.all(`SELECT * FROM files WHERE folder_id = ? AND uploaded_by = ?`, [folderId, userId], (err, files) => {
                res.render('dashboard', {
                    title: `Folder: ${folder.name}`,
                    folders: subfolders,
                    files,
                    currentFolder: folder
                });
            });
        });
    });
});

const archiver = require('archiver');
const { getDecryptedStream } = require('../utils/encryption');
const fs = require('fs');
const path = require('path');

// Delete Folder
router.post('/delete/:id', (req, res) => {
    const folderId = req.params.id;
    const userId = req.session.userId;

    db.get('SELECT * FROM folders WHERE id = ? AND owner_id = ?', [folderId, userId], (err, folder) => {
        if (!folder) {
            return res.status(404).json({ success: false, message: 'Folder not found' });
        }

        db.all('SELECT * FROM files WHERE folder_id = ? AND uploaded_by = ?', [folderId, userId], (err, files) => {
            if (files && files.length > 0) {
                files.forEach(file => {
                    const filePath = path.join(__dirname, '../uploads', file.stored_name);
                    fs.unlink(filePath, () => { });
                    if (file.is_encrypted) {
                        const decPath = path.join(__dirname, '../uploads', `dec_${file.stored_name}`);
                        fs.unlink(decPath, () => { });
                    }
                });
                db.run('DELETE FROM files WHERE folder_id = ? AND uploaded_by = ?', [folderId, userId]);
            }

            db.run('DELETE FROM folders WHERE id = ? AND owner_id = ?', [folderId, userId], () => {
                res.json({ success: true });
            });
        });
    });
});

module.exports = router;
