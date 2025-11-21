const express = require("express");
const router = express.Router();
const userController = require("../controllers/user");
const { verifyToken, requireRole } = require("../middleware/auth");

// Public routes
router.post("/register", userController.register);
router.get("/activate/:token", userController.activate);
router.post("/login", userController.login);
router.post("/verify-otp", userController.verifyOtp);

// Password reset
router.post("/request-password-reset", userController.requestPasswordReset);
router.post("/reset-password/:token", userController.resetPassword);

// Example admin-only route
router.get("/all", verifyToken, requireRole(["admin"]), async (req, res) => {
    const users = await require("../config/db").query(
        "SELECT id, fullname, email, phone, role FROM users"
    );
    res.json(users.rows);
});

module.exports = router;
