export const mainCategoryOptions = [
  {
    value: "idps",
    label: "დევნილები",
  },
  {
    value: "ecomigrants",
    label: "ეკომიგრანტები",
  },
  {
    value: "homeless",
    label: "უსახლკაროები",
  },
];

export const subCategoryOptions = {
  idps: [
    {
      value: "idps_rural_house",
      label: "სოფლად სახლი",
    },
    {
      value: "idps_admin_promise_purchase",
      label: "470-600$ / ადმინისტრაციული დაპირებით შესყიდვა",
    },
    {
      value: "idps_legalization_lawful_possession",
      label: "დაკანონება / მართლზომიერი მფლობელობა",
    },
    {
      value: "idps_legalization_housing_rule",
      label: "დაკანონება / განსახლების წესი",
    },
  ],
  ecomigrants: [
    {
      value: "ecomigrant_purchase",
      label: "შესყიდვა",
    },
    {
      value: "ecomigrant_legalization",
      label: "დაკანონება",
    },
  ],
  homeless: [
    {
      value: "homeless_purchase",
      label: "შესყიდვა",
    },
  ],
};

export const getMainCategoryLabel = (value) => {
  return mainCategoryOptions.find((item) => item.value === value)?.label || value;
};

export const getSubCategoryLabel = (value) => {
  const allSubCategories = Object.values(subCategoryOptions).flat();

  return allSubCategories.find((item) => item.value === value)?.label || value;
};