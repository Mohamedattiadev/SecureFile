# End-to-End Manual Testing & Security Verification Guide

This guide walks through validating the newly redesigned Bootstrap 5 SecureFile Application.

## Test Case 1: Normal User Flow
1. **Start Server**: `npm start`
2. **Access App**: Go to `http://localhost:3000`
3. **Register**: Click "Get Started" and create an account (e.g., `user1`, `user1@example.com`, `password123`).
4. **Observation**: You should be smoothly redirected to Login with a success flash message.
5. **Login**: Enter the credentials.
6. **Observation**: Redirected to the modern SaaS-like dashboard. Your username appears in the top right.
7. **Upload**: Select a valid `.txt` or `.png` file. Click "Upload File".
8. **Observation**: A success flash message appears. The file appears in the "Your Files" table.
9. **Download**: Click the download icon matching your file. 
10. **Observation**: The browser downloads the originally named file.

## Test Case 2: Upload Invalid File (Malicious Upload Attempt)
1. **Setup**: Create a file named `shell.php` with contents `<?php system($_GET['c']); ?>`.
2. **Action**: On the Dashboard, attempt to upload `shell.php`.
3. **Observation**: The application redirects back to the dashboard with a red flash message stating `Invalid file type`. The file never hits the disk.
4. **Action (Double Extension)**: Rename it to `shell.php.jpg` and try again.
5. **Observation**: The backend strict validation blocks it with `Double extensions are not allowed`.

## Test Case 3: IDOR (Insecure Direct Object Reference) Attempt
1. **Setup**: Log in as `user1` and upload a file. Hover over the "Download" button to see the ID (e.g., `/files/download/2`).
2. **Action**: Open a different browser (or an incognito window), navigate to `/auth/register` and make `user2`.
3. **Action**: Log in as `user2`. Manually type the URL `http://localhost:3000/files/download/2`.
4. **Observation**: The screen displays an Error 400/403 stating `Forbidden: Permission denied.` `user2` cannot access `user1`'s files.

## Test Case 4: CSRF (Cross-Site Request Forgery) Bypass Attempt
1. **Action**: Open the Developer Tools in the browser while logged in.
2. **Action**: Edit the HTML of the Upload Form. Find the `<input type="hidden" name="_csrf" value="...">` (or the `?_csrf` in the form action URL) and change a character in the token token hash.
3. **Action**: Submit the form.
4. **Observation**: The application rejects the request, kicking you to the `Error 403: Form tampered with` screen.

## Test Case 5: Rate Limit Detection (Brute Force Protection)
1. **Action**: Go to the login page.
2. **Action**: Intentionally type the wrong password 6 times rapidly.
3. **Observation**: On the 6th attempt, instead of processing the login, the server responds with a simple text message: `Too many login attempts from this IP, please try again after 15 minutes`. (The brute force is halted).

## Test Case 6: Admin Privilege Escalation
1. **Action**: While logged in as a normal user, manually attempt to navigate to `http://localhost:3000/admin`.
2. **Observation**: Server responds with `Error 403: Forbidden: You do not have the required permissions.`

## Production Security Notes
- **Stack Traces**: Make sure to run `NODE_ENV=production node app.js`. Try triggering a 500 error — you will no longer see raw stack traces, only a generic user-friendly error string.
- **Cookies**: In `production`, session cookies are automatically marked `Secure`, avoiding transmission over unencrypted HTTP.
