const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const db = require('../database');
const { forwardAuthenticated, ensureAuthenticated } = require('../middleware/authMiddleware');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/mailer');
const { generateSecureToken, hashToken } = require('../utils/tokens');
const { auditLog } = require('../utils/logger');

const rateLimitHandler = (req, res, next, options) => {
    res.status(options.statusCode).render('error', {
        title: `${options.statusCode} Too Many Requests`,
        message: options.message,
        error: { status: options.statusCode }
    });
};

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many login attempts from this IP, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler
});

router.get('/login', forwardAuthenticated, (req, res) => {
    res.render('login', { title: 'Login - SecureFile', formData: {} });
});

router.post('/login', forwardAuthenticated, loginLimiter, [
    body('username').trim().escape().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required')
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error_msg', errors.array().map(e => e.msg).join(' | '));
        return res.render('login', { title: 'Login - SecureFile', formData: req.body });
    }

    const { username, password } = req.body;

    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (err || !user) {
            req.flash('error_msg', 'Invalid username or password');
            auditLog(null, 'LOGIN_FAIL', `Username: ${username}`, req);
            return res.redirect('/auth/login');
        }

        bcrypt.compare(password, user.password_hash, (err, result) => {
            if (result) {
                // Check verification
                if (user.is_verified === 0) {
                    req.flash('error_msg', 'Please verify your email before logging in.');
                    return res.redirect('/auth/verify-notice');
                }

                req.session.regenerate(function (err) {
                    if (err) return next(err);
                    req.session.userId = user.id;
                    req.session.username = user.username;
                    req.session.role = user.role;

                    req.session.save(function (err) {
                        if (err) return next(err);
                        auditLog(user.id, 'LOGIN_SUCCESS', null, req);
                        req.flash('success_msg', 'You are now logged in');
                        res.redirect('/dashboard');
                    });
                });
            } else {
                auditLog(user.id, 'LOGIN_FAIL', 'Incorrect password', req);
                req.flash('error_msg', 'Invalid username or password');
                res.redirect('/auth/login');
            }
        });
    });
});

router.get('/register', forwardAuthenticated, (req, res) => {
    res.render('register', { title: 'Register - SecureFile', formData: {} });
});

router.post('/register', forwardAuthenticated, [
    body('username').trim().escape().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('email').trim().isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error_msg', errors.array().map(e => e.msg).join(' | '));
        return res.render('register', { title: 'Register - SecureFile', formData: req.body });
    }

    const { username, email, password } = req.body;

    db.get(`SELECT id FROM users WHERE username = ? OR email = ?`, [username, email], (err, row) => {
        if (err) {
            req.flash('error_msg', 'Database error');
            return res.redirect('/auth/register');
        }

        if (row) {
            req.flash('error_msg', 'Username or email already exists');
            return res.render('register', { title: 'Register - SecureFile', formData: { username, email } });
        }

        bcrypt.hash(password, 10, (err, hash) => {
            if (err) {
                req.flash('error_msg', 'Error hashing password');
                return res.redirect('/auth/register');
            }

            const verificationToken = generateSecureToken();
            const tokenHash = hashToken(verificationToken);
            const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

            db.run(`INSERT INTO users (username, email, password_hash, verification_token, verification_token_expires) VALUES (?, ?, ?, ?, ?)`,
                [username, email, hash, tokenHash, expires],
                async function (err) {
                    if (err) {
                        req.flash('error_msg', 'Error creating user');
                        return res.redirect('/auth/register');
                    }

                    const userId = this.lastID;
                    await sendVerificationEmail(email, verificationToken);
                    auditLog(userId, 'REGISTER', 'User registered, verification email sent', req);

                    if (process.env.NODE_ENV !== 'production') {
                        console.log('\n=============================================================');
                        console.log(`[DEV MODE] Verification Link for ${username}:`);
                        console.log(`http://localhost:3000/auth/verify-email?token=${verificationToken}`);
                        console.log('=============================================================\n');
                    }

                    req.flash('success_msg', 'Registration successful! Please check your email (or server console) to verify your account.');
                    res.redirect('/auth/login');
                }
            );
        });
    });
});

// Verification notice page
router.get('/verify-notice', (req, res) => {
    res.render('verify-notice', { title: 'Verify Email' });
});

// Verify Email Logic
router.get('/verify-email', (req, res) => {
    const { token } = req.query;
    if (!token) return res.redirect('/auth/login');

    const hashed = hashToken(token);
    const now = new Date().toISOString();

    db.get(`SELECT id FROM users WHERE verification_token = ? AND verification_token_expires > ?`, [hashed, now], (err, user) => {
        if (err || !user) {
            req.flash('error_msg', 'Invalid or expired verification token.');
            return res.redirect('/auth/login');
        }

        db.run(`UPDATE users SET is_verified = 1, verification_token = NULL, verification_token_expires = NULL WHERE id = ?`, [user.id], (err) => {
            if (err) return res.render('error', { message: 'Verification failed' });
            auditLog(user.id, 'EMAIL_VERIFIED', null, req);
            req.flash('success_msg', 'Email verified successfully! You can now log in.');
            res.redirect('/auth/login');
        });
    });
});

// Forgot Password
router.get('/forgot-password', (req, res) => {
    res.render('forgot-password', { title: 'Forgot Password' });
});

router.post('/forgot-password', (req, res) => {
    const { email } = req.body;
    db.get(`SELECT id FROM users WHERE email = ?`, [email], async (err, user) => {
        if (user) {
            const resetToken = generateSecureToken();
            const tokenHash = hashToken(resetToken);
            const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 mins

            db.run(`UPDATE users SET password_reset_token = ?, password_reset_token_expires = ? WHERE id = ?`,
                [tokenHash, expires, user.id],
                async () => {
                    await sendPasswordResetEmail(email, resetToken);
                    auditLog(user.id, 'PASSWORD_RESET_REQUESTED', null, req);
                });
        }
        // Always show same message to prevent user enumeration
        req.flash('success_msg', 'If that email exists, a reset link has been sent.');
        res.redirect('/auth/login');
    });
});

// Reset Password
router.get('/reset-password', (req, res) => {
    const { token } = req.query;
    res.render('reset-password', { title: 'Reset Password', token });
});

router.post('/reset-password', [
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
], (req, res) => {
    const { token, password } = req.body;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error_msg', errors.array().map(e => e.msg).join(' | '));
        return res.redirect(`/auth/reset-password?token=${token}`);
    }

    const hashed = hashToken(token);
    const now = new Date().toISOString();

    db.get(`SELECT id FROM users WHERE password_reset_token = ? AND password_reset_token_expires > ?`, [hashed, now], (err, user) => {
        if (err || !user) {
            req.flash('error_msg', 'Invalid or expired reset token.');
            return res.redirect('/auth/login');
        }

        bcrypt.hash(password, 10, (err, hash) => {
            db.run(`UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_token_expires = NULL WHERE id = ?`,
                [hash, user.id], (err) => {
                    auditLog(user.id, 'PASSWORD_RESET_SUCCESS', null, req);
                    req.flash('success_msg', 'Password reset successful! Please log in.');
                    res.redirect('/auth/login');
                });
        });
    });
});

router.get('/logout', ensureAuthenticated, (req, res) => {
    const userId = req.session.userId;
    req.session.destroy((err) => {
        if (err) console.error(err);
        auditLog(userId, 'LOGOUT', null, req);
        res.clearCookie('sessionId');
        res.redirect('/auth/login');
    });
});

module.exports = router;
