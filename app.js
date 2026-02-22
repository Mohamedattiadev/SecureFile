require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const csurf = require('csurf');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cookieParser = require('cookie-parser');
const expressLayouts = require('express-ejs-layouts');
const flash = require('connect-flash');
const db = require('./database');
const { errorHandler } = require('./middleware/errorHandler');

const { cleanupExpiredFiles, cleanupExpiredTokens } = require('./utils/worker');
cleanupExpiredFiles();
cleanupExpiredTokens();

const app = express();
const PORT = process.env.PORT || 3000;

// HTTPS Enforcement in Production
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (req.headers['x-forwarded-proto'] !== 'https') {
            return res.redirect(['https://', req.get('Host'), req.url].join(''));
        }
        next();
    });
}

// View Engine & Layout Setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layout');

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret_for_dev_only',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 2
    },
    name: 'sessionId'
}));

// Flash messages
app.use(flash());

// Global View Variables middleware
app.use((req, res, next) => {
    res.locals.user = req.session ? req.session.userId : null;
    res.locals.username = req.session ? req.session.username : null;
    res.locals.role = req.session ? req.session.role : null;
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    res.locals.title = 'SecureFile';
    res.locals.csrfToken = '';
    res.locals.formData = null;
    res.locals.notifications = [];

    if (req.session && req.session.userId) {
        db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 5', [req.session.userId], (err, notifs) => {
            if (!err && notifs) {
                res.locals.notifications = notifs;
            }
            next();
        });
    } else {
        next();
    }
});

// Security: Helmet
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https://*"],
            connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
            upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
        },
    },
    hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false
}));
app.disable('x-powered-by');

// Advanced Rate Limiting
const rateLimitHandler = (req, res, next, options) => {
    res.status(options.statusCode).render('error', {
        title: `${options.statusCode} Too Many Requests`,
        message: options.message,
        error: { status: options.statusCode }
    });
};

const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, handler: rateLimitHandler });
const searchLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 50, message: 'Too many search attempts', handler: rateLimitHandler });
const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many uploads', handler: rateLimitHandler });

app.use(globalLimiter);

// CSRF Protection globally
app.use(csurf({ cookie: false }));

// Set up CSRF token for views
app.use((req, res, next) => {
    res.locals.csrfToken = req.csrfToken();
    next();
});

// CSRF Error Handler
app.use(function (err, req, res, next) {
    if (err.code !== 'EBADCSRFTOKEN') return next(err);
    res.status(403).render('error', {
        title: '403 Forbidden',
        message: 'Form tampered with (CSRF token missing or invalid)',
        error: { status: 403 }
    });
});

// Routes
const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const adminRoutes = require('./routes/admin');
const profileRoutes = require('./routes/profile');
const messageRoutes = require('./routes/messages');
const folderRoutes = require('./routes/folders');
const shareRoutes = require('./routes/share');
const notificationRoutes = require('./routes/notifications');

const { ensureAuthenticated } = require('./middleware/authMiddleware');

app.use('/auth', authRoutes);
app.use('/files', fileRoutes);
app.use('/admin', adminRoutes);
app.use('/profile', profileRoutes);
app.use('/messages', messageRoutes);
app.use('/folders', folderRoutes);
app.use('/share', shareRoutes);
app.use('/notifications', notificationRoutes);

// Health Route
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Home
app.get('/', (req, res) => {
    res.render('index', { title: 'Home - SecureFile' });
});

// Dashboard
app.get('/dashboard', ensureAuthenticated, (req, res) => {
    const userId = req.session.userId;
    const generatedLink = req.session.generatedLink || null;
    req.session.generatedLink = null;
    // Fetch user files and folders
    db.all(`SELECT * FROM folders WHERE owner_id = ? AND parent_id IS NULL`, [userId], (err, folders) => {
        db.all(`
            SELECT f.*, GROUP_CONCAT(u.username, ', ') as shared_with_names
            FROM files f
            LEFT JOIN file_shares s ON f.id = s.file_id
            LEFT JOIN users u ON s.shared_with_id = u.id
            WHERE f.uploaded_by = ? AND f.folder_id IS NULL 
            GROUP BY f.id
            ORDER BY f.upload_date DESC
        `, [userId], (err, files) => {
            res.render('dashboard', { title: 'Dashboard', files, folders, generatedLink });
        });
    });
});

// 404 & Central Error
app.use((req, res) => {
    res.status(404).render('error', { title: '404 Not Found', message: 'Page Not Found', error: { status: 404 } });
});
app.use(errorHandler);

// Only listen if not required via tests
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`SecureFile App running on http://localhost:${PORT}`);
    });
}

module.exports = app;
