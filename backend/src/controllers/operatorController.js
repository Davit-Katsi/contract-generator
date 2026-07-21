const { Op } = require("sequelize");

const {
  Case,
  Family,
  FamilyMember,
  Seller,
  Property,
  ContractData,
  ContractActionLog,
  OperatorCaseView,
} = require("../models");

const {
  expireLegalizationCases,
} = require("../services/caseExpirationService");

const {
  evaluateAndUpdateCaseStatus,
} = require("../services/caseStatusService");

const fs = require("fs");
const path = require("path");
const { generateContractDocx } = require("../services/contractGenerationService");
const { getNbgUsdRate } = require("../services/nbgRateService");

const MAIN_CATEGORIES = ["idps", "ecomigrants", "homeless"];

const SUB_CATEGORIES = [
  "idps_rural_house",
  "idps_admin_promise_purchase",
  "idps_legalization_lawful_possession",
  "idps_legalization_housing_rule",
  "ecomigrant_purchase",
  "ecomigrant_legalization",
  "homeless_purchase",
];

const LEGALIZATION_SUB_CATEGORIES = [
  "idps_legalization_lawful_possession",
  "idps_legalization_housing_rule",
  "ecomigrant_legalization",
];

const isLegalizationSubCategory = (subCategory) => {
  return LEGALIZATION_SUB_CATEGORIES.includes(subCategory);
};

const getOperatorFullAccessCaseIds = async (operatorId) => {
  const views = await OperatorCaseView.findAll({
    where: {
      operatorId,
      hasFullAccess: true,
    },
    attributes: ["caseId"],
  });

  const rawCaseIds = [
    ...new Set(views.map((view) => Number(view.caseId)).filter(Boolean)),
  ];

  if (rawCaseIds.length === 0) {
    return [];
  }

  const cases = await Case.findAll({
    where: {
      id: {
        [Op.in]: rawCaseIds,
      },
      subCategory: {
        [Op.in]: LEGALIZATION_SUB_CATEGORIES,
      },
    },
    attributes: ["id"],
  });

  return cases.map((caseRecord) => Number(caseRecord.id)).filter(Boolean);
};

const buildAccessibleFamilyWhere = async (operatorId) => {
  const fullAccessCaseIds = await getOperatorFullAccessCaseIds(operatorId);

  const accessRules = [
    {
      assignedOperatorId: operatorId,
    },
  ];

  if (fullAccessCaseIds.length > 0) {
    accessRules.push({
      caseId: {
        [Op.in]: fullAccessCaseIds,
      },
    });
  }

  return {
    [Op.or]: accessRules,
  };
};

const operatorHasFullAccessToCase = async (caseId, operatorId) => {
  const caseRecord = await Case.findByPk(caseId, {
    attributes: ["id", "subCategory"],
  });

  if (!caseRecord || !isLegalizationSubCategory(caseRecord.subCategory)) {
    return false;
  }

  const view = await OperatorCaseView.findOne({
    where: {
      operatorId,
      caseId,
      hasFullAccess: true,
    },
    attributes: ["id"],
  });

  return Boolean(view);
};

const ensureFamilyBelongsToOperator = async (
  familyId,
  operatorId,
  include = []
) => {
  const accessWhere = await buildAccessibleFamilyWhere(operatorId);

  const family = await Family.findOne({
    where: {
      [Op.and]: [
        {
          id: familyId,
        },
        accessWhere,
      ],
    },
    include,
  });

  return family;
};

const ensureCaseBelongsToOperator = async (caseId, operatorId) => {
  const directFamily = await Family.findOne({
    where: {
      caseId,
      assignedOperatorId: operatorId,
    },
    attributes: ["id", "caseId"],
  });

  if (directFamily) {
    return directFamily;
  }

  const hasFullAccess = await operatorHasFullAccessToCase(caseId, operatorId);

  if (!hasFullAccess) {
    return null;
  }

  return {
    id: null,
    caseId: Number(caseId),
    hasFullAccess: true,
  };
};

const markOperatorCaseViewed = async ({ operatorId, caseId }) => {
  const now = new Date();

  const [view, created] = await OperatorCaseView.findOrCreate({
    where: {
      operatorId,
      caseId,
    },
    defaults: {
      operatorId,
      caseId,
      hasFullAccess: false,
      firstViewedAt: now,
      lastViewedAt: now,
    },
  });

  if (!created) {
    if (!view.firstViewedAt) {
      view.firstViewedAt = now;
    }

    view.lastViewedAt = now;
    await view.save();
  }

  return view;
};

const buildFamilySearchResult = (family) => {
  const plain = family.toJSON ? family.toJSON() : family;
  const sellers = plain.sellers || [];

  return {
    id: plain.id,
    caseId: plain.caseId,
    rowNumber: plain.rowNumber,
    primaryPersonFullName: plain.primaryPersonFullName,
    primaryPersonPersonalNumber: plain.primaryPersonPersonalNumber,
    beneficiaryPhone: plain.beneficiaryPhone,
    purchaseAmount: plain.purchaseAmount,
    purchaseAmountText: plain.purchaseAmountText,
    isSigned: plain.isSigned,
    isActive: plain.isActive,
    cancelledAt: plain.cancelledAt,
    cancellationReason: plain.cancellationReason,
    case: plain.case
      ? {
          id: plain.case.id,
          title: plain.case.title,
          orderNumber: plain.case.orderNumber,
          orderDate: plain.case.orderDate,
          mainCategory: plain.case.mainCategory,
          subCategory: plain.case.subCategory,
          isClosed: plain.case.isClosed,
        }
      : null,
    membersCount: Array.isArray(plain.members) ? plain.members.length : 0,
    members: plain.members || [],
    sellers,
    sellerNames: sellers.map((seller) => seller.fullName).filter(Boolean),
    property: plain.property || null,
  };
};

