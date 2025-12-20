
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// encryption key (32 bytes hex) from env JOB_SERVICE_ENC_KEY (if not set, files stored unencrypted)
const ENC_KEY = process.env.JOB_SERVICE_ENC_KEY || null; // hex string
const ALGO = 'aes-256-gcm';

function encryptFile(inputPath) {
    if (!ENC_KEY) return inputPath; // no encryption configured
    const key = Buffer.from(ENC_KEY, 'hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, key, iv, { authTagLength: 16 });
    const input = fs.createReadStream(inputPath);
    const outPath = inputPath + '.enc';
    const output = fs.createWriteStream(outPath);
    return new Promise((resolve, reject) => {
        input.pipe(cipher).pipe(output);
        output.on('finish', () => {
            // append iv and auth tag at end (we'll store iv and auth tag in a small json file)
            const authTag = cipher.getAuthTag();
            // write metadata
            fs.writeFileSync(outPath + '.meta', JSON.stringify({ iv: iv.toString('hex'), authTag: authTag.toString('hex') }));
            // remove original
            fs.unlinkSync(inputPath);
            resolve(outPath);
        });
        output.on('error', reject);
    });
}

function decryptStream(encPath) {
    if (!ENC_KEY) return fs.createReadStream(encPath);
    const key = Buffer.from(ENC_KEY, 'hex');
    const meta = JSON.parse(fs.readFileSync(encPath + '.meta'));
    const iv = Buffer.from(meta.iv, 'hex');
    const authTag = Buffer.from(meta.authTag, 'hex');
    const decipher = crypto.createDecipheriv(ALGO, key, iv, { authTagLength: 16 });
    decipher.setAuthTag(authTag);
    const input = fs.createReadStream(encPath);
    return input.pipe(decipher);
}

// Persist KYC submission to DB. Creates table if it doesn't exist.
exports.submitKyc = async (req, res) => {
    const { employerId, documentType } = req.body;

    if (!employerId || !documentType || !req.file) {
        return res.status(400).json({ error: 'Missing required fields or file' });
    }

    try {
        // ensure table exists
        const createTableSql = `
            CREATE TABLE IF NOT EXISTS kyc_records (
                id UUID PRIMARY KEY,
                employer_id UUID NOT NULL,
                document_type TEXT NOT NULL,
                document_path TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )`;
        await pool.query(createTableSql);

    const id = uuidv4();
    const uploadedPath = path.join(__dirname, '..', '..', 'uploads', 'kyc', req.file.filename);

    // encrypt file if key configured
    const storedPath = await encryptFile(uploadedPath);
    const documentPath = path.join('/uploads/kyc', path.basename(storedPath));

        const insertSql = `
            INSERT INTO kyc_records (id, employer_id, document_type, document_path, status, submitted_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *`;

        const values = [id, employerId, documentType, documentPath, 'pending', new Date()];

        const result = await pool.query(insertSql, values);

        return res.status(201).json({ message: 'KYC document submitted successfully', kycRecord: result.rows[0] });
    } catch (err) {
        console.error('Error saving KYC record:', err);
        return res.status(500).json({ error: 'Server error' });
    }
};

exports.getKYCStatus = async (req, res) => {
    const { employerId } = req.params;
    try {
        const findSql = `SELECT * FROM kyc_records WHERE employer_id = $1 ORDER BY submitted_at DESC`;
        const result = await pool.query(findSql, [employerId]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'No KYC records found for this employer' });
        return res.json({ kycRecords: result.rows });
    } catch (err) {
        console.error('Error fetching KYC records:', err);
        return res.status(500).json({ error: 'Server error' });
    }
};

// Admin: approve/reject a KYC record and optionally update employer status
exports.adminApproveKyc = async (req, res) => {
    const { kycId } = req.params;
    const { action, adminId, reason } = req.body; // action: APPROVE|REJECT
    if (!action || !['APPROVE', 'REJECT'].includes(action)) return res.status(400).json({ error: 'Invalid action' });

    try {
        // ensure kyc_records exists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS kyc_records (
                id UUID PRIMARY KEY,
                employer_id UUID NOT NULL,
                document_type TEXT NOT NULL,
                document_path TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )`);

        // update kyc record
        const newStatus = action === 'APPROVE' ? 'approved' : 'rejected';
        const upd = await pool.query(`UPDATE kyc_records SET status=$1 WHERE id=$2 RETURNING *`, [newStatus, kycId]);
        if (upd.rowCount === 0) return res.status(404).json({ error: 'KYC record not found' });

        const kyc = upd.rows[0];

        // insert a simple audit into employer_audits (if table exists)
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS employer_audits (
                    id UUID PRIMARY KEY,
                    employer_id UUID NOT NULL,
                    action TEXT NOT NULL,
                    admin_id UUID,
                    reason TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )`);
        } catch (_) {}

        const auditId = uuidv4();
        await pool.query(`INSERT INTO employer_audits (id, employer_id, action, admin_id, reason) VALUES ($1,$2,$3,$4,$5)`, [auditId, kyc.employer_id, action, adminId || null, reason || null]);

        // if approved, mark employer VERIFIED
        if (action === 'APPROVE') {
            await pool.query(`UPDATE employers SET status='VERIFIED', updated_at=NOW() WHERE id=$1`, [kyc.employer_id]);
        }

        return res.json({ message: 'KYC processed', kyc: upd.rows[0] });
    } catch (err) {
        console.error('Error approving KYC:', err);
        return res.status(500).json({ error: 'Server error' });
    }
};

// Download decrypted KYC document (signed access required)
exports.getKycDocument = async (req, res) => {
    const { kycId } = req.params;
    try {
        const q = `SELECT document_path FROM kyc_records WHERE id=$1`;
        const r = await pool.query(q, [kycId]);
        if (r.rowCount === 0) return res.status(404).json({ error: 'KYC not found' });
        const docPath = path.join(__dirname, '..', '..', r.rows[0].document_path);
        const encPath = docPath.endsWith('.enc') ? docPath : docPath + '.enc';
        if (!fs.existsSync(encPath)) return res.status(404).json({ error: 'File not found' });
        const stream = decryptStream(encPath);
        res.setHeader('Content-Type', 'application/octet-stream');
        return stream.pipe(res);
    } catch (err) {
        console.error('Error fetching KYC document:', err);
        return res.status(500).json({ error: 'Server error' });
    }
};
