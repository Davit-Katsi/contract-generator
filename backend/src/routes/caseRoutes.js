const express = require("express");
const {
  createCase,
  getCases,
  getCaseById,
  assignCaseToOperator,
  assignCaseToMultipleOperators,
  assignFamilyToOperator,
  cancelCase,
  updateCaseAuthorization,
} = require("../controllers/caseController");

const { authMiddleware, requireRole } = require("../middleware/authMiddleware");
const { handleCaseUpload } = require("../middleware/uploadMiddleware");

const router = express.Router();

router.use(authMiddleware);

router.post(
  "/",
  requireRole("manager", "admin"),
  handleCaseUpload,
  createCase
);

router.get("/", requireRole("manager", "admin", "head"), getCases);

router.patch(
  "/:id/assign-operator",
  requireRole("manager", "admin"),
  assignCaseToOperator
);

router.patch(
  "/:id/assign-operators",
  requireRole("manager", "admin"),
  assignCaseToMultipleOperators
);

router.patch(
  "/families/:familyId/assign-operator",
  requireRole("manager", "admin"),
  assignFamilyToOperator
);

router.patch(
  "/:id/cancel",
  requireRole("manager"),
  cancelCase
);

router.patch(
  "/:id/authorization",
  requireRole("manager", "admin"),
  updateCaseAuthorization
);

router.get(
  "/:id",
  requireRole("manager", "admin", "head", "operator"),
  getCaseById
);

module.exports = router;