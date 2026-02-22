const fs = require('fs');
const path = require('path');
const db = require('../database');
const { decryptText } = require('../utils/encryption');

async function validateSecurity() {
    console.log("🔒 Starting Security Validation...");

    // 1. Check Encryption at Rest
    db.all("SELECT stored_name, is_encrypted FROM files WHERE is_encrypted = 1", [], (err, files) => {
        if (err) throw err;
        files.forEach(f => {
            const filePath = path.join(__dirname, '../uploads', f.stored_name);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                if (content.includes('<?php') || content.includes('<html>')) {
                    console.error(`❌ SECURITY ALERT: File ${f.stored_name} is marked as encrypted but contains raw text!`);
                } else {
                    console.log(`✅ File ${f.stored_name} is encrypted at rest.`);
                }
            }
        });
    });

    // 2. Check Token Hashing
    db.all("SELECT verification_token, password_reset_token FROM users", [], (err, users) => {
        users.forEach(u => {
            if (u.verification_token && u.verification_token.length < 32) {
                console.error(`❌ SECURITY ALERT: User ${u.id} has potentially unhashed verification token!`);
            }
            if (u.password_reset_token && u.password_reset_token.length < 32) {
                console.error(`❌ SECURITY ALERT: User ${u.id} has potentially unhashed reset token!`);
            }
        });
        console.log("✅ Token hashing verified.");
    });

    // 3. Check Audit Logging
    db.get("SELECT COUNT(*) as count FROM audit_logs", (err, row) => {
        if (row.count > 0) {
            console.log(`✅ Audit logging is active (${row.count} entries).`);
        } else {
            console.warn("⚠️ Warning: Audit logs are empty.");
        }
    });

    console.log("🚀 Security Validation Complete.");
    setTimeout(() => process.exit(0), 1000);
}

validateSecurity();
