const express = require("express");
const router = express.Router();
const userController = require("../controllers/user");
router.post("/register", userController.register);
router.post("/login", userController.login);
router.post("/verify-otp", userController.verifyOtp);
router.post("/forgot-password", userController.forgotPassword);
router.post("/reset-password/:token", userController.resetPassword);
router.get("/activate/:token", userController.activate);


module.exports = router;
