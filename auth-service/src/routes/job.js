
const express = require('express');
const router = express.Router();
const { savedProfile } = require('./../controllers/jobs/profile');
const { verifyToken, requireRole } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'profiles');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, uploadDir);
	},
	filename: function (req, file, cb) {
		const ext = path.extname(file.originalname);
		const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
		cb(null, filename);
	}
});

const upload = multer({
	storage,
	limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
	fileFilter: (req, file, cb) => {
		if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed'), false);
		cb(null, true);
	}
});

// Route to save a job profile, accessible only to authenticated users with 'user' role
// Accepts multipart/form-data with optional `profile_picture` file field
router.post('/save-profile', verifyToken, requireRole(['user']), upload.single('profile_picture'), savedProfile);

module.exports = router;