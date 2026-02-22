const express = require('express');
const router = express.Router();
const db = require('../database');
const fs = require('fs');
const path = require('path');
const { ensureAuthenticated } = require('../middleware/authMiddleware');
const { ensureRole } = require('../middleware/roleMiddleware');

router.use(ensureAuthenticated);
router.use(ensureRole('admin'));

router.get('/', (req, res) => {
    const stats = {};

    db.serialize(() => {
        db.get("SELECT COUNT(*) as count FROM users", (err, row) => stats.userCount = row ? row.count : 0);
        db.get("SELECT COUNT(*) as count FROM files", (err, row) => stats.fileCount = row ? row.count : 0);
        db.get("SELECT COUNT(*) as count FROM audit_logs WHERE action = 'LOGIN_FAIL'", (err, row) => stats.failedLogins = row ? row.count : 0);
        db.get("SELECT COUNT(*) as count FROM files WHERE is_encrypted = 1", (err, row) => stats.encryptedFiles = row ? row.count : 0);

        db.all(`SELECT id, username, email, role, is_verified FROM users`, (err, users) => {
            db.all(`
                SELECT f.*, u.username as uploaded_by 
                FROM files f 
                JOIN users u ON f.uploaded_by = u.id 
                ORDER BY f.upload_date DESC`, (err, files) => {
                db.all("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 50", (err, logs) => {
                    res.render('admin', { title: 'Admin Panel', users, files, stats, logs });
                });
            });
        });
    });
});

router.post('/delete-user/:id', (req, res) => {
    const userId = req.params.id;
    if (userId == req.session.userId) {
        req.flash('error_msg', 'Cannot delete yourself');
        return res.redirect('/admin');
    }
    db.run('DELETE FROM users WHERE id = ?', [userId], () => {
        req.flash('success_msg', 'User deleted');
        res.redirect('/admin');
    });
});

router.post('/delete-file/:id', (req, res) => {
    const fileId = req.params.id;
    db.get(`SELECT * FROM files WHERE id = ?`, [fileId], (err, file) => {
        if (!file) return res.redirect('/admin');
        const filePath = path.join(__dirname, '../uploads', file.stored_name);
        db.run(`DELETE FROM files WHERE id = ?`, [fileId], () => {
            if (fs.existsSync(filePath)) fs.unlink(filePath, () => { });
            req.flash('success_msg', 'File deleted');
            res.redirect('/admin');
        });
    });
});

router.get('/backup', (req, res) => {
    const dbFile = path.resolve(__dirname, `../${process.env.DB_FILE || 'database.sqlite'}`);
    res.download(dbFile, `backup-${Date.now()}.sqlite`);
});

module.exports = router;
