const { Op } = require("sequelize");

const {
  sequelize,
  Case,
  Family,
  ContractActionLog,
} = require("../models");

const LEGALIZATION_SUB_CATEGORIES = [
  "idps_legalization_lawful_possession",
  "idps_legalization_housing_rule",
  "ecomigrant_legalization",
];

const getGeorgiaTodayISO = () => {
  const now = new Date();
  const georgiaNow = new Date(now.getTime() + 4 * 60 * 60 * 1000);

  return georgiaNow.toISOString().slice(0, 10);
};

const toDateOnly = (value) => {
  if (!value) return "";

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
};

const addCalendarMonthsISO = (dateValue, monthsToAdd) => {
  const source = toDateOnly(dateValue);

  if (!source) return "";

  const [yearValue, monthValue, dayValue] = source
    .split("-")
    .map((item) => Number(item));

  if (!yearValue || !monthValue || !dayValue) return "";

  const rawMonthIndex = monthValue - 1 + monthsToAdd;
  const targetYear = yearValue + Math.floor(rawMonthIndex / 12);
  const targetMonthIndex = ((rawMonthIndex % 12) + 12) % 12;

  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonthIndex + 1, 0)
  ).getUTCDate();

  const targetDay = Math.min(dayValue, lastDayOfTargetMonth);

  return `${targetYear}-${String(targetMonthIndex + 1).padStart(2, "0")}-${String(
    targetDay
  ).padStart(2, "0")}`;
};

const isLegalizationCase = (caseRecord) => {
  return LEGALIZATION_SUB_CATEGORIES.includes(caseRecord?.subCategory);
};

const getLegalizationExpirationDate = (caseRecord) => {
  if (!isLegalizationCase(caseRecord)) return "";

  return addCalendarMonthsISO(caseRecord.orderDate, 3);
};

const isLegalizationCaseExpired = (caseRecord, todayISO = getGeorgiaTodayISO()) => {
  const expirationDate = getLegalizationExpirationDate(caseRecord);

  if (!expirationDate) return false;

  return expirationDate <= todayISO;
};

const expireLegalizationCases = async ({ userId = null } = {}) => {
  const todayISO = getGeorgiaTodayISO();

  const candidateCases = await Case.findAll({
    where: {
      isClosed: false,
      isCancelled: false,
      subCategory: {
        [Op.in]: LEGALIZATION_SUB_CATEGORIES,
      },
      orderDate: {
        [Op.ne]: null,
      },
    },
  });

  const expiredCases = candidateCases.filter((caseRecord) =>
    isLegalizationCaseExpired(caseRecord, todayISO)
  );

  let expiredCasesCount = 0;
  let cancelledFamiliesCount = 0;

  for (const caseRecord of expiredCases) {
    await sequelize.transaction(async (transaction) => {
      const familiesToCancel = await Family.findAll({
        where: {
          caseId: caseRecord.id,
          isActive: true,
          isSigned: false,
        },
        attributes: ["id"],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      const familyIds = familiesToCancel.map((family) => family.id);

      if (familyIds.length > 0) {
        await Family.update(
          {
            isActive: false,
            cancelledAt: new Date(),
          },
          {
            where: {
              id: {
                [Op.in]: familyIds,
              },
            },
            transaction,
          }
        );

        await ContractActionLog.bulkCreate(
          familyIds.map((familyId) => ({
            familyId,
            userId,
            action: "cancelled",
            comment:
              "დაკანონების განკარგულების 3-თვიანი ვადის გასვლის გამო ოჯახი ავტომატურად გაუქმდა.",
          })),
          { transaction }
        );

        cancelledFamiliesCount += familyIds.length;
      }

      caseRecord.isClosed = true;
      caseRecord.closedAt = new Date();

      await caseRecord.save({ transaction });

      expiredCasesCount += 1;
    });
  }

  return {
    expiredCasesCount,
    cancelledFamiliesCount,
  };
};

module.exports = {
  LEGALIZATION_SUB_CATEGORIES,
  getLegalizationExpirationDate,
  isLegalizationCaseExpired,
  expireLegalizationCases,
};