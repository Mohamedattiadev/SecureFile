const nodemailer = require('nodemailer');

let transporter;

const initTransporter = async () => {
    if (transporter) return;

    if (process.env.NODE_ENV !== 'production' && (!process.env.MAIL_HOST || process.env.MAIL_HOST === 'localhost')) {
        console.log('[MAILER] Generating Ethereal Email test account...');
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
            host: "smtp.ethereal.email",
            port: 587,
            secure: false,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass,
            },
        });
        console.log(`[MAILER] Ethereal account ready: ${testAccount.user}`);
    } else {
        transporter = nodemailer.createTransport({
            host: process.env.MAIL_HOST,
            port: process.env.MAIL_PORT || 587,
            secure: process.env.MAIL_PORT == 465,
            auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASS
            }
        });
    }
};

const sendEmail = async (to, subject, html) => {
    try {
        await initTransporter();

        const info = await transporter.sendMail({
            from: `"SecureFile" <${process.env.MAIL_FROM || 'no-reply@securefile.com'}>`,
            to,
            subject,
            html
        });

        if (process.env.NODE_ENV !== 'production' && (!process.env.MAIL_HOST || process.env.MAIL_HOST === 'localhost')) {
            console.log(`[MAILER] Message sent to ${to}`);
            console.log(`[MAILER] ----------------------------------------------------`);
            console.log(`[MAILER] PREVIEW URL: ${nodemailer.getTestMessageUrl(info)}`);
            console.log(`[MAILER] ----------------------------------------------------`);
        }
        return true;
    } catch (error) {
        console.error('Email sending failed:', error.message);
        return false;
    }
};

const emailTemplate = (title, header, bodyText, buttonText, buttonUrl) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8f9fa;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 40px 0;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <!-- Header -->
                    <tr>
                        <td align="center" style="background-color: #0d6efd; padding: 30px;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">SecureFile</h1>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <h2 style="color: #212529; margin-top: 0; margin-bottom: 20px; font-size: 20px;">${header}</h2>
                            <p style="color: #495057; font-size: 16px; line-height: 1.5; margin-bottom: 30px;">${bodyText}</p>
                            
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center">
                                        <a href="${buttonUrl}" style="background-color: #0d6efd; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 5px; font-weight: bold; display: inline-block; font-size: 16px;">${buttonText}</a>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="color: #6c757d; font-size: 14px; line-height: 1.5; margin-top: 30px; margin-bottom: 0;">
                                Or copy and paste this link into your browser:<br>
                                <a href="${buttonUrl}" style="color: #0d6efd; text-decoration: none; word-break: break-all;">${buttonUrl}</a>
                            </p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f1f3f5; padding: 20px; text-align: center;">
                            <p style="color: #adb5bd; font-size: 12px; margin: 0;">&copy; ${new Date().getFullYear()} SecureFile. All rights reserved.</p>
                            <p style="color: #adb5bd; font-size: 12px; margin: 5px 0 0 0;">If you did not request this email, please ignore it.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;

const sendVerificationEmail = async (email, token) => {
    const url = `${process.env.APP_URL || 'http://localhost:3000'}/auth/verify-email?token=${token}`;
    const html = emailTemplate(
        'Verify your Email',
        'Welcome to SecureFile!',
        'You are just one step away from securely managing your files. Please confirm your email address by clicking the button below. This link expires in 24 hours.',
        'Verify Email Address',
        url
    );
    return sendEmail(email, 'Verify your SecureFile Email', html);
};

const sendPasswordResetEmail = async (email, token) => {
    const url = `${process.env.APP_URL || 'http://localhost:3000'}/auth/reset-password?token=${token}`;
    const html = emailTemplate(
        'Reset Password',
        'Password Reset Request',
        'We received a request to reset your SecureFile password. Click the button below to set a new password. This link expires in 30 minutes.',
        'Reset Password',
        url
    );
    return sendEmail(email, 'SecureFile Password Reset', html);
};

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
