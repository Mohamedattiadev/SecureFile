const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const db = require('../database');
const fs = require('fs');
const { ensureAuthenticated } = require('../middleware/authMiddleware');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = crypto.randomUUID();
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, uniqueSuffix + ext);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedMimeTypes = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'];

    if (allowedExtensions.includes(ext) && allowedMimeTypes.includes(file.mimetype)) {
        const basename = path.basename(file.originalname, ext);
        if (basename.includes('.')) {
            return cb(new Error('Invalid filename: Double extensions are not allowed'), false);
        }
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only PDF, PNG, JPG, JPEG, and TXT are allowed.'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: fileFilter
});

const handleUpload = (req, res, next) => {
    const uploadSingle = upload.single('document');
    uploadSingle(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            req.flash('error_msg', `Upload error: ${err.message}`);
            return res.redirect('/dashboard');
        } else if (err) {
            req.flash('error_msg', err.message);
            return res.redirect('/dashboard');
        }
        next();
    });
};

router.post('/upload', ensureAuthenticated, handleUpload, (req, res) => {
    if (!req.file) {
        req.flash('error_msg', 'No file uploaded or invalid file.');
        return res.redirect('/dashboard');
    }

    const { originalname: originalName, filename: storedName } = req.file;
    const uploadedBy = req.session.userId;

    db.run(`INSERT INTO files (original_name, stored_name, uploaded_by) VALUES (?, ?, ?)`,
        [originalName, storedName, uploadedBy],
        function (err) {
            if (err) {
                console.error(err);
                fs.unlink(path.join(__dirname, '../uploads/', storedName), () => { });
                req.flash('error_msg', 'Database error storing file metadata.');
                return res.redirect('/dashboard');
            }
            req.flash('success_msg', 'File uploaded successfully.');
            res.redirect('/dashboard');
        }
    );
});

router.get('/download/:id', ensureAuthenticated, (req, res) => {
    const { id: fileId } = req.params;
    const { userId, role: userRole } = req.session;

    db.get(`SELECT * FROM files WHERE id = ?`, [fileId], (err, file) => {
        if (err) {
            console.error(err);
            req.flash('error_msg', 'Database error.');
            return res.redirect('back');
        }

        if (!file) {
            req.flash('error_msg', 'File not found.');
            return res.redirect('back');
        }

        if (file.uploaded_by !== userId && userRole !== 'admin') {
            req.flash('error_msg', 'Forbidden: Permission denied.');
            return res.redirect('back');
        }

        const filePath = path.join(__dirname, '../uploads', file.stored_name);
        const uploadsDir = path.join(__dirname, '../uploads');

        if (!filePath.startsWith(uploadsDir) || !fs.existsSync(filePath)) {
            req.flash('error_msg', 'File not found on disk or invalid path.');
            return res.redirect('back');
        }

        res.download(filePath, file.original_name, (err) => {
            if (err && !res.headersSent) {
                console.error("Error downloading file:", err);
                req.flash('error_msg', 'Error downloading file');
                res.redirect('back');
            }
        });
    });
});

router.post('/delete/:id', ensureAuthenticated, (req, res) => {
    const { id: fileId } = req.params;
    const { userId } = req.session;

    db.get(`SELECT * FROM files WHERE id = ? AND uploaded_by = ?`, [fileId, userId], (err, file) => {
        if (err) {
            console.error(err);
            req.flash('error_msg', 'Database error.');
            return res.redirect('/dashboard');
        }

        if (!file) {
            req.flash('error_msg', 'File not found or unauthorized.');
            return res.redirect('/dashboard');
        }

        const filePath = path.join(__dirname, '../uploads', file.stored_name);

        db.run(`DELETE FROM files WHERE id = ?`, [fileId], function (err) {
            if (err) {
                console.error(err);
                req.flash('error_msg', 'Error deleting from database.');
                return res.redirect('/dashboard');
            }

            if (fs.existsSync(filePath)) {
                fs.unlink(filePath, () => { });
            }
            req.flash('success_msg', 'File deleted successfully.');
            res.redirect('/dashboard');
        });
    });
});

module.exports = router;
