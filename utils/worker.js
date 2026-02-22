const cron = require('node-cron');
const db = require('../database');
const fs = require('fs');
const path = require('path');

const cleanupExpiredFiles = () => {
    // Run every hour
    cron.schedule('0 * * * *', () => {
        console.log('Running background cleanup for expired files...');
        const now = new Date().toISOString();

        db.all(`SELECT id, stored_name FROM files WHERE expires_at < ?`, [now], (err, rows) => {
            if (err) return console.error('Cleanup error:', err.message);

            rows.forEach(file => {
                const filePath = path.join(__dirname, '../uploads', file.stored_name);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
                db.run(`DELETE FROM files WHERE id = ?`, [file.id]);
                console.log(`Cleanup: Deleted expired file ${file.stored_name}`);
            });
        });
    });
};

const cleanupExpiredTokens = () => {
    cron.schedule('*/30 * * * *', () => { // Every 30 mins
        console.log('Running background cleanup for expired tokens...');
        const now = new Date().toISOString();
        db.run(`DELETE FROM download_tokens WHERE expires_at < ? OR is_used = 1`, [now]);
    });
};

module.exports = { cleanupExpiredFiles, cleanupExpiredTokens };
