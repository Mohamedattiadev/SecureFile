const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-cbc';
// Encryption key MUST be exactly 32 bytes for aes-256-cbc.
const rawKey = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012'; // 32 byte fallback
const ENCRYPTION_KEY = Buffer.from(rawKey.substring(0, 32));

const encryptFile = (inputPath, outputPath) => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);

    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);

    input.pipe(cipher).pipe(output);

    return new Promise((resolve, reject) => {
        output.on('finish', () => resolve(iv.toString('hex')));
        output.on('error', reject);
        input.on('error', reject);
    });
};

const decryptFile = (inputPath, outputPath, ivHex) => {
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);

    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);

    input.pipe(decipher).pipe(output);

    return new Promise((resolve, reject) => {
        output.on('finish', resolve);
        output.on('error', reject);
        input.on('error', reject);
    });
};

const encryptText = (text) => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return { iv: iv.toString('hex'), content: encrypted };
};

const decryptText = (encryptedData) => {
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedData.content, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};

const getDecryptedStream = (inputPath, ivHex) => {
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    return fs.createReadStream(inputPath).pipe(decipher);
};

module.exports = { encryptFile, decryptFile, encryptText, decryptText, getDecryptedStream };
