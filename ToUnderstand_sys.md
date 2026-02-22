# SecureFile Application

A production-ready secure web application for managing files, built with Node.js, Express, and SQLite.

## Features
- Secure Authentication (Register, Login, Logout)
- Role-Based Access Control (Admin and User)
- Secure File Upload and Download
- User Dashboard for Managing Files
- Global Admin Panel

---

## Deployment Instructions

### 1. Local Development
1. **Prerequisites**: Ensure you have Node.js (v18+) and npm installed.
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Configuration**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   *Edit `.env` to set your desired `PORT` and a strong `SESSION_SECRET`*.
4. **Database Setup**:
   The SQLite database (`database.sqlite`) will be initialized automatically on the first run. The default admin account is created with `admin / adminpassword123`. **Change this immediately in a production environment.**
5. **Start Server**:
   ```bash
   node app.js
   ```
   Access the application at `http://localhost:3000`.

### 2. Production Deployment (Render, Railway, etc.)
1. **Environment Variables**:
   In your hosting platform’s dashboard, configure the following environment variables:
   - `NODE_ENV=production`
   - `SESSION_SECRET=<a_very_long_secure_random_string>`
   - `PORT=<provided_by_host>`
2. **Persistent Storage**:
   SQLite and the `uploads` directory write to the local filesystem. On ephemeral filesystems (like Heroku), these will be lost on restart. For persistent storage on platforms like Railway or Render:
   - Mount a persistent disk volume to the `uploads/` path.
   - Mount a persistent disk volume for the SQLite database OR migrate the SQLite code to use PostgreSQL/MySQL.
3. **Session Configuration**:
   The code automatically sets `secure: true` for cookies when `NODE_ENV='production'`. Ensure your app is served over HTTPS.

### 3. Security Hardening in Production
- **HTTPS Enforcement**: Use a reverse proxy (like Nginx) or your cloud provider to force all traffic to HTTPS, and terminate SSL there.
- **Reverse Proxy Setup**: If using Nginx, configure `proxy_pass` to the node app and properly set headers (`X-Forwarded-For`, etc.). In `app.js`, add `app.set('trust proxy', 1)` if behind a proxy to ensure rate limiting and secure cookies work correctly.
- **Rate Limiting Tuning**: Adjust the `express-rate-limit` window and max variables in `app.js` and `auth.js` depending on your expected traffic volume.
- **Logging**: Implement a logging framework like `winston` or `morgan` to keep structured logs of access and errors.

---

## Security Documentation

### How Vulnerabilities are Prevented

1. **SQL Injection (SQLi)**
   - All interactions with the SQLite database use parameterized queries via the `sqlite3` library (`db.run(query, [params])`, etc.). Raw strings from user input are never concatenated into SQL commands.

2. **Cross-Site Scripting (XSS)**
   - EJS templates (`<%= ... %>`) automatically HTML-escape all variables, preventing stored XSS from filenames or usernames.
   - `helmet` is used to implement a basic Content Security Policy (CSP), restricting where scripts can be loaded or executed.
   - User inputs during registration/login are sanitized using `express-validator` (e.g., `trim()`, `escape()`).

3. **Cross-Site Request Forgery (CSRF)**
   - The `csurf` middleware generates a unique CSRF token per session.
   - This token is required on all state-changing POST requests (login, register, upload, delete). If missing or invalid, the request is rejected.

4. **Insecure Direct Object Reference (IDOR)**
   - When downloading or deleting a file, the backend verifies that `file.uploaded_by === req.session.userId` or that `req.session.role === 'admin'`. A user cannot guess another file's ID and access it.

5. **Brute Force Attacks**
   - `express-rate-limit` is applied to the login route (max 5 attempts per 15 mins per IP).
   - Global rate limiting is applied to the entire application.
   - `bcrypt` is used with 10 salt rounds to slow down offline password cracking.

6. **Path Traversal**
   - Uploaded files are renamed aggressively using `crypto.randomUUID()`. Original names provided by the client are never used directly on the filesystem.
   - During download (`res.download`), the resolved file path is strictly verified to ensure it starts with the designated `/uploads` directory using `filePath.startsWith(uploadsDir)`.

7. **Malicious File Uploads**
   - File extensions are strictly checked against an allowlist (`.pdf`, `.png`, `.jpg`, `.txt`).
   - MIME types provided by Multer are also checked against an allowlist.
   - Double-extensions (e.g., `file.php.jpg`) are explicitly blocked.
   - Upload size is restricted to 5MB to prevent Denial of Service via storage exhaustion.

### Intentional Weakening (For Educational Security Testing)

*Warning: Revert these changes for production!*

To create a "Phase 1 insecure version":
1. **Disable Parameterized Queries**: Change `db.get("SELECT * FROM users WHERE username = ?", [username])` to `db.get("SELECT * FROM users WHERE username = '" + username + "'")` to allow SQLi.
2. **Remove File Renaming**: In `files.js` Multer setup, use `cb(null, file.originalname)` instead of generating a UUID. This introduces Path Traversal and Stored XSS risks via filenames.
3. **Remove IDOR Checks**: In the `/download/:id` route, remove the `if (file.uploaded_by !== userId && userRole !== 'admin')` block.
4. **Disable CSRF**: Remove `csurf` middleware from `app.js` and remove hidden CSRF fields from EJS templates.
5. **Disable Password Hashing**: Store passwords in plaintext in the database instead of using `bcrypt`.

### Penetration Testing Checklist
- [ ] Attempt SQL Injection on Login (`' OR 1=1 --`) and Register endpoints.
- [ ] Attempt to upload a Web Shell (`.php`, `.jsp`, `.nodejs`) disguised with double extensions or wrong MIME types.
- [ ] Attempt Directory Traversal by manipulating the filename during upload or the `id` during download (e.g., `../../etc/passwd`).
- [ ] Intercept a legitimate upload request and see if you can change the `uploaded_by` field (Mass Assignment).
- [ ] Log in as User A, find a file ID belonging to User B, and attempt to view or delete it (IDOR).
- [ ] Capture a POST request, remove the CSRF token, and resend it (CSRF validation test).
- [ ] Attempt to bruteforce the login page to trigger the rate limiter.
- [ ] Verify session cookies have `HttpOnly` and `SameSite` flags.
- [ ] Upload a file named `<script>alert(1)</script>.txt` and check if the dashboard renders the alert (Stored XSS).
