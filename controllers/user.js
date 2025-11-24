const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mail = require("../config/mail");
const { v4: uuid } = require("uuid");

// ------------------ REGISTER ------------------
exports.register = async (req, res) => {
  try {
    const { fullname, email, phone, password } = req.body;

    const userExist = await pool.query(
      "SELECT * FROM users WHERE email=$1 OR phone=$2",
      [email, phone]
    );
    if (userExist.rowCount > 0)
      return res.status(400).json({ error: "Email or phone already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await pool.query(
      "INSERT INTO users (id, fullname, email, phone, password, role) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [uuid(), fullname, email, phone, hashedPassword, "user"]
    );

    const token = jwt.sign(
      { id: newUser.rows[0].id },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    await mail.sendMail({
      to: email,
      subject: "Activate Your Account",
      html: `
        <div style="font-family: Arial; max-width:600px; margin:auto; padding:20px; border:1px solid #e0e0e0; border-radius:8px; background:#f9f9f9;">
          <h2 style="text-align:center;">Welcome!</h2>
          <p>Hi ${fullname || "User"},</p>
          <p>Please click the button below to activate your account:</p>
          <div style="text-align:center; margin:20px 0;">
            <a href="http://localhost:5000/api/v1/user/activate/${token}" 
               style="padding:12px 25px; background:#4CAF50; color:white; border-radius:5px; text-decoration:none; font-weight:bold;">
               Activate Account
            </a>
          </div>
          <p>If the button doesn’t work, copy and paste this URL in your browser:</p>
          <p>http://localhost:5000/api/v1/user/activate/${token}</p>
          <hr />
          <p style="font-size:12px; color:#777;">Ignore this email if you did not register.</p>
        </div>
      `,
    });

    res.json({ message: "User registered. Check email to activate.", user: newUser.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

// ------------------ ACTIVATE ACCOUNT ------------------
exports.activate = async (req, res) => {
  try {
    const { token } = req.params;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const updated = await pool.query(
      "UPDATE users SET is_verified=true WHERE id=$1 RETURNING *",
      [decoded.id]
    );

    if (!updated.rows[0]) return res.status(404).send("User not found");

    res.redirect(`http://localhost:3000/interest?userId=${decoded.id}`);
  } catch (err) {
    console.error(err);
    res.status(400).send("Invalid or expired activation link");
  }
};

// ------------------ LOGIN (with OTP) ------------------
exports.login = async (req, res) => {
  try {
    const { emailOrPhone, password } = req.body;
    if (!emailOrPhone || !password)
      return res.status(400).json({ error: "Email/phone and password are required" });

    const userQuery = await pool.query(
      "SELECT * FROM users WHERE LOWER(email)=LOWER($1) OR phone=$1",
      [emailOrPhone.trim()]
    );
    if (userQuery.rowCount === 0) return res.status(404).json({ error: "User not found" });

    const user = userQuery.rows[0];
    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(400).json({ error: "Invalid password" });

    if (!user.is_verified) return res.status(403).json({ error: "Account not activated" });

    // Generate OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query(
      "INSERT INTO otps (id, user_id, code, expires_at) VALUES ($1,$2,$3,$4)",
      [uuid(), user.id, otpCode, expires]
    );

    await mail.sendMail({
      to: user.email,
      subject: "Your Login OTP",
      text: `Your OTP is ${otpCode}. It will expire in 5 minutes.`,
    });

    res.json({ message: "OTP sent to email" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

// ------------------ VERIFY OTP ------------------
exports.verifyOtp = async (req, res) => {
  try {
    const { emailOrPhone, otp } = req.body;
    if (!emailOrPhone || !otp) return res.status(400).json({ error: "Email/phone and OTP are required" });

    const userQuery = await pool.query(
      "SELECT * FROM users WHERE LOWER(email)=LOWER($1) OR phone=$1",
      [emailOrPhone.trim()]
    );
    if (userQuery.rowCount === 0) return res.status(404).json({ error: "User not found" });

    const user = userQuery.rows[0];
    const otpQuery = await pool.query(
      "SELECT * FROM otps WHERE user_id=$1 ORDER BY expires_at DESC LIMIT 1",
      [user.id]
    );
    if (otpQuery.rowCount === 0) return res.status(400).json({ error: "OTP not found" });

    const otpRecord = otpQuery.rows[0];
    if (new Date() > otpRecord.expires_at) return res.status(400).json({ error: "OTP expired" });
    if (otp !== otpRecord.code) return res.status(400).json({ error: "Invalid OTP" });

    await pool.query("UPDATE users SET is_verified=true WHERE id=$1", [user.id]);
    await pool.query("DELETE FROM otps WHERE id=$1", [otpRecord.id]);

    res.json({ message: "OTP verified successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

// ------------------ RESEND OTP ------------------
exports.resendOtp = async (req, res) => {
  try {
    const { emailOrPhone } = req.body;
    if (!emailOrPhone) return res.status(400).json({ error: "Email or phone is required" });

    const userQuery = await pool.query(
      "SELECT * FROM users WHERE LOWER(email)=LOWER($1) OR phone=$1",
      [emailOrPhone.trim()]
    );
    if (userQuery.rowCount === 0) return res.status(404).json({ error: "User not found" });

    const user = userQuery.rows[0];
    await pool.query("DELETE FROM otps WHERE user_id=$1", [user.id]);

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query(
      "INSERT INTO otps (id,user_id,code,expires_at) VALUES ($1,$2,$3,$4)",
      [uuid(), user.id, otpCode, expires]
    );

    await mail.sendMail({
      to: user.email,
      subject: "Your New OTP Code",
      text: `Your new OTP is ${otpCode}. It will expire in 5 minutes.`,
    });

    res.json({ message: "New OTP sent successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

// ------------------ FORGOT PASSWORD ------------------
exports.forgotPassword = async (req, res) => {
  try {
    const { emailOrPhone } = req.body;
    if (!emailOrPhone) return res.status(400).json({ error: "Email or phone is required" });

    const userQuery = await pool.query(
      "SELECT * FROM users WHERE LOWER(email)=LOWER($1) OR phone=$1",
      [emailOrPhone.trim()]
    );
    if (userQuery.rowCount === 0) return res.status(404).json({ error: "User not found" });

    const user = userQuery.rows[0];
    const resetToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "15m" });
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      "INSERT INTO password_resets (id,user_id,token,expires_at) VALUES ($1,$2,$3,$4)",
      [uuid(), user.id, resetToken, expires]
    );

    await mail.sendMail({
      to: user.email,
      subject: "Password Reset Request",
      html: `
        <div style="font-family: Arial; max-width:600px; margin:auto; padding:20px; border:1px solid #e0e0e0; border-radius:8px; background:#f9f9f9;">
          <h2 style="text-align:center;">Password Reset</h2>
          <p>Hello ${user.fullname || "User"},</p>
          <p>Click the link below to reset your password. Expires in 15 minutes:</p>
          <div style="text-align:center; margin:20px 0;">
            <a href="http://localhost:3000/reset-password/${resetToken}" 
               style="padding:12px 25px; background:#4CAF50; color:white; border-radius:5px; text-decoration:none; font-weight:bold;">
               Reset Password
            </a>
          </div>
          <p>If the link doesn’t work, copy and paste this URL:</p>
          <p>http://localhost:3000/reset-password/${resetToken}</p>
          <hr />
          <p style="font-size:12px; color:#777;">Ignore if you did not request this.</p>
        </div>
      `,
    });

    res.json({ message: "Password reset link sent to your email" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

// ------------------ RESET PASSWORD ------------------
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: "New password is required" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const resetQuery = await pool.query(
      "SELECT * FROM password_resets WHERE user_id=$1 AND token=$2 AND expires_at>NOW()",
      [decoded.id, token]
    );
    if (resetQuery.rowCount === 0) return res.status(400).json({ error: "Token expired or invalid" });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password=$1 WHERE id=$2", [hashedPassword, decoded.id]);
    await pool.query("DELETE FROM password_resets WHERE id=$1", [resetQuery.rows[0].id]);

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};
