
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const { registerEmployer, getEmployer, adminUpdateEmployerStatus } = require('../controllers/employer.controller');

router.post('/employers/register', registerEmployer);
router.get('/employers/:id', getEmployer);
// Admin endpoint to update status: body { action: 'VERIFY'|'REJECT'|'SUSPEND', adminId?, reason? }
router.post('/employers/admin/status/:employerId', adminAuth, adminUpdateEmployerStatus);

module.exports = router;