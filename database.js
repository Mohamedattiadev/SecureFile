const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.resolve(__dirname, process.env.DB_FILE || 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Create users table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user'
        )
    `, (err) => {
        if (err) {
            console.error('Error creating users table:', err.message);
        } else {
            console.log('Users table created or exists.');
            // Seed a default admin user if no users exist
            db.get("SELECT COUNT(*) AS count FROM users", (err, row) => {
                if (err) {
                    console.error('Error checking users count:', err.message);
                } else if (row.count === 0) {
                    const saltRounds = 10;
                    const defaultAdminPassword = 'adminpassword123'; // Users should change this immediately
                    bcrypt.hash(defaultAdminPassword, saltRounds, (err, hash) => {
                        if (err) {
                            console.error('Error hashing default admin password:', err.message);
                            return;
                        }
                        const stmt = db.prepare(`INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)`);
                        // Parameterized query for inserting default admin
                        stmt.run('admin', 'admin@example.com', hash, 'admin', function(err) {
                            if (err) {
                                console.error('Error inserting default admin:', err.message);
                            } else {
                                console.log('Default admin user created.');
                            }
                        });
                        stmt.finalize();
                    });
                }
            });
        }
    });

    // Create files table
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
        if (err) {
            console.error('Error creating files table:', err.message);
        } else {
            console.log('Files table created or exists.');
        }
    });

    // Enable foreign keys
    db.run("PRAGMA foreign_keys = ON;");
});

module.exports = db;
