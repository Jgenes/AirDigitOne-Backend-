const express = require("express");
const router = express.Router();
const interestController = require("../controllers/interest");
const { verifyToken, requireRole } = require("../middleware/auth");

// Get categories & items
router.get("/", verifyToken, interestController.getCategories);

// Save user interests
router.post("/save", verifyToken, interestController.saveUserInterests);

// Admin add category
router.post(
  "/admin/add-category",
  verifyToken,
  requireRole(["admin"]),
  interestController.addCategory
);

module.exports = router;
