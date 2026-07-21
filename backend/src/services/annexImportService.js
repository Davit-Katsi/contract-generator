const ExcelJS = require("exceljs");

const {
  sequelize,
  Family,
  FamilyMember,
  Seller,
  Property,
  ContractData,
  ContractActionLog,
} = require("../models");

const cellToString = (value) => {
  if (value === null || value === undefined) return "";

  if (typeof value === "object") {
    if (value.text) return String(value.text).trim();
    if (value.result) return String(value.result).trim();

    if (value.richText) {
      return value.richText.map((item) => item.text).join("").trim();
    }

    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }
  }

  return String(value).trim();
};

const normalizeSpaces = (value) => {
  return cellToString(value)
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const fullName = (firstName, lastName) => {
  return `${normalizeSpaces(firstName)} ${normalizeSpaces(lastName)}`.trim();
};

const isValidColumn = (column) => {
  const number = Number(column);
  return Number.isInteger(number) && number > 0;
};

const getCellValue = (row, column) => {
  if (!row || !isValidColumn(column)) {
    return null;
  }

  return row.getCell(Number(column)).value;
};

const getCellText = (row, column) => {
  return normalizeSpaces(getCellValue(row, column));
};

const buildImportValidationError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const validateRequiredPersonalNumber = (rawValue, rowNumber, label) => {
  const originalValue = cellToString(rawValue);
  const digitsOnly = originalValue.replace(/\D/g, "");

  if (digitsOnly.length !== 11) {
    throw buildImportValidationError(
      `${label} — Excel-ის ${rowNumber}-ე რიგში მითითებული პირადი ნომერი "${originalValue || "ცარიელი"}" არ შეიცავს 11 ციფრს.`
    );
  }

  return digitsOnly;
};

const validateOptionalPersonalNumber = (rawValue, rowNumber, label) => {
  const originalValue = cellToString(rawValue);
  const digitsOnly = originalValue.replace(/\D/g, "");

  if (!originalValue && !digitsOnly) {
    return "";
  }

  if (digitsOnly.length !== 11) {
    throw buildImportValidationError(
      `${label} — Excel-ის ${rowNumber}-ე რიგში მითითებული პირადი ნომერი "${originalValue || "ცარიელი"}" არ შეიცავს 11 ციფრს.`
    );
  }

  return digitsOnly;
};

const parseAmount = (rawValue) => {
  const text = normalizeSpaces(rawValue);

  if (!text) {
    return {
      purchaseAmount: null,
      purchaseAmountText: null,
      currencyMode: "gel_fixed",
    };
  }

  const isUsdEquivalent =
    text.includes("აშშ") || text.toLowerCase().includes("usd");

  const numericText = text.replace(/[^\d.,]/g, "").replace(",", ".");
  const amount = Number.parseFloat(numericText);

  return {
    purchaseAmount: Number.isNaN(amount) ? null : amount,
    purchaseAmountText: text,
    currencyMode: isUsdEquivalent ? "usd_equivalent_gel" : "gel_fixed",
  };
};

const getParserConfig = (subCategory) => {
  switch (subCategory) {
    case "idps_rural_house":
      return {
        type: "purchase",
        numberCol: 1,
        firstNameCol: 2,
        lastNameCol: 3,
        personalNumberCol: 4,
        protocolCol: 5,
        phoneCol: 6,
        sellerNameCol: 7,
        sellerPersonalNumberCol: 8,
        sellerPhoneCol: 9,
        addressCol: 10,
        cadastralCol: 11,
        amountCol: 12,
      };

    case "ecomigrant_purchase":
      return {
        type: "purchase",
        numberCol: 1,
        firstNameCol: 2,
        lastNameCol: 3,
        personalNumberCol: 4,
        originInfoCol: 5,
        protocolCol: 6,
        phoneCol: 7,
        sellerNameCol: 8,
        sellerPersonalNumberCol: 9,
        sellerPhoneCol: 10,
        addressCol: 11,
        cadastralCol: 12,
        amountCol: 13,
        damagedPropertyCadastralCol: 14,
      };

    case "idps_admin_promise_purchase":
      return {
        type: "purchase",
        numberCol: 1,
        secondaryNumberCol: 2,
        firstNameCol: 3,
        lastNameCol: 4,
        personalNumberCol: 5,
        administrativePromiseCol: 6,
        protocolCol: 7,
        phoneCol: 8,
        sellerNameCol: 9,
        sellerPersonalNumberCol: 10,
        sellerPhoneCol: null,
        addressCol: 11,
        cadastralCol: 12,
        amountCol: 13,
      };

    case "homeless_purchase":
      return {
        type: "purchase",
        numberCol: 1,
        firstNameCol: 2,
        lastNameCol: 3,
        personalNumberCol: 4,
        phoneCol: 5,
        protocolCol: 6,
        sellerNameCol: 7,
        sellerPersonalNumberCol: 8,
        sellerPhoneCol: 9,
        addressCol: 10,
        cadastralCol: 11,
        amountCol: 12,
      };

    case "idps_legalization_lawful_possession":
    case "idps_legalization_housing_rule":
      return {
        type: "idps_legalization",
        numberCol: 1,
        firstNameCol: 2,
        lastNameCol: 3,
        personalNumberCol: 4,
        addressCol: 5,
        entranceCol: 6,
        floorCol: 7,
        apartmentCol: 8,
        buildingCol: 9,
        areaCol: 10,
        cadastralCol: 11,
      };

    case "ecomigrant_legalization":
      return {
        type: "ecomigrant_legalization",
        numberCol: 1,
        personalNumberCol: 2,
        firstNameCol: 3,
        lastNameCol: 4,
        addressCol: 5,
        landPurposeCol: 6,
        specifiedAreaCol: 7,
        buildingListCol: 8,
        floorAreaCol: 9,
        totalBuildingAreaCol: 10,
        cadastralCol: 11,
        contractAnnexNumberCol: 12,
      };

    default:
      throw new Error(
        `ამ ქვეკატეგორიის Excel import ჯერ არ არის აღწერილი: ${subCategory}`
      );
  }
};

const createImportLog = async ({ familyId, userId, transaction }) => {
  await ContractActionLog.create(
    {
      familyId,
      userId,
      action: "created",
      comment: "ოჯახი შეიქმნა Excel დანართის იმპორტით.",
    },
    { transaction }
  );
};

const ensureFamilyExistsForMemberRow = ({ currentFamily, rowNumber }) => {
  if (!currentFamily) {
    throw buildImportValidationError(
      `Excel-ის ${rowNumber}-ე რიგში ოჯახის ნომერი ვერ მოიძებნა. შეამოწმეთ დანართის სტრუქტურა.`
    );
  }
};

const importPurchaseAnnex = async ({
  worksheet,
  config,
  caseRecord,
  userId,
  transaction,
}) => {
  let currentFamily = null;
  let importedFamilies = 0;
  let importedMembers = 0;
  let lastFamilyKey = null;

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);

    const numberValue = getCellText(row, config.numberCol);
    const secondaryNumberValue = getCellText(row, config.secondaryNumberCol);

    const firstNameValue = getCellText(row, config.firstNameCol);
    const lastNameValue = getCellText(row, config.lastNameCol);
    const personalNumberRaw = getCellValue(row, config.personalNumberCol);

    if (!firstNameValue && !lastNameValue && !cellToString(personalNumberRaw)) {
      continue;
    }

    const personalNumberValue = validateRequiredPersonalNumber(
      personalNumberRaw,
      rowNumber,
      "მყიდველი/ოჯახის წევრი"
    );

    const familyKey = numberValue || secondaryNumberValue;
    const isNewFamily = Boolean(familyKey) && familyKey !== lastFamilyKey;

    if (isNewFamily) {
      lastFamilyKey = familyKey;

      const amountData = parseAmount(getCellValue(row, config.amountCol));
      const rowNo = Number.parseInt(numberValue, 10);
      const secondaryRowNo = Number.parseInt(secondaryNumberValue, 10);

      currentFamily = await Family.create(
        {
          caseId: caseRecord.id,
          rowNumber: Number.isNaN(rowNo)
            ? Number.isNaN(secondaryRowNo)
              ? null
              : secondaryRowNo
            : rowNo,
          primaryPersonFullName: fullName(firstNameValue, lastNameValue),
          primaryPersonPersonalNumber: personalNumberValue,
          beneficiaryPhone: getCellText(row, config.phoneCol),
          protocolInfo: getCellText(row, config.protocolCol),
          administrativePromiseInfo: getCellText(
            row,
            config.administrativePromiseCol
          ),
          originInfo: getCellText(row, config.originInfoCol),
          purchaseAmount: amountData.purchaseAmount,
          purchaseAmountText: amountData.purchaseAmountText,
          currencyMode: amountData.currencyMode,
        },
        { transaction }
      );

      const sellerPersonalNumber = validateOptionalPersonalNumber(
        getCellValue(row, config.sellerPersonalNumberCol),
        rowNumber,
        "გამყიდველი"
      );

      await Seller.create(
        {
          familyId: currentFamily.id,
          fullName: getCellText(row, config.sellerNameCol),
          personalNumber: sellerPersonalNumber,
          phone: getCellText(row, config.sellerPhoneCol),
        },
        { transaction }
      );

      await Property.create(
        {
          familyId: currentFamily.id,
          address: getCellText(row, config.addressCol),
          cadastralCode: getCellText(row, config.cadastralCol),
          damagedPropertyCadastralCode: getCellText(
            row,
            config.damagedPropertyCadastralCol
          ),
        },
        { transaction }
      );

      await ContractData.create(
        {
          familyId: currentFamily.id,
          extraData: {},
        },
        { transaction }
      );

      await createImportLog({
        familyId: currentFamily.id,
        userId,
        transaction,
      });

      importedFamilies += 1;
    }

    ensureFamilyExistsForMemberRow({ currentFamily, rowNumber });

    await FamilyMember.create(
      {
        familyId: currentFamily.id,
        fullName: fullName(firstNameValue, lastNameValue),
        personalNumber: personalNumberValue,
        signerType: "self",
      },
      { transaction }
    );

    importedMembers += 1;
  }

  return {
    importedFamilies,
    importedMembers,
    message: "Excel დანართის იმპორტი დასრულდა.",
  };
};

const importIdpsLegalizationAnnex = async ({
  worksheet,
  config,
  caseRecord,
  userId,
  transaction,
}) => {
  let currentFamily = null;
  let importedFamilies = 0;
  let importedMembers = 0;
  let lastFamilyKey = null;

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);

    const numberValue = getCellText(row, config.numberCol);
    const firstNameValue = getCellText(row, config.firstNameCol);
    const lastNameValue = getCellText(row, config.lastNameCol);
    const personalNumberRaw = getCellValue(row, config.personalNumberCol);

    if (!firstNameValue && !lastNameValue && !cellToString(personalNumberRaw)) {
      continue;
    }

    const personalNumberValue = validateRequiredPersonalNumber(
      personalNumberRaw,
      rowNumber,
      "მყიდველი/ოჯახის წევრი"
    );

    const familyKey = numberValue;
    const isNewFamily = Boolean(familyKey) && familyKey !== lastFamilyKey;

    if (isNewFamily) {
      lastFamilyKey = familyKey;

      const rowNo = Number.parseInt(numberValue, 10);

      currentFamily = await Family.create(
        {
          caseId: caseRecord.id,
          rowNumber: Number.isNaN(rowNo) ? null : rowNo,
          primaryPersonFullName: fullName(firstNameValue, lastNameValue),
          primaryPersonPersonalNumber: personalNumberValue,
          beneficiaryPhone: null,
          protocolInfo: null,
          administrativePromiseInfo: null,
          originInfo: null,
          purchaseAmount: null,
          purchaseAmountText: null,
          currencyMode: "gel_fixed",
        },
        { transaction }
      );

      await Property.create(
        {
          familyId: currentFamily.id,
          address: getCellText(row, config.addressCol),
          cadastralCode: getCellText(row, config.cadastralCol),
          floor: getCellText(row, config.floorCol),
          apartmentNumber: getCellText(row, config.apartmentCol),
          area: getCellText(row, config.areaCol),
          buildingInfo: getCellText(row, config.buildingCol),
        },
        { transaction }
      );

      await ContractData.create(
        {
          familyId: currentFamily.id,
          extraData: {
            entrance: getCellText(row, config.entranceCol),
            legalizationType: caseRecord.subCategory,
          },
        },
        { transaction }
      );

      await createImportLog({
        familyId: currentFamily.id,
        userId,
        transaction,
      });

      importedFamilies += 1;
    }

    ensureFamilyExistsForMemberRow({ currentFamily, rowNumber });

    await FamilyMember.create(
      {
        familyId: currentFamily.id,
        fullName: fullName(firstNameValue, lastNameValue),
        personalNumber: personalNumberValue,
        signerType: "self",
      },
      { transaction }
    );

    importedMembers += 1;
  }

  return {
    importedFamilies,
    importedMembers,
    message: "Excel დანართის იმპორტი დასრულდა.",
  };
};

const importEcomigrantLegalizationAnnex = async ({
  worksheet,
  config,
  caseRecord,
  userId,
  transaction,
}) => {
  let currentFamily = null;
  let importedFamilies = 0;
  let importedMembers = 0;
  let lastFamilyKey = null;

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);

    const numberValue = getCellText(row, config.numberCol);
    const firstNameValue = getCellText(row, config.firstNameCol);
    const lastNameValue = getCellText(row, config.lastNameCol);
    const personalNumberRaw = getCellValue(row, config.personalNumberCol);

    if (!firstNameValue && !lastNameValue && !cellToString(personalNumberRaw)) {
      continue;
    }

    const personalNumberValue = validateRequiredPersonalNumber(
      personalNumberRaw,
      rowNumber,
      "მყიდველი/ოჯახის წევრი"
    );

    const familyKey = numberValue;
    const isNewFamily = Boolean(familyKey) && familyKey !== lastFamilyKey;

    if (isNewFamily) {
      lastFamilyKey = familyKey;

      const rowNo = Number.parseInt(numberValue, 10);

      const specifiedArea = getCellText(row, config.specifiedAreaCol);
      const buildingList = getCellText(row, config.buildingListCol);

      currentFamily = await Family.create(
        {
          caseId: caseRecord.id,
          rowNumber: Number.isNaN(rowNo) ? null : rowNo,
          primaryPersonFullName: fullName(firstNameValue, lastNameValue),
          primaryPersonPersonalNumber: personalNumberValue,
          beneficiaryPhone: null,
          protocolInfo: null,
          administrativePromiseInfo: null,
          originInfo: null,
          purchaseAmount: null,
          purchaseAmountText: null,
          currencyMode: "gel_fixed",
        },
        { transaction }
      );

      await Property.create(
        {
          familyId: currentFamily.id,
          address: getCellText(row, config.addressCol),
          cadastralCode: getCellText(row, config.cadastralCol),
          area: specifiedArea,
          buildingInfo: buildingList,
        },
        { transaction }
      );

      await ContractData.create(
        {
          familyId: currentFamily.id,
          extraData: {
            landPurpose: getCellText(row, config.landPurposeCol),
            specifiedArea,
            buildingList,
            floorArea: getCellText(row, config.floorAreaCol),
            totalBuildingArea: getCellText(row, config.totalBuildingAreaCol),
            contractAnnexNumber: getCellText(
              row,
              config.contractAnnexNumberCol
            ),
          },
        },
        { transaction }
      );

      await createImportLog({
        familyId: currentFamily.id,
        userId,
        transaction,
      });

      importedFamilies += 1;
    }

    ensureFamilyExistsForMemberRow({ currentFamily, rowNumber });

    await FamilyMember.create(
      {
        familyId: currentFamily.id,
        fullName: fullName(firstNameValue, lastNameValue),
        personalNumber: personalNumberValue,
        signerType: "self",
      },
      { transaction }
    );

    importedMembers += 1;
  }

  return {
    importedFamilies,
    importedMembers,
    message: "Excel დანართის იმპორტი დასრულდა.",
  };
};

const importAnnexForCase = async ({ caseRecord, userId, transaction = null }) => {
  if (!caseRecord.annexExcelPath) {
    return {
      importedFamilies: 0,
      importedMembers: 0,
      message: "Excel დანართი არ არის ატვირთული.",
    };
  }

  const config = getParserConfig(caseRecord.subCategory);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(caseRecord.annexExcelPath);

  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error("Excel ფაილში worksheet ვერ მოიძებნა.");
  }

  const shouldManageTransaction = !transaction;
  const activeTransaction = transaction || (await sequelize.transaction());

  try {
    let summary;

    if (config.type === "purchase") {
      summary = await importPurchaseAnnex({
        worksheet,
        config,
        caseRecord,
        userId,
        transaction: activeTransaction,
      });
    } else if (config.type === "idps_legalization") {
      summary = await importIdpsLegalizationAnnex({
        worksheet,
        config,
        caseRecord,
        userId,
        transaction: activeTransaction,
      });
    } else if (config.type === "ecomigrant_legalization") {
      summary = await importEcomigrantLegalizationAnnex({
        worksheet,
        config,
        caseRecord,
        userId,
        transaction: activeTransaction,
      });
    } else {
      throw new Error(
        `ამ ქვეკატეგორიის Excel import ჯერ არ არის აღწერილი: ${caseRecord.subCategory}`
      );
    }

    if (shouldManageTransaction) {
      await activeTransaction.commit();
    }

    return summary;
  } catch (error) {
    if (shouldManageTransaction) {
      await activeTransaction.rollback();
    }

    throw error;
  }
};

module.exports = {
  importAnnexForCase,
};