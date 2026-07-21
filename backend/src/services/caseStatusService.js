const { Case, Family } = require("../models");

const getCaseProgress = async (caseId) => {
  const families = await Family.findAll({
    where: {
      caseId,
    },
    attributes: ["id", "isActive", "isSigned"],
  });

  const totalFamilies = families.length;

  const signedFamilies = families.filter((family) => family.isSigned).length;

  const cancelledFamilies = families.filter(
    (family) => !family.isActive
  ).length;

  const remainingFamilies = families.filter(
    (family) => family.isActive && !family.isSigned
  ).length;

  return {
    totalFamilies,
    signedFamilies,
    cancelledFamilies,
    remainingFamilies,
  };
};

const evaluateAndUpdateCaseStatus = async (caseId) => {
  const caseRecord = await Case.findByPk(caseId);

  if (!caseRecord) {
    return null;
  }

  const progress = await getCaseProgress(caseId);

  const shouldClose =
    progress.totalFamilies > 0 && progress.remainingFamilies === 0;

  if (shouldClose && !caseRecord.isClosed) {
    caseRecord.isClosed = true;
    caseRecord.closedAt = new Date();
    await caseRecord.save();
  }

  if (!shouldClose && caseRecord.isClosed) {
    caseRecord.isClosed = false;
    caseRecord.closedAt = null;
    await caseRecord.save();
  }

  return {
    caseId: caseRecord.id,
    isClosed: caseRecord.isClosed,
    closedAt: caseRecord.closedAt,
    ...progress,
  };
};

module.exports = {
  getCaseProgress,
  evaluateAndUpdateCaseStatus,
};