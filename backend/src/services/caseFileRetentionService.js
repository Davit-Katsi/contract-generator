const fs = require("fs");
const { Op } = require("sequelize");

const { Case } = require("../models");

const DEFAULT_RETENTION_MONTHS = 12;
const JOB_INTERVAL_MS = 24 * 60 * 60 * 1000;

let retentionJobStarted = false;
let retentionJobTimer = null;

const getRetentionMonths = () => {
  const value = Number(process.env.CASE_FILE_RETENTION_MONTHS);

  if (Number.isInteger(value) && value > 0) {
    return value;
  }

  return DEFAULT_RETENTION_MONTHS;
};

const addMonths = (dateValue, monthsToAdd) => {
  if (!dateValue) return null;

  const source = new Date(dateValue);

  if (Number.isNaN(source.getTime())) return null;

  const result = new Date(source);
  const originalDay = result.getDate();

  result.setMonth(result.getMonth() + monthsToAdd);

  /*
    თუ მაგალითად 31 იანვარს +1 თვე გამოვიდა მარტში გადასვლა,
    დავაბრუნოთ target თვის ბოლო დღე.
  */
  if (result.getDate() < originalDay) {
    result.setDate(0);
  }

  return result;
};

const getCaseRetentionBaseDate = (caseRecord) => {
  if (caseRecord.isCancelled && caseRecord.cancelledAt) {
    return caseRecord.cancelledAt;
  }

  if (caseRecord.isClosed && caseRecord.closedAt) {
    return caseRecord.closedAt;
  }

  /*
    fallback — თუ ძველ ჩანაწერს closedAt/cancelledAt არ აქვს.
    აქტიურ ქეისებს service მაინც არ შეეხება.
  */
  return caseRecord.updatedAt || caseRecord.createdAt || null;
};

const getCasePurgeAfter = (caseRecord) => {
  if (caseRecord.purgeAfter) {
    return new Date(caseRecord.purgeAfter);
  }

  const baseDate = getCaseRetentionBaseDate(caseRecord);

  return addMonths(baseDate, getRetentionMonths());
};

const safeDeleteFile = async (filePath) => {
  if (!filePath) {
    return {
      filePath,
      deleted: false,
      existed: false,
      error: null,
    };
  }

  try {
    if (!fs.existsSync(filePath)) {
      return {
        filePath,
        deleted: false,
        existed: false,
        error: null,
      };
    }

    await fs.promises.unlink(filePath);

    return {
      filePath,
      deleted: true,
      existed: true,
      error: null,
    };
  } catch (error) {
    return {
      filePath,
      deleted: false,
      existed: true,
      error: error.message,
    };
  }
};

const purgeExpiredCaseFiles = async ({ source = "manual" } = {}) => {
  const now = new Date();

  const cases = await Case.findAll({
    where: {
      [Op.and]: [
        {
          [Op.or]: [{ isClosed: true }, { isCancelled: true }],
        },
        {
          [Op.or]: [
            {
              orderPdfPath: {
                [Op.ne]: null,
              },
            },
            {
              annexExcelPath: {
                [Op.ne]: null,
              },
            },
          ],
        },
      ],
    },
  });

  let checkedCases = 0;
  let purgedCases = 0;
  let deletedFiles = 0;
  let missingFiles = 0;
  const errors = [];

  for (const caseRecord of cases) {
    checkedCases += 1;

    const purgeAfter = getCasePurgeAfter(caseRecord);

    if (!purgeAfter || purgeAfter > now) {
      if (!caseRecord.purgeAfter && purgeAfter) {
        caseRecord.purgeAfter = purgeAfter;
        await caseRecord.save();
      }

      continue;
    }

    const orderPdfResult = await safeDeleteFile(caseRecord.orderPdfPath);
    const annexExcelResult = await safeDeleteFile(caseRecord.annexExcelPath);

    const results = [orderPdfResult, annexExcelResult];

    results.forEach((result) => {
      if (result.deleted) deletedFiles += 1;
      if (!result.existed && result.filePath) missingFiles += 1;

      if (result.error) {
        errors.push({
          caseId: caseRecord.id,
          filePath: result.filePath,
          error: result.error,
        });
      }
    });

    /*
      თუ რომელიმე ფაილის წაშლაზე error იყო, path-ს არ ვანულებთ,
      რომ შემდეგ run-ზე ისევ სცადოს.
    */
    const hasDeleteError = results.some((result) => result.error);

    if (hasDeleteError) {
      continue;
    }

    caseRecord.orderPdfPath = null;
    caseRecord.annexExcelPath = null;
    caseRecord.purgeAfter = purgeAfter;
    caseRecord.filesPurgedAt = now;
    caseRecord.filesPurgeReason = `ფაილები წაიშალა retention წესით (${getRetentionMonths()} თვე). წყარო: ${source}`;

    await caseRecord.save();

    purgedCases += 1;
  }

  if (purgedCases > 0 || errors.length > 0) {
    console.log("Case file retention result:", {
      checkedCases,
      purgedCases,
      deletedFiles,
      missingFiles,
      errorsCount: errors.length,
    });
  }

  return {
    checkedCases,
    purgedCases,
    deletedFiles,
    missingFiles,
    errors,
  };
};

const startCaseFileRetentionJob = () => {
  if (retentionJobStarted) {
    return;
  }

  retentionJobStarted = true;

  retentionJobTimer = setInterval(() => {
    purgeExpiredCaseFiles({ source: "scheduled" }).catch((error) => {
      console.error("Case file retention scheduled job error:", error);
    });
  }, JOB_INTERVAL_MS);

  console.log(
    `Case file retention job started. Retention: ${getRetentionMonths()} month(s).`
  );
};

const stopCaseFileRetentionJob = () => {
  if (retentionJobTimer) {
    clearInterval(retentionJobTimer);
  }

  retentionJobTimer = null;
  retentionJobStarted = false;
};

module.exports = {
  getRetentionMonths,
  getCasePurgeAfter,
  purgeExpiredCaseFiles,
  startCaseFileRetentionJob,
  stopCaseFileRetentionJob,
};