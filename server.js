require("dotenv").config();
const express = require("express");
const router = express.Router();

const cors = require("cors");

const userRoutes = require("./routes/user");
const interestRoutes = require("./routes/interest");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/v1/user", userRoutes);
app.use("/api/v1/interest", interestRoutes);
app.use("/api/v1/user/interest", interestRoutes);

app.listen(5000, () => console.log("Server running on port 5000"));
