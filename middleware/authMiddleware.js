module.exports = {
    ensureAuthenticated: function (req, res, next) {
        if (req.session && req.session.userId) {
            return next();
        }
        res.redirect('/auth/login');
    },
    forwardAuthenticated: function (req, res, next) {
        if (req.session && req.session.userId) {
            return res.redirect('/dashboard');
        }
        return next();
    }
};
