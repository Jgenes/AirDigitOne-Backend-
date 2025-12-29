const express = require("express");
const router = express.Router();
const multer = require("multer");
const {
  submitOnboarding,
 
} = require("../controllers/employerOnboardingController");
const { getAllEmployers, getEmployerDetails, activateEmployer } = require("../controllers/employer.controller");
const {registerEmployer} = require("../controllers/employer.controller");
const upload = multer({ dest: "uploads/temp/" });

// Onboard
router.post("/employer/onboard", upload.fields([
  { name: "logo", maxCount: 1 },
  { name: "business_license", maxCount: 1 },
  { name: "tax_certificate", maxCount: 1 },
]), submitOnboarding);

// Register Employer
router.post("/employer/register", registerEmployer);

// Get all employers
router.get("/employers", getAllEmployers);

// Get single employer
router.get("/employers/:id", getEmployerDetails);

// Activate employer
router.patch("/employers/activate/:id", activateEmployer);

module.exports = router;
