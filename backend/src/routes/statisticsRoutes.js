const express = require("express");

const {
  getManagerDashboard,
  getOperatorStatisticsDashboard,
  searchHeadFamilies,
  getHeadDashboard,
} = require("../controllers/statisticsController");

const { authMiddleware, requireRole } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);

router.get(
  "/manager/dashboard",
  requireRole("manager", "admin"),
  getManagerDashboard
);

router.get(
  "/operator/dashboard",
  requireRole("operator", "admin"),
  getOperatorStatisticsDashboard
);

router.get(
  "/head/families/search",
  requireRole("head", "admin"),
  searchHeadFamilies
);

router.get(
  "/head/dashboard",
  requireRole("head", "admin"),
  getHeadDashboard
);

module.exports = router;