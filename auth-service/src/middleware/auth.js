const jwt = require("jsonwebtoken");
const pool = require("../config/db");

// Verify JWT
exports.verifyToken = async (req, res, next) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader) return res.status(401).json({ error: "No token provided" });

    const token = authHeader.split(" ")[1]; // Bearer TOKEN
    if (!token) return res.status(401).json({ error: "No token provided" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // If the token doesn't include a role (e.g. activation/reset tokens),
        // fetch the user's role from the database and attach it.
        if (!decoded.role && decoded.id) {
            try {
                const userQuery = await pool.query("SELECT role FROM users WHERE id=$1", [decoded.id]);
                if (userQuery.rowCount > 0) {
                    decoded.role = userQuery.rows[0].role;
                }
            } catch (dbErr) {
                console.error("Error fetching user role:", dbErr);
                // don't fail here; proceed without role and let requireRole handle it
            }
        }

        req.user = decoded; // { id, role? }
        next();
    } catch (err) {
        return res.status(403).json({ error: "Invalid or expired token" });
    }
};

// Role-based access
exports.requireRole = (roles) => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: "Unauthorized: no user found on request" });
    }

    const userRole = req.user.role;
    if (!userRole) {
        return res.status(403).json({ error: "Forbidden: token does not contain a role. Use an access token." });
    }

    if (!roles.includes(userRole)) {
        return res.status(403).json({ error: "Forbidden: insufficient role" });
    }
    next();
};
