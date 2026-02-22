# 🛡️ SecureFile

SecureFile is a production-ready, secure file management web application built with Node.js and Express. It features a modern Bootstrap 5 UI, robust authentication, and enterprise-grade security protections against common web vulnerabilities.

## 🚀 Features

- **Modern UI/UX**: Responsive design using Bootstrap 5 with a clean "SaaS" aesthetic.
- **Secure File Handling**:
  - MIME-type validation.
  - File size limits (5MB).
  - Double extension prevention.
  - Path traversal protection (UUID renaming).
- **Authentication & Authorization**:
  - Secure login/registration with Bcrypt password hashing.
  - Session-based authentication with secure cookie settings.
  - Role-based access control (User vs. Admin).
  - IDOR (Insecure Direct Object Reference) prevention for file downloads/deletions.
- **Security Protections**:
  - CSRF protection on all state-changing routes.
  - Rate limiting for brute-force prevention on authentication routes.
  - Secure HTTP headers via Helmet.js.
  - Input sanitization and validation.
- **Admin Dashboard**: Comprehensive view for administrators to manage all users and files in the system.

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite (managed via `sqlite3`)
- **Templating**: EJS with `express-ejs-layouts`
- **Styling**: Bootstrap 5, Bootstrap Icons, Vanilla CSS
- **Testing**: Jest, Supertest

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

## ⚙️ Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd securefile
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy the example environment file and update the values:
   ```bash
   cp .env.example .env
   ```
   *Note: Ensure you set a strong `SESSION_SECRET` for production.*

4. **Initialize Database**:
   The database tables will be automatically created on the first run.

## 🏃 Usage

### Development / Production
To start the application:
```bash
npm start
```
The app will be available at `http://localhost:3000`.

### Testing
To run the automated integration test suite:
```bash
npm test
```

## 📂 Project Structure

```text
├── middleware/          # Custom auth, role, and error middlewares
├── public/              # Static assets (CSS, JS, Images)
├── routes/              # Express route handlers
├── test/                # Automated Jest/Supertest suite
├── uploads/             # Encrypted/Renamed file storage
├── views/               # EJS templates and layouts
├── app.js               # Application entry point & configuration
├── database.js          # SQLite connection and schema setup

```

## 🔒 Security Best Practices Implemented

- **CSRF Protection**: Every form inclusion requires a token. Multipart forms handle tokens via query parameters to ensure `multer` compliance.
- **Session Security**: Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` (in production).
- **Error Handling**: Centralized handler prevents information leakage by hiding stack traces in production.
- **XSS Prevention**: EJS handles output encoding, and Helmet's CSP restricts unauthorized script execution.

## 📝 Documentation
- [Manual Testing Guide](MANUAL_TEST_GUIDE.md): Scenario-based verification of security features.

## ⚖️ License
This project is for educational security purposes. Use responsibly.
