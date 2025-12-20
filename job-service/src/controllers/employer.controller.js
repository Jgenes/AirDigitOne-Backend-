const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

async function ensureEmployersTable() {
    const sql = `
    CREATE TABLE IF NOT EXISTS employers (
      id UUID PRIMARY KEY,
      company_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      sector TEXT,
      address TEXT,
      password_hash TEXT,
      password_salt TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`;
    await pool.query(sql);
}

async function ensureEmployerAuditsTable() {
    const sql = `
    CREATE TABLE IF NOT EXISTS employer_audits (
      id UUID PRIMARY KEY,
      employer_id UUID NOT NULL,
      action TEXT NOT NULL,
      admin_id UUID,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`;
    await pool.query(sql);
}

async function ensureTables() {
    await ensureEmployersTable();
    await ensureEmployerAuditsTable();
}

// Register employer endpoint
exports.registerEmployer = async (req, res) => {
    const { company_name, email, phone, sector, address, password } = req.body;
    if (!company_name || !email || !password) {
        return res.status(400).json({ error: 'company_name, email and password are required' });
    }

    try {
        await ensureTables();

        // check duplicate email
        const dup = await pool.query('SELECT id FROM employers WHERE email=$1', [email.toLowerCase()]);
        if (dup.rowCount > 0) return res.status(409).json({ error: 'Email already registered' });

        // hash password (scrypt)
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync(password, salt, 64).toString('hex');

        const id = uuidv4();
        const insertSql = `
            INSERT INTO employers (id, company_name, email, phone, sector, address, password_hash, password_salt, status)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING id, company_name, email, status, created_at`;
        const values = [id, company_name, email.toLowerCase(), phone || null, sector || null, address || null, hash, salt, 'PENDING'];
        const r = await pool.query(insertSql, values);

        return res.status(201).json({ message: 'Employer registered', employer: r.rows[0] });
    } catch (err) {
        console.error('Employer registration error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
};

// Get employer info
exports.getEmployer = async (req, res) => {
    const { id } = req.params;
    try {
        // use actual column names and alias company_name -> company
        const q = `SELECT id, company_name AS company, email, status, created_at, updated_at FROM employers WHERE id=$1`;
        const r = await pool.query(q, [id]);
        if (r.rowCount === 0) return res.status(404).json({ error: 'Employer not found' });
        return res.json({ employer: r.rows[0] });
    } catch (err) {
        console.error('Error fetching employer:', err);
        return res.status(500).json({ error: 'Server error' });
    }
};

// Approve/reject/suspend employer (admin action)
exports.adminUpdateEmployerStatus = async (req, res) => {
    const { employerId } = req.params;
    const { action, adminId, reason } = req.body; // action: VERIFY/REJECT/SUSPEND
    if (!action) return res.status(400).json({ error: 'Action is required' });

    const allowed = { VERIFY: 'VERIFIED', REJECT: 'REJECTED', SUSPEND: 'SUSPENDED' };
    if (!allowed[action]) return res.status(400).json({ error: 'Invalid action' });

    try {
        await ensureTables();
        const status = allowed[action];
        await pool.query(`UPDATE employers SET status=$1, updated_at=NOW() WHERE id=$2`, [status, employerId]);

        // insert audit
        const auditId = uuidv4();
        await pool.query(
          `INSERT INTO employer_audits (id, employer_id, action, admin_id, reason) VALUES ($1,$2,$3,$4,$5)`,
          [auditId, employerId, action, adminId || null, reason || null]
        );

        return res.json({ message: 'Employer status updated', status });
    } catch (err) {
        console.error('Error updating employer status:', err);
        return res.status(500).json({ error: 'Server error' });
    }
};