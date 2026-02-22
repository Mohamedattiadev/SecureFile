module.exports = {
    ensureVerified: (req, res, next) => {
        const db = require('../database');
        if (!req.session.userId) return res.redirect('/auth/login');

        db.get('SELECT is_verified FROM users WHERE id = ?', [req.session.userId], (err, user) => {
            if (user && user.is_verified === 1) {
                return next();
            }
            req.flash('error_msg', 'Please verify your email to access this feature.');
            res.redirect('/auth/verify-notice');
        });
    }
};
