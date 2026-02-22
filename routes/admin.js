const express = require('express');
const router = express.Router();
const db = require('../database');
const fs = require('fs');
const path = require('path');
const { ensureAuthenticated } = require('../middleware/authMiddleware');
const { ensureRole } = require('../middleware/roleMiddleware');

router.get('/', ensureAuthenticated, ensureRole('admin'), (req, res) => {
    db.all(`SELECT id, username, email, role FROM users`, [], (err, users) => {
        if (err) {
            console.error(err);
            req.flash('error_msg', 'Error fetching users');
            return res.redirect('/dashboard');
        }

        db.all(`
            SELECT f.id, f.original_name, f.stored_name, f.upload_date, u.username as uploaded_by 
            FROM files f 
            JOIN users u ON f.uploaded_by = u.id 
            ORDER BY f.upload_date DESC`,
            [], (err, files) => {
                if (err) {
                    console.error(err);
                    req.flash('error_msg', 'Error fetching files');
                    return res.redirect('/dashboard');
                }
                res.render('admin', { title: 'Admin Panel - SecureFile', users, files });
            }
        );
    });
});

router.post('/delete-file/:id', ensureAuthenticated, ensureRole('admin'), (req, res) => {
    const fileId = req.params.id;

    db.get(`SELECT * FROM files WHERE id = ?`, [fileId], (err, file) => {
        if (err || !file) {
            req.flash('error_msg', 'File not found');
            return res.redirect('/admin');
        }

        const filePath = path.join(__dirname, '../uploads', file.stored_name);

        db.run(`DELETE FROM files WHERE id = ?`, [fileId], function (err) {
            if (err) {
                console.error(err);
                req.flash('error_msg', 'Database error deleting file');
                return res.redirect('/admin');
            }

            if (fs.existsSync(filePath)) fs.unlink(filePath, () => { });
            req.flash('success_msg', 'File deleted completely.');
            res.redirect('/admin');
        });
    });
});

module.exports = router;
