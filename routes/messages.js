const express = require('express');
const router = express.Router();
const db = require('../database');
const { ensureAuthenticated } = require('../middleware/authMiddleware');
const { encryptText, decryptText } = require('../utils/encryption');
const { auditLog } = require('../utils/logger');

router.use(ensureAuthenticated);

// View conversations list
router.get('/', (req, res) => {
    const userId = req.session.userId;
    db.all(`
        SELECT DISTINCT u.id, u.username, u.avatar_path 
        FROM users u 
        JOIN messages m ON (u.id = m.sender_id OR u.id = m.receiver_id) 
        WHERE (m.sender_id = ? OR m.receiver_id = ?) AND u.id != ?`, [userId, userId, userId], (err, users) => {
        res.render('messages/index', { title: 'Messages', contacts: users || [] });
    });
});

// View single conversation
router.get('/:userId', (req, res) => {
    const myId = req.session.userId;
    const theirId = req.params.userId;

    db.get('SELECT username FROM users WHERE id = ?', [theirId], (err, contact) => {
        if (!contact) return res.redirect('/messages');

        db.all(`
            SELECT * FROM messages 
            WHERE (sender_id = ? AND receiver_id = ?) 
               OR (sender_id = ? AND receiver_id = ?)
            ORDER BY created_at ASC`, [myId, theirId, theirId, myId], (err, rows) => {
            const messages = rows.map(m => {
                if (m.is_encrypted) {
                    try {
                        // Logic: Content is stored as "iv:content"
                        const [iv, content] = m.content.split(':');
                        m.content = decryptText({ iv, content });
                    } catch (e) {
                        m.content = "[Decryption Failed]";
                    }
                }
                return m;
            });
            db.all('SELECT id, original_name FROM files WHERE uploaded_by = ?', [myId], (err, myFiles) => {
                res.render('messages/chat', {
                    title: `Chat with ${contact.username}`,
                    messages,
                    contact,
                    contactId: theirId,
                    myFiles: myFiles || []
                });
            });
        });
    });
});

// API to get messages (for polling)
router.get('/:userId/api', (req, res) => {
    const myId = req.session.userId;
    const theirId = req.params.userId;

    db.all(`
        SELECT * FROM messages 
        WHERE (sender_id = ? AND receiver_id = ?) 
           OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at ASC`, [myId, theirId, theirId, myId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB Error' });
        const messages = rows.map(m => {
            if (m.is_encrypted) {
                try {
                    const [iv, content] = m.content.split(':');
                    m.content = decryptText({ iv, content });
                } catch (e) { m.content = "[Decryption Failed]"; }
            }
            return m;
        });
        res.json({ messages, myId });
    });
});

// Search for user to start chat
router.post('/search', (req, res) => {
    const { username } = req.body;
    db.get('SELECT id FROM users WHERE username = ?', [username], (err, targetUser) => {
        if (!targetUser) {
            req.flash('error_msg', 'User not found');
            return res.redirect('/messages');
        }
        if (targetUser.id === req.session.userId) {
            req.flash('error_msg', 'You cannot chat with yourself');
            return res.redirect('/messages');
        }
        res.redirect(`/messages/${targetUser.id}`);
    });
});

// Send Message
router.post('/send', (req, res) => {
    const { receiverId, content, encrypt } = req.body;
    const senderId = req.session.userId;

    let finalContent = content;
    let isEncrypted = 0;

    if (encrypt === 'on' || encrypt === true) {
        const encrypted = encryptText(content);
        finalContent = `${encrypted.iv}:${encrypted.content}`;
        isEncrypted = 1;
    }

    db.run(`INSERT INTO messages (sender_id, receiver_id, content, is_encrypted) VALUES (?, ?, ?, ?)`,
        [senderId, receiverId, finalContent, isEncrypted], (err) => {
            if (!err) {
                db.run('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)',
                    [receiverId, `New message from ${req.session.username}`, 'message']);
                auditLog(senderId, 'MESSAGE_SEND', `Sent to user ${receiverId}`, req);
            }
            res.redirect(`/messages/${receiverId}`);
        });
});

// Share File in Chat
router.post('/share-file', (req, res) => {
    const { receiverId, fileId } = req.body;
    const senderId = req.session.userId;

    if (!fileId || !receiverId) return res.status(400).json({ error: 'Missing data' });

    // 1. Validate ownership
    db.get('SELECT original_name FROM files WHERE id = ? AND uploaded_by = ?', [fileId, senderId], (err, file) => {
        if (!file) return res.status(403).json({ error: 'Unauthorized or file not found' });

        // 2. Grant permission
        db.run(`INSERT OR IGNORE INTO file_shares (file_id, shared_with_id, permission) VALUES (?, ?, ?)`,
            [fileId, receiverId, 'view'], (err) => {

                // 3. Send Message
                const content = `Shared a file: ${file.original_name}`;
                db.run(`INSERT INTO messages (sender_id, receiver_id, content, attachment_file_id) VALUES (?, ?, ?, ?)`,
                    [senderId, receiverId, content, fileId], (err) => {
                        db.run('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)',
                            [receiverId, `${req.session.username} shared a file in your chat`, 'message']);

                        res.json({ success: true, message: 'File shared successfully' });
                    });
            });
    });
});

module.exports = router;

