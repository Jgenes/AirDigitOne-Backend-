const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const transporter = require("../config/mail"); // Hostinger SMTP
const { v4: uuid } = require("uuid");

// ------------------ HELPER: SEND EMAIL ------------------
async function sendEmail(mailOptions) {
  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error("❌ Email error:", err);
        reject(err);
      } else {
        console.log("✅ Email sent:", info.response);
        resolve(info);
      }
    });
  });
}

// ------------------ REGISTER ------------------
async function register(req, res) {
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

    const mailOptions = {
      from: `"AirDigital One" <${process.env.EMAIL_USER}>`,
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
      `
    };

    await sendEmail(mailOptions);

    res.json({ message: "User registered. Check email to activate.", user: newUser.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}

// ------------------ ACTIVATE ACCOUNT ------------------
async function activate(req, res) {
  try {
    const { token } = req.params;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const updated = await pool.query(
      "UPDATE users SET is_verified=true WHERE id=$1 RETURNING *",
      [decoded.id]
    );

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
    console.error(err);
    res.status(400).send("Invalid or expired activation link");
  }
}

// ------------------ LOGIN (OTP) ------------------
async function login(req, res) {
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

    await pool.query("DELETE FROM otps WHERE user_id=$1", [user.id]);

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query(
      "INSERT INTO otps (id, user_id, code, expires_at) VALUES ($1, $2, $3, $4)",
      [uuid(), user.id, otpCode, expires]
    );

    const mailOptions = {
      from: `"AirDigital One" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "Your Login OTP",
      text: `Your OTP is ${otpCode}. It will expire in 5 minutes.`
    };

    await sendEmail(mailOptions);

    res.json({ message: "OTP sent to email" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}

// ------------------ VERIFY OTP ------------------
async function verifyOtp(req, res) {
  try {
    const { emailOrPhone, otp } = req.body;

    if (!emailOrPhone || !otp) {
      return res.status(400).json({ error: "Email/phone and OTP are required" });
    }

    const userQuery = await pool.query(
      "SELECT * FROM users WHERE LOWER(email)=LOWER($1) OR phone=$1",
      [emailOrPhone.trim()]
    );

    if (userQuery.rowCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userQuery.rows[0];

    const otpQuery = await pool.query(
      "SELECT * FROM otps WHERE user_id=$1 ORDER BY expires_at DESC LIMIT 1",
      [user.id]
    );

    if (otpQuery.rowCount === 0) {
      return res.status(400).json({ error: "OTP not found" });
    }

    const otpRecord = otpQuery.rows[0];

    // Check expiration
    if (new Date() > otpRecord.expires_at) {
      return res.status(400).json({ error: "OTP expired" });
    }

    // Check code
    if (otp.toString().trim() !== otpRecord.code.toString().trim()) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    // Valid OTP → delete it
    await pool.query("DELETE FROM otps WHERE id=$1", [otpRecord.id]);

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // Check for existing interests
    const interestCheck = await pool.query(
      "SELECT * FROM user_interests WHERE user_id=$1",
      [user.id]
    );

    const hasInterest = interestCheck.rowCount > 0;

    return res.json({
      message: "OTP verified successfully",
      token,
      hasInterest,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}


// ------------------ FORGOT PASSWORD ------------------
async function forgotPassword(req, res) {
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

    const mailOptions = {
      from: `"AirDigital One" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "Reset Your Password",
      html: `<p>Hello ${user.fullname},</p>
             <p>Click the link to reset your password: 
             <a href="http://localhost:3000/reset-password/${resetToken}">Reset Password</a></p>`
    };

    await sendEmail(mailOptions);

    res.json({ message: "Password reset link sent to email" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}

// ------------------ RESET PASSWORD ------------------
async function resetPassword(req, res) {
  try {
    const { token } = req.params;
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "New password required" });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query("UPDATE users SET password=$1 WHERE id=$2", [hashedPassword, decoded.id]);

    const userQuery = await pool.query("SELECT * FROM users WHERE id=$1", [decoded.id]);
    const user = userQuery.rows[0];

    const mailOptions = {
      from: `"AirDigital One" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "Password Updated Successfully",
      html: `<p>Hello ${user.fullname},</p><p>Your password has been updated successfully.</p>`
    };

    await sendEmail(mailOptions);

    res.json({ message: "Password reset successful" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}

// ------------------ EXPORT ALL FUNCTIONS ------------------
module.exports = {
  register,
  activate,
  login,
  verifyOtp,
  forgotPassword,
  resetPassword,
  sendEmail // optional
};