const getUsdExchangeRate = async (req, res) => {
  try {
    const date = req.query.date || undefined;
    const rate = await getNbgUsdRate(date);

    return res.json(rate);
  } catch (error) {
    console.error("Get USD exchange rate error:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "USD კურსის მიღების შეცდომა.",
    });
  }
};

const getOperatorDashboard = async (req, res) => {
  try {
    await expireLegalizationCases({
      userId: req.user.id,
    });
    const accessWhere = await buildAccessibleFamilyWhere(req.user.id);

    const families = await Family.findAll({
      where: accessWhere,
      include: [
        {
          model: Case,
          as: "case",
          required: true,
          where: {
            isCancelled: false,
          },
          attributes: [
            "id",
            "mainCategory",
            "subCategory",
            "isClosed",
            "isCancelled",
          ],
        },
      ],
      attributes: ["id", "caseId", "isActive", "isSigned"],
    });

    const mainCategoryCounts = {};
    const subCategoryCounts = {};

    MAIN_CATEGORIES.forEach((category) => {
      mainCategoryCounts[category] = 0;
    });

    SUB_CATEGORIES.forEach((category) => {
      subCategoryCounts[category] = 0;
    });

    const caseIds = [
      ...new Set(
        families
          .map((family) => family.case?.id)
          .filter((caseId) => Boolean(caseId))
      ),
    ];

    const views =
      caseIds.length > 0
        ? await OperatorCaseView.findAll({
            where: {
              operatorId: req.user.id,
              caseId: {
                [Op.in]: caseIds,
              },
              lastViewedAt: {
                [Op.not]: null,
              },
            },
            attributes: ["caseId"],
          })
        : [];

    const viewedCaseIds = new Set(views.map((view) => view.caseId));

    let remainingFamilies = 0;
    let signedFamilies = 0;
    let cancelledFamilies = 0;

    families.forEach((family) => {
      const caseRecord = family.case;

      if (family.isSigned) {
        signedFamilies += 1;
      } else if (!family.isActive) {
        cancelledFamilies += 1;
      } else {
        remainingFamilies += 1;

        if (caseRecord) {
          mainCategoryCounts[caseRecord.mainCategory] =
            (mainCategoryCounts[caseRecord.mainCategory] || 0) + 1;

          subCategoryCounts[caseRecord.subCategory] =
            (subCategoryCounts[caseRecord.subCategory] || 0) + 1;
        }
      }
    });

    return res.json({
      totalCases: caseIds.length,
      newCases: caseIds.filter((caseId) => !viewedCaseIds.has(caseId)).length,
      totalDelegatedFamilies: families.length,
      totalRemaining: remainingFamilies,
      remainingFamilies,
      signedFamilies,
      cancelledFamilies,
      mainCategoryCounts,
      subCategoryCounts,
    });
  } catch (error) {
    console.error("Operator dashboard error:", error);
    return res.status(500).json({
      message: "ოპერატორის სტატისტიკის მიღების შეცდომა.",
    });
  }
};

const getMyCases = async (req, res) => {
  try {
    await expireLegalizationCases({
      userId: req.user.id,
    });
    const accessWhere = await buildAccessibleFamilyWhere(req.user.id);

    const families = await Family.findAll({
      where: accessWhere,
      include: [
        {
          model: Case,
          as: "case",
          required: true,
          where: {
            isCancelled: false,
          },
          attributes: [
            "id",
            "title",
            "orderNumber",
            "orderDate",
            "mainCategory",
            "subCategory",
            "isClosed",
            "isCancelled",
            "annexExcelPath",
            "createdAt",
          ],
        },
      ],
      order: [
        ["caseId", "DESC"],
        ["rowNumber", "ASC"],
      ],
    });

    const grouped = new Map();

    families.forEach((family) => {
      const caseRecord = family.case;

      if (!caseRecord) return;

      if (!grouped.has(caseRecord.id)) {
        grouped.set(caseRecord.id, {
          id: caseRecord.id,
          title: caseRecord.title,
          orderNumber: caseRecord.orderNumber,
          orderDate: caseRecord.orderDate,
          mainCategory: caseRecord.mainCategory,
          subCategory: caseRecord.subCategory,
          isClosed: caseRecord.isClosed,
          isCancelled: caseRecord.isCancelled,
          hasAnnexExcel: Boolean(caseRecord.annexExcelPath),
          createdAt: caseRecord.createdAt,
          isNewForOperator: true,
          stats: {
            totalDelegated: 0,
            remaining: 0,
            signed: 0,
            cancelled: 0,
          },
        });
      }

      const item = grouped.get(caseRecord.id);

      item.stats.totalDelegated += 1;

      if (family.isSigned) {
        item.stats.signed += 1;
      } else if (!family.isActive) {
        item.stats.cancelled += 1;
      } else {
        item.stats.remaining += 1;
      }
    });

    const cases = Array.from(grouped.values());
    const caseIds = cases.map((item) => item.id);

    const views =
      caseIds.length > 0
        ? await OperatorCaseView.findAll({
            where: {
              operatorId: req.user.id,
              caseId: {
                [Op.in]: caseIds,
              },
              lastViewedAt: {
                [Op.not]: null,
              },
            },
            attributes: ["caseId"],
          })
        : [];

    const viewedCaseIds = new Set(views.map((view) => view.caseId));

    const result = cases.map((item) => ({
      ...item,
      isNewForOperator: !viewedCaseIds.has(item.id),
    }));

    return res.json(result);
  } catch (error) {
    console.error("Get operator cases error:", error);
    return res.status(500).json({
      message: "ოპერატორის ქეისების სიის მიღების შეცდომა.",
    });
  }
};

const getMyCaseFamilies = async (req, res) => {
  try {
    await expireLegalizationCases({
      userId: req.user.id,
    });
    const { caseId } = req.params;

    const caseRecord = await Case.findByPk(caseId, {
      attributes: [
        "id",
        "title",
        "orderNumber",
        "orderDate",
        "mainCategory",
        "subCategory",
        "isClosed",
        "isCancelled",
      ],
    });

    if (!caseRecord) {
      return res.status(404).json({
        message: "ქეისი ვერ მოიძებნა.",
      });
    }

    const directAssignedFamily = await Family.findOne({
      where: {
        caseId,
        assignedOperatorId: req.user.id,
      },
      attributes: ["id"],
    });

    const hasFullAccess = await operatorHasFullAccessToCase(caseId, req.user.id);

    if (!directAssignedFamily && !hasFullAccess) {
      return res.status(404).json({
        message: "ქეისი ვერ მოიძებნა ან ამ ქეისზე წვდომა არ გაქვთ.",
      });
    }

    const familyWhere = hasFullAccess
      ? { caseId }
      : {
          caseId,
          assignedOperatorId: req.user.id,
        };

    const families = await Family.findAll({
      where: familyWhere,
      include: [
        {
          model: FamilyMember,
          as: "members",
        },
        {
          model: Seller,
          as: "seller",
        },
        {
          model: Seller,
          as: "sellers",
        },
        {
          model: Property,
          as: "property",
        },
        {
          model: ContractData,
          as: "contractData",
        },
      ],
      order: [
        ["rowNumber", "ASC"],
        ["id", "ASC"],
      ],
    });

    if (families.length === 0) {
      return res.status(404).json({
        message: "ამ ქეისში ოჯახები ვერ მოიძებნა.",
      });
    }

    await markOperatorCaseViewed({
      operatorId: req.user.id,
      caseId: Number(caseId),
    });

    return res.json({
      case: caseRecord,
      families,
    });
  } catch (error) {
    console.error("Get operator case families error:", error);
    return res.status(500).json({
      message: "ქეისში ოჯახების მიღების შეცდომა.",
    });
  }
};

const getMyFamilyById = async (req, res) => {
  try {
    const { familyId } = req.params;

    const family = await ensureFamilyBelongsToOperator(familyId, req.user.id, [
      {
        model: Case,
        as: "case",
      },
      {
        model: FamilyMember,
        as: "members",
      },
      {
        model: Seller,
        as: "seller",
      },
      {
        model: Seller,
        as: "sellers",
      },
      {
        model: Property,
        as: "property",
      },
      {
        model: ContractData,
        as: "contractData",
      },
      {
        model: ContractActionLog,
        as: "logs",
        order: [["createdAt", "DESC"]],
      },
    ]);

    if (!family) {
      return res.status(404).json({
        message: "ოჯახი ვერ მოიძებნა ან ამ ოჯახზე წვდომა არ გაქვთ.",
      });
    }

    return res.json(family);
  } catch (error) {
    console.error("Get operator family error:", error);
    return res.status(500).json({
      message: "ოჯახის დეტალების მიღების შეცდომა.",
    });
  }
};

const markFamilySigned = async (req, res) => {
  try {
    const { familyId } = req.params;

    const family = await ensureFamilyBelongsToOperator(familyId, req.user.id, [
      {
        model: Case,
        as: "case",
        attributes: ["id", "isCancelled"],
      },
    ]);

    if (!family) {
      return res.status(404).json({
        message: "ოჯახი ვერ მოიძებნა ან ამ ოჯახზე წვდომა არ გაქვთ.",
      });
    }

    if (family.case?.isCancelled) {
      return res.status(400).json({
        message: "გაუქმებულ ქეისში ოპერატორის მოქმედება შეზღუდულია.",
      });
    }

    if (family.isSigned) {
      return res.status(400).json({
        message: "ეს ხელშეკრულება უკვე მონიშნულია გაფორმებულად.",
      });
    }

    if (!family.isActive) {
      return res.status(400).json({
        message: "გაუქმებულ ოჯახზე ხელშეკრულების გაფორმების მონიშვნა შეუძლებელია.",
      });
    }

    family.isSigned = true;
    family.signedAt = new Date();

    await family.save();

    await ContractActionLog.create({
      familyId: family.id,
      userId: req.user.id,
      action: "signed",
      comment: "ოპერატორმა მონიშნა, რომ ხელშეკრულება გაფორმდა.",
    });

    const caseStatus = await evaluateAndUpdateCaseStatus(family.caseId);

    return res.json({
      message: "ხელშეკრულება მონიშნულია გაფორმებულად.",
      family,
      caseStatus,
    });
  } catch (error) {
    console.error("Mark family signed error:", error);
    return res.status(500).json({
      message: "ხელშეკრულების გაფორმებულად მონიშვნის შეცდომა.",
    });
  }
};

const cancelFamily = async (req, res) => {
  try {
    await expireLegalizationCases({
      userId: req.user.id,
    });
    const { familyId } = req.params;
    const { reason } = req.body || {};

    const family = await ensureFamilyBelongsToOperator(familyId, req.user.id, [
      {
        model: Case,
        as: "case",
        attributes: ["id", "isCancelled"],
      },
    ]);

    if (!family) {
      return res.status(404).json({
        message: "ოჯახი ვერ მოიძებნა ან ამ ოჯახზე წვდომა არ გაქვთ.",
      });
    }

    if (family.case?.isCancelled) {
      return res.status(400).json({
        message: "გაუქმებულ ქეისში ოპერატორის მოქმედება შეზღუდულია.",
      });
    }

    if (!family.isActive) {
      return res.status(400).json({
        message: "ეს ოჯახი უკვე გაუქმებულია.",
      });
    }

    if (family.isSigned) {
      return res.status(400).json({
        message:
          "უკვე გაფორმებული ხელშეკრულების გაუქმება ამ მოქმედებით შეუძლებელია.",
      });
    }

    family.isActive = false;
    family.cancelledAt = new Date();
    family.cancellationReason = reason || null;

    await family.save();

    await ContractActionLog.create({
      familyId: family.id,
      userId: req.user.id,
      action: "cancelled",
      comment: reason || "ოპერატორმა გააუქმა ოჯახი.",
    });

    const caseStatus = await evaluateAndUpdateCaseStatus(family.caseId);

    return res.json({
      message: "ოჯახი გაუქმებულია და გახდა არააქტიური.",
      family,
      caseStatus,
    });
  } catch (error) {
    console.error("Cancel family error:", error);
    return res.status(500).json({
      message: "ოჯახის გაუქმების შეცდომა.",
    });
  }
};

const reactivateFamily = async (req, res) => {
  try {
    await expireLegalizationCases({
      userId: req.user.id,
    });
    const { familyId } = req.params;

    const family = await ensureFamilyBelongsToOperator(familyId, req.user.id, [
      {
        model: Case,
        as: "case",
        attributes: ["id", "isCancelled"],
      },
    ]);

    if (!family) {
      return res.status(404).json({
        message: "ოჯახი ვერ მოიძებნა ან ამ ოჯახზე წვდომა არ გაქვთ.",
      });
    }
    
    if (family.case?.isClosed) {
      return res.status(400).json({
        message: "დასრულებულ ქეისში ოჯახის რეაქტივაცია შეუძლებელია.",
      });
    }

    if (family.case?.isCancelled) {
      return res.status(400).json({
        message: "გაუქმებულ ქეისში ოპერატორის მოქმედება შეზღუდულია.",
      });
    }

    if (family.isSigned) {
      return res.status(400).json({
        message: "გაფორმებული ხელშეკრულების რეაქტივაცია საჭირო არ არის.",
      });
    }

    if (family.isActive) {
      return res.status(400).json({
        message: "ეს ოჯახი უკვე აქტიურია.",
      });
    }

    family.isActive = true;
    family.cancelledAt = null;
    family.cancellationReason = null;

    await family.save();

    await ContractActionLog.create({
      familyId: family.id,
      userId: req.user.id,
      action: "reactivated",
      comment: "ოპერატორმა ოჯახი ხელახლა გაააქტიურა.",
    });

    const caseStatus = await evaluateAndUpdateCaseStatus(family.caseId);

    return res.json({
      message: "ოჯახი ხელახლა გააქტიურდა.",
      family,
      caseStatus,
    });
  } catch (error) {
    console.error("Reactivate family error:", error);
    return res.status(500).json({
      message: "ოჯახის გააქტიურების შეცდომა.",
    });
  }
};

const updateSellerData = async (req, res) => {
  try {
    const { familyId } = req.params;

    const {
      fullName,
      personalNumber,
      phone,
      bankName,
      bankCode,
      bankAccount,
      bankRecipient,
    } = req.body || {};

    const family = await ensureFamilyBelongsToOperator(familyId, req.user.id);

    if (!family) {
      return res.status(404).json({
        message: "ოჯახი ვერ მოიძებნა ან ამ ოჯახზე წვდომა არ გაქვთ.",
      });
    }

    let seller = await Seller.findOne({ where: { familyId } });

    if (!seller) {
      seller = await Seller.create({
        familyId,
        fullName: fullName || "გამყიდველი",
      });
    }

    if (fullName !== undefined) seller.fullName = fullName;
    if (personalNumber !== undefined) seller.personalNumber = personalNumber;
    if (phone !== undefined) seller.phone = phone;
    if (bankName !== undefined) seller.bankName = bankName;
    if (bankCode !== undefined) seller.bankCode = bankCode;
    if (bankAccount !== undefined) seller.bankAccount = bankAccount;
    if (bankRecipient !== undefined) seller.bankRecipient = bankRecipient;

    await seller.save();

    await ContractActionLog.create({
      familyId: family.id,
      userId: req.user.id,
      action: "generated",
      comment: "ოპერატორმა განაახლა გამყიდველის/საბანკო მონაცემები.",
    });

    return res.json({
      message: "გამყიდველის მონაცემები განახლდა.",
      seller,
    });
  } catch (error) {
    console.error("Update seller data error:", error);
    return res.status(500).json({
      message: "გამყიდველის მონაცემების განახლების შეცდომა.",
    });
  }
};

const updatePropertyData = async (req, res) => {
  try {
    const { familyId } = req.params;

    const {
      address,
      cadastralCode,
      floor,
      apartmentNumber,
      area,
      buildingInfo,
      damagedPropertyCadastralCode,
    } = req.body || {};

    const family = await ensureFamilyBelongsToOperator(familyId, req.user.id);

    if (!family) {
      return res.status(404).json({
        message: "ოჯახი ვერ მოიძებნა ან ამ ოჯახზე წვდომა არ გაქვთ.",
      });
    }

    let property = await Property.findOne({ where: { familyId } });

    if (!property) {
      property = await Property.create({
        familyId,
        address: address || "მისამართი",
        cadastralCode: cadastralCode || "საკადასტრო კოდი",
      });
    }

    if (address !== undefined) property.address = address;
    if (cadastralCode !== undefined) property.cadastralCode = cadastralCode;
    if (floor !== undefined) property.floor = floor;
    if (apartmentNumber !== undefined) property.apartmentNumber = apartmentNumber;
    if (area !== undefined) property.area = area;
    if (buildingInfo !== undefined) property.buildingInfo = buildingInfo;
    if (damagedPropertyCadastralCode !== undefined) {
      property.damagedPropertyCadastralCode = damagedPropertyCadastralCode;
    }

    await property.save();

    await ContractActionLog.create({
      familyId: family.id,
      userId: req.user.id,
      action: "generated",
      comment: "ოპერატორმა განაახლა ქონების დამატებითი მონაცემები.",
    });

    return res.json({
      message: "ქონების მონაცემები განახლდა.",
      property,
    });
  } catch (error) {
    console.error("Update property data error:", error);
    return res.status(500).json({
      message: "ქონების მონაცემების განახლების შეცდომა.",
    });
  }
};

const updateFamilyMemberSigner = async (req, res) => {
  try {
    const { memberId } = req.params;

    const {
      signerType,
      representativeFullName,
      representativePersonalNumber,
    } = req.body || {};

    const allowedSignerTypes = [
      "self",
      "representative",
      "proxy",
      "supporter",
      "legal_representative",
    ];

    if (!signerType || !allowedSignerTypes.includes(signerType)) {
      return res.status(400).json({
        message: "ხელმომწერის ტიპი არასწორია.",
      });
    }

    const member = await FamilyMember.findByPk(memberId, {
      include: [
        {
          model: Family,
          as: "family",
          include: [
            {
              model: Case,
              as: "case",
              attributes: ["id", "isCancelled"],
            },
          ],
        },
      ],
    });

    if (!member) {
      return res.status(404).json({
        message: "ოჯახის წევრი ვერ მოიძებნა.",
      });
    }

    const family = await ensureFamilyBelongsToOperator(
      member.familyId,
      req.user.id
    );

    if (!family) {
      return res.status(403).json({
        message: "ამ ოჯახის წევრის განახლების უფლება არ გაქვთ.",
      });
    }

    if (member.family.case?.isCancelled) {
      return res.status(400).json({
        message: "გაუქმებულ ქეისში ოპერატორის მოქმედება შეზღუდულია.",
      });
    }

    member.signerType = signerType;
    member.representativeFullName = representativeFullName || null;
    member.representativePersonalNumber = representativePersonalNumber || null;

    await member.save();

    await ContractActionLog.create({
      familyId: member.familyId,
      userId: req.user.id,
      action: "generated",
      comment:
        "ოპერატორმა განაახლა ოჯახის წევრის ხელმოწერის/წარმომადგენლობის მონაცემები.",
    });

    return res.json({
      message: "ოჯახის წევრის ხელმოწერის მონაცემები განახლდა.",
      member,
    });
  } catch (error) {
    console.error("Update family member signer error:", error);
    return res.status(500).json({
      message: "ოჯახის წევრის ხელმოწერის მონაცემების განახლების შეცდომა.",
    });
  }
};

const updateSellerSigner = async (req, res) => {
  try {
    const { sellerId } = req.params;

    const {
      signerType,
      representativeFullName,
      representativePersonalNumber,
    } = req.body || {};

    const allowedSignerTypes = [
      "self",
      "representative",
      "proxy",
      "supporter",
      "legal_representative",
    ];

    if (!signerType || !allowedSignerTypes.includes(signerType)) {
      return res.status(400).json({
        message: "ხელმომწერის ტიპი არასწორია.",
      });
    }

    const seller = await Seller.findByPk(sellerId, {
      include: [
        {
          model: Family,
          as: "family",
          include: [
            {
              model: Case,
              as: "case",
              attributes: ["id", "isCancelled"],
            },
          ],
        },
      ],
    });

    if (!seller) {
      return res.status(404).json({
        message: "გამყიდველი ვერ მოიძებნა.",
      });
    }

    const family = await ensureFamilyBelongsToOperator(
      seller.familyId,
      req.user.id
    );

    if (!family) {
      return res.status(403).json({
        message: "ამ გამყიდველის განახლების უფლება არ გაქვთ.",
      });
    }

    if (seller.family.case?.isCancelled) {
      return res.status(400).json({
        message: "გაუქმებულ ქეისში ოპერატორის მოქმედება შეზღუდულია.",
      });
    }

    seller.signerType = signerType;

    if (signerType === "self") {
      seller.representativeFullName = null;
      seller.representativePersonalNumber = null;
    } else {
      seller.representativeFullName = representativeFullName || null;
      seller.representativePersonalNumber =
        representativePersonalNumber || null;
    }

    await seller.save();

    await ContractActionLog.create({
      familyId: seller.familyId,
      userId: req.user.id,
      action: "generated",
      comment:
        "ოპერატორმა განაახლა გამყიდველის ხელმოწერის/წარმომადგენლობის მონაცემები.",
    });

    return res.json({
      message: "გამყიდველის ხელმოწერის მონაცემები განახლდა.",
      seller,
    });
  } catch (error) {
    console.error("Update seller signer error:", error);
    return res.status(500).json({
      message: "გამყიდველის ხელმოწერის მონაცემების განახლების შეცდომა.",
    });
  }
};

const updateContractExtraData = async (req, res) => {
  try {
    const { familyId } = req.params;

    const { extraData } = req.body || {};

    const family = await ensureFamilyBelongsToOperator(familyId, req.user.id, [
      {
        model: Case,
        as: "case",
        attributes: ["id", "subCategory", "isCancelled"],
      },
    ]);

    if (!family) {
      return res.status(404).json({
        message: "ოჯახი ვერ მოიძებნა ან ამ ოჯახზე წვდომა არ გაქვთ.",
      });
    }

    if (family.case?.isCancelled) {
      return res.status(400).json({
        message: "გაუქმებულ ქეისში ოპერატორის მოქმედება შეზღუდულია.",
      });
    }

    const allowedExtraData = {
      bankName: extraData?.bankName || "",
      bankCode: extraData?.bankCode || "",
      bankAccount: extraData?.bankAccount || "",
      bankRecipient: extraData?.bankRecipient || "",
    };

    if (family.case?.subCategory === "idps_admin_promise_purchase") {
      const sourceAmountUsd = Number(family.purchaseAmount || 0);
      const usdRate = Number(extraData?.usdRate || 0);

      if (Number.isNaN(sourceAmountUsd) || sourceAmountUsd <= 0) {
        return res.status(400).json({
          message: "USD თანხა ოჯახზე არასწორია ან არ არის შევსებული.",
        });
      }

      if (Number.isNaN(usdRate) || usdRate <= 0) {
        return res.status(400).json({
          message: "USD კურსი არასწორია ან არ არის შევსებული.",
        });
      }

      allowedExtraData.sourceAmountUsd = sourceAmountUsd;
      allowedExtraData.usdRate = usdRate;
      allowedExtraData.usdRateDate = extraData?.usdRateDate || "";
      allowedExtraData.usdRateSource =
        extraData?.usdRateSource === "manual" ? "manual" : "NBG";
      allowedExtraData.usdRateManualOverride =
        extraData?.usdRateManualOverride === true;
      allowedExtraData.convertedGelAmount = Number(
        (sourceAmountUsd * usdRate).toFixed(2)
      );
    }

    let contractData = await ContractData.findOne({ where: { familyId } });

    if (!contractData) {
      contractData = await ContractData.create({
        familyId,
        extraData: {},
      });
    }

    contractData.extraData = {
      ...(contractData.extraData || {}),
      ...allowedExtraData,
    };

    await contractData.save();

    await ContractActionLog.create({
      familyId: family.id,
      userId: req.user.id,
      action: "generated",
      comment:
        "ოპერატორმა განაახლა საბანკო რეკვიზიტები/დამატებითი მონაცემები.",
    });

    return res.json({
      message: "დამატებითი მონაცემები განახლდა.",
      contractData,
    });
  } catch (error) {
    console.error("Update contract extra data error:", error);
    return res.status(500).json({
      message: "დამატებითი მონაცემების განახლების შეცდომა.",
    });
  }
};

const generateFamilyContract = async (req, res) => {
  try {
    const { familyId } = req.params;

    const family = await ensureFamilyBelongsToOperator(familyId, req.user.id, [
      {
        model: Case,
        as: "case",
        attributes: ["id", "isCancelled"],
      },
    ]);

    if (!family) {
      return res.status(404).json({
        message: "ოჯახი ვერ მოიძებნა ან ამ ოჯახზე წვდომა არ გაქვთ.",
      });
    }

    if (family.case?.isCancelled) {
      return res.status(400).json({
        message: "გაუქმებულ ქეისში ხელშეკრულების გენერირება შეუძლებელია.",
      });
    }

    if (!family.isActive) {
      return res.status(400).json({
        message: "გაუქმებულ ოჯახზე ხელშეკრულების გენერირება შეუძლებელია.",
      });
    }

    const result = await generateContractDocx({
      familyId: family.id,
      userId: req.user.id,
    });

    const encodedFileName = encodeURIComponent(result.fileName);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.fileName}"; filename*=UTF-8''${encodedFileName}`
    );

    return res.send(result.buffer);
  } catch (error) {
    console.error("Generate family contract error:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "ხელშეკრულების გენერირების შეცდომა.",
      missingFields: error.missingFields || undefined,
    });
  }
};

const addSellerData = async (req, res) => {
  try {
    const { familyId } = req.params;

    const {
      fullName,
      personalNumber,
      phone,
      bankName,
      bankCode,
      bankAccount,
      bankRecipient,
    } = req.body || {};

    if (!fullName) {
      return res.status(400).json({
        message: "გამყიდველის სახელი/გვარი აუცილებელია.",
      });
    }

    const family = await ensureFamilyBelongsToOperator(familyId, req.user.id);

    if (!family) {
      return res.status(404).json({
        message: "ოჯახი ვერ მოიძებნა ან ამ ოჯახზე წვდომა არ გაქვთ.",
      });
    }

    const seller = await Seller.create({
      familyId,
      fullName,
      personalNumber,
      phone,
      bankName,
      bankCode,
      bankAccount,
      bankRecipient,
    });

    await ContractActionLog.create({
      familyId: family.id,
      userId: req.user.id,
      action: "generated",
      comment: "ოპერატორმა დაამატა დამატებითი გამყიდველი.",
    });

    return res.status(201).json({
      message: "გამყიდველი დაემატა.",
      seller,
    });
  } catch (error) {
    console.error("Add seller data error:", error);
    return res.status(500).json({
      message: "გამყიდველის დამატების შეცდომა.",
    });
  }
};

const updateSellerById = async (req, res) => {
  try {
    const { sellerId } = req.params;

    const {
      fullName,
      personalNumber,
      phone,
      bankName,
      bankCode,
      bankAccount,
      bankRecipient,
    } = req.body || {};

    const seller = await Seller.findByPk(sellerId, {
      include: [
        {
          model: Family,
          as: "family",
        },
      ],
    });

    if (!seller) {
      return res.status(404).json({
        message: "გამყიდველი ვერ მოიძებნა.",
      });
    }

    const family = await ensureFamilyBelongsToOperator(
      seller.familyId,
      req.user.id
    );

    if (!family) {
      return res.status(403).json({
        message: "ამ გამყიდველის განახლების უფლება არ გაქვთ.",
      });
    }

    if (fullName !== undefined) seller.fullName = fullName;
    if (personalNumber !== undefined) seller.personalNumber = personalNumber;
    if (phone !== undefined) seller.phone = phone;
    if (bankName !== undefined) seller.bankName = bankName;
    if (bankCode !== undefined) seller.bankCode = bankCode;
    if (bankAccount !== undefined) seller.bankAccount = bankAccount;
    if (bankRecipient !== undefined) seller.bankRecipient = bankRecipient;

    await seller.save();

    await ContractActionLog.create({
      familyId: seller.familyId,
      userId: req.user.id,
      action: "generated",
      comment: "ოპერატორმა განაახლა გამყიდველის მონაცემები.",
    });

    return res.json({
      message: "გამყიდველის მონაცემები განახლდა.",
      seller,
    });
  } catch (error) {
    console.error("Update seller by id error:", error);
    return res.status(500).json({
      message: "გამყიდველის მონაცემების განახლების შეცდომა.",
    });
  }
};

const deleteSellerById = async (req, res) => {
  try {
    const { sellerId } = req.params;

    const seller = await Seller.findByPk(sellerId, {
      include: [
        {
          model: Family,
          as: "family",
        },
      ],
    });

    if (!seller) {
      return res.status(404).json({
        message: "გამყიდველი ვერ მოიძებნა.",
      });
    }

    const family = await ensureFamilyBelongsToOperator(
      seller.familyId,
      req.user.id
    );

    if (!family) {
      return res.status(403).json({
        message: "ამ გამყიდველის წაშლის უფლება არ გაქვთ.",
      });
    }

    const sellersCount = await Seller.count({
      where: {
        familyId: seller.familyId,
      },
    });

    if (sellersCount <= 1) {
      return res.status(400).json({
        message:
          "ბოლო გამყიდველის წაშლა არ შეიძლება. მინიმუმ ერთი გამყიდველი უნდა დარჩეს.",
      });
    }

    const familyId = seller.familyId;

    await seller.destroy();

    await ContractActionLog.create({
      familyId,
      userId: req.user.id,
      action: "generated",
      comment: "ოპერატორმა წაშალა გამყიდველი.",
    });

    return res.json({
      message: "გამყიდველი წაიშალა.",
      sellerId: Number(sellerId),
    });
  } catch (error) {
    console.error("Delete seller by id error:", error);
    return res.status(500).json({
      message: "გამყიდველის წაშლის შეცდომა.",
    });
  }
};

const getMyCaseStatus = async (req, res) => {
  try {
    const { caseId } = req.params;

    const access = await ensureCaseBelongsToOperator(caseId, req.user.id);

    if (!access) {
      return res.status(404).json({
        message: "ქეისი ვერ მოიძებნა ან ამ ქეისზე წვდომა არ გაქვთ.",
      });
    }

    const caseStatus = await evaluateAndUpdateCaseStatus(caseId);

    return res.json({
      caseStatus,
    });
  } catch (error) {
    console.error("Get my case status error:", error);
    return res.status(500).json({
      message: "ქეისის სტატუსის მიღების შეცდომა.",
    });
  }
};

const searchAssignedFamilies = async (req, res) => {
  try {
    const query = String(req.query.query || req.query.q || "").trim();

    if (!query || query.length < 2) {
      return res.json({
        query,
        count: 0,
        results: [],
      });
    }

    const like = `%${query}%`;
    const accessWhere = await buildAccessibleFamilyWhere(req.user.id);

    const familyMatches = await Family.findAll({
      where: {
        [Op.and]: [
          accessWhere,
          {
            [Op.or]: [
              { primaryPersonFullName: { [Op.iLike]: like } },
              { primaryPersonPersonalNumber: { [Op.iLike]: like } },
              { beneficiaryPhone: { [Op.iLike]: like } },
              { protocolInfo: { [Op.iLike]: like } },
              { administrativePromiseInfo: { [Op.iLike]: like } },
              { originInfo: { [Op.iLike]: like } },
            ],
          },
        ],
      },
      attributes: ["id"],
      limit: 100,
    });

    const caseMatches = await Family.findAll({
      where: accessWhere,
      include: [
        {
          model: Case,
          as: "case",
          required: true,
          attributes: [],
          where: {
            [Op.or]: [
              { title: { [Op.iLike]: like } },
              { orderNumber: { [Op.iLike]: like } },
            ],
          },
        },
      ],
      attributes: ["id"],
      limit: 100,
    });

    const memberMatches = await FamilyMember.findAll({
      where: {
        [Op.or]: [
          { fullName: { [Op.iLike]: like } },
          { personalNumber: { [Op.iLike]: like } },
          { representativeFullName: { [Op.iLike]: like } },
          { representativePersonalNumber: { [Op.iLike]: like } },
        ],
      },
      include: [
        {
          model: Family,
          as: "family",
          required: true,
          attributes: ["id"],
          where: accessWhere,
        },
      ],
      attributes: ["familyId"],
      limit: 100,
    });

    const sellerMatches = await Seller.findAll({
      where: {
        [Op.or]: [
          { fullName: { [Op.iLike]: like } },
          { personalNumber: { [Op.iLike]: like } },
          { phone: { [Op.iLike]: like } },
          { bankName: { [Op.iLike]: like } },
          { bankCode: { [Op.iLike]: like } },
          { bankAccount: { [Op.iLike]: like } },
          { bankRecipient: { [Op.iLike]: like } },
        ],
      },
      include: [
        {
          model: Family,
          as: "family",
          required: true,
          attributes: ["id"],
          where: accessWhere,
        },
      ],
      attributes: ["familyId"],
      limit: 100,
    });

    const propertyMatches = await Property.findAll({
      where: {
        [Op.or]: [
          { address: { [Op.iLike]: like } },
          { cadastralCode: { [Op.iLike]: like } },
          { floor: { [Op.iLike]: like } },
          { apartmentNumber: { [Op.iLike]: like } },
          { area: { [Op.iLike]: like } },
          { buildingInfo: { [Op.iLike]: like } },
          { damagedPropertyCadastralCode: { [Op.iLike]: like } },
        ],
      },
      include: [
        {
          model: Family,
          as: "family",
          required: true,
          attributes: ["id"],
          where: accessWhere,
        },
      ],
      attributes: ["familyId"],
      limit: 100,
    });

    const familyIds = [
      ...new Set([
        ...familyMatches.map((item) => item.id),
        ...caseMatches.map((item) => item.id),
        ...memberMatches.map((item) => item.familyId),
        ...sellerMatches.map((item) => item.familyId),
        ...propertyMatches.map((item) => item.familyId),
      ]),
    ].filter(Boolean);

    if (familyIds.length === 0) {
      return res.json({
        query,
        count: 0,
        results: [],
      });
    }

    const families = await Family.findAll({
      where: {
        [Op.and]: [
          accessWhere,
          {
            id: {
              [Op.in]: familyIds,
            },
          },
        ],
      },
      include: [
        {
          model: Case,
          as: "case",
          attributes: [
            "id",
            "title",
            "orderNumber",
            "orderDate",
            "mainCategory",
            "subCategory",
            "isClosed",
          ],
        },
        {
          model: FamilyMember,
          as: "members",
          attributes: ["id", "fullName", "personalNumber", "signerType"],
        },
        {
          model: Seller,
          as: "sellers",
          attributes: ["id", "fullName", "personalNumber", "phone"],
        },
        {
          model: Property,
          as: "property",
          attributes: ["id", "address", "cadastralCode"],
        },
      ],
      order: [
        ["caseId", "DESC"],
        ["rowNumber", "ASC"],
        ["id", "ASC"],
      ],
      limit: 100,
    });

    return res.json({
      query,
      count: families.length,
      results: families.map(buildFamilySearchResult),
    });
  } catch (error) {
    console.error("Search assigned families error:", error);
    return res.status(500).json({
      message: "ოჯახების ძებნის შეცდომა.",
    });
  }
};

const markCaseViewed = async (req, res) => {
  try {
    const { caseId } = req.params;

    const access = await ensureCaseBelongsToOperator(caseId, req.user.id);

    if (!access) {
      return res.status(404).json({
        message: "ქეისი ვერ მოიძებნა ან ამ ქეისზე წვდომა არ გაქვთ.",
      });
    }

    const view = await markOperatorCaseViewed({
      operatorId: req.user.id,
      caseId: Number(caseId),
    });

    return res.json({
      message: "ქეისი მონიშნულია ნანახად.",
      view,
    });
  } catch (error) {
    console.error("Mark case viewed error:", error);
    return res.status(500).json({
      message: "ქეისის ნანახად მონიშვნის შეცდომა.",
    });
  }
};

const downloadMyCaseAnnex = async (req, res) => {
  try {
    const { caseId } = req.params;

    const access = await ensureCaseBelongsToOperator(caseId, req.user.id);

    if (!access) {
      return res.status(404).json({
        message: "ქეისი ვერ მოიძებნა ან ამ ქეისზე წვდომა არ გაქვთ.",
      });
    }

    const caseRecord = await Case.findByPk(caseId, {
      attributes: ["id", "orderNumber", "annexExcelPath"],
    });

    if (!caseRecord || !caseRecord.annexExcelPath) {
      return res.status(404).json({
        message: "ამ ქეისზე Excel დანართი ვერ მოიძებნა.",
      });
    }

    if (!fs.existsSync(caseRecord.annexExcelPath)) {
      return res.status(404).json({
        message: "Excel ფაილი სერვერზე ვერ მოიძებნა.",
      });
    }

    const originalFileName = path.basename(caseRecord.annexExcelPath);
    const downloadName = `${
      caseRecord.orderNumber || "case"
    }_${originalFileName}`;

    return res.download(caseRecord.annexExcelPath, downloadName);
  } catch (error) {
    console.error("Download operator case annex error:", error);
    return res.status(500).json({
      message: "Excel დანართის ჩამოტვირთვის შეცდომა.",
    });
  }
};

module.exports = {
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
  updateSellerData,
  updatePropertyData,
  updateFamilyMemberSigner,
  updateSellerSigner,
  updateContractExtraData,
  generateFamilyContract,
  addSellerData,
  updateSellerById,
  deleteSellerById,
};