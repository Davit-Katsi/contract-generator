const { Op } = require("sequelize");
const fs = require("fs");

const {
  sequelize,
  Case,
  Family,
  FamilyMember,
  Seller,
  Property,
  ContractData,
  ContractActionLog,
  OperatorCaseView,
  User,
} = require("../models");

const {
  expireLegalizationCases,
} = require("../services/caseExpirationService");

const { importAnnexForCase } = require("../services/annexImportService");

const allowedMainCategories = ["idps", "ecomigrants", "homeless"];

const allowedSubCategoriesByMain = {
  idps: [
    "idps_rural_house",
    "idps_admin_promise_purchase",
    "idps_legalization_lawful_possession",
    "idps_legalization_housing_rule",
  ],
  ecomigrants: ["ecomigrant_purchase", "ecomigrant_legalization"],
  homeless: ["homeless_purchase"],
};

const allowedSubCategories = Object.values(allowedSubCategoriesByMain).flat();

const normalizeOptionalText = (value) => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed || null;
};

const safeDeleteFile = async (filePath) => {
  if (!filePath) return;

  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch (error) {
    console.warn("Uploaded file cleanup warning:", filePath, error.message);
  }
};

const cleanupUploadedFiles = async (filePaths = []) => {
  await Promise.all(filePaths.filter(Boolean).map((filePath) => safeDeleteFile(filePath)));
};

const getCategoryValidationError = ({ mainCategory, subCategory }) => {
  if (!mainCategory) {
    return "მიმართულების არჩევა აუცილებელია.";
  }

  if (!subCategory) {
    return "ქვეპროგრამის არჩევა აუცილებელია.";
  }

  if (!allowedMainCategories.includes(mainCategory)) {
    return "არასწორი ძირითადი მიმართულება.";
  }

  if (!allowedSubCategories.includes(subCategory)) {
    return "არასწორი ქვეპროგრამა.";
  }

  if (!allowedSubCategoriesByMain[mainCategory]?.includes(subCategory)) {
    return "არჩეული ქვეპროგრამა არ ეკუთვნის არჩეულ მიმართულებას.";
  }

  return null;
};

const legalizationSubCategories = [
  "idps_legalization_lawful_possession",
  "idps_legalization_housing_rule",
  "ecomigrant_legalization",
];

const isLegalizationSubCategory = (subCategory) => {
  return legalizationSubCategories.includes(subCategory);
};

const normalizeOperatorIds = (operatorIds) => {
  if (!Array.isArray(operatorIds)) return [];

  return Array.from(
    new Set(
      operatorIds
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  );
};

const getOperatorAuthorizationData = (operator) => {
  return {
    authorizedPersonFullName:
      normalizeOptionalText(operator.authorizedPersonFullName) ||
      normalizeOptionalText(operator.fullName),

    authorizedPersonPersonalNumber: normalizeOptionalText(
      operator.authorizedPersonPersonalNumber
    ),

    authorizedPersonPosition: normalizeOptionalText(
      operator.authorizedPersonPosition
    ),
  };
};

const applyOperatorAuthorizationToCase = async (caseRecord, operator) => {
  const authorizationData = getOperatorAuthorizationData(operator);

  caseRecord.authorizedPersonFullName =
    authorizationData.authorizedPersonFullName;

  caseRecord.authorizedPersonPersonalNumber =
    authorizationData.authorizedPersonPersonalNumber;

  caseRecord.authorizedPersonPosition =
    authorizationData.authorizedPersonPosition;

  await caseRecord.save();

  return authorizationData;
};

const buildAssignedOperatorsSummary = (families = [], operatorViews = []) => {
  const map = new Map();

  const addOperator = ({ id, fullName, username, familiesCount = 0 }) => {
    if (!id) return;

    const operatorId = Number(id);

    if (!map.has(operatorId)) {
      map.set(operatorId, {
        id: operatorId,
        fullName: fullName || null,
        username: username || null,
        familiesCount: 0,
      });
    }

    const row = map.get(operatorId);
    row.familiesCount = Math.max(row.familiesCount || 0, familiesCount || 0);

    if (!row.fullName && fullName) row.fullName = fullName;
    if (!row.username && username) row.username = username;
  };

  families.forEach((family) => {
    if (!family.assignedOperatorId) return;

    const operator = family.assignedOperator;

    addOperator({
      id: family.assignedOperatorId,
      fullName: operator?.fullName,
      username: operator?.username,
      familiesCount: (map.get(Number(family.assignedOperatorId))?.familiesCount || 0) + 1,
    });
  });

  operatorViews.forEach((view) => {
    if (!view.hasFullAccess) return;

    const operator = view.operator;

    addOperator({
      id: view.operatorId,
      fullName: operator?.fullName,
      username: operator?.username,
      familiesCount: families.length,
    });
  });

  return Array.from(map.values());
};

const createCase = async (req, res) => {
  let transaction = null;
  let uploadedFilePaths = [];

  try {
    const {
      title,
      caseName,
      orderNumber,
      orderDate,
      mainCategory,
      subCategory,
      authorizedPersonFullName,
      authorizedPersonPersonalNumber,
      authorizedPersonPosition,
    } = req.body || {};

    const finalTitle =
      normalizeOptionalText(title) || normalizeOptionalText(caseName);

    const finalOrderNumber = normalizeOptionalText(orderNumber);
    const finalMainCategory = normalizeOptionalText(mainCategory);
    const finalSubCategory = normalizeOptionalText(subCategory);

    if (
      !finalTitle ||
      !finalOrderNumber ||
      !orderDate ||
      !finalMainCategory ||
      !finalSubCategory
    ) {
      return res.status(400).json({
        message:
          "ქეისის დასახელება, ბრძანების ნომერი, თარიღი, მიმართულება და ქვეპროგრამა აუცილებელია.",
      });
    }

    const categoryValidationError = getCategoryValidationError({
      mainCategory: finalMainCategory,
      subCategory: finalSubCategory,
    });

    if (categoryValidationError) {
      return res.status(400).json({
        message: categoryValidationError,
      });
    }

    const orderPdfPath = req.files?.orderPdf?.[0]?.path || null;
    const annexExcelPath = req.files?.annexExcel?.[0]?.path || null;

    uploadedFilePaths = [orderPdfPath, annexExcelPath].filter(Boolean);

    if (!orderPdfPath) {
      return res.status(400).json({
        message: "ბრძანების PDF ფაილი აუცილებელია.",
      });
    }

    if (!annexExcelPath) {
      await cleanupUploadedFiles(uploadedFilePaths);

      return res.status(400).json({
        message: "დანართის Excel ფაილი აუცილებელია.",
      });
    }

    transaction = await sequelize.transaction();

    const newCase = await Case.create(
      {
        title: finalTitle,
        orderNumber: finalOrderNumber,
        orderDate,
        mainCategory: finalMainCategory,
        subCategory: finalSubCategory,
        authorizedPersonFullName: normalizeOptionalText(
          authorizedPersonFullName
        ),
        authorizedPersonPersonalNumber: normalizeOptionalText(
          authorizedPersonPersonalNumber
        ),
        authorizedPersonPosition: normalizeOptionalText(
          authorizedPersonPosition
        ),
        orderPdfPath,
        annexExcelPath,
        createdById: req.user.id,
      },
      { transaction }
    );

    const importSummary = await importAnnexForCase({
      caseRecord: newCase,
      userId: req.user.id,
      transaction,
    });

    await transaction.commit();
    transaction = null;

    return res.status(201).json({
      message: "ქეისი წარმატებით შეიქმნა.",
      case: newCase,
      importSummary,
    });
  } catch (error) {
    console.error("Create case error:", error);

    if (transaction) {
      await transaction.rollback();
    }

    await cleanupUploadedFiles(uploadedFilePaths);

    const statusCode = error.statusCode || 500;

    return res.status(statusCode).json({
      message:
        statusCode === 400
          ? error.message
          : "ქეისის შექმნის შეცდომა.",
    });
  }
};

const getCases = async (req, res) => {
  try {
    await expireLegalizationCases({
      userId: req.user.id,
    });
    const where = {};

    if (req.user.role === "manager") {
      where.createdById = req.user.id;
    }

    const cases = await Case.findAll({
      where,
      include: [
        {
          model: User,
          as: "createdBy",
          attributes: ["id", "fullName", "username"],
        },
        {
          model: Family,
          as: "families",
          attributes: ["id", "isSigned", "isActive", "assignedOperatorId"],
          include: [
            {
              model: User,
              as: "assignedOperator",
              attributes: [
                "id",
                "fullName",
                "username",
                "authorizedPersonFullName",
                "authorizedPersonPersonalNumber",
                "authorizedPersonPosition",
              ],
            },
          ],
        },
        {
          model: OperatorCaseView,
          as: "operatorViews",
          required: false,
          where: {
            hasFullAccess: true,
          },
          attributes: ["id", "operatorId", "caseId", "hasFullAccess"],
          include: [
            {
              model: User,
              as: "operator",
              attributes: [
                "id",
                "fullName",
                "username",
                "authorizedPersonFullName",
                "authorizedPersonPersonalNumber",
                "authorizedPersonPosition",
              ],
            },
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const result = cases.map((item) => {
      const plain = item.toJSON();
      const families = plain.families || [];
      const operatorViews = plain.operatorViews || [];

      const hasSharedFullAccess =
        isLegalizationSubCategory(plain.subCategory) &&
        operatorViews.some((view) => view.hasFullAccess);

      const assignedOperators = buildAssignedOperatorsSummary(
        families,
        hasSharedFullAccess ? operatorViews : []
      );

      const directlyDelegatedFamilies = families.filter(
        (family) => family.assignedOperatorId
      ).length;

      const delegatedFamilies = hasSharedFullAccess
        ? families.length
        : directlyDelegatedFamilies;

      const notDelegatedFamilies = hasSharedFullAccess
        ? 0
        : families.length - directlyDelegatedFamilies;

      return {
        ...plain,
        operatorViews: undefined,

        familiesCount: families.length,
        delegatedFamilies,
        notDelegatedFamilies,

        assignedOperators,
        assignedOperatorId:
          assignedOperators.length === 1 ? assignedOperators[0].id : null,
        assignedOperator:
          assignedOperators.length === 1 ? assignedOperators[0] : null,
        hasMixedOperators: assignedOperators.length > 1,
        hasSharedFullAccess,

        stats: {
          totalFamilies: families.length,
          delegatedFamilies,
          notDelegatedFamilies,
          signedFamilies: families.filter((family) => family.isSigned).length,
          activeFamilies: families.filter(
            (family) => family.isActive && !family.isSigned
          ).length,
          cancelledFamilies: families.filter((family) => !family.isActive)
            .length,
        },

        canCancel:
          families.length > 0 &&
          families.filter((family) => family.isSigned).length === 0 &&
          families.filter((family) => !family.isActive).length === 0,
      };
    });

    return res.json(result);
  } catch (error) {
    console.error("Get cases error:", error);

    return res.status(500).json({
      message: "ქეისების სიის მიღების შეცდომა.",
    });
  }
};

const getCaseById = async (req, res) => {
  try {
    await expireLegalizationCases({
      userId: req.user.id,
    });
    const { id } = req.params;

    const item = await Case.findByPk(id, {
      include: [
        {
          model: User,
          as: "createdBy",
          attributes: ["id", "fullName", "username"],
        },
        {
          model: Family,
          as: "families",
          include: [
            { model: FamilyMember, as: "members" },
            { model: Seller, as: "seller" },
            { model: Property, as: "property" },
            { model: ContractData, as: "contractData" },
            {
              model: User,
              as: "assignedOperator",
              attributes: [
                "id",
                "fullName",
                "username",
                "authorizedPersonFullName",
                "authorizedPersonPersonalNumber",
                "authorizedPersonPosition",
              ],
            },
          ],
        },
      ],
    });

    if (!item) {
      return res.status(404).json({
        message: "ქეისი ვერ მოიძებნა.",
      });
    }

    return res.json(item);
  } catch (error) {
    console.error("Get case by id error:", error);

    return res.status(500).json({
      message: "ქეისის მიღების შეცდომა.",
    });
  }
};

const assignCaseToOperator = async (req, res) => {
  try {
    const { id } = req.params;
    const { operatorId } = req.body || {};

    if (!operatorId) {
      return res.status(400).json({
        message: "ოპერატორის არჩევა აუცილებელია.",
      });
    }

    const caseRecord = await Case.findByPk(id);

    if (!caseRecord) {
      return res.status(404).json({
        message: "ქეისი ვერ მოიძებნა.",
      });
    }

    if (req.user.role === "manager" && caseRecord.createdById !== req.user.id) {
      return res.status(403).json({
        message: "ამ ქეისის დელეგირების უფლება არ გაქვთ.",
      });
    }

    const operator = await User.findOne({
      where: {
        id: operatorId,
        role: "operator",
        isActive: true,
      },
    });

    if (!operator) {
      return res.status(404).json({
        message: "აქტიური ოპერატორი ვერ მოიძებნა.",
      });
    }

    const authorizationData = await applyOperatorAuthorizationToCase(
      caseRecord,
      operator
    );

    const [updatedCount] = await Family.update(
      { assignedOperatorId: operator.id },
      { where: { caseId: caseRecord.id } }
    );

    const families = await Family.findAll({
      where: { caseId: caseRecord.id },
      attributes: ["id"],
    });

    await Promise.all(
      families.map((family) =>
        ContractActionLog.create({
          familyId: family.id,
          userId: req.user.id,
          action: "created",
          comment: `ქეისი დელეგირდა ოპერატორზე: ${
            operator.fullName || operator.username
          }`,
        })
      )
    );

    return res.json({
      message: "ქეისი წარმატებით დელეგირდა ოპერატორზე.",
      assignedOperator: {
        id: operator.id,
        fullName: operator.fullName,
        username: operator.username,
        authorizedPersonFullName: operator.authorizedPersonFullName,
        authorizedPersonPersonalNumber: operator.authorizedPersonPersonalNumber,
        authorizedPersonPosition: operator.authorizedPersonPosition,
      },
      authorizationData,
      updatedFamilies: updatedCount,
    });
  } catch (error) {
    console.error("Assign case to operator error:", error);

    return res.status(500).json({
      message: "ქეისის დელეგირების შეცდომა.",
    });
  }
};

const assignCaseToMultipleOperators = async (req, res) => {
  let transaction = null;

  try {
    const { id } = req.params;
    const operatorIds = normalizeOperatorIds(req.body?.operatorIds);

    if (operatorIds.length < 2) {
      return res.status(400).json({
        message:
          "რამდენიმე ოპერატორზე წვდომის მისანიჭებლად აირჩიეთ მინიმუმ 2 ოპერატორი.",
      });
    }

    const caseRecord = await Case.findByPk(id, {
      include: [
        {
          model: Family,
          as: "families",
          attributes: ["id", "rowNumber", "isSigned", "isActive"],
        },
      ],
    });

    if (!caseRecord) {
      return res.status(404).json({
        message: "ქეისი ვერ მოიძებნა.",
      });
    }

    if (req.user.role === "manager" && caseRecord.createdById !== req.user.id) {
      return res.status(403).json({
        message: "ამ ქეისის დელეგირების უფლება არ გაქვთ.",
      });
    }

    if (caseRecord.isClosed) {
      return res.status(400).json({
        message: "დასრულებული ქეისის გადაცემა შეუძლებელია.",
      });
    }

    if (caseRecord.isCancelled) {
      return res.status(400).json({
        message: "გაუქმებული ქეისის გადაცემა შეუძლებელია.",
      });
    }

    if (!isLegalizationSubCategory(caseRecord.subCategory)) {
      return res.status(400).json({
        message:
          "რამდენიმე ოპერატორზე ერთდროული წვდომა დაშვებულია მხოლოდ დაკანონების ქვეპროგრამებზე.",
      });
    }

    const families = caseRecord.families || [];

    if (families.length === 0) {
      return res.status(400).json({
        message: "ქეისში ოჯახები არ არის იმპორტირებული.",
      });
    }

    const operators = await User.findAll({
      where: {
        id: {
          [Op.in]: operatorIds,
        },
        role: "operator",
        isActive: true,
      },
      attributes: [
        "id",
        "fullName",
        "username",
        "authorizedPersonFullName",
        "authorizedPersonPersonalNumber",
        "authorizedPersonPosition",
      ],
    });

    if (operators.length !== operatorIds.length) {
      return res.status(400).json({
        message:
          "არჩეულ სიაში არის ისეთი ოპერატორი, რომელიც ვერ მოიძებნა ან აქტიური არ არის.",
      });
    }

    transaction = await sequelize.transaction();

    /*
      დაკანონებაზე ოჯახებს აღარ ვყოფთ.
      ყველა ოჯახის assignedOperatorId რჩება null ან არსებული მნიშვნელობა.
      წვდომა ენიჭება case-level ჩანაწერით OperatorCaseView-ში.
    */

    await Promise.all(
      operatorIds.map(async (operatorId) => {
        const [view, created] = await OperatorCaseView.findOrCreate({
          where: {
            operatorId,
            caseId: caseRecord.id,
          },
          defaults: {
            operatorId,
            caseId: caseRecord.id,
            hasFullAccess: true,
            firstViewedAt: null,
            lastViewedAt: null,
          },
          transaction,
        });

        if (!created && !view.hasFullAccess) {
          view.hasFullAccess = true;
          await view.save({ transaction });
        }
      })
    );

    const operatorMap = new Map(
      operators.map((operator) => [Number(operator.id), operator])
    );

    const orderedOperators = operatorIds.map((operatorId) =>
      operatorMap.get(operatorId)
    );

    await Promise.all(
      families.map((family) =>
        ContractActionLog.create(
          {
            familyId: family.id,
            userId: req.user.id,
            action: "created",
            comment: `დაკანონების ქეისზე წვდომა მიენიჭა ოპერატორებს: ${orderedOperators
              .map((operator) => operator.fullName || operator.username)
              .join(", ")}`,
          },
          { transaction }
        )
      )
    );

    await transaction.commit();
    transaction = null;

    return res.json({
      message: "დაკანონების ქეისზე წვდომა წარმატებით მიენიჭა რამდენიმე ოპერატორს.",
      caseId: caseRecord.id,
      sharedFamilies: families.length,
      operators: orderedOperators.map((operator) => ({
        operatorId: operator.id,
        fullName: operator.fullName,
        username: operator.username,
      })),
    });
  } catch (error) {
    console.error("Assign case to multiple operators error:", error);

    if (transaction) {
      await transaction.rollback();
    }

    return res.status(500).json({
      message: "ქეისის რამდენიმე ოპერატორზე გადაცემის შეცდომა.",
    });
  }
};

const assignFamilyToOperator = async (req, res) => {
  try {
    const { familyId } = req.params;
    const { operatorId } = req.body || {};

    if (!operatorId) {
      return res.status(400).json({
        message: "ოპერატორის არჩევა აუცილებელია.",
      });
    }

    const family = await Family.findByPk(familyId, {
      include: [{ model: Case, as: "case" }],
    });

    if (!family) {
      return res.status(404).json({
        message: "ოჯახი ვერ მოიძებნა.",
      });
    }

    if (
      req.user.role === "manager" &&
      family.case.createdById !== req.user.id
    ) {
      return res.status(403).json({
        message: "ამ ოჯახის დელეგირების უფლება არ გაქვთ.",
      });
    }

    const operator = await User.findOne({
      where: {
        id: operatorId,
        role: "operator",
        isActive: true,
      },
    });

    if (!operator) {
      return res.status(404).json({
        message: "აქტიური ოპერატორი ვერ მოიძებნა.",
      });
    }

    family.assignedOperatorId = operator.id;
    await family.save();

    const authorizationData = await applyOperatorAuthorizationToCase(
      family.case,
      operator
    );

    await ContractActionLog.create({
      familyId: family.id,
      userId: req.user.id,
      action: "created",
      comment: `ოჯახი დელეგირდა ოპერატორზე: ${
        operator.fullName || operator.username
      }`,
    });

    return res.json({
      message: "ოჯახი წარმატებით დელეგირდა ოპერატორზე.",
      familyId: family.id,
      assignedOperator: {
        id: operator.id,
        fullName: operator.fullName,
        username: operator.username,
        authorizedPersonFullName: operator.authorizedPersonFullName,
        authorizedPersonPersonalNumber: operator.authorizedPersonPersonalNumber,
        authorizedPersonPosition: operator.authorizedPersonPosition,
      },
      authorizationData,
    });
  } catch (error) {
    console.error("Assign family to operator error:", error);

    return res.status(500).json({
      message: "ოჯახის დელეგირების შეცდომა.",
    });
  }
};

const cancelCase = async (req, res) => {
  try {
    const { id } = req.params;

    const caseRecord = await Case.findByPk(id, {
      include: [
        {
          model: Family,
          as: "families",
          attributes: ["id", "isSigned", "isActive", "assignedOperatorId"],
        },
      ],
    });

    if (!caseRecord) {
      return res.status(404).json({
        message: "ქეისი ვერ მოიძებნა.",
      });
    }

    if (req.user.role === "manager" && caseRecord.createdById !== req.user.id) {
      return res.status(403).json({
        message: "ამ ქეისის გაუქმების უფლება არ გაქვთ.",
      });
    }

    if (caseRecord.isClosed) {
      return res.status(400).json({
        message: "დასრულებული ქეისის გაუქმება შეუძლებელია.",
      });
    }

    if (caseRecord.isCancelled) {
      return res.status(400).json({
        message: "ქეისი უკვე გაუქმებულია.",
      });
    }

    const families = caseRecord.families || [];

    if (families.length === 0) {
      return res.status(400).json({
        message: "ცარიელი ქეისის გაუქმება ამ ეტაპზე შეუძლებელია.",
      });
    }

    const hasSignedFamily = families.some((family) => family.isSigned);
    const hasCancelledFamily = families.some((family) => !family.isActive);

    if (hasSignedFamily || hasCancelledFamily) {
      return res.status(400).json({
        message:
          "ქეისის გაუქმება შესაძლებელია მხოლოდ მაშინ, როცა არცერთი ხელშეკრულება არ არის გაფორმებული ან გაუქმებული.",
      });
    }

    caseRecord.isCancelled = true;
    caseRecord.cancelledAt = new Date();
    caseRecord.cancelledById = req.user.id;

    await caseRecord.save();

    await Family.update(
      {
        assignedOperatorId: null,
      },
      {
        where: {
          caseId: caseRecord.id,
        },
      }
    );

    await Promise.all(
      families.map((family) =>
        ContractActionLog.create({
          familyId: family.id,
          userId: req.user.id,
          action: "cancelled",
          comment: "ქეისი გაუქმდა მენეჯერის მიერ.",
        })
      )
    );

    return res.json({
      message: "ქეისი წარმატებით გაუქმდა.",
      caseId: caseRecord.id,
    });
  } catch (error) {
    console.error("Cancel case error:", error);

    return res.status(500).json({
      message: "ქეისის გაუქმების შეცდომა.",
    });
  }
};

const updateCaseAuthorization = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      authorizedPersonFullName,
      authorizedPersonPersonalNumber,
      authorizedPersonPosition,
    } = req.body || {};

    const caseRecord = await Case.findByPk(id);

    if (!caseRecord) {
      return res.status(404).json({
        message: "ქეისი ვერ მოიძებნა.",
      });
    }

    if (caseRecord.isClosed) {
      return res.status(400).json({
        message: "დასრულებული ქეისის ოპერატორზე გადაცემა შეუძლებელია.",
      });
    }

    if (caseRecord.isCancelled) {
      return res.status(400).json({
        message: "გაუქმებული ქეისის ოპერატორზე გადაცემა შეუძლებელია.",
      });
    }

    if (req.user.role === "manager" && caseRecord.createdById !== req.user.id) {
      return res.status(403).json({
        message: "ამ ქეისის განახლების უფლება არ გაქვთ.",
      });
    }

    if (authorizedPersonFullName !== undefined) {
      caseRecord.authorizedPersonFullName =
        normalizeOptionalText(authorizedPersonFullName);
    }

    if (authorizedPersonPersonalNumber !== undefined) {
      caseRecord.authorizedPersonPersonalNumber = normalizeOptionalText(
        authorizedPersonPersonalNumber
      );
    }

    if (authorizedPersonPosition !== undefined) {
      caseRecord.authorizedPersonPosition =
        normalizeOptionalText(authorizedPersonPosition);
    }

    await caseRecord.save();

    return res.json({
      message: "უფლებამოსილი პირის მონაცემები განახლდა.",
      case: caseRecord,
    });
  } catch (error) {
    console.error("Update case authorization error:", error);

    return res.status(500).json({
      message: "უფლებამოსილი პირის მონაცემების განახლების შეცდომა.",
    });
  }
};

module.exports = {
  createCase,
  getCases,
  getCaseById,
  assignCaseToOperator,
  assignCaseToMultipleOperators,
  assignFamilyToOperator,
  cancelCase,
  updateCaseAuthorization,
};