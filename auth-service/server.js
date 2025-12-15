require("dotenv").config();
const express = require("express");
const router = express.Router();

const cors = require("cors");
const path = require('path');

const userRoutes = require("./src/routes/user");
const interestRoutes = require("./src/routes/interest");
const jobRoutes = require("./src/routes/job");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files (profile pictures)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use("/api/v1/user", userRoutes);
app.use("/api/v1/interest", interestRoutes);
app.use("/api/v1/user/interest", interestRoutes);
app.use("/api/v1/jobs", jobRoutes);

app.listen(5000, () => console.log("Server running on port 5000"));
