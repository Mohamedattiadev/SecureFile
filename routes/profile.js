const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const db = require('../database');
const { ensureAuthenticated } = require('../middleware/authMiddleware');
const { ensureVerified } = require('../middleware/verifiedMiddleware');
const multer = require('multer');
const path = require('path');
const { auditLog } = require('../utils/logger');
const fs = require('fs');

// Avatar Upload Config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './public/avatars';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `${req.session.userId}-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) return cb(null, true);
        cb(new Error('Only images (JPEG, JPG, PNG) are allowed'));
    }
});

router.use(ensureAuthenticated);

// View Profile
router.get('/', (req, res) => {
    const userId = req.session.userId;
    db.get('SELECT username, email, role, avatar_path, is_verified FROM users WHERE id = ?', [userId], (err, user) => {
        db.all('SELECT * FROM audit_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT 20', [userId], (err, logs) => {
            res.render('profile/index', { title: 'Your Profile', user, logs });
        });
    });
});

// Update Username
router.post('/update-username', [
    body('username').trim().escape().isLength({ min: 3 }).withMessage('Username must be at least 3 characters')
], (req, res) => {
    const { username } = req.body;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error_msg', errors.array()[0].msg);
        return res.redirect('/profile');
    }

    db.run('UPDATE users SET username = ? WHERE id = ?', [username, req.session.userId], (err) => {
        if (err) {
            req.flash('error_msg', 'Username already taken');
        } else {
            req.session.username = username;
            auditLog(req.session.userId, 'PROFILE_UPDATE', 'Changed username', req);
            req.flash('success_msg', 'Username updated');
        }
        res.redirect('/profile');
    });
});

// Change Password
router.post('/change-password', [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
], (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.session.userId;

    db.get('SELECT password_hash FROM users WHERE id = ?', [userId], (err, user) => {
        bcrypt.compare(currentPassword, user.password_hash, (err, result) => {
            if (result) {
                bcrypt.hash(newPassword, 10, (err, hash) => {
                    db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId], () => {
                        auditLog(userId, 'PASSWORD_CHANGE', 'Manual password change', req);
                        req.flash('success_msg', 'Password changed successfully');
                        res.redirect('/profile');
                    });
                });
            } else {
                req.flash('error_msg', 'Current password incorrect');
                res.redirect('/profile');
            }
        });
    });
});

// Upload Avatar
router.post('/upload-avatar', upload.single('avatar'), (req, res) => {
    if (!req.file) {
        req.flash('error_msg', 'No file uploaded or invalid file type');
        return res.redirect('/profile');
    }

    const avatarPath = `/avatars/${req.file.filename}`;
    db.run('UPDATE users SET avatar_path = ? WHERE id = ?', [avatarPath, req.session.userId], () => {
        auditLog(req.session.userId, 'AVATAR_UPDATE', null, req);
        req.flash('success_msg', 'Avatar updated');
        res.redirect('/profile');
    });
});

module.exports = router;
