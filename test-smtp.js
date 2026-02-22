require('dotenv').config();
const nodemailer = require('nodemailer');

async function testMail() {
    console.log("Using Host:", process.env.MAIL_HOST);
    console.log("Using Port:", process.env.MAIL_PORT);
    console.log("Using User:", process.env.MAIL_USER);
    // don't log pass obviously

    const transporter = nodemailer.createTransport({
        host: process.env.MAIL_HOST,
        port: process.env.MAIL_PORT || 587,
        secure: process.env.MAIL_PORT == 465,
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASS
        },
        logger: true,
        debug: true
    });

    try {
        console.log("Verifying connection...");
        const valid = await transporter.verify();
        console.log("Connection Verified:", valid);
    } catch (e) {
        console.error("Connection Failed:", e);
    }
}
testMail();
