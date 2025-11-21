require("dotenv").config();
const express = require("express");
const cors = require("cors");

const userRoutes = require("./routes/user");
const interestRoutes = require("./routes/interest");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/user", userRoutes);
app.use("/api/interest", interestRoutes);

app.listen(5000, () => console.log("Server running on port 5000"));
