const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const mkdirp = require('mkdirp');

const ENC_KEY = process.env.JOB_SERVICE_ENC_KEY || null;
const ALGO = 'aes-256-gcm';

// Encrypt file
async function encryptFile(inputPath) {
  if (!ENC_KEY) return inputPath;

  const key = Buffer.from(ENC_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv, { authTagLength: 16 });
  const outPath = inputPath + '.enc';

  const input = fs.createReadStream(inputPath);
  const output = fs.createWriteStream(outPath);

  return new Promise((resolve, reject) => {
    input.pipe(cipher).pipe(output);
    output.on('finish', () => {
      const authTag = cipher.getAuthTag();
      fs.writeFileSync(
        outPath + '.meta',
        JSON.stringify({ iv: iv.toString('hex'), authTag: authTag.toString('hex') })
      );
      fs.unlinkSync(inputPath); // remove original file
      resolve(outPath);
    });
    output.on('error', reject);
  });
}

// Submit Onboarding
exports.submitOnboarding = async (req, res) => {
  try {
    const {
      employerId, company_name, registration_number, tax_id, sector,
      number_of_employees, physical_address, postal_address, website,
      contact_person, contact_email, contact_phone, company_description,
      bank_account, operational_areas, social_links
    } = req.body;

    if (!employerId || !company_name || !registration_number) {
      return res.status(400).json({ error: 'Employer ID, company name, and registration number are required' });
    }

    // Ensure uploads directory exists
    const uploadDir = path.join(__dirname, '..', 'uploads', 'employer');
    await mkdirp(uploadDir);

    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employer_details (
        id UUID PRIMARY KEY,
        employer_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        company_name TEXT NOT NULL,
        registration_number TEXT NOT NULL,
        tax_id TEXT,
        sector TEXT,
        number_of_employees INT,
        physical_address TEXT,
        postal_address TEXT,
        website TEXT,
        contact_person TEXT,
        contact_email TEXT,
        contact_phone TEXT,
        company_description TEXT,
        bank_account TEXT,
        operational_areas TEXT,
        social_links JSONB,
        logo_path TEXT,
        business_license_path TEXT,
        tax_certificate_path TEXT,
        is_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const id = uuidv4();

    const files = req.files || {};
    const logoPath = files.logo ? await encryptFile(files.logo[0].path) : null;
    const licensePath = files.business_license ? await encryptFile(files.business_license[0].path) : null;
    const taxCertPath = files.tax_certificate ? await encryptFile(files.tax_certificate[0].path) : null;

    // Move encrypted files to permanent folder
    const moveFile = (filePath) => {
      if (!filePath) return null;
      const destPath = path.join(uploadDir, path.basename(filePath));
      fs.renameSync(filePath, destPath);
      return path.join('/uploads/employer', path.basename(filePath));
    };

    const finalLogoPath = moveFile(logoPath);
    const finalLicensePath = moveFile(licensePath);
    const finalTaxPath = moveFile(taxCertPath);

    const insertSql = `
      INSERT INTO employer_details (
        id, employer_id, company_name, registration_number, tax_id, sector,
        number_of_employees, physical_address, postal_address, website,
        contact_person, contact_email, contact_phone, company_description,
        bank_account, operational_areas, social_links,
        logo_path, business_license_path, tax_certificate_path
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20
      ) RETURNING *
    `;

    const values = [
      id, employerId, company_name, registration_number, tax_id || null, sector || null,
      number_of_employees || null, physical_address || null, postal_address || null, website || null,
      contact_person || null, contact_email || null, contact_phone || null, company_description || null,
      bank_account || null, operational_areas || null, social_links ? JSON.stringify(social_links) : null,
      finalLogoPath, finalLicensePath, finalTaxPath
    ];

    const result = await pool.query(insertSql, values);
  

    return res.status(201).json({ message: 'Onboarding submitted successfully', employerDetails: result.rows[0] });
  } catch (err) {
    console.error('Error saving onboarding:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
