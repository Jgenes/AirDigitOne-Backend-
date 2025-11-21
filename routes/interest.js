const express = require("express");
const router = express.Router();
const interestController = require("../controllers/interest");
const { verifyToken, requireRole } = require("../middleware/auth");

// all routes
router.get("/", verifyToken, interestController.getCategories);
router.post("/save", verifyToken, interestController.saveUserInterests);

// route for admin to add category
router.post("/admin/add-category", verifyToken, requireRole(["admin"]), async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Category name required" });
    const { v4: uuid } = require("uuid");
    await require("../config/db").query("INSERT INTO categories (id, name) VALUES ($1,$2)", [
        uuid(),
        name,
    ]);
    res.json({ message: "Category added" });
});

module.exports = router;
