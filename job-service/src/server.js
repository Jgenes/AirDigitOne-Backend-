const express = require('express');
require('dotenv').config();
const employerRoutes = require('./routes/employer.routes');
const jobRoutes = require('./routes/job.routes');
const cors = require('cors');

const app = express();

// CORS middleware setup (only for specific routes)
app.use(cors({ origin: true, credentials: true }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists and serve it statically
const uploadsDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

app.use('/api/v1/employer', employerRoutes);
app.use("/api/v1/employer/jobs", jobRoutes);


// removed problematic preflight registration:
// app.options('/api/v1/employer/*', cors());

// Listen on the defined port
const PORT = process.env.PORT || 4002;
app.listen(PORT, () => {
  console.log(`Job Service running on port ${PORT}`);
});
