const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const transporter = require("../config/mail");
const { v4: uuid } = require("uuid");

// ------------------ HELPER: SEND EMAIL ------------------
async function sendEmail(mailOptions) {
  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) return reject(err);
      resolve(info);
    });
  });
}

// ------------------ REGISTER EMPLOYER ------------------
async function registerEmployer(req, res) {
  try {
    const { fullname, company_name, owner_name, email, phone, password, address, sector } = req.body;

    if (!fullname || !email || !password || !company_name || !owner_name) {
      return res.status(400).json({ error: "Fullname, company_name, owner_name, email, and password are required" });
    }

    const exist = await pool.query("SELECT * FROM users WHERE email=$1 OR phone=$2", [email, phone]);
    if (exist.rowCount > 0) return res.status(400).json({ error: "Email or phone already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newEmployer = await pool.query(
      `INSERT INTO users 
        (id, fullname, company_name, owner_name, email, phone, password, role, address, sector)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [uuid(), fullname, company_name, owner_name, email, phone || null, hashedPassword, "employer", address || null, sector || null]
    );

    const token = jwt.sign({ id: newEmployer.rows[0].id, role: "employer" }, process.env.JWT_SECRET, { expiresIn: "1d" });

    const mailOptions = {
      from: `"AirDigital One" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Activate Your Employer Account",
      html: `
        <p>Hello ${fullname},</p>
        <p>Welcome to AirDigital One! Please activate your employer account by clicking the link below:</p>
        <p><a href="http://localhost:5000/api/v1/user/activate/${token}">Activate Account</a></p>
        <p>If the button does not work, copy and paste the following link into your browser:</p>
        <p>http://localhost:5000/api/v1/user/activate/${token}</p>
      `
    };

    await sendEmail(mailOptions);

    res.json({ message: "Employer registered. Check email to activate account.", user: newEmployer.rows[0] });

  } catch (err) {
    console.error("Register Employer Error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ------------------ ACTIVATE USER ------------------
async function activate(req, res) {
  try {
    const { token } = req.params;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const updated = await pool.query("UPDATE users SET is_verified=true WHERE id=$1 RETURNING *", [decoded.id]);
    if (!updated.rows[0]) return res.status(404).send("User not found");

    const mailOptions = {
      from: `"AirDigital One" <${process.env.EMAIL_USER}>`,
      to: updated.rows[0].email,
      subject: "Your Account is Activated!",
      html: `
        <h2>Welcome, ${updated.rows[0].fullname}!</h2>
        <p>Your account has been successfully activated.</p>
        <p>You can now log in and start using our services.</p>
      `
    };

    await sendEmail(mailOptions);
    res.redirect(`http://localhost:3000/interest?userId=${decoded.id}`);

  } catch (err) {
    console.error("Activation Error:", err);
    res.status(400).send("Invalid or expired activation link");
  }
}

// ------------------ LOGIN (OTP) ------------------
async function login(req, res) {
  try {
    const { emailOrPhone, password } = req.body;
    if (!emailOrPhone || !password) return res.status(400).json({ error: "Email/phone and password are required" });

    const userQuery = await pool.query("SELECT * FROM users WHERE LOWER(email)=LOWER($1) OR phone=$1", [emailOrPhone.trim()]);
    if (userQuery.rowCount === 0) return res.status(404).json({ error: "User not found" });

    const user = userQuery.rows[0];
    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(400).json({ error: "Invalid password" });
    if (!user.is_verified) return res.status(403).json({ error: "Account not activated" });

    await pool.query("DELETE FROM otps WHERE user_id=$1", [user.id]);

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query("INSERT INTO otps (id, user_id, code, expires_at) VALUES ($1, $2, $3, $4)", [uuid(), user.id, otpCode, expires]);

    const mailOptions = {
      from: `"AirDigital One" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "Your Login OTP",
      text: `Your OTP is ${otpCode}. It will expire in 5 minutes.`
    };

    await sendEmail(mailOptions);
    res.json({ message: "OTP sent to email" });

  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ------------------ GET ALL EMPLOYERS ------------------
async function getAllEmployers(req, res) {
  try {
    const result = await pool.query(`
      SELECT id, company_name, registration_number, tax_id, sector,
             number_of_employees, contact_person, contact_email, contact_phone, is_verified
      FROM employer_details
      ORDER BY company_name
    `);
    res.json(result.rows);

  } catch (err) {
    console.error("Get All Employers Error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ------------------ GET EMPLOYER DETAILS ------------------
async function getEmployerDetails(req, res) {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT id, company_name, registration_number, tax_id, sector,
             number_of_employees, physical_address, postal_address, website,
             contact_person, contact_email, contact_phone, company_description,
             operational_areas, business_license_path, tax_certificate_path, logo_path,
             is_verified
      FROM employer_details
      WHERE id=$1
    `, [id]);

    if (result.rowCount === 0) return res.status(404).json({ error: "Employer not found" });
    res.json(result.rows[0]);

  } catch (err) {
    console.error("Get Employer Details Error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ------------------ ACTIVATE EMPLOYER ------------------
async function activateEmployer(req, res) {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      UPDATE employer_details
      SET is_verified=true
      WHERE id=$1
      RETURNING *
    `, [id]);

    if (result.rowCount === 0) return res.status(404).json({ error: "Employer not found" });
    res.json({ message: "Employer activated successfully", employer: result.rows[0] });

  } catch (err) {
    console.error("Activate Employer Error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

module.exports = {
  login,
  registerEmployer,
  activate,
  sendEmail,
  getAllEmployers,
  getEmployerDetails,
  activateEmployer
};
