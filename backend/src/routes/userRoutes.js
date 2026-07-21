const express = require("express");
const { getActiveOperators } = require("../controllers/userController");
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);

router.get(
  "/operators",
  requireRole("manager", "admin"),
  getActiveOperators
);

module.exports = router;