const express = require("express");

const {
  getUsdExchangeRate,
  getOperatorDashboard,
  getMyCases,
  getMyCaseFamilies,
  getMyFamilyById,
  getMyCaseStatus,
  searchAssignedFamilies,
  markCaseViewed,
  downloadMyCaseAnnex,
  markFamilySigned,
  cancelFamily,
  reactivateFamily,
  updateFamilyMemberSigner,
  updateSellerSigner,
  updateContractExtraData,
  generateFamilyContract,
} = require("../controllers/operatorController");

const { authMiddleware, requireRole } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole("operator"));

router.get("/dashboard", getOperatorDashboard);

router.get("/exchange-rates/usd", getUsdExchangeRate);

router.get("/cases", getMyCases);

router.get("/families/search", searchAssignedFamilies);

router.get("/cases/:caseId/status", getMyCaseStatus);

router.post("/cases/:caseId/mark-viewed", markCaseViewed);

router.get("/cases/:caseId/download-annex", downloadMyCaseAnnex);

router.get("/cases/:caseId/families", getMyCaseFamilies);

router.get("/families/:familyId", getMyFamilyById);

router.patch("/family-members/:memberId/signer", updateFamilyMemberSigner);

router.patch("/sellers/:sellerId/signer", updateSellerSigner);

router.patch("/families/:familyId/contract-data", updateContractExtraData);

router.patch("/families/:familyId/sign", markFamilySigned);

router.post("/families/:familyId/generate-contract", generateFamilyContract);

router.patch("/families/:familyId/cancel", cancelFamily);

router.patch("/families/:familyId/reactivate", reactivateFamily);

module.exports = router;