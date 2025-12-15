const pool = require("../../config/db");
const path = require("path");

// Save candidate profile — accepts multipart/form-data with optional file field `profile_picture`
exports.savedProfile = async (req, res) => {
    try {
        const userId = req.user && req.user.id;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        // Pull fields from body, use empty string as default when not provided
            const {
                full_name = "",
                birthdate = "",
                gender = "",
                disability = "",
                interests = ""
            } = req.body || {};

            // Avoid inserting empty string into a DATE column — use NULL when blank
            const birthdateValue = (typeof birthdate === 'string' && birthdate.trim() !== '') ? birthdate.trim() : null;

        // If a file was uploaded by multer, build the public path to store in DB
        let profile_picture = req.body.profile_picture || null;
        if (req.file && req.file.filename) {
            // store relative URL so client can fetch it from the server
            profile_picture = `/uploads/profiles/${req.file.filename}`;
        }

        // Normalize interests: accept array or string. Convert empty -> null
        let interestsValue = Array.isArray(interests) ? JSON.stringify(interests) : interests;
        if (typeof interestsValue === 'string' && interestsValue.trim() === '') interestsValue = null;

        // Normalize disability: convert empty string -> null, "true"/"false" -> boolean
        const normalizeMaybeBoolean = (val) => {
            if (val === undefined || val === null) return null;
            if (typeof val === 'string') {
                const t = val.trim();
                if (t === '') return null;
                if (t.toLowerCase() === 'true') return true;
                if (t.toLowerCase() === 'false') return false;
                return t;
            }
            return val;
        };

        const disabilityValue = normalizeMaybeBoolean(disability);

        // Validate gender against an allowed set. Adjust this list to match your DB constraint.
        // Common allowed values: male, female, non-binary, other, prefer_not_to_say
        const allowedGenders = ['male', 'female'];
        let genderValue = null;
        if (typeof gender === 'string' && gender.trim() !== '') {
            const g = gender.trim().toLowerCase();
            if (!allowedGenders.includes(g)) {
                return res.status(400).json({ error: 'Invalid gender value', allowed: allowedGenders });
            }
            genderValue = g;
        }

        const query = `
        INSERT INTO candidate_profiles
        (user_id, full_name, profile_picture, birthdate, gender, disability, interests)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (user_id)
        DO UPDATE SET
            full_name = EXCLUDED.full_name,
            profile_picture = EXCLUDED.profile_picture,
            birthdate = EXCLUDED.birthdate,
            gender = EXCLUDED.gender,
            disability = EXCLUDED.disability,
            interests = EXCLUDED.interests,
            updated_at = CURRENT_TIMESTAMP
    `;

            await pool.query(query, [
                userId,
                full_name,
                profile_picture,
                birthdateValue,
                genderValue,
                disabilityValue,
                interestsValue
            ]);

        return res.json({ message: "Profile saved successfully", profile_picture });
    } catch (err) {
        console.error("Error saving profile:", err);
        return res.status(500).json({ error: "Server error" });
    }
};