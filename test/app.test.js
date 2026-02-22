// Set test database to avoid dropping real dev data
process.env.DB_FILE = 'test_database.sqlite';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../app');
const db = require('../database');
const fs = require('fs');
const path = require('path');

// Helper to extract CSRF token from html response
function extractCsrfToken(html) {
    const match = html.match(/name="_csrf" value="([^"]+)"/);
    return match ? match[1] : null;
}

describe('SecureFile End-to-End Tests', () => {
    let server;
    let agent;
    let csrfToken;
    let testUserId;

    beforeAll((done) => {
        // Start server specifically for supertest agent if needed, 
        // but supertest handles mounting automatically.
        agent = request.agent(app);

        // Wait for DB to initialize tables (from database.js)
        setTimeout(() => {
            // Clean up old test data
            db.run("DELETE FROM users WHERE username = 'testuser'", () => {
                done();
            });
        }, 1000); // give sqlite a second to init
    });

    afterAll((done) => {
        // Cleanup test db
        const dbPath = path.resolve(__dirname, '../', process.env.DB_FILE);

        db.close((err) => {
            if (err) console.error('Error closing test db:', err.message);
            if (fs.existsSync(dbPath)) {
                fs.unlinkSync(dbPath);
            }
            done();
        });
    });

    it('1. Should return 200 JSON on /health route', async () => {
        const res = await request(app).get('/health');
        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('ok');
    });

    it('2. Should load register page and provide a CSRF token', async () => {
        const res = await agent.get('/auth/register');
        expect(res.statusCode).toBe(200);
        csrfToken = extractCsrfToken(res.text);
        expect(csrfToken).toBeTruthy();
    });

    it('3. Should block registration if CSRF is missing or invalid', async () => {
        const res = await agent.post('/auth/register').send({
            username: 'hackerman',
            email: 'hacker@example.com',
            password: 'password123',
            _csrf: 'invalid_token'
        });
        expect(res.statusCode).toBe(403);
        expect(res.text).toContain('Form tampered with');
    });

    it('4. Should register a new user successfully', async () => {
        const res = await agent.post('/auth/register').send({
            username: 'testuser',
            email: 'testuser@example.com',
            password: 'SecurePassword123',
            _csrf: csrfToken
        });
        expect(res.statusCode).toBe(302); // redirect to login
        expect(res.headers.location).toBe('/auth/login');
    });

    it('5. Should load login page and get new CSRF token', async () => {
        const res = await agent.get('/auth/login');
        expect(res.statusCode).toBe(200);
        csrfToken = extractCsrfToken(res.text);
        expect(csrfToken).toBeTruthy();
    });

    it('6. Should login successfully and persist session', async () => {
        const res = await agent.post('/auth/login').send({
            username: 'testuser',
            password: 'SecurePassword123',
            _csrf: csrfToken
        });
        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe('/dashboard');

        // Verify session persistence by accessing dashboard
        const dashRes = await agent.get('/dashboard');
        expect(dashRes.statusCode).toBe(200);
        expect(dashRes.text).toContain('testuser'); // username should be in navbar

        // Update CSRF token for the dashboard upload form
        csrfToken = extractCsrfToken(dashRes.text);
    });

    it('7. Should block unauthorized access to admin panel (IDOR/Role restriction)', async () => {
        const res = await agent.get('/admin');
        expect(res.statusCode).toBe(403);
        expect(res.text).toContain('Forbidden');
    });

    it('8. Should upload a text file securely', async () => {
        // Create a dummy file
        const testFilePath = path.join(__dirname, 'dummy.txt');
        fs.writeFileSync(testFilePath, 'Hello Secure World');

        const res = await agent.post(`/files/upload?_csrf=${csrfToken}`)
            .attach('document', testFilePath);

        expect(res.statusCode).toBe(302); // Redirect back to dashboard
        expect(res.headers.location).toBe('/dashboard');

        // Verify it appears on dashboard
        const dashRes = await agent.get('/dashboard');
        expect(dashRes.text).toContain('dummy.txt');

        fs.unlinkSync(testFilePath); // cleanup raw
    });

    it('9. Should block invalid file type upload', async () => {
        const testFilePath = path.join(__dirname, 'malicious.php');
        fs.writeFileSync(testFilePath, '<?php echo "hacked"; ?>');

        const res = await agent.post(`/files/upload?_csrf=${csrfToken}`)
            .attach('document', testFilePath);

        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe('/dashboard');

        // Flash message should contain error about file type
        const dashRes = await agent.get('/dashboard');
        expect(dashRes.text).toContain('Invalid file type');

        fs.unlinkSync(testFilePath);
    });
});
