const express = require("express");
const router = express.Router();
const jobController = require("../controllers/job.controller");

// All routes use JWT directly inside controller
router.post("/", jobController.createJob);
router.get("/", jobController.getJobs);
router.get("/:id", jobController.getJob);
router.put("/:id", jobController.updateJob);
router.delete("/:id", jobController.deleteJob);
router.post("/:id/skills", jobController.addJobSkills);
router.post("/:id/industries", jobController.addJobIndustries);

module.exports = router;
