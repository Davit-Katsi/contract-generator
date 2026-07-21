const { Op } = require("sequelize");
const {
  Case,
  Family,
  FamilyMember,
  Seller,
  Property,
  User,
  OperatorCaseView,
} = require("../models");

const {
  expireLegalizationCases,
} = require("../services/caseExpirationService");

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

const getSharedLegalizationCaseIds = async (operatorId) => {
  const views = await OperatorCaseView.findAll({
    where: {
      operatorId,
      hasFullAccess: true,
    },
    attributes: ["caseId"],
  });

  const caseIds = [
    ...new Set(
      views.map((view) => Number(view.caseId)).filter((id) => id > 0)
    ),
  ];

  if (caseIds.length === 0) {
    return [];
  }

  const cases = await Case.findAll({
    where: {
      id: {
        [Op.in]: caseIds,
      },
      subCategory: {
        [Op.in]: LEGALIZATION_SUB_CATEGORIES,
      },
    },
    attributes: ["id"],
  });

  return cases.map((caseRecord) => Number(caseRecord.id)).filter((id) => id > 0);
};

const buildOperatorFamilyAccessWhere = (operatorId, sharedCaseIds = []) => {
  const normalizedSharedCaseIds = Array.isArray(sharedCaseIds)
    ? sharedCaseIds.map((id) => Number(id)).filter((id) => id > 0)
    : [];

  if (normalizedSharedCaseIds.length === 0) {
    return {
      assignedOperatorId: operatorId,
    };
  }

  return {
    [Op.or]: [
      {
        assignedOperatorId: operatorId,
      },
      {
        caseId: {
          [Op.in]: normalizedSharedCaseIds,
        },
      },
    ],
  };
};

const mergeFamilyWhereWithAccess = (familyWhere = {}, accessWhere = {}) => {
  const hasFamilyWhere = Object.keys(familyWhere || {}).length > 0;
  const hasAccessWhere = Object.keys(accessWhere || {}).length > 0;

  if (hasFamilyWhere && hasAccessWhere) {
    return {
      [Op.and]: [familyWhere, accessWhere],
    };
  }

  if (hasAccessWhere) return accessWhere;
  return familyWhere;
};

const createEmptyCategoryStats = () => {
  const result = {};

  MAIN_CATEGORIES.forEach((category) => {
    result[category] = {
      totalFamilies: 0,
      signedFamilies: 0,
      cancelledFamilies: 0,
      remainingFamilies: 0,
    };
  });

  return result;
};

const createEmptySubCategoryStats = () => {
  const result = {};

  SUB_CATEGORIES.forEach((category) => {
    result[category] = {
      totalFamilies: 0,
      signedFamilies: 0,
      cancelledFamilies: 0,
      remainingFamilies: 0,
    };
  });

  return result;
};

const getFamilyStatus = (family) => {
  if (family.isSigned) return "signed";
  if (!family.isActive) return "cancelled";
  return "remaining";
};

const toGeorgiaYearMonth = (dateValue) => {
  if (!dateValue) return null;

  const date = new Date(dateValue);
  const georgiaDate = new Date(date.getTime() + 4 * 60 * 60 * 1000);

  return georgiaDate.toISOString().slice(0, 7);
};

const buildDateRange = ({ year, month }) => {
  if (!year) return null;

  const numericYear = Number(year);
  const numericMonth = month ? Number(month) : null;

  if (Number.isNaN(numericYear)) return null;

  if (numericMonth && !Number.isNaN(numericMonth)) {
    const start = new Date(Date.UTC(numericYear, numericMonth - 1, 1, -4, 0, 0));
    const end = new Date(Date.UTC(numericYear, numericMonth, 1, -4, 0, 0));

    return { start, end };
  }

  const start = new Date(Date.UTC(numericYear, 0, 1, -4, 0, 0));
  const end = new Date(Date.UTC(numericYear + 1, 0, 1, -4, 0, 0));

  return { start, end };
};

const buildStatisticsFilters = (query) => {
  const {
    year,
    month,
    mainCategory,
    subCategory,
    operatorId,
  } = query || {};

  const caseWhere = {
    isCancelled: false,
  };

  const familyWhere = {};
  const dateRange = buildDateRange({ year, month });

  if (mainCategory) {
    caseWhere.mainCategory = mainCategory;
  }

  if (subCategory) {
    caseWhere.subCategory = subCategory;
  }

  if (dateRange) {
    familyWhere[Op.or] = [
      {
        signedAt: {
          [Op.gte]: dateRange.start,
          [Op.lt]: dateRange.end,
        },
      },
      {
        cancelledAt: {
          [Op.gte]: dateRange.start,
          [Op.lt]: dateRange.end,
        },
      },
    ];
  }

  return {
    caseWhere,
    familyWhere,
    hasFamilyFilter: Boolean(dateRange),
    appliedFilters: {
      year: year || null,
      month: month || null,
      mainCategory: mainCategory || null,
      subCategory: subCategory || null,
      operatorId: operatorId ? Number(operatorId) : null,
    },
  };
};

const buildPersonSearchWhere = (query) => {
  const cleanQuery = String(query || "").trim();
  const like = `%${cleanQuery}%`;
  const terms = cleanQuery
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);

  return {
    [Op.or]: [
      { fullName: { [Op.iLike]: like } },
      { personalNumber: { [Op.iLike]: like } },
      ...terms.map((term) => ({
        fullName: {
          [Op.iLike]: `%${term}%`,
        },
      })),
      ...terms.map((term) => ({
        personalNumber: {
          [Op.iLike]: `%${term}%`,
        },
      })),
    ],
  };
};

const getFamilyStatusLabel = (family) => {
  if (family.isSigned) return "გაფორმებული";
  if (!family.isActive) return "გაუქმებული";
  return "გასაფორმებელი";
};

const buildHeadFamilySearchResult = (family) => {
  const plain = family.toJSON ? family.toJSON() : family;

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
    statusLabel: getFamilyStatusLabel(plain),

    case: plain.case
      ? {
          id: plain.case.id,
          title: plain.case.title,
          orderNumber: plain.case.orderNumber,
          orderDate: plain.case.orderDate,
          mainCategory: plain.case.mainCategory,
          subCategory: plain.case.subCategory,
          isClosed: plain.case.isClosed,
          isCancelled: plain.case.isCancelled,
        }
      : null,

    assignedOperator: plain.assignedOperator
      ? {
          id: plain.assignedOperator.id,
          fullName: plain.assignedOperator.fullName,
          username: plain.assignedOperator.username,
        }
      : null,

    members: plain.members || [],
    sellers: plain.sellers || [],
    property: plain.property || null,
  };
};

const addToBucket = (bucket, key, field) => {
  if (!key) return;

  if (!bucket[key]) {
    bucket[key] = {
      signedFamilies: 0,
      cancelledFamilies: 0,
    };
  }

  bucket[key][field] += 1;
};

const buildCaseStatistics = (cases) => {
  const activeCases = (cases || []).filter(
    (caseRecord) => !caseRecord.isCancelled
  );
  const byMainCategory = createEmptyCategoryStats();
  const bySubCategory = createEmptySubCategoryStats();

  const totals = {
    totalCases: activeCases.length,
    activeCases: 0,
    closedCases: 0,

    totalFamilies: 0,
    delegatedFamilies: 0,
    notDelegatedFamilies: 0,

    signedFamilies: 0,
    cancelledFamilies: 0,
    remainingFamilies: 0,
  };

  const caseRows = activeCases.map((caseRecord) => {
    const families = caseRecord.families || [];
    const operatorViews = caseRecord.operatorViews || [];
    const hasSharedFullAccess =
      isLegalizationSubCategory(caseRecord.subCategory) &&
      operatorViews.some((view) => view.hasFullAccess);
    const caseStats = {
      totalFamilies: 0,
      delegatedFamilies: 0,
      notDelegatedFamilies: 0,
      signedFamilies: 0,
      cancelledFamilies: 0,
      remainingFamilies: 0,
    };

    if (caseRecord.isClosed) {
      totals.closedCases += 1;
    } else {
      totals.activeCases += 1;
    }

    families.forEach((family) => {
      const status = getFamilyStatus(family);

      totals.totalFamilies += 1;
      caseStats.totalFamilies += 1;

      const isDelegatedFamily =
        Boolean(family.assignedOperatorId) || hasSharedFullAccess;

      if (isDelegatedFamily) {
        totals.delegatedFamilies += 1;
        caseStats.delegatedFamilies += 1;
      } else {
        totals.notDelegatedFamilies += 1;
        caseStats.notDelegatedFamilies += 1;
      }

      if (status === "signed") {
        totals.signedFamilies += 1;
        caseStats.signedFamilies += 1;

        byMainCategory[caseRecord.mainCategory].signedFamilies += 1;
        bySubCategory[caseRecord.subCategory].signedFamilies += 1;
      }

      if (status === "cancelled") {
        totals.cancelledFamilies += 1;
        caseStats.cancelledFamilies += 1;

        byMainCategory[caseRecord.mainCategory].cancelledFamilies += 1;
        bySubCategory[caseRecord.subCategory].cancelledFamilies += 1;
      }

      if (status === "remaining") {
        totals.remainingFamilies += 1;
        caseStats.remainingFamilies += 1;

        byMainCategory[caseRecord.mainCategory].remainingFamilies += 1;
        bySubCategory[caseRecord.subCategory].remainingFamilies += 1;
      }

      byMainCategory[caseRecord.mainCategory].totalFamilies += 1;
      bySubCategory[caseRecord.subCategory].totalFamilies += 1;
    });

    return {
      id: caseRecord.id,
      title: caseRecord.title,
      orderNumber: caseRecord.orderNumber,
      orderDate: caseRecord.orderDate,
      mainCategory: caseRecord.mainCategory,
      subCategory: caseRecord.subCategory,
      isClosed: caseRecord.isClosed,
      closedAt: caseRecord.closedAt,
      createdAt: caseRecord.createdAt,
      stats: caseStats,
    };
  });

  return {
    totals,
    byMainCategory,
    bySubCategory,
    cases: caseRows,
  };
};

const buildOperatorPerformance = async (cases) => {
  const operatorIds = new Set();

  cases.forEach((caseRecord) => {
    const sharedOperatorIds = isLegalizationSubCategory(caseRecord.subCategory)
      ? (caseRecord.operatorViews || [])
          .filter((view) => view.hasFullAccess)
          .map((view) => Number(view.operatorId))
          .filter((id) => id > 0)
      : [];

    (caseRecord.families || []).forEach((family) => {
      const familyOperatorIds = new Set(sharedOperatorIds);

      if (family.assignedOperatorId) {
        familyOperatorIds.add(Number(family.assignedOperatorId));
      }

      familyOperatorIds.forEach((operatorId) => {
        if (operatorId > 0) {
          operatorIds.add(operatorId);
        }
      });
    });
  });

  const operators = await User.findAll({
    where: {
      id: Array.from(operatorIds),
    },
    attributes: ["id", "fullName", "username"],
  });

  const operatorMap = new Map();

  operators.forEach((operator) => {
    operatorMap.set(Number(operator.id), {
      operatorId: Number(operator.id),
      fullName: operator.fullName,
      username: operator.username,
      totalFamilies: 0,
      signedFamilies: 0,
      cancelledFamilies: 0,
      remainingFamilies: 0,
    });
  });

  cases.forEach((caseRecord) => {
    const sharedOperatorIds = isLegalizationSubCategory(caseRecord.subCategory)
      ? (caseRecord.operatorViews || [])
          .filter((view) => view.hasFullAccess)
          .map((view) => Number(view.operatorId))
          .filter((id) => id > 0)
      : [];

    (caseRecord.families || []).forEach((family) => {
      const familyOperatorIds = new Set(sharedOperatorIds);

      if (family.assignedOperatorId) {
        familyOperatorIds.add(Number(family.assignedOperatorId));
      }

      familyOperatorIds.forEach((operatorId) => {
        if (!operatorMap.has(operatorId)) {
          operatorMap.set(operatorId, {
            operatorId,
            fullName: "უცნობი ოპერატორი",
            username: "",
            totalFamilies: 0,
            signedFamilies: 0,
            cancelledFamilies: 0,
            remainingFamilies: 0,
          });
        }

        const row = operatorMap.get(operatorId);
        const status = getFamilyStatus(family);

        row.totalFamilies += 1;

        if (status === "signed") row.signedFamilies += 1;
        if (status === "cancelled") row.cancelledFamilies += 1;
        if (status === "remaining") row.remainingFamilies += 1;
      });
    });
  });

  return Array.from(operatorMap.values()).sort(
    (a, b) => b.totalFamilies - a.totalFamilies
  );
};

const buildMonthlyReport = (cases) => {
  const monthly = {};

  cases.forEach((caseRecord) => {
    (caseRecord.families || []).forEach((family) => {
      if (family.isSigned && family.signedAt) {
        const key = toGeorgiaYearMonth(family.signedAt);

        addToBucket(monthly, key, "signedFamilies");
      }

      if (!family.isActive && family.cancelledAt) {
        const key = toGeorgiaYearMonth(family.cancelledAt);

        addToBucket(monthly, key, "cancelledFamilies");
      }
    });
  });

  return Object.keys(monthly)
    .sort()
    .map((key) => ({
      yearMonth: key,
      ...monthly[key],
    }));
};

const loadCasesWithFamilies = async ({
  caseWhere = {},
  familyWhere = {},
  hasFamilyFilter = false,
} = {}) => {
  return Case.findAll({
    where: caseWhere,
    include: [
      {
        model: Family,
        as: "families",
        where: familyWhere,
        required: hasFamilyFilter,
        attributes: [
          "id",
          "caseId",
          "assignedOperatorId",
          "isSigned",
          "signedAt",
          "isActive",
          "cancelledAt",
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
      },
    ],
    order: [["createdAt", "DESC"]],
  });
};

const loadOperatorCasesForStatistics = async ({
  operatorId,
  caseWhere = {},
  familyWhere = {},
} = {}) => {
  const sharedCaseIds = await getSharedLegalizationCaseIds(operatorId);

  const accessWhere = buildOperatorFamilyAccessWhere(
    operatorId,
    sharedCaseIds
  );

  const finalFamilyWhere = mergeFamilyWhereWithAccess(
    familyWhere,
    accessWhere
  );

  const families = await Family.findAll({
    where: finalFamilyWhere,
    include: [
      {
        model: Case,
        as: "case",
        required: true,
        where: caseWhere,
        attributes: [
          "id",
          "title",
          "orderNumber",
          "orderDate",
          "mainCategory",
          "subCategory",
          "isClosed",
          "isCancelled",
          "closedAt",
          "createdAt",
        ],
      },
    ],
    attributes: [
      "id",
      "caseId",
      "assignedOperatorId",
      "isSigned",
      "signedAt",
      "isActive",
      "cancelledAt",
    ],
    order: [
      ["caseId", "DESC"],
      ["id", "ASC"],
    ],
  });

  const sharedCaseIdSet = new Set(sharedCaseIds.map((id) => Number(id)));
  const caseMap = new Map();

  families.forEach((family) => {
    const plainFamily = family.toJSON ? family.toJSON() : family;
    const caseRecord = plainFamily.case;

    if (!caseRecord) return;

    if (!caseMap.has(caseRecord.id)) {
      caseMap.set(caseRecord.id, {
        ...caseRecord,
        families: [],
        operatorViews: sharedCaseIdSet.has(Number(caseRecord.id))
          ? [
              {
                operatorId,
                caseId: caseRecord.id,
                hasFullAccess: true,
              },
            ]
          : [],
      });
    }

    const row = caseMap.get(caseRecord.id);

    row.families.push({
      id: plainFamily.id,
      caseId: plainFamily.caseId,
      assignedOperatorId: plainFamily.assignedOperatorId,
      isSigned: plainFamily.isSigned,
      signedAt: plainFamily.signedAt,
      isActive: plainFamily.isActive,
      cancelledAt: plainFamily.cancelledAt,
    });
  });

  return Array.from(caseMap.values());
};

const getManagerDashboard = async (req, res) => {
  try {
    await expireLegalizationCases({
      userId: req.user.id,
    });
    const filters = buildStatisticsFilters(req.query);

    if (req.user.role === "manager") {
      filters.caseWhere.createdById = req.user.id;
    }

    let familyWhere = filters.familyWhere;
    let hasFamilyFilter = filters.hasFamilyFilter;

    if (filters.appliedFilters.operatorId) {
      const sharedCaseIds = await getSharedLegalizationCaseIds(
        filters.appliedFilters.operatorId
      );

      const accessWhere = buildOperatorFamilyAccessWhere(
        filters.appliedFilters.operatorId,
        sharedCaseIds
      );

      familyWhere = mergeFamilyWhereWithAccess(familyWhere, accessWhere);
      hasFamilyFilter = true;
    }

    const cases = await loadCasesWithFamilies({
      caseWhere: filters.caseWhere,
      familyWhere,
      hasFamilyFilter,
    });

    const statistics = buildCaseStatistics(cases);

    return res.json({
      role: req.user.role,
      scope: req.user.role === "admin" ? "all_cases" : "created_by_me",
      filters: filters.appliedFilters,
      ...statistics,
    });
  } catch (error) {
    console.error("Manager statistics error:", error);
    return res.status(500).json({
      message: "მენეჯერის სტატისტიკის მიღების შეცდომა.",
    });
  }
};

const getOperatorStatisticsDashboard = async (req, res) => {
  try {
    await expireLegalizationCases({
      userId: req.user.id,
    });

    const filters = buildStatisticsFilters(req.query);

    const cases = await loadOperatorCasesForStatistics({
      operatorId: req.user.id,
      caseWhere: filters.caseWhere,
      familyWhere: filters.familyWhere,
    });

    const statistics = buildCaseStatistics(cases);
    const monthlyReport = buildMonthlyReport(cases);

    return res.json({
      role: req.user.role,
      scope: "assigned_to_me",
      filters: {
        ...filters.appliedFilters,
        operatorId: req.user.id,
      },
      ...statistics,
      monthlyReport,
    });
  } catch (error) {
    console.error("Operator statistics error:", error);
    return res.status(500).json({
      message: "ოპერატორის სტატისტიკის მიღების შეცდომა.",
    });
  }
};

const searchHeadFamilies = async (req, res) => {
  try {
    const query = String(req.query.query || req.query.q || "").trim();

    if (!query || query.length < 2) {
      return res.json({
        query,
        count: 0,
        results: [],
      });
    }

    const personWhere = buildPersonSearchWhere(query);

    const memberMatches = await FamilyMember.findAll({
      where: personWhere,
      include: [
        {
          model: Family,
          as: "family",
          required: true,
          attributes: ["id"],
        },
      ],
      attributes: ["familyId"],
      limit: 150,
    });

    const sellerMatches = await Seller.findAll({
      where: personWhere,
      include: [
        {
          model: Family,
          as: "family",
          required: true,
          attributes: ["id"],
        },
      ],
      attributes: ["familyId"],
      limit: 150,
    });

    const familyIds = [
      ...new Set([
        ...memberMatches.map((item) => item.familyId),
        ...sellerMatches.map((item) => item.familyId),
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
        id: {
          [Op.in]: familyIds,
        },
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
            "isCancelled",
          ],
        },
        {
          model: User,
          as: "assignedOperator",
          attributes: ["id", "fullName", "username"],
        },
        {
          model: FamilyMember,
          as: "members",
          attributes: ["id", "fullName", "personalNumber", "signerType"],
        },
        {
          model: Seller,
          as: "sellers",
          attributes: ["id", "fullName", "personalNumber", "phone", "signerType"],
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
      limit: 150,
    });

    return res.json({
      query,
      count: families.length,
      results: families.map(buildHeadFamilySearchResult),
    });
  } catch (error) {
    console.error("Head family search error:", error);
    return res.status(500).json({
      message: "ოჯახის ძიების შეცდომა.",
    });
  }
};

const getHeadDashboard = async (req, res) => {
  try {
    await expireLegalizationCases({
      userId: req.user.id,
    });
    const filters = buildStatisticsFilters(req.query);

    let familyWhere = filters.familyWhere;
    let hasFamilyFilter = filters.hasFamilyFilter;

    if (filters.appliedFilters.operatorId) {
      const sharedCaseIds = await getSharedLegalizationCaseIds(
        filters.appliedFilters.operatorId
      );

      const accessWhere = buildOperatorFamilyAccessWhere(
        filters.appliedFilters.operatorId,
        sharedCaseIds
      );

      familyWhere = mergeFamilyWhereWithAccess(familyWhere, accessWhere);
      hasFamilyFilter = true;
    }

    const cases = await loadCasesWithFamilies({
      caseWhere: filters.caseWhere,
      familyWhere,
      hasFamilyFilter,
    });

    const statistics = buildCaseStatistics(cases);
    const operatorPerformance = await buildOperatorPerformance(cases);
    const monthlyReport = buildMonthlyReport(cases);

    return res.json({
      role: req.user.role,
      scope: "all_cases",
      filters: filters.appliedFilters,
      ...statistics,
      operatorPerformance,
      monthlyReport,
    });
  } catch (error) {
    console.error("Head statistics error:", error);
    return res.status(500).json({
      message: "ხელმძღვანელის სტატისტიკის მიღების შეცდომა.",
    });
  }
};

module.exports = {
  getManagerDashboard,
  getOperatorStatisticsDashboard,
  searchHeadFamilies,
  getHeadDashboard,
};