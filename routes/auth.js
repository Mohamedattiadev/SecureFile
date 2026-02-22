const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const db = require('../database');
const { forwardAuthenticated, ensureAuthenticated } = require('../middleware/authMiddleware');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many login attempts from this IP, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
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

    db.get(`SELECT id, username, password_hash, role FROM users WHERE username = ?`, [username], (err, user) => {
        if (err || !user) {
            req.flash('error_msg', 'Invalid username or password');
            return res.redirect('/auth/login');
        }

        bcrypt.compare(password, user.password_hash, (err, result) => {
            if (result) {
                req.session.regenerate(function (err) {
                    if (err) next(err);
                    req.session.userId = user.id;
                    req.session.username = user.username;
                    req.session.role = user.role;

                    req.session.save(function (err) {
                        if (err) next(err);
                        req.flash('success_msg', 'You are now logged in');
                        res.redirect('/dashboard');
                    });
                });
            } else {
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

            db.run(`INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)`,
                [username, email, hash],
                function (err) {
                    if (err) {
                        req.flash('error_msg', 'Error creating user');
                        return res.redirect('/auth/register');
                    }
                    req.flash('success_msg', 'You are now registered and can log in');
                    res.redirect('/auth/login');
                }
            );
        });
    });
});

router.get('/logout', ensureAuthenticated, (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error(err);
        res.clearCookie('sessionId');
        res.redirect('/auth/login');
    });
});

module.exports = router;
