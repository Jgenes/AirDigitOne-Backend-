const adminKey = process.env.JOB_SERVICE_ADMIN_KEY || null;

module.exports = (req, res, next) => {
  if (!adminKey) {
    // If no admin key configured, deny by default to avoid accidental exposure
    return res.status(403).json({ error: 'Admin access not configured' });
  }

  const provided = req.headers['x-admin-key'] || req.headers['x-admin-token'];
  if (!provided || provided !== adminKey) {
    return res.status(403).json({ error: 'Forbidden: invalid admin credentials' });
  }

  next();
};
