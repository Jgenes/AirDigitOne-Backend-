
import express from "express";
import cors from "cors";
import employerRoutes from "./routes/employer.routes.js";
import kycRoutes from "./routes/kyc.routes.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/v1/employers", employerRoutes);
app.use("/api/v1/kyc", kycRoutes);

export default app;