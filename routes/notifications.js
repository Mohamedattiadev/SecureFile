const express = require('express');
const router = express.Router();
const db = require('../database');
const { ensureAuthenticated } = require('../middleware/authMiddleware');

router.use(ensureAuthenticated);

router.get('/', (req, res) => {
    db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [req.session.userId], (err, notifications) => {
        res.render('notifications/index', { title: 'Notifications', notifications });
    });
});

router.post('/mark-read/:id', (req, res) => {
    db.run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId], () => {
        if (req.xhr || req.headers.accept.indexOf('json') > -1 || req.headers['content-type'] === 'application/json') {
            return res.json({ success: true });
        }
        const referer = req.get('Referrer');
        res.redirect(referer ? referer : '/dashboard');
    });
});

module.exports = router;
