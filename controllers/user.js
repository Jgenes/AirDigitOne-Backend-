const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mail = require("../config/mail");
const { v4: uuid } = require("uuid");


// REGISTER
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
            { id: newUser.rows[0].id, role: newUser.rows[0].role },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        await mail.sendMail({
            to: email,
            subject: "Activate Your Account",
            html: `<p>Click link to activate:</p> <a href="http://localhost:5000/api/user/activate/${token}">Activate</a>`,
        });

        res.json({
            message: "User registered, check email to activate",
            user: newUser.rows[0],
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
};

// ACTIVATE ACCOUNT
exports.activate = async (req, res) => {
    try {
        const { token } = req.params;
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const updated = await pool.query(
            "UPDATE users SET is_verified=true WHERE id=$1 RETURNING *",
            [decoded.id]
        );
        res.json({ message: "Account activated", user: updated.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: "Invalid token" });
    }
};

// LOGIN
exports.login = async (req, res) => {
    try {
        const { emailOrPhone, password } = req.body;
        const userQuery = await pool.query(
            "SELECT * FROM users WHERE email=$1 OR phone=$1",
            [emailOrPhone]
        );
        if (userQuery.rowCount === 0)
            return res.status(400).json({ error: "User not found" });

        const user = userQuery.rows[0];
        const validPass = await bcrypt.compare(password, user.password);
        if (!validPass) return res.status(400).json({ error: "Invalid password" });

        // generate OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

        await pool.query(
            "INSERT INTO otps (id, user_id, code, expires_at) VALUES ($1,$2,$3,$4)",
            [uuid(), user.id, otpCode, expires]
        );

        await mail.sendMail({
            to: user.email,
            subject: "Your Login OTP",
            text: `Your OTP is ${otpCode}`,
        });

        res.json({ message: "OTP sent to email" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
};

// VERIFY OTP
exports.verifyOtp = async (req, res) => {
    try {
        const { emailOrPhone, otp } = req.body;

        if (!emailOrPhone || !otp)
            return res.status(400).json({ error: "Email/phone and OTP are required" });

        const userQuery = await pool.query(
            "SELECT * FROM users WHERE (LOWER(email)=LOWER($1) OR phone=$1) AND is_verified=true",
            [emailOrPhone]
        );
        if (userQuery.rowCount === 0)
            return res.status(404).json({ error: "User not found or not verified" });

        const user = userQuery.rows[0];

        const otpQuery = await pool.query(
            "SELECT * FROM otps WHERE user_id=$1 AND code=$2 AND expires_at > NOW()",
            [user.id, otp]
        );
        if (otpQuery.rowCount === 0)
            return res.status(400).json({ error: "Invalid or expired OTP" });

        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            message: "Login successful",
            token,
            user: {
                id: user.id,
                fullname: user.fullname,
                email: user.email,
                phone: user.phone,
                role: user.role,
            },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
};



// request password reset
exports.requestPasswordReset = async (req, res) => {
    try {
        const { emailOrPhone } = req.body;
        if (!emailOrPhone) return res.status(400).json({ error: "Email or phone is required" });

        const userQuery = await pool.query(
            "SELECT * FROM users WHERE LOWER(email)=LOWER($1) OR phone=$1",
            [emailOrPhone]
        );
        if (userQuery.rowCount === 0) return res.status(404).json({ error: "User not found" });

        const user = userQuery.rows[0];

        // Generate a reset token (JWT) valid for 15 minutes
        const resetToken = jwt.sign(
            { id: user.id },
            process.env.JWT_SECRET,
            { expiresIn: "15m" }
        );

        // Save token in password_resets table
        const expires = new Date(Date.now() + 15*60*1000);
        await pool.query(
            "INSERT INTO password_resets (id, user_id, token, expires_at) VALUES ($1,$2,$3,$4)",
            [uuid(), user.id, resetToken, expires]
        );

        // Send email with reset link
        await mail.sendMail({
            to: user.email,
            subject: "Password Reset Request",
            html: `<p>Click to reset your password (expires in 15 mins):</p>
                   <a href="http://localhost:5000/api/user/reset-password/${resetToken}">Reset Password</a>`
        });

        res.json({ message: "Password reset email sent" });
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

        // Verify JWT token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(400).json({ error: "Invalid or expired token" });
        }

        // Check token in DB and not expired
        const resetQuery = await pool.query(
            "SELECT * FROM password_resets WHERE user_id=$1 AND token=$2 AND expires_at > NOW()",
            [decoded.id, token]
        );
        if (resetQuery.rowCount === 0) return res.status(400).json({ error: "Token expired or invalid" });

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update user password
        await pool.query("UPDATE users SET password=$1 WHERE id=$2", [hashedPassword, decoded.id]);

        // Delete used reset token
        await pool.query("DELETE FROM password_resets WHERE id=$1", [resetQuery.rows[0].id]);

        res.json({ message: "Password reset successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
};
