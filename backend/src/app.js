console.log("APP.JS LOADED - CONTRACT GENERATOR BACKEND");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { syncDatabase } = require("./models");
const seedAdmin = require("./services/seedAdmin");

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const caseRoutes = require("./routes/caseRoutes");
const userRoutes = require("./routes/userRoutes");
const operatorRoutes = require("./routes/operatorRoutes");
const statisticsRoutes = require("./routes/statisticsRoutes");
const {
  purgeExpiredCaseFiles,
  startCaseFileRetentionJob,
} = require("./services/caseFileRetentionService");

const app = express();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log("REQUEST:", req.method, req.originalUrl);
  next();
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Contract Generator API is running",
  });
});

app.get("/api/test", (req, res) => {
  console.log("TEST ROUTE HIT");
  res.json({ message: "test works" });
});

app.use((req, res, next) => {
  console.log("REQUEST:", req.method, req.originalUrl);
  next();
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/cases", caseRoutes);
app.use("/api/users", userRoutes);
app.use("/api/operator", operatorRoutes);
app.use("/api/statistics", statisticsRoutes);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await syncDatabase();
    await seedAdmin();
    await purgeExpiredCaseFiles({ source: "startup" });
    startCaseFileRetentionJob();

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();