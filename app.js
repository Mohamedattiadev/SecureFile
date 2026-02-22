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

const app = express();
const PORT = process.env.PORT || 3000;

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

// Global View Variables middleware - Load early to ensure variables exist even if CSRF fails
app.use((req, res, next) => {
    res.locals.user = req.session ? req.session.userId : null;
    res.locals.username = req.session ? req.session.username : null;
    res.locals.role = req.session ? req.session.role : null;
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    res.locals.title = 'SecureFile'; // Default title
    res.locals.csrfToken = ''; // Default before CSRF runs
    res.locals.formData = null; // Default for form tracking
    next();
});

// Security: Helmet
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:"]
        },
    },
}));
app.disable('x-powered-by');

// Global Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// CSRF Protection globally
app.use(csurf({ cookie: false })); // session based

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
const { ensureAuthenticated } = require('./middleware/authMiddleware');

app.use('/auth', authRoutes);
app.use('/files', fileRoutes);
app.use('/admin', adminRoutes);

// Health Route for Verifications
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
    db.all(`SELECT id, original_name, upload_date FROM files WHERE uploaded_by = ? ORDER BY upload_date DESC`, [userId], (err, files) => {
        if (err) {
            console.error(err);
            req.flash('error_msg', 'Error fetching files');
            return res.status(500).render('error', { title: '500 Internal Error', message: 'Error fetching files', error: { status: 500 } });
        }
        res.render('dashboard', { title: 'Dashboard', files: files });
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
