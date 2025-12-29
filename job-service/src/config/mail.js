const nodemailer = require('nodemailer');
require('dotenv').config();

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT) || 465;
const user = process.env.EMAIL_USER;
const pass = process.env.EMAIL_PASS;

if (!host || !user || !pass) {
  console.warn('SMTP config not fully set (SMTP_HOST/EMAIL_USER/EMAIL_PASS). Email will fail until configured.');
}

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465, // true for 465, false for other ports
  auth: user && pass ? { user, pass } : undefined,
});

module.exports = transporter;