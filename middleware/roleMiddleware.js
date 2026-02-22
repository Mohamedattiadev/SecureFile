module.exports = {
    ensureRole: function (role) {
        return function (req, res, next) {
            if (req.session && req.session.role === role) {
                return next();
            }
            res.status(403).render('error', {
                message: 'Forbidden: You do not have the required permissions.',
                error: { status: 403 }
            });
        }
    }
};
