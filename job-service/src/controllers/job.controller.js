const pool = require("../config/db");
const { v4: uuid } = require("uuid");
const jwt = require("jsonwebtoken");

// Allowed values matching PostgreSQL constraints
const validContractTypes = ["full_time", "part_time", "internship", "freelance"];
const validWorkModes = ["onsite", "remote", "hybrid"];

////////////////////////////////////////////////////
/// HELPER: Get employerId from JWT
////////////////////////////////////////////////////
function getEmployerId(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) throw new Error("No token provided");

  const token = authHeader.split(" ")[1];
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  return decoded.id;
}

////////////////////////////////////////////////////
/// CREATE JOB
////////////////////////////////////////////////////
async function createJob(req, res) {
  try {
    const employerId = getEmployerId(req);

    const {
      title,
      description,
      location,
      salary_min,
      salary_max,
      contract_type,
      work_mode
    } = req.body;

    if (!title || !description || !location || !contract_type || !work_mode) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!validContractTypes.includes(contract_type)) {
      return res.status(400).json({ error: `Invalid contract type. Allowed: ${validContractTypes.join(", ")}` });
    }

    if (!validWorkModes.includes(work_mode)) {
      return res.status(400).json({ error: `Invalid work mode. Allowed: ${validWorkModes.join(", ")}` });
    }

    const result = await pool.query(
      `INSERT INTO jobs (
        id, employer_id, title, description, location,
        salary_min, salary_max, contract_type, work_mode, expiry_date
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, CURRENT_DATE + INTERVAL '30 days')
      RETURNING *`,
      [
        uuid(),
        employerId,
        title,
        description,
        location,
        salary_min || null,
        salary_max || null,
        contract_type,
        work_mode
      ]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error("Create Job Error:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
}

////////////////////////////////////////////////////
/// GET ALL JOBS
////////////////////////////////////////////////////
async function getJobs(req, res) {
  try {
    const { location, type, industry } = req.query;

    let conditions = [];
    let values = [];
    let index = 1;

    let query = `
      SELECT DISTINCT j.*
      FROM jobs j
      LEFT JOIN job_industries ji ON j.id = ji.job_id
      WHERE j.is_active=true
        AND j.expiry_date >= CURRENT_DATE
    `;

    if (location) {
      conditions.push(`j.location=$${index++}`);
      values.push(location);
    }

    if (type) {
      conditions.push(`j.contract_type=$${index++}`);
      values.push(type);
    }

    if (industry) {
      conditions.push(`ji.industry=$${index++}`);
      values.push(industry);
    }

    if (conditions.length > 0) query += " AND " + conditions.join(" AND ");
    query += " ORDER BY j.created_at DESC";

    const result = await pool.query(query, values);
    res.json(result.rows);

  } catch (err) {
    console.error("Get Jobs Error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

////////////////////////////////////////////////////
/// GET SINGLE JOB
////////////////////////////////////////////////////
async function getJob(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
         j.*,
         ARRAY_AGG(DISTINCT js.skill) AS skills,
         ARRAY_AGG(DISTINCT ji.industry) AS industries
       FROM jobs j
       LEFT JOIN job_skills js ON j.id = js.job_id
       LEFT JOIN job_industries ji ON j.id = ji.job_id
       WHERE j.id=$1 AND j.is_active=true
       GROUP BY j.id`,
      [id]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: "Job not found" });
    res.json(result.rows[0]);

  } catch (err) {
    console.error("Get Job Error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

////////////////////////////////////////////////////
/// UPDATE JOB
////////////////////////////////////////////////////
async function updateJob(req, res) {
  try {
    const employerId = getEmployerId(req);
    const { id } = req.params;
    const {
      title,
      description,
      location,
      salary_min,
      salary_max,
      contract_type,
      work_mode
    } = req.body;

    if (!validContractTypes.includes(contract_type) || !validWorkModes.includes(work_mode)) {
      return res.status(400).json({ error: "Invalid contract type or work mode" });
    }

    const result = await pool.query(
      `UPDATE jobs
       SET title=$1, description=$2, location=$3,
           salary_min=$4, salary_max=$5,
           contract_type=$6, work_mode=$7,
           updated_at=NOW()
       WHERE id=$8 AND employer_id=$9
       RETURNING *`,
      [
        title, description, location,
        salary_min || null, salary_max || null,
        contract_type, work_mode,
        id, employerId
      ]
    );

    if (result.rowCount === 0) return res.status(403).json({ error: "Unauthorized or job not found" });
    res.json(result.rows[0]);

  } catch (err) {
    console.error("Update Job Error:", err);
    res.status(500).json({ error: "Server error" });
  }
}


async function deleteJob(req, res) {
  try {
    const employerId = getEmployerId(req);
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE jobs SET is_active=false WHERE id=$1 AND employer_id=$2`,
      [id, employerId]
    );

    if (result.rowCount === 0) return res.status(403).json({ error: "Unauthorized or job not found" });
    res.json({ message: "Job deleted successfully" });

  } catch (err) {
    console.error("Delete Job Error:", err);
    res.status(500).json({ error: "Server error" });
  }
}


async function addJobSkills(req, res) {
  try {
    const { id } = req.params;
    const { skills } = req.body;

    if (!Array.isArray(skills)) return res.status(400).json({ error: "Skills must be an array" });

    await pool.query(
      `INSERT INTO job_skills (id, job_id, skill)
       SELECT gen_random_uuid(), $1, unnest($2::text[])`,
      [id, skills]
    );

    res.json({ message: "Skills added successfully" });

  } catch (err) {
    console.error("Add Skills Error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

////////////////////////////////////////////////////
/// ADD JOB INDUSTRIES
////////////////////////////////////////////////////
async function addJobIndustries(req, res) {
  try {
    const { id } = req.params;
    const { industries } = req.body;

    if (!Array.isArray(industries)) return res.status(400).json({ error: "Industries must be an array" });

    await pool.query(
      `INSERT INTO job_industries (id, job_id, industry)
       SELECT gen_random_uuid(), $1, unnest($2::text[])`,
      [id, industries]
    );

    res.json({ message: "Industries added successfully" });

  } catch (err) {
    console.error("Add Industries Error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

module.exports = {
  createJob,
  getJobs,
  getJob,
  updateJob,
  deleteJob,
  addJobSkills,
  addJobIndustries
};
