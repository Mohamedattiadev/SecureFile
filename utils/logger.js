const db = require('../database');

const auditLog = (userId, action, details, req = null) => {
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress) : 'system';
    const query = `INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)`;
    db.run(query, [userId, action, details, ip], (err) => {
        if (err) console.error('Audit Log Error:', err.message);
    });
};

module.exports = { auditLog };
