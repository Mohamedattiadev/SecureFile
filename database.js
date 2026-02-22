const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.resolve(__dirname, process.env.DB_FILE || 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Function to safely add columns (SQLite doesn't support IF NOT EXISTS for ADD COLUMN)
const safeAddColumn = (tableName, colName, colType) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
        if (err) return;
        const columnExists = columns.some(col => col.name === colName);
        if (!columnExists) {
            db.run(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${colType}`, (err) => {
                if (err) console.error(`Error adding column ${colName} to ${tableName}:`, err.message);
                else console.log(`Migration: Added ${colName} to ${tableName}`);
            });
        }
    });
};

db.serialize(() => {
    // Enable foreign keys
    db.run("PRAGMA foreign_keys = ON;");

    // 1. Users Table Extension
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user'
        )
    `, (err) => {
        if (!err) {
            // New columns for Phase 2
            safeAddColumn('users', 'is_verified', 'INTEGER DEFAULT 0');
            safeAddColumn('users', 'verification_token', 'TEXT');
            safeAddColumn('users', 'verification_token_expires', 'DATETIME');
            safeAddColumn('users', 'password_reset_token', 'TEXT');
            safeAddColumn('users', 'password_reset_token_expires', 'DATETIME');
            safeAddColumn('users', 'avatar_path', 'TEXT');

            // Seed admin...
            db.get("SELECT COUNT(*) AS count FROM users", (err, row) => {
                if (!err && row.count === 0) {
                    const saltRounds = 10;
                    bcrypt.hash('adminpassword123', saltRounds, (err, hash) => {
                        if (!err) {
                            db.run('INSERT INTO users (username, email, password_hash, role, is_verified) VALUES (?, ?, ?, ?, ?)',
                                ['admin', 'admin@example.com', hash, 'admin', 1]);
                        }
                    });
                }
            });
        }
    });

    // 2. Folders Table
    db.run(`
        CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            owner_id INTEGER NOT NULL,
            parent_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(parent_id) REFERENCES folders(id) ON DELETE CASCADE
        )
    `);

    // 3. Files Table Extension
    db.run(`
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_name TEXT NOT NULL,
            stored_name TEXT NOT NULL UNIQUE,
            uploaded_by INTEGER NOT NULL,
            upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(uploaded_by) REFERENCES users(id) ON DELETE CASCADE
        )
    `, (err) => {
        if (!err) {
            safeAddColumn('files', 'folder_id', 'INTEGER REFERENCES folders(id) ON DELETE SET NULL');
            safeAddColumn('files', 'is_encrypted', 'INTEGER DEFAULT 0');
            safeAddColumn('files', 'encryption_iv', 'TEXT');
            safeAddColumn('files', 'expires_at', 'DATETIME');
            safeAddColumn('files', 'is_client_encrypted', 'INTEGER DEFAULT 0');
        }
    });

    // 4. File Shares
    db.run(`
        CREATE TABLE IF NOT EXISTS file_shares (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL,
            shared_with_id INTEGER NOT NULL,
            permission TEXT DEFAULT 'view', -- 'view' or 'download'
            shared_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE,
            FOREIGN KEY(shared_with_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // 5. Messages
    db.run(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            content TEXT,
            is_encrypted INTEGER DEFAULT 0,
            attachment_file_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(receiver_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(attachment_file_id) REFERENCES files(id) ON DELETE SET NULL
        )
    `);

    // 6. Notifications
    db.run(`
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            message TEXT NOT NULL,
            type TEXT,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // 7. Audit Logs
    db.run(`
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT NOT NULL,
            details TEXT,
            ip_address TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    // 8. Download Tokens (Signed URLs)
    db.run(`
        CREATE TABLE IF NOT EXISTS download_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            expires_at DATETIME NOT NULL,
            is_used INTEGER DEFAULT 0,
            FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
        )
    `);
});

module.exports = db;
