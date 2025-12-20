
const express = require('express');
const router = express.Router();
const upload = require('../utils/upload');
const adminAuth = require('../middleware/adminAuth');
const { submitKyc, getKYCStatus, adminApproveKyc, getKycDocument } = require('../controllers/kyc.controller');


// Submit KYC document (multipart/form-data, field name: document)
router.post('/submit', upload.single('document'), submitKyc);

// Get KYC records for an employer
router.get('/status/:employerId', getKYCStatus);

// Admin: approve/reject a KYC record (protected)
router.post('/admin/process/:kycId', adminAuth, adminApproveKyc);

// Download decrypted KYC document (stream) - admin protected
router.get('/document/:kycId', adminAuth, getKycDocument);

module.exports = router;