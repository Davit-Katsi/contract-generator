const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

const {
  Family,
  FamilyMember,
  Seller,
  Property,
  ContractData,
  ContractActionLog,
  Case,
  User,
} = require("../models");

const { generateContractNumber } = require("./contractNumberService");
const { getGeorgiaDateISO, formatGeorgianDate } = require("./dateService");
const { numberToGeorgian } = require("./numberToGeorgianService");
const { getNbgUsdRate } = require("./nbgRateService");

const PURCHASE_SUB_CATEGORIES = [
  "idps_rural_house",
  "idps_admin_promise_purchase",
  "ecomigrant_purchase",
  "homeless_purchase",
];

const IDPS_LEGALIZATION_SUB_CATEGORIES = [
  "idps_legalization_lawful_possession",
  "idps_legalization_housing_rule",
];

const LEGALIZATION_SUB_CATEGORIES = [
  ...IDPS_LEGALIZATION_SUB_CATEGORIES,
  "ecomigrant_legalization",
];

const isPurchaseSubCategory = (subCategory) => {
  return PURCHASE_SUB_CATEGORIES.includes(subCategory);
};

const isIdpsLegalizationSubCategory = (subCategory) => {
  return IDPS_LEGALIZATION_SUB_CATEGORIES.includes(subCategory);
};

const isEcomigrantLegalizationSubCategory = (subCategory) => {
  return subCategory === "ecomigrant_legalization";
};

const isLegalizationSubCategory = (subCategory) => {
  return LEGALIZATION_SUB_CATEGORIES.includes(subCategory);
};

const normalizeText = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const buildAuthorizedPersonForContract = ({ caseRecord, generatingUser }) => {
  if (isLegalizationSubCategory(caseRecord.subCategory)) {
    return {
      authorizedPersonFullName:
        normalizeText(generatingUser?.authorizedPersonFullName) ||
        normalizeText(generatingUser?.fullName),

      authorizedPersonPersonalNumber: normalizeText(
        generatingUser?.authorizedPersonPersonalNumber
      ),

      authorizedPersonPosition: normalizeText(
        generatingUser?.authorizedPersonPosition
      ),
    };
  }

  return {
    authorizedPersonFullName: normalizeText(
      caseRecord.authorizedPersonFullName
    ),
    authorizedPersonPersonalNumber: normalizeText(
      caseRecord.authorizedPersonPersonalNumber
    ),
    authorizedPersonPosition: normalizeText(
      caseRecord.authorizedPersonPosition
    ),
  };
};

const formatAmount = (value) => {
  if (value === null || value === undefined) return "";

  const number = Number(value);

  if (Number.isNaN(number)) return String(value);

  return new Intl.NumberFormat("ka-GE", {
    maximumFractionDigits: 0,
  }).format(number);
};

const formatAmountWithDecimals = (value) => {
  if (value === null || value === undefined || value === "") return "";

  const number = Number(value);

  if (Number.isNaN(number)) return String(value);

  return new Intl.NumberFormat("ka-GE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
};

const signerLabel = (person) => {
  if (!person || person.signerType === "self") return "";
  if (!person.representativeFullName) return "";

  const rep = `${person.representativeFullName}${
    person.representativePersonalNumber
      ? ` პ/ნ ${person.representativePersonalNumber}`
      : ""
  }`;

  switch (person.signerType) {
    case "representative":
      return `წარმომადგენელი: ${rep}`;
    case "proxy":
      return `მინდობილი პირი: ${rep}`;
    case "supporter":
      return `მხარდამჭერი: ${rep}`;
    case "legal_representative":
      return `კანონიერი წარმომადგენელი: ${rep}`;
    default:
      return "";
  }
};

const signerBasisLabel = (signerType) => {
  switch (signerType) {
    case "representative":
      return "წარმომადგენელი";
    case "proxy":
      return "მინდობილობა";
    case "supporter":
      return "მხარდაჭერა";
    case "legal_representative":
      return "კანონიერი წარმომადგენელი";
    default:
      return "";
  }
};

const representativeDisplay = (person) => {
  if (!person || !person.signerType || person.signerType === "self") {
    return "";
  }

  if (!person.representativeFullName) {
    return "";
  }

  return `${person.representativeFullName}${
    person.representativePersonalNumber
      ? `\nპირადი № ${person.representativePersonalNumber}`
      : ""
  }`;
};

const normalizeSellerList = ({ seller, sellers }) => {
  if (Array.isArray(sellers) && sellers.length > 0) {
    return sellers;
  }

  if (seller) {
    return [seller];
  }

  return [];
};

const buildSellerBlock = (sellerList) => {
  if (!sellerList.length) return "";

  return sellerList
    .map((item) => {
      const label = signerLabel(item);

      return `${item.fullName || ""}${
        item.personalNumber ? ` პ/ნ ${item.personalNumber}` : ""
      }${item.phone ? ` ტელ: ${item.phone}` : ""}${label ? `\n${label}` : ""}`;
    })
    .join("\n\n");
};

const buildSellerSignatureBlock = (sellerList) => {
  if (!sellerList.length) return "";

  return sellerList
    .map((item) => {
      const label = signerLabel(item);

      return `${item.fullName || ""}${
        item.personalNumber ? ` პ/ნ ${item.personalNumber}` : ""
      }${item.phone ? ` ტელ: ${item.phone}` : ""}${label ? `\n${label}` : ""}

------------------------------------------`;
    })
    .join("\n\n");
};

const buildBankRequisitesBlock = (extraData = {}) => {
  return `მიმღების ბანკი: ${extraData.bankName || ""}
ბანკის კოდი: ${extraData.bankCode || ""}
მიმღები: ${extraData.bankRecipient || ""}
ა/ა: ${extraData.bankAccount || ""}`;
};

const buildBuyerNamesBlock = (members = []) => {
  return members
    .map((member) => member.fullName || "")
    .filter(Boolean)
    .join("\n");
};

const buildBuyerRequisitesBlock = (members = []) => {
  return members
    .map((member) => {
      return `${member.fullName || ""}${
        member.personalNumber ? ` პ/ნ ${member.personalNumber}` : ""
      }`;
    })
    .filter((line) => line.trim())
    .join("\n");
};

const buildIdpsLegalizationPropertyDescription = ({ property, extraData }) => {
  const parts = [];

  if (property?.address) {
    parts.push(property.address);
  }

  if (extraData?.entrance) {
    parts.push(`სადარბაზო ${extraData.entrance}`);
  }

  if (property?.floor) {
    parts.push(`სართული ${property.floor}`);
  }

  if (property?.apartmentNumber) {
    parts.push(`ბინა ${property.apartmentNumber}`);
  }

  if (property?.buildingInfo) {
    parts.push(`შენობა ${property.buildingInfo}`);
  }

  if (property?.area) {
    parts.push(`ფართი: ${property.area} კვ.მ`);
  }

  if (property?.cadastralCode) {
    parts.push(`ს/კ: ${property.cadastralCode}`);
  }

  return parts.join(", ");
};

const buildEcomigrantLegalizationPropertyDescription = ({
  property,
  extraData,
}) => {
  const parts = [];

  if (property?.address) {
    parts.push(property.address);
  }

  if (extraData?.landPurpose) {
    parts.push(`ნაკვეთის დანიშნულება: ${extraData.landPurpose}`);
  }

  if (extraData?.specifiedArea || property?.area) {
    parts.push(
      `დაზუსტებული ფართობი: ${
        extraData?.specifiedArea || property?.area
      } კვ.მ`
    );
  }

  if (extraData?.buildingList || property?.buildingInfo) {
    parts.push(
      `შენობა-ნაგებობის ჩამონათვალი: ${
        extraData?.buildingList || property?.buildingInfo
      }`
    );
  }

  if (extraData?.floorArea) {
    parts.push(`სართული/ფართი: ${extraData.floorArea}`);
  }

  if (extraData?.totalBuildingArea) {
    parts.push(
      `შენობა-ნაგებობების საერთო ფართი: ${extraData.totalBuildingArea}`
    );
  }

  if (property?.cadastralCode) {
    parts.push(`საკადასტრო კოდი: ${property.cadastralCode}`);
  }

  return parts.join(", ");
};

const isBlank = (value) => {
  return value === null || value === undefined || String(value).trim() === "";
};

const addMissing = (missingFields, condition, label) => {
  if (condition) {
    missingFields.push(label);
  }
};

const buildValidationError = (message, missingFields = []) => {
  const error = new Error(message);
  error.statusCode = 400;
  error.missingFields = missingFields;
  return error;
};

const resolveAdminPromiseUsdConversion = async ({ family, contractData }) => {
  const extraData = contractData.extraData || {};
  const sourceAmountUsd = Number(family.purchaseAmount || 0);

  if (Number.isNaN(sourceAmountUsd) || sourceAmountUsd <= 0) {
    throw buildValidationError(
      "USD თანხა ოჯახზე არასწორია ან არ არის შევსებული.",
      ["USD თანხა"]
    );
  }

  if (extraData.usdRateManualOverride === true) {
    const manualRate = Number(extraData.usdRate);

    if (Number.isNaN(manualRate) || manualRate <= 0) {
      throw buildValidationError("ხელით შეყვანილი USD კურსი არასწორია.", [
        "USD კურსი",
      ]);
    }

    return {
      sourceAmountUsd,
      usdRate: manualRate,
      usdRateDate: extraData.usdRateDate || getGeorgiaDateISO(),
      usdRateSource: "manual",
      usdRateManualOverride: true,
      convertedGelAmount: Number((sourceAmountUsd * manualRate).toFixed(2)),
    };
  }

  try {
    const nbgRate = await getNbgUsdRate();
    const rate = Number(nbgRate.rate);

    if (Number.isNaN(rate) || rate <= 0) {
      throw new Error("USD კურსი NBG პასუხში ვერ მოიძებნა.");
    }

    return {
      sourceAmountUsd,
      usdRate: rate,
      usdRateDate: nbgRate.validFromDate || nbgRate.sourceDate || getGeorgiaDateISO(),
      usdRateSource: "NBG",
      usdRateManualOverride: false,
      convertedGelAmount: Number((sourceAmountUsd * rate).toFixed(2)),
    };
  } catch (error) {
    throw buildValidationError(
      "NBG კურსის წამოღება ვერ მოხერხდა. USD კურსი შეიყვანეთ ხელით.",
      ["USD კურსი"]
    );
  }
};

const validateContractRequiredFields = ({
  family,
  caseRecord,
  seller,
  sellers,
  property,
  members,
  contractData,
  authorizedPerson,
}) => {
  const missingFields = [];

  const sellerList = normalizeSellerList({ seller, sellers });
  const extraData = contractData?.extraData || {};
  const activeAuthorizedPerson = authorizedPerson || caseRecord;

  const isPurchase = isPurchaseSubCategory(caseRecord.subCategory);
  const isIdpsLegalization = isIdpsLegalizationSubCategory(
    caseRecord.subCategory
  );
  const isEcomigrantLegalization = isEcomigrantLegalizationSubCategory(
    caseRecord.subCategory
  );

  addMissing(
    missingFields,
    isBlank(activeAuthorizedPerson.authorizedPersonFullName),
    isLegalizationSubCategory(caseRecord.subCategory)
      ? "ოპერატორის უფლებამოსილი პირის სახელი/გვარი"
      : "სააგენტოს უფლებამოსილი პირის სახელი/გვარი"
  );

  addMissing(
    missingFields,
    isBlank(activeAuthorizedPerson.authorizedPersonPersonalNumber),
    isLegalizationSubCategory(caseRecord.subCategory)
      ? "ოპერატორის უფლებამოსილი პირის პირადი ნომერი"
      : "სააგენტოს უფლებამოსილი პირის პირადი ნომერი"
  );

  addMissing(
    missingFields,
    isBlank(activeAuthorizedPerson.authorizedPersonPosition),
    isLegalizationSubCategory(caseRecord.subCategory)
      ? "ოპერატორის უფლებამოსილი პირის თანამდებობა"
      : "სააგენტოს უფლებამოსილი პირის თანამდებობა"
  );

  addMissing(missingFields, isBlank(property?.address), "ქონების მისამართი");

  addMissing(
    missingFields,
    isBlank(property?.cadastralCode),
    "ქონების საკადასტრო კოდი"
  );

  if (isPurchase) {
    addMissing(missingFields, sellerList.length === 0, "გამყიდველი");

    sellerList.forEach((item, index) => {
      const sellerLabel =
        sellerList.length > 1 ? `გამყიდველი ${index + 1}` : "გამყიდველი";

      addMissing(
        missingFields,
        isBlank(item.fullName),
        `${sellerLabel} - სახელი/გვარი`
      );

      addMissing(
        missingFields,
        isBlank(item.personalNumber),
        `${sellerLabel} - პირადი ნომერი`
      );

      const signerType = item.signerType || "self";

      if (signerType !== "self") {
        addMissing(
          missingFields,
          isBlank(item.representativeFullName),
          `${sellerLabel} - წარმომადგენლის/მინდობილი პირის/მხარდამჭერის სახელი/გვარი`
        );

        addMissing(
          missingFields,
          isBlank(item.representativePersonalNumber),
          `${sellerLabel} - წარმომადგენლის/მინდობილი პირის/მხარდამჭერის პირადი ნომერი`
        );
      }
    });

    addMissing(missingFields, isBlank(extraData.bankName), "მიმღების ბანკი");
    addMissing(missingFields, isBlank(extraData.bankCode), "ბანკის კოდი");
    addMissing(missingFields, isBlank(extraData.bankRecipient), "თანხის მიმღები");
    addMissing(missingFields, isBlank(extraData.bankAccount), "საბანკო ანგარიში");

    addMissing(missingFields, isBlank(family.purchaseAmount), "შესყიდვის თანხა");
  }

  if (caseRecord.subCategory === "ecomigrant_purchase") {
    addMissing(
      missingFields,
      isBlank(property?.damagedPropertyCadastralCode),
      "დაზიანებული ქონების საკადასტრო კოდი"
    );
  }

  if (caseRecord.subCategory === "idps_admin_promise_purchase") {
    addMissing(
      missingFields,
      isBlank(family.administrativePromiseInfo),
      "ადმინისტრაციული დაპირების/470-600$ პროგრამის მონაცემი"
    );

    addMissing(missingFields, isBlank(extraData.usdRate), "USD კურსი");

    addMissing(
      missingFields,
      isBlank(extraData.usdRateDate),
      "USD კურსის თარიღი"
    );

    addMissing(
      missingFields,
      isBlank(extraData.convertedGelAmount),
      "კონვერტირებული თანხა ლარში"
    );
  }

  if (isIdpsLegalization) {
    addMissing(missingFields, isBlank(property?.area), "ქონების ფართი");
    addMissing(missingFields, isBlank(property?.floor), "სართული");
    addMissing(missingFields, isBlank(property?.apartmentNumber), "ბინა");
    addMissing(missingFields, isBlank(property?.buildingInfo), "შენობა");
  }

  if (isEcomigrantLegalization) {
    addMissing(
      missingFields,
      isBlank(extraData.landPurpose),
      "ნაკვეთის დანიშნულება"
    );

    addMissing(
      missingFields,
      isBlank(property?.area),
      "დაზუსტებული ფართობი"
    );

    addMissing(
      missingFields,
      isBlank(property?.buildingInfo),
      "შენობა-ნაგებობის ჩამონათვალი"
    );
  }

  addMissing(
    missingFields,
    !Array.isArray(members) || members.length === 0,
    "მყიდველი/ოჯახის წევრი"
  );

  members.forEach((member, index) => {
    const memberLabel =
      members.length > 1 ? `მყიდველი ${index + 1}` : "მყიდველი";

    addMissing(
      missingFields,
      isBlank(member.fullName),
      `${memberLabel} - სახელი/გვარი`
    );

    addMissing(
      missingFields,
      isBlank(member.personalNumber),
      `${memberLabel} - პირადი ნომერი`
    );

    const signerType = member.signerType || "self";

    if (signerType !== "self") {
      addMissing(
        missingFields,
        isBlank(member.representativeFullName),
        `${memberLabel} - წარმომადგენლის/მინდობილი პირის/მხარდამჭერის სახელი/გვარი`
      );

      addMissing(
        missingFields,
        isBlank(member.representativePersonalNumber),
        `${memberLabel} - წარმომადგენლის/მინდობილი პირის/მხარდამჭერის პირადი ნომერი`
      );
    }
  });

  return missingFields;
};

const buildContractContext = ({
  family,
  caseRecord,
  seller,
  sellers,
  property,
  members,
  contractData,
  authorizedPerson,
}) => {
  const sellerList = normalizeSellerList({ seller, sellers });
  const primarySeller = sellerList[0] || null;

  const extraData = contractData.extraData || {};
  const activeAuthorizedPerson = authorizedPerson || caseRecord;

  const bankName = extraData.bankName || "";
  const bankCode = extraData.bankCode || "";
  const bankRecipient = extraData.bankRecipient || "";
  const bankAccount = extraData.bankAccount || "";

  const isAdminPromisePurchase =
    caseRecord.subCategory === "idps_admin_promise_purchase";

  const contractAmountValue = isAdminPromisePurchase
    ? extraData.convertedGelAmount
    : family.purchaseAmount;

  const purchaseAmountNumber = contractAmountValue
    ? Math.round(Number(contractAmountValue))
    : null;

  const amountWords = purchaseAmountNumber
    ? numberToGeorgian(purchaseAmountNumber)
    : "";

  const buyerBlock = members
    .map((member) => {
      const label = signerLabel(member);

      return `მყიდველი: ${member.fullName} პ/ნ ${member.personalNumber || ""}${
        label ? `\n${label}` : ""
      }`;
    })
    .join("\n\n");

  const signatureBuyerBlock = members
    .map((member) => {
      const label = signerLabel(member);

      return `${member.fullName} ${
        member.personalNumber ? `პ/ნ ${member.personalNumber}` : ""
      }${label ? `\n${label}` : ""}

-----------------------------------------`;
    })
    .join("\n\n");

  const sellerBlock = buildSellerBlock(sellerList);
  const sellerSignatureBlock = buildSellerSignatureBlock(sellerList);
  const bankRequisitesBlock = buildBankRequisitesBlock(extraData);

  const buyerNamesBlock = buildBuyerNamesBlock(members);
  const buyerRequisitesBlock = buildBuyerRequisitesBlock(members);

  const idpsLegalizationPropertyDescription =
    buildIdpsLegalizationPropertyDescription({
      property,
      extraData,
    });

  const ecomigrantLegalizationPropertyDescription =
    buildEcomigrantLegalizationPropertyDescription({
      property,
      extraData,
    });

  const legalizationPropertyDescription =
    caseRecord.subCategory === "ecomigrant_legalization"
      ? ecomigrantLegalizationPropertyDescription
      : idpsLegalizationPropertyDescription;

  return {
    mainCategory: caseRecord.mainCategory || "",
    subCategory: caseRecord.subCategory || "",

    isEcomigrantPurchase:
      caseRecord.subCategory === "ecomigrant_purchase" ? "true" : "",
    isIdpsRuralHouse:
      caseRecord.subCategory === "idps_rural_house" ? "true" : "",
    isIdpsAdminPromisePurchase:
      caseRecord.subCategory === "idps_admin_promise_purchase" ? "true" : "",
    isHomelessPurchase:
      caseRecord.subCategory === "homeless_purchase" ? "true" : "",

    isLegalization:
      isLegalizationSubCategory(caseRecord.subCategory) ? "true" : "",
    isIdpsLegalizationLawfulPossession:
      caseRecord.subCategory === "idps_legalization_lawful_possession"
        ? "true"
        : "",
    isIdpsLegalizationHousingRule:
      caseRecord.subCategory === "idps_legalization_housing_rule"
        ? "true"
        : "",
    isEcomigrantLegalization:
      caseRecord.subCategory === "ecomigrant_legalization" ? "true" : "",

    contractNumber: contractData.contractNumber || "",
    contractDate: contractData.contractDate || "",
    contractDateText: formatGeorgianDate(contractData.contractDate),

    orderNumber: caseRecord.orderNumber || "",
    orderDate: caseRecord.orderDate || "",
    orderDateText: formatGeorgianDate(caseRecord.orderDate),

    authorizedPersonFullName:
      activeAuthorizedPerson.authorizedPersonFullName || "",
    authorizedPersonPersonalNumber:
      activeAuthorizedPerson.authorizedPersonPersonalNumber || "",
    authorizedPersonPosition:
      activeAuthorizedPerson.authorizedPersonPosition || "",

    buyerBlock,
    signatureBuyerBlock,
    buyerSignatureBlock: signatureBuyerBlock,
    buyerNamesBlock,
    buyerRequisitesBlock,

    sellerBlock,
    sellerSignatureBlock,
    bankRequisitesBlock,

    sellerFullName: primarySeller?.fullName || "",
    sellerPersonalNumber: primarySeller?.personalNumber || "",
    sellerPhone: primarySeller?.phone || "",

    bankName,
    bankCode,
    bankRecipient,
    bankAccount,

    propertyAddress: property?.address || "",

    cadastralCode: property?.cadastralCode || "",
    propertyCadastralCode: property?.cadastralCode || "",

    propertyFloor: property?.floor || "",

    apartmentNumber: property?.apartmentNumber || "",
    propertyApartmentNumber: property?.apartmentNumber || "",

    propertyArea: property?.area || "",
    buildingInfo: property?.buildingInfo || "",

    idpsLegalizationPropertyDescription,
    ecomigrantLegalizationPropertyDescription,
    legalizationPropertyDescription,

    propertyEntrance: extraData.entrance || "",
    landPurpose: extraData.landPurpose || "",
    specifiedArea: extraData.specifiedArea || property?.area || "",
    buildingList: extraData.buildingList || property?.buildingInfo || "",
    floorArea: extraData.floorArea || "",
    totalBuildingArea: extraData.totalBuildingArea || "",
    contractAnnexNumber: extraData.contractAnnexNumber || "",
    damagedPropertyCadastralCode:
      property?.damagedPropertyCadastralCode || "",

    purchaseAmount: isAdminPromisePurchase
      ? formatAmountWithDecimals(contractAmountValue)
      : formatAmount(contractAmountValue),

    purchaseAmountWords: amountWords,

    purchaseAmountUsd: formatAmount(family.purchaseAmount),
    usdRate: extraData.usdRate || "",
    usdRateDate: extraData.usdRateDate || "",
    usdRateSource: extraData.usdRateSource || "",
    convertedGelAmount: extraData.convertedGelAmount
      ? formatAmountWithDecimals(extraData.convertedGelAmount)
      : "",

    primaryPersonFullName: family.primaryPersonFullName || "",
    primaryPersonPersonalNumber: family.primaryPersonPersonalNumber || "",
    beneficiaryPhone: family.beneficiaryPhone || "",
    protocolInfo: family.protocolInfo || "",
    administrativePromiseInfo: family.administrativePromiseInfo || "",
    originInfo: family.originInfo || "",

    familyMembers: members.map((member, index) => ({
      memberIndex: index + 1,
      fullName: member.fullName || "",
      personalNumber: member.personalNumber || "",
      signerType: member.signerType || "self",
      signerLabel: signerLabel(member),
      representativeFullName: member.representativeFullName || "",
      representativePersonalNumber: member.representativePersonalNumber || "",
      representativeDisplay: representativeDisplay(member),
      representativeBasisDisplay: signerBasisLabel(member.signerType || "self"),
    })),

    sellers: sellerList.map((item) => ({
      fullName: item.fullName || "",
      personalNumber: item.personalNumber || "",
      phone: item.phone || "",
      signerType: item.signerType || "self",
      signerLabel: signerLabel(item),
      representativeFullName: item.representativeFullName || "",
      representativePersonalNumber: item.representativePersonalNumber || "",
    })),

    extraData,
  };
};

const getTemplatePath = (subCategory) => {
  const templates = {
    ecomigrant_purchase: "ecomigrant_purchase.docx",
    idps_rural_house: "idps_rural_house.docx",
    idps_admin_promise_purchase: "idps_admin_promise_purchase.docx",
    homeless_purchase: "homeless_purchase.docx",

    idps_legalization_lawful_possession:
      "idps_legalization_lawful_possession.docx",
    idps_legalization_housing_rule:
      "idps_legalization_housing_rule.docx",
    ecomigrant_legalization: "ecomigrant_legalization.docx",
  };

  const fileName = templates[subCategory];

  if (!fileName) {
    throw new Error(
      `ამ ქვეკატეგორიისთვის შაბლონი ჯერ არ არის მიბმული: ${subCategory}`
    );
  }

  return path.join(__dirname, "../../templates", fileName);
};

const generateContractDocx = async ({ familyId, userId }) => {
  const family = await Family.findByPk(familyId, {
    include: [
      { model: Case, as: "case" },
      { model: FamilyMember, as: "members" },
      { model: Seller, as: "seller" },
      { model: Seller, as: "sellers" },
      { model: Property, as: "property" },
      { model: ContractData, as: "contractData" },
    ],
  });

  if (!family) {
    throw new Error("ოჯახი ვერ მოიძებნა.");
  }

  const caseRecord = family.case;
  const members = family.members || [];
  const seller = family.seller || null;
  const sellers = family.sellers || [];
  const property = family.property || null;

  const generatingUser = await User.findByPk(userId, {
    attributes: [
      "id",
      "fullName",
      "username",
      "authorizedPersonFullName",
      "authorizedPersonPersonalNumber",
      "authorizedPersonPosition",
    ],
  });

  if (isLegalizationSubCategory(caseRecord.subCategory) && !generatingUser) {
    throw buildValidationError(
      "ხელშეკრულების გენერირება შეუძლებელია. ოპერატორი ვერ მოიძებნა.",
      ["ოპერატორი"]
    );
  }

  const authorizedPerson = buildAuthorizedPersonForContract({
    caseRecord,
    generatingUser,
  });

  let contractData = family.contractData;

  if (!contractData) {
    contractData = await ContractData.create({
      familyId: family.id,
      extraData: {},
    });
  }

  if (caseRecord.subCategory === "idps_admin_promise_purchase") {
    const conversion = await resolveAdminPromiseUsdConversion({
      family,
      contractData,
    });

    contractData.extraData = {
      ...(contractData.extraData || {}),
      ...conversion,
    };

    await contractData.save();
  }

  const missingFields = validateContractRequiredFields({
    family,
    caseRecord,
    seller,
    sellers,
    property,
    members,
    contractData,
    authorizedPerson,
  });

  if (missingFields.length > 0) {
    throw buildValidationError(
      "ხელშეკრულების გენერირება შეუძლებელია. შეავსეთ სავალდებულო ველები.",
      missingFields
    );
  }

  if (!contractData.contractDate) {
    contractData.contractDate = getGeorgiaDateISO();
  }

  if (!contractData.contractNumber) {
    contractData.contractNumber = generateContractNumber({
      caseRecord,
      family,
    });
  }

  await contractData.save();

  const templatePath = getTemplatePath(caseRecord.subCategory);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`შაბლონი ვერ მოიძებნა: ${templatePath}`);
  }

  const content = fs.readFileSync(templatePath, "binary");
  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  const context = buildContractContext({
    family,
    caseRecord,
    seller,
    sellers,
    property,
    members,
    contractData,
    authorizedPerson,
  });

  doc.render(context);

  const buffer = doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  const safeContractNumber = contractData.contractNumber.replace(
    /[\\/:"*?<>|]+/g,
    "-"
  );

  const fileName = `contract-${family.id}-${safeContractNumber}.docx`;

  contractData.generatedAt = new Date();

  await contractData.save();

  await ContractActionLog.create({
    familyId: family.id,
    userId,
    action: "generated",
    comment: "ხელშეკრულება დაგენერირდა და ჩამოიტვირთა DOCX ფორმატში.",
  });

  return {
    familyId: family.id,
    contractNumber: contractData.contractNumber,
    contractDate: contractData.contractDate,
    fileName,
    buffer,
  };
};

module.exports = {
  generateContractDocx,
};