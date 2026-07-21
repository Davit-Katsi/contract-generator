const CATEGORY_CODES = {
  idps_rural_house: "08",
  idps_admin_promise_purchase: "02",
  idps_legalization_lawful_possession: "03",
  idps_legalization_housing_rule: "04",
  ecomigrant_purchase: "01",
  ecomigrant_legalization: "05",
  homeless_purchase: "06",
};

const generateContractNumber = ({ caseRecord, family }) => {
  const baseNumber = process.env.CONTRACT_BASE_NUMBER || "270602";
  const categoryCode = CATEGORY_CODES[caseRecord.subCategory] || "00";

  const rowPart = family.rowNumber || family.id;

  return `${baseNumber}/${categoryCode}-${rowPart}`;
};

module.exports = {
  generateContractNumber,
};