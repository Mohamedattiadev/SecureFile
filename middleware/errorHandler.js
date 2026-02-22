module.exports = {
    errorHandler: (err, req, res, next) => {
        console.error(err.stack);

        const status = err.status || 500;
        const message = process.env.NODE_ENV === 'production'
            ? 'An internal server error occurred.'
            : err.message;

        res.status(status);

        // Ensure globals exist if middleware was bypassed
        res.locals.user = res.locals.user || null;
        res.locals.username = res.locals.username || null;
        res.locals.role = res.locals.role || null;
        res.locals.success_msg = res.locals.success_msg || [];
        res.locals.error_msg = res.locals.error_msg || [];
        res.locals.error = res.locals.error || [];
        res.locals.title = res.locals.title || `Error ${status}`;
        res.locals.csrfToken = res.locals.csrfToken || '';
        res.locals.formData = res.locals.formData || null;

        res.render('error', {
            title: `Error ${status}`,
            message: message,
            error: process.env.NODE_ENV === 'production' ? {} : err
        });
    }
};
