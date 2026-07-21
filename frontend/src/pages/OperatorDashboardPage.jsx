import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CheckCircle,
  Download,
  Eye,
  FileSearch,
  FolderOpen,
  PenLine,
  RotateCcw,
  Save,
  Search,
  X,
} from "lucide-react";
import AppLayout from "../layouts/AppLayout";
import api from "../api/axios";
import {
  getMainCategoryLabel,
  getSubCategoryLabel,
} from "../constants/categories";

const signerTypeOptions = [
  { value: "self", label: "თავად აწერს ხელს" },
  { value: "proxy", label: "მინდობილი პირი" },
  { value: "supporter", label: "მხარდამჭერი" },
  { value: "legal_representative", label: "კანონიერი წარმომადგენელი" },
];

const bankOptions = [
  { name: 'სს "საქართველოს ბანკი"', code: "BAGAGE22" },
  { name: 'სს "თიბისი ბანკი"', code: "TBCBGE22" },
  { name: 'სს "ლიბერთი ბანკი"', code: "LBRTGE22" },
  { name: 'სს "ბაზის ბანკი"', code: "CBASGE22" },
  { name: 'სს "სილქ ბანკი"', code: "DISNGE22" },
  { name: 'სს "ბანკი ქართუ"', code: "CRTUGE22" },
  { name: 'სს "ხალიკ ბანკი საქართველო"', code: "HABGGE22" },
  { name: 'სს "ტერაბანკი"', code: "TEBAGE22" },
  { name: 'სს "პროკრედიტ ბანკი, საქართველო"', code: "MIBGGE22" },
  { name: 'სს "ზირაათ ბანკი საქართველო"', code: "TCZBGE22" },
  { name: 'სს "პაშა ბანკი საქართველო"', code: "PAHAGE22" },
  { name: 'სს "იშბანკი საქართველო"', code: "ISBKGE22" },
  { name: 'სს "კრედო ბანკი"', code: "JSCRGE22" },
  { name: 'სს "პეისერა ბანკი საქართველო"', code: "PSRAGE22" },
  { name: 'სს "ჰეშ ბანკი"', code: "HAJSGE22" },
  { name: 'სს "პეივ ბანკ ჯორჯია"', code: "PAVEGE22" },
];

const statisticsMainCategories = ["idps", "ecomigrants", "homeless"];

const statisticsSubCategoriesByMain = {
  idps: [
    "idps_rural_house",
    "idps_admin_promise_purchase",
    "idps_legalization_lawful_possession",
    "idps_legalization_housing_rule",
  ],
  ecomigrants: ["ecomigrant_purchase", "ecomigrant_legalization"],
  homeless: ["homeless_purchase"],
};

const OPERATOR_CASES_PAGE_SIZE = 10;
const EMPTY_ROWS = [];

const monthOptions = [
  { value: "1", label: "იანვარი" },
  { value: "2", label: "თებერვალი" },
  { value: "3", label: "მარტი" },
  { value: "4", label: "აპრილი" },
  { value: "5", label: "მაისი" },
  { value: "6", label: "ივნისი" },
  { value: "7", label: "ივლისი" },
  { value: "8", label: "აგვისტო" },
  { value: "9", label: "სექტემბერი" },
  { value: "10", label: "ოქტომბერი" },
  { value: "11", label: "ნოემბერი" },
  { value: "12", label: "დეკემბერი" },
];

const getYearOptions = () => {
  const currentYear = new Date().getFullYear();

  return Array.from({ length: 5 }, (_, index) => String(currentYear - index));
};

const padDatePart = (value) => String(value).padStart(2, "0");

const toDisplayRateDate = (value) => {
  if (!value) return "";

  const raw = String(value).trim();

  // 2026-07-06 ან 2026-07-06T00:00:00 -> 06/07/2026
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const [year, month, day] = raw.slice(0, 10).split("-");
    return `${day}/${month}/${year}`;
  }

  // NBG-დან თუ მოდის MM/DD/YYYY, მაგალითად 07/06/2026 -> 06/07/2026
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);

  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    let year = slashMatch[3];

    if (year.length === 2) {
      year = `20${year}`;
    }

    // თუ პირველი ნაწილი 12-ზე მეტია, სავარაუდოდ უკვე DD/MM/YYYY არის
    if (first > 12) {
      return `${padDatePart(first)}/${padDatePart(second)}/${year}`;
    }

    // სხვა შემთხვევაში ვთვლით, რომ მოვიდა MM/DD/YYYY
    return `${padDatePart(second)}/${padDatePart(first)}/${year}`;
  }

  return raw;
};

const sanitizeDisplayRateDate = (value) => {
  return String(value || "")
    .replace(/[^\d/]/g, "")
    .slice(0, 10);
};

const getCasesFromResponse = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.cases)) return data.cases;
  return [];
};

const getSearchResultsFromResponse = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
};

const formatDate = (value) => {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat("ka-GE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const getCaseDisplayNumber = (caseItem) => {
  return caseItem?.orderNumber || caseItem?.title || `ბრძანება #${caseItem?.id}`;
};

const getFamilyStatusLabel = (family) => {
  if (!family?.isActive) return "გაუქმებული";
  if (family?.isSigned) return "გაფორმებული";
  return "გასაფორმებელი";
};

const getFamilyStatusClass = (family) => {
  if (!family?.isActive) return "cancelled";
  if (family?.isSigned) return "closed";
  return "active";
};

const getCaseStatusLabel = (caseItem) => {
  if (caseItem?.isCancelled) return "გაუქმებული";
  if (caseItem?.isClosed) return "დასრულებული";
  return "აქტიური";
};

const getCaseStatusClass = (caseItem) => {
  if (caseItem?.isCancelled) return "cancelled";
  if (caseItem?.isClosed) return "closed";
  return "active";
};

const getMembersCount = (family) => {
  if (typeof family?.membersCount === "number") return family.membersCount;
  if (Array.isArray(family?.members)) return family.members.length;
  return "—";
};

const getSellerText = (family) => {
  if (Array.isArray(family?.sellerNames) && family.sellerNames.length > 0) {
    return family.sellerNames.join(", ");
  }

  if (Array.isArray(family?.sellers) && family.sellers.length > 0) {
    const sellersText = family.sellers
      .map((seller) => seller.fullName)
      .filter(Boolean)
      .join(", ");

    return sellersText || "—";
  }

  if (family?.seller?.fullName) return family.seller.fullName;

  return "—";
};

const getPropertyText = (family) => {
  const address = family?.property?.address || "";
  const cadastral = family?.property?.cadastralCode || "";

  if (!address && !cadastral) return "—";

  return [address, cadastral].filter(Boolean).join(" / ");
};

const familyMatchesLocalSearch = (family, query) => {
  const text = query.trim().toLowerCase();

  if (!text) return true;

  const sellers = Array.isArray(family?.sellers)
    ? family.sellers.map(
        (seller) => `${seller.fullName || ""} ${seller.personalNumber || ""}`
      )
    : [];

  const members = Array.isArray(family?.members)
    ? family.members.map(
        (member) => `${member.fullName || ""} ${member.personalNumber || ""}`
      )
    : [];

  const searchable = [
    family?.rowNumber,
    family?.primaryPersonFullName,
    family?.primaryPersonPersonalNumber,
    family?.beneficiaryPhone,
    family?.purchaseAmountText,
    family?.property?.address,
    family?.property?.cadastralCode,
    ...sellers,
    ...members,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchable.includes(text);
};

const getSignerFormMap = (items = []) => {
  const result = {};

  items.forEach((item) => {
    result[item.id] = {
      signerType: item.signerType || "self",
      representativeFullName: item.representativeFullName || "",
      representativePersonalNumber: item.representativePersonalNumber || "",
    };
  });

  return result;
};

const getBankForm = (family) => {
  const extraData = family?.contractData?.extraData || {};

  return {
    bankName: extraData.bankName || "",
    bankCode: extraData.bankCode || "",
    bankAccount: extraData.bankAccount || "",
    bankRecipient: extraData.bankRecipient || "",
  };
};


const isAdminPromisePurchaseFamily = (family) => {
  return family?.case?.subCategory === "idps_admin_promise_purchase";
};

const calculateConvertedGelAmount = (sourceAmountUsd, usdRate) => {
  const amount = Number(sourceAmountUsd || 0);
  const rate = Number(usdRate || 0);

  if (!amount || !rate || Number.isNaN(amount) || Number.isNaN(rate)) {
    return "";
  }

  return (amount * rate).toFixed(2);
};

const getEmptyUsdRateForm = () => ({
  sourceAmountUsd: "",
  usdRate: "",
  usdRateDate: "",
  usdRateSource: "NBG",
  convertedGelAmount: "",
  usdRateManualOverride: false,
});

const getFileNameFromHeader = (headerValue, fallback) => {
  if (!headerValue) return fallback;

  const utfMatch = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch {
      return utfMatch[1];
    }
  }

  const normalMatch = headerValue.match(/filename="?([^"]+)"?/i);
  if (normalMatch?.[1]) return normalMatch[1];

  return fallback;
};

const readErrorPayload = async (err) => {
  const data = err.response?.data;

  if (data instanceof Blob) {
    const text = await data.text();

    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  }

  return data || {};
};

const getCaseYearMonth = (caseItem) => {
  if (!caseItem?.orderDate) return null;

  const date = new Date(caseItem.orderDate);

  if (Number.isNaN(date.getTime())) return null;

  return {
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1),
    key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}`,
  };
};

const caseMatchesStatisticsFilters = (caseItem, filters = {}) => {
  if (filters.mainCategory && caseItem.mainCategory !== filters.mainCategory) {
    return false;
  }

  if (filters.subCategory && caseItem.subCategory !== filters.subCategory) {
    return false;
  }

  if (filters.year || filters.month) {
    const dateParts = getCaseYearMonth(caseItem);

    if (!dateParts) return false;

    if (filters.year && dateParts.year !== String(filters.year)) {
      return false;
    }

    if (filters.month && dateParts.month !== String(Number(filters.month))) {
      return false;
    }
  }

  return true;
};

const createEmptyOperatorCategoryStats = () => {
  const result = {};

  statisticsMainCategories.forEach((category) => {
    result[category] = {
      totalFamilies: 0,
      signedFamilies: 0,
      cancelledFamilies: 0,
      remainingFamilies: 0,
    };
  });

  return result;
};

const createEmptyOperatorSubCategoryStats = () => {
  const result = {};

  Object.values(statisticsSubCategoriesByMain)
    .flat()
    .forEach((category) => {
      result[category] = {
        totalFamilies: 0,
        signedFamilies: 0,
        cancelledFamilies: 0,
        remainingFamilies: 0,
      };
    });

  return result;
};

const buildLocalOperatorStatistics = (caseRows = []) => {
  const byMainCategory = createEmptyOperatorCategoryStats();
  const bySubCategory = createEmptyOperatorSubCategoryStats();
  const monthlyMap = {};

  const totals = {
    totalFamilies: 0,
    signedFamilies: 0,
    cancelledFamilies: 0,
    remainingFamilies: 0,
  };

  caseRows.forEach((caseItem) => {
    const stats = caseItem.stats || {};

    const totalFamilies = Number(stats.totalDelegated || 0);
    const signedFamilies = Number(stats.signed || 0);
    const cancelledFamilies = Number(stats.cancelled || 0);
    const remainingFamilies = Number(stats.remaining || 0);

    totals.totalFamilies += totalFamilies;
    totals.signedFamilies += signedFamilies;
    totals.cancelledFamilies += cancelledFamilies;
    totals.remainingFamilies += remainingFamilies;

    if (byMainCategory[caseItem.mainCategory]) {
      byMainCategory[caseItem.mainCategory].totalFamilies += totalFamilies;
      byMainCategory[caseItem.mainCategory].signedFamilies += signedFamilies;
      byMainCategory[caseItem.mainCategory].cancelledFamilies += cancelledFamilies;
      byMainCategory[caseItem.mainCategory].remainingFamilies += remainingFamilies;
    }

    if (bySubCategory[caseItem.subCategory]) {
      bySubCategory[caseItem.subCategory].totalFamilies += totalFamilies;
      bySubCategory[caseItem.subCategory].signedFamilies += signedFamilies;
      bySubCategory[caseItem.subCategory].cancelledFamilies += cancelledFamilies;
      bySubCategory[caseItem.subCategory].remainingFamilies += remainingFamilies;
    }

    const dateParts = getCaseYearMonth(caseItem);

    if (dateParts?.key) {
      if (!monthlyMap[dateParts.key]) {
        monthlyMap[dateParts.key] = {
          yearMonth: dateParts.key,
          signedFamilies: 0,
          cancelledFamilies: 0,
        };
      }

      monthlyMap[dateParts.key].signedFamilies += signedFamilies;
      monthlyMap[dateParts.key].cancelledFamilies += cancelledFamilies;
    }
  });

  return {
    totals,
    byMainCategory,
    bySubCategory,
    monthlyReport: Object.values(monthlyMap).sort((a, b) =>
      a.yearMonth.localeCompare(b.yearMonth)
    ),
  };
};

const OperatorDashboardPage = () => {
  const [dashboard, setDashboard] = useState(null);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [casesPage, setCasesPage] = useState(1);

  const statisticsLoading = false;
  const [statisticsFilters, setStatisticsFilters] = useState({
    year: "",
    month: "",
    mainCategory: "",
    subCategory: "",
  });

  const [toast, setToast] = useState(null);
  const toastTimeoutRef = useRef(null);

  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchPerformed, setSearchPerformed] = useState(false);

  const [caseModalOpen, setCaseModalOpen] = useState(false);
  const [caseLoading, setCaseLoading] = useState(false);
  const [selectedCaseData, setSelectedCaseData] = useState(null);
  const [caseSearch, setCaseSearch] = useState("");
  const [highlightFamilyId, setHighlightFamilyId] = useState(null);

  const [familyModalOpen, setFamilyModalOpen] = useState(false);
  const [familyLoading, setFamilyLoading] = useState(false);
  const [selectedFamily, setSelectedFamily] = useState(null);
  const [memberSignerForms, setMemberSignerForms] = useState({});
  const [sellerSignerForms, setSellerSignerForms] = useState({});
  const [bankForm, setBankForm] = useState({
    bankName: "",
    bankCode: "",
    bankAccount: "",
    bankRecipient: "",
  });
  const [familyActionLoading, setFamilyActionLoading] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [missingFields, setMissingFields] = useState([]);
  const [usdRateForm, setUsdRateForm] = useState(getEmptyUsdRateForm());
  const [usdRateEditable, setUsdRateEditable] = useState(false);
  const [usdRateLoading, setUsdRateLoading] = useState(false);
  const [usdRateError, setUsdRateError] = useState("");

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });

    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }

    toastTimeoutRef.current = window.setTimeout(() => {
      setToast(null);
    }, 3200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const loadDashboard = useCallback(async () => {
    const response = await api.get("/operator/dashboard");
    setDashboard(response.data);
  }, []);

  const loadCases = useCallback(async () => {
    const response = await api.get("/operator/cases");
    const nextCases = getCasesFromResponse(response.data);

    setCases(nextCases);
    setCasesPage(1);
  }, []);

  const loadPage = useCallback(async () => {
    setLoading(true);

    try {
      await Promise.all([loadDashboard(), loadCases()]);
    } catch (err) {
      showToast(
        err.response?.data?.message ||
          "ოპერატორის გვერდის მონაცემების მიღება ვერ მოხერხდა.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }, [loadDashboard, loadCases, showToast]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadPage();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [loadPage]);

  const selectedFamilies = useMemo(() => {
    return selectedCaseData?.families || [];
  }, [selectedCaseData]);

  const filteredSelectedFamilies = useMemo(() => {
    return selectedFamilies.filter((family) =>
      familyMatchesLocalSearch(family, caseSearch)
    );
  }, [selectedFamilies, caseSearch]);

  const refreshSelectedCaseFamilies = useCallback(async () => {
    const caseId = selectedCaseData?.case?.id;

    if (!caseId) return;

    const response = await api.get(`/operator/cases/${caseId}/families`);
    setSelectedCaseData(response.data);
  }, [selectedCaseData?.case?.id]);

  const loadFamilyDetails = useCallback(async (familyId) => {
    const response = await api.get(`/operator/families/${familyId}`);
    const family = response.data;

    setSelectedFamily(family);
    setMemberSignerForms(getSignerFormMap(family.members || []));
    setSellerSignerForms(getSignerFormMap(family.sellers || []));
    setBankForm(getBankForm(family));
    setMissingFields([]);
    setUsdRateError("");
    setUsdRateForm(getEmptyUsdRateForm());
    setUsdRateEditable(false);

    if (isAdminPromisePurchaseFamily(family)) {
      const extraData = family.contractData?.extraData || {};
      const sourceAmountUsd = family.purchaseAmount || extraData.sourceAmountUsd || "";

      setUsdRateForm({
        sourceAmountUsd,
        usdRate: extraData.usdRate || "",
        usdRateDate: toDisplayRateDate(extraData.usdRateDate || ""),
        usdRateSource: extraData.usdRateSource || "NBG",
        convertedGelAmount:
          extraData.convertedGelAmount ||
          calculateConvertedGelAmount(sourceAmountUsd, extraData.usdRate),
        usdRateManualOverride: extraData.usdRateManualOverride === true,
      });

      setUsdRateLoading(true);

      try {
        const rateResponse = await api.get("/operator/exchange-rates/usd");
        const rateData = rateResponse.data;
        const rate = Number(rateData.rate || 0);

        if (!rate || Number.isNaN(rate)) {
          throw new Error("USD კურსი NBG პასუხში ვერ მოიძებნა.");
        }

        setUsdRateForm({
          sourceAmountUsd,
          usdRate: rate,
          usdRateDate: toDisplayRateDate(
            rateData.validFromDate || rateData.sourceDate || ""
          ),
          usdRateSource: "NBG",
          convertedGelAmount: calculateConvertedGelAmount(sourceAmountUsd, rate),
          usdRateManualOverride: false,
        });

        setUsdRateEditable(false);
      } catch (rateError) {
        setUsdRateError(
          rateError.response?.data?.message ||
            rateError.message ||
            "NBG კურსის წამოღება ვერ მოხერხდა. შეიყვანე კურსი ხელით."
        );

        setUsdRateForm((prev) => ({
          ...prev,
          usdRateSource: "manual",
          usdRateManualOverride: true,
        }));

        setUsdRateEditable(true);
      } finally {
        setUsdRateLoading(false);
      }
    }

    return family;
  }, []);

  const openCaseModal = async (caseItem, options = {}) => {
    setCaseModalOpen(true);
    setSelectedCaseData(null);
    setCaseLoading(true);
    setCaseSearch(options.familySearchTerm || "");
    setHighlightFamilyId(options.familyId || null);

    try {
      const response = await api.get(`/operator/cases/${caseItem.id}/families`);
      setSelectedCaseData(response.data);

      await Promise.all([loadDashboard(), loadCases()]);
    } catch (err) {
      showToast(
        err.response?.data?.message || "ბრძანების ოჯახების მიღება ვერ მოხერხდა.",
        "error"
      );
      setCaseModalOpen(false);
    } finally {
      setCaseLoading(false);
    }
  };

  const closeCaseModal = () => {
    setCaseModalOpen(false);
    setSelectedCaseData(null);
    setCaseSearch("");
    setHighlightFamilyId(null);
  };

  const openFamilyModal = async (familyId) => {
    setFamilyModalOpen(true);
    setFamilyLoading(true);
    setSelectedFamily(null);

    try {
      await loadFamilyDetails(familyId);
    } catch (err) {
      showToast(
        err.response?.data?.message || "ოჯახის დეტალების მიღება ვერ მოხერხდა.",
        "error"
      );
      setFamilyModalOpen(false);
    } finally {
      setFamilyLoading(false);
    }
  };

  const closeFamilyModal = () => {
    if (familyActionLoading || savingKey) return;

    setFamilyModalOpen(false);
    setSelectedFamily(null);
    setMemberSignerForms({});
    setSellerSignerForms({});
    setBankForm({
      bankName: "",
      bankCode: "",
      bankAccount: "",
      bankRecipient: "",
    });
    setUsdRateForm(getEmptyUsdRateForm());
    setUsdRateEditable(false);
    setUsdRateLoading(false);
    setUsdRateError("");
    setMissingFields([]);
  };

  const reloadFamilyAndLists = async (familyId) => {
    await Promise.all([
      loadFamilyDetails(familyId),
      loadDashboard(),
      loadCases(),
      refreshSelectedCaseFamilies(),
    ]);
  };

  const reloadAfterFamilyAction = async (familyId) => {
    await Promise.all([loadDashboard(), loadCases(), refreshSelectedCaseFamilies()]);

    if (selectedFamily?.id === familyId) {
      await loadFamilyDetails(familyId);
    }
  };

  const searchFamilies = async (event) => {
    event?.preventDefault();

    const query = globalSearchQuery.trim();

    if (query.length < 2) {
      showToast("ძებნისთვის შეიყვანე მინიმუმ 2 სიმბოლო.", "error");
      return;
    }

    setSearchLoading(true);
    setSearchPerformed(true);

    try {
      const response = await api.get("/operator/families/search", {
        params: { query },
      });

      setSearchResults(getSearchResultsFromResponse(response.data));
    } catch (err) {
      showToast(
        err.response?.data?.message || "ოჯახების ძებნა ვერ მოხერხდა.",
        "error"
      );
    } finally {
      setSearchLoading(false);
    }
  };

  const clearSearch = () => {
    setGlobalSearchQuery("");
    setSearchResults([]);
    setSearchPerformed(false);
  };

  const updateStatisticsFilter = (field, value) => {
    setStatisticsFilters((prev) => ({
      ...prev,
      [field]: value,
      ...(field === "year" && !value ? { month: "" } : {}),
      ...(field === "mainCategory" ? { subCategory: "" } : {}),
    }));
  };

  const applyStatisticsFilters = () => {
    setCasesPage(1);
  };

  const clearStatisticsFilters = () => {
    const emptyFilters = {
      year: "",
      month: "",
      mainCategory: "",
      subCategory: "",
    };

    setStatisticsFilters(emptyFilters);
    setCasesPage(1);
  };

  const downloadCaseAnnex = async (caseItem) => {
    try {
      const response = await api.get(
        `/operator/cases/${caseItem.id}/download-annex`,
        {
          responseType: "blob",
        }
      );

      const blob = new Blob([response.data], {
        type:
          response.headers["content-type"] ||
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      const safeName = String(getCaseDisplayNumber(caseItem))
        .replace(/[\\/:*?"<>|]/g, "_")
        .trim();

      link.href = url;
      link.download = `${safeName || "case"}_დანართი.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);
    } catch (err) {
      showToast(
        err.response?.data?.message ||
          "Excel დანართის ჩამოტვირთვა ვერ მოხერხდა.",
        "error"
      );
    }
  };

  const downloadGeneratedDocx = async () => {
    if (!selectedFamily?.id) return;

    setFamilyActionLoading(true);
    setMissingFields([]);

    try {
      await persistContractExtraData({ reload: false });

      const response = await api.post(
        `/operator/families/${selectedFamily.id}/generate-contract`,
        {},
        {
          responseType: "blob",
        }
      );

      const fileName = getFileNameFromHeader(
        response.headers["content-disposition"],
        `contract-${selectedFamily.id}.docx`
      );

      const blob = new Blob([response.data], {
        type:
          response.headers["content-type"] ||
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);

      showToast("ხელშეკრულება ჩამოიტვირთა.");
      await reloadFamilyAndLists(selectedFamily.id);
    } catch (err) {
      const payload = await readErrorPayload(err);

      setMissingFields(payload.missingFields || []);
      showToast(
        payload.message || "ხელშეკრულების გენერირება ვერ მოხერხდა.",
        "error"
      );
    } finally {
      setFamilyActionLoading(false);
    }
  };

  const saveMemberSigner = async (memberId) => {
    const form = memberSignerForms[memberId];

    if (!form) return;

    setSavingKey(`member-${memberId}`);

    try {
      await api.patch(`/operator/family-members/${memberId}/signer`, {
        signerType: form.signerType,
        representativeFullName:
          form.signerType === "self" ? "" : form.representativeFullName,
        representativePersonalNumber:
          form.signerType === "self" ? "" : form.representativePersonalNumber,
      });

      showToast("ოჯახის წევრის ხელმოწერის მონაცემები განახლდა.");

      if (selectedFamily?.id) {
        await reloadFamilyAndLists(selectedFamily.id);
      }
    } catch (err) {
      showToast(
        err.response?.data?.message ||
          "ოჯახის წევრის მონაცემების შენახვა ვერ მოხერხდა.",
        "error"
      );
    } finally {
      setSavingKey("");
    }
  };

  const saveSellerSigner = async (sellerId) => {
    const form = sellerSignerForms[sellerId];

    if (!form) return;

    setSavingKey(`seller-${sellerId}`);

    try {
      await api.patch(`/operator/sellers/${sellerId}/signer`, {
        signerType: form.signerType,
        representativeFullName:
          form.signerType === "self" ? "" : form.representativeFullName,
        representativePersonalNumber:
          form.signerType === "self" ? "" : form.representativePersonalNumber,
      });

      showToast("გამყიდველის ხელმოწერის მონაცემები განახლდა.");

      if (selectedFamily?.id) {
        await reloadFamilyAndLists(selectedFamily.id);
      }
    } catch (err) {
      showToast(
        err.response?.data?.message ||
          "გამყიდველის ხელმოწერის მონაცემების შენახვა ვერ მოხერხდა.",
        "error"
      );
    } finally {
      setSavingKey("");
    }
  };

  const buildContractExtraDataPayload = () => {
    const extraDataPayload = {
      ...bankForm,
    };

    if (selectedFamily?.case?.subCategory === "idps_admin_promise_purchase") {
      extraDataPayload.sourceAmountUsd = usdRateForm.sourceAmountUsd;
      extraDataPayload.usdRate = usdRateForm.usdRate;
      extraDataPayload.usdRateDate = usdRateForm.usdRateDate;
      extraDataPayload.usdRateSource = usdRateForm.usdRateSource;
      extraDataPayload.convertedGelAmount = usdRateForm.convertedGelAmount;
      extraDataPayload.usdRateManualOverride =
        usdRateForm.usdRateManualOverride === true;
    }

    return extraDataPayload;
  };

  const persistContractExtraData = async ({ reload = false } = {}) => {
    if (!selectedFamily?.id) return;

    await api.patch(`/operator/families/${selectedFamily.id}/contract-data`, {
      extraData: buildContractExtraDataPayload(),
    });

    if (reload) {
      await reloadFamilyAndLists(selectedFamily.id);
    }
  };

  const saveBankData = async () => {
    if (!selectedFamily?.id) return;

    setSavingKey("bank");

    try {
      await persistContractExtraData({ reload: true });
      showToast("საბანკო რეკვიზიტები შენახულია.");
    } catch (err) {
      showToast(
        err.response?.data?.message ||
          "საბანკო რეკვიზიტების შენახვა ვერ მოხერხდა.",
        "error"
      );
    } finally {
      setSavingKey("");
    }
  };

  const markSigned = async (familyId = selectedFamily?.id) => {
    if (!familyId) return;

    setFamilyActionLoading(true);

    try {
      await api.patch(`/operator/families/${familyId}/sign`);
      showToast("ხელშეკრულება მონიშნულია გაფორმებულად.");
      await reloadAfterFamilyAction(familyId);
    } catch (err) {
      showToast(
        err.response?.data?.message || "გაფორმებულად მონიშვნა ვერ მოხერხდა.",
        "error"
      );
    } finally {
      setFamilyActionLoading(false);
    }
  };

  const cancelSelectedFamily = async (familyId = selectedFamily?.id) => {
    if (!familyId) return;

    setFamilyActionLoading(true);

    try {
      await api.patch(`/operator/families/${familyId}/cancel`, {});
      showToast("ოჯახი გაუქმებულია.");
      await reloadAfterFamilyAction(familyId);
    } catch (err) {
      showToast(
        err.response?.data?.message || "ოჯახის გაუქმება ვერ მოხერხდა.",
        "error"
      );
    } finally {
      setFamilyActionLoading(false);
    }
  };

  const reactivateSelectedFamily = async (familyId = selectedFamily?.id) => {
    if (!familyId) return;

    setFamilyActionLoading(true);

    try {
      await api.patch(`/operator/families/${familyId}/reactivate`);
      showToast("ოჯახი ხელახლა გააქტიურდა.");
      await reloadAfterFamilyAction(familyId);
    } catch (err) {
      showToast(
        err.response?.data?.message || "ოჯახის რეაქტივაცია ვერ მოხერხდა.",
        "error"
      );
    } finally {
      setFamilyActionLoading(false);
    }
  };

  const updateMemberForm = (memberId, patch) => {
    setMemberSignerForms((prev) => ({
      ...prev,
      [memberId]: {
        ...(prev[memberId] || {}),
        ...patch,
      },
    }));
  };

  const updateSellerForm = (sellerId, patch) => {
    setSellerSignerForms((prev) => ({
      ...prev,
      [sellerId]: {
        ...(prev[sellerId] || {}),
        ...patch,
      },
    }));
  };

  const selectedFamilyCaseCancelled = Boolean(selectedFamily?.case?.isCancelled);
  const selectedFamilyCaseClosed = Boolean(selectedFamily?.case?.isClosed);
  const canEditSelectedFamily =
    Boolean(selectedFamily) &&
    selectedFamily.isActive &&
    !selectedFamily.isSigned &&
    !selectedFamilyCaseCancelled &&
    !selectedFamilyCaseClosed;

  const canGenerateSelectedFamily =
    Boolean(selectedFamily) &&
    selectedFamily.isActive &&
    !selectedFamilyCaseCancelled &&
    !selectedFamilyCaseClosed;

  const selectedFamilyIsEcomigrantPurchase =
    selectedFamily?.case?.subCategory === "ecomigrant_purchase";

  const caseModalCaseCancelled = Boolean(selectedCaseData?.case?.isCancelled);
  const caseModalCaseClosed = Boolean(selectedCaseData?.case?.isClosed);

  const canSignFamilyRow = (family) => {
    return (
      family?.isActive &&
      !family?.isSigned &&
      !caseModalCaseCancelled &&
      !caseModalCaseClosed
    );
  };

  const canCancelFamilyRow = (family) => {
    return (
      family?.isActive &&
      !family?.isSigned &&
      !caseModalCaseCancelled &&
      !caseModalCaseClosed
    );
  };

  const canReactivateFamilyRow = (family) => {
    return (
      !family?.isActive &&
      !family?.isSigned &&
      !caseModalCaseCancelled &&
      !caseModalCaseClosed
    );
  };

  const operatorCases = Array.isArray(cases) ? cases : EMPTY_ROWS;

  const totalCasesPages = Math.max(
    1,
    Math.ceil(operatorCases.length / OPERATOR_CASES_PAGE_SIZE)
  );

  const safeCasesPage = Math.min(casesPage, totalCasesPages);

  const paginatedCases = useMemo(() => {
    const start = (safeCasesPage - 1) * OPERATOR_CASES_PAGE_SIZE;
    return operatorCases.slice(start, start + OPERATOR_CASES_PAGE_SIZE);
  }, [operatorCases, safeCasesPage]);

  const statisticsCases = useMemo(() => {
    return operatorCases.filter((caseItem) =>
      caseMatchesStatisticsFilters(caseItem, statisticsFilters)
    );
  }, [operatorCases, statisticsFilters]);

  const localOperatorStatistics = useMemo(() => {
    return buildLocalOperatorStatistics(statisticsCases);
  }, [statisticsCases]);

  const operatorStatisticsTotals = localOperatorStatistics.totals;

  const availableStatisticsSubCategories = statisticsFilters.mainCategory
    ? statisticsSubCategoriesByMain[statisticsFilters.mainCategory] || []
    : [];

  const operatorCategoryTreeRows = statisticsMainCategories.flatMap((mainCategory) => {
    const mainStats = localOperatorStatistics.byMainCategory?.[mainCategory] || {
      totalFamilies: 0,
      signedFamilies: 0,
      cancelledFamilies: 0,
      remainingFamilies: 0,
    };

    const parentRow = {
      type: "main",
      key: mainCategory,
      label: getMainCategoryLabel(mainCategory),
      ...mainStats,
    };

    const childRows = (statisticsSubCategoriesByMain[mainCategory] || [])
      .map((subCategory) => ({
        type: "sub",
        key: subCategory,
        parentKey: mainCategory,
        label: getSubCategoryLabel(subCategory),
        ...(localOperatorStatistics.bySubCategory?.[subCategory] || {
          totalFamilies: 0,
          signedFamilies: 0,
          cancelledFamilies: 0,
          remainingFamilies: 0,
        }),
      }))
      .filter(
        (row) =>
          row.totalFamilies > 0 ||
          row.signedFamilies > 0 ||
          row.cancelledFamilies > 0 ||
          row.remainingFamilies > 0
      );

    return [parentRow, ...childRows];
  });

  const operatorMonthlyRows = localOperatorStatistics.monthlyReport || [];

  return (
    <AppLayout>
      {toast && (
        <div className={`floating-toast ${toast.type}`}>
          {toast.type === "success" ? (
            <CheckCircle size={18} />
          ) : (
            <AlertCircle size={18} />
          )}
          {toast.message}
        </div>
      )}

      <div className="page-header">
        <div>
          <h2>ოპერატორის სამუშაო სივრცე</h2>
        </div>
      </div>

      <div className="operator-stats-grid">
        <div className="mini-stat-card">
          <span>დელეგირებული ბრძანებები</span>
          <strong>{dashboard?.totalCases ?? 0}</strong>
        </div>

        <div className="mini-stat-card new-stat">
          <span>ახალი / უნახავი</span>
          <strong>{dashboard?.newCases ?? 0}</strong>
        </div>

        <div className="mini-stat-card">
          <span>გასაფორმებელი ოჯახები</span>
          <strong>
            {dashboard?.remainingFamilies ?? dashboard?.totalRemaining ?? 0}
          </strong>
        </div>

        <div className="mini-stat-card">
          <span>გაფორმებული</span>
          <strong>{dashboard?.signedFamilies ?? 0}</strong>
        </div>

        <div className="mini-stat-card">
          <span>გაუქმებული</span>
          <strong>{dashboard?.cancelledFamilies ?? 0}</strong>
        </div>
      </div>

      <section className="page-card section-card">
        <div className="section-title">
          <div className="section-title-left">
            <FileSearch size={19} />
            <h3>ოჯახის საერთო ძებნა</h3>
          </div>
        </div>

        <form className="operator-search-form" onSubmit={searchFamilies}>
          <div className="operator-search-input-wrap">
            <Search size={18} />
            <input
              value={globalSearchQuery}
              onChange={(event) => setGlobalSearchQuery(event.target.value)}
              placeholder="პირადი ნომერი, სახელი/გვარი, გამყიდველი, საკადასტრო, მისამართი ან ბრძანების ნომერი"
            />
          </div>

          <button
            type="submit"
            className="primary-button"
            disabled={searchLoading}
          >
            {searchLoading ? "იძებნება..." : "ძებნა"}
          </button>

          <button type="button" className="secondary-button" onClick={clearSearch}>
            გასუფთავება
          </button>
        </form>

        {searchPerformed && (
          <div className="operator-search-results">
            <div className="details-section-title">
              ძებნის შედეგები — {searchResults.length}
            </div>

            <div className="table-wrapper">
              <table className="data-table operator-search-table">
                <thead>
                  <tr>
                    <th>№</th>
                    <th>ბენეფიციარი</th>
                    <th>პირადი ნომერი</th>
                    <th>ბრძანების ნომერი</th>
                    <th>პროგრამა</th>
                    <th>ქონება</th>
                    <th>სტატუსი</th>
                    <th>მოქმედება</th>
                  </tr>
                </thead>

                <tbody>
                  {searchResults.map((family) => (
                    <tr key={family.id}>
                      <td>
                        <span className="count-badge">
                          {family.rowNumber || "—"}
                        </span>
                      </td>

                      <td>
                        <span className="table-main-text">
                          {family.primaryPersonFullName || "—"}
                        </span>
                      </td>

                      <td>
                        <span className="table-secondary-text">
                          {family.primaryPersonPersonalNumber || "—"}
                        </span>
                      </td>

                      <td>
                        <span
                          className="table-secondary-text"
                          title={getCaseDisplayNumber(family.case)}
                        >
                          {getCaseDisplayNumber(family.case)}
                        </span>
                      </td>

                      <td>
                        <span className="table-secondary-text">
                          {getSubCategoryLabel(family.case?.subCategory)}
                        </span>
                      </td>

                      <td>
                        <span
                          className="table-secondary-text"
                          title={getPropertyText(family)}
                        >
                          {getPropertyText(family)}
                        </span>
                      </td>

                      <td>
                        <span
                          className={`case-status-badge ${getFamilyStatusClass(
                            family
                          )}`}
                        >
                          {getFamilyStatusLabel(family)}
                        </span>
                      </td>

                      <td>
                        <div className="action-icon-group">
                          <button
                            type="button"
                            className="icon-action-button process"
                            onClick={() => openFamilyModal(family.id)}
                            title="დამუშავება"
                            aria-label="დამუშავება"
                          >
                            <PenLine size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {searchResults.length === 0 && (
                    <tr>
                      <td colSpan="8" className="empty-table-cell">
                        შედეგი ვერ მოიძებნა.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="page-card section-card">
        <div className="section-title">
          <div className="section-title-left">
            <FolderOpen size={19} />
            <h3>ჩემზე დელეგირებული ბრძანებები</h3>
          </div>
        </div>

        {loading ? (
          <div className="details-loading">მონაცემები იტვირთება...</div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table operator-cases-table">
              <thead>
                <tr>
                  <th>ბრძანების ნომერი</th>
                  <th>თარიღი</th>
                  <th>მიმართულება</th>
                  <th>პროგრამა</th>
                  <th>სულ ოჯახი</th>
                  <th>გასაფორმებელი</th>
                  <th>გაფორმებული</th>
                  <th>გაუქმებული</th>
                  <th>სტატუსი</th>
                  <th>მოქმედება</th>
                </tr>
              </thead>

              <tbody>
                {paginatedCases.map((caseItem) => (
                  <tr
                    key={caseItem.id}
                    className={
                      caseItem.isNewForOperator
                        ? "operator-case-row new-case"
                        : "operator-case-row"
                    }
                  >
                    <td>
                      <div className="operator-case-title-cell">
                        {caseItem.isNewForOperator && (
                          <span className="new-case-dot" title="ახალი ბრძანება" />
                        )}

                        <span
                          className="table-main-text"
                          title={getCaseDisplayNumber(caseItem)}
                        >
                          {getCaseDisplayNumber(caseItem)}
                        </span>
                      </div>
                    </td>

                    <td>
                      <span className="table-secondary-text">
                        {formatDate(caseItem.orderDate)}
                      </span>
                    </td>

                    <td>
                      <span className="table-secondary-text">
                        {getMainCategoryLabel(caseItem.mainCategory)}
                      </span>
                    </td>

                    <td>
                      <span
                        className="table-secondary-text"
                        title={getSubCategoryLabel(caseItem.subCategory)}
                      >
                        {getSubCategoryLabel(caseItem.subCategory)}
                      </span>
                    </td>

                    <td>
                      <span className="count-badge">
                        {caseItem.stats?.totalDelegated ?? 0}
                      </span>
                    </td>

                    <td>
                      <span className="remaining-badge">
                        {caseItem.stats?.remaining ?? 0}
                      </span>
                    </td>

                    <td>
                      <span className="count-badge">
                        {caseItem.stats?.signed ?? 0}
                      </span>
                    </td>

                    <td>
                      <span className="count-badge">
                        {caseItem.stats?.cancelled ?? 0}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`case-status-badge ${getCaseStatusClass(
                          caseItem
                        )}`}
                      >
                        {getCaseStatusLabel(caseItem)}
                      </span>
                    </td>

                    <td className="actions-column">
                      <div className="table-actions-group">
                        <button
                          type="button"
                          className="small-secondary-button"
                          onClick={() => openCaseModal(caseItem)}
                        >
                          <Eye size={14} />
                          ნახვა
                        </button>

                        <button
                          type="button"
                          className="small-secondary-button"
                          onClick={() => downloadCaseAnnex(caseItem)}
                          disabled={!caseItem.hasAnnexExcel}
                          title={
                            !caseItem.hasAnnexExcel
                              ? "ამ ბრძანებაზე Excel დანართი არ არის ატვირთული"
                              : ""
                          }
                        >
                          <Download size={14} />
                          Excel
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {cases.length === 0 && (
                  <tr>
                    <td colSpan="10" className="empty-table-cell">
                      შენზე დელეგირებული ბრძანება ჯერ არ არის.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {operatorCases.length > OPERATOR_CASES_PAGE_SIZE && (
          <div className="pagination-bar">
            <div className="pagination-info">
              გვერდი {safeCasesPage} / {totalCasesPages}
            </div>

            <div className="pagination-actions">
              <button
                type="button"
                className="pagination-button"
                onClick={() => setCasesPage((prev) => Math.max(1, prev - 1))}
                disabled={safeCasesPage === 1}
              >
                წინა
              </button>

              <button
                type="button"
                className="pagination-button"
                onClick={() =>
                  setCasesPage((prev) => Math.min(totalCasesPages, prev + 1))
                }
                disabled={safeCasesPage === totalCasesPages}
              >
                შემდეგი
              </button>
            </div>
          </div>
        )}
      </section>

            <section className="page-card section-card operator-statistics-section">
        <div className="section-title">
          <div className="section-title-left">
            <BarChart3 size={19} />
            <h3>ჩემი სტატისტიკა</h3>
          </div>
        </div>

        <div className="operator-statistics-filters">
          <label>
            წელი
            <select
              value={statisticsFilters.year}
              onChange={(event) =>
                updateStatisticsFilter("year", event.target.value)
              }
            >
              <option value="">ყველა</option>
              {getYearOptions().map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>

          <label>
            თვე
            <select
              value={statisticsFilters.month}
              onChange={(event) =>
                updateStatisticsFilter("month", event.target.value)
              }
              disabled={!statisticsFilters.year}
            >
              <option value="">ყველა</option>
              {monthOptions.map((month) => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            მიმართულება
            <select
              value={statisticsFilters.mainCategory}
              onChange={(event) =>
                updateStatisticsFilter("mainCategory", event.target.value)
              }
            >
              <option value="">ყველა</option>
              {statisticsMainCategories.map((category) => (
                <option key={category} value={category}>
                  {getMainCategoryLabel(category)}
                </option>
              ))}
            </select>
          </label>

          <label>
            ქვეპროგრამა
            <select
              value={statisticsFilters.subCategory}
              onChange={(event) =>
                updateStatisticsFilter("subCategory", event.target.value)
              }
              disabled={!statisticsFilters.mainCategory}
            >
              <option value="">ყველა</option>
              {availableStatisticsSubCategories.map((category) => (
                <option key={category} value={category}>
                  {getSubCategoryLabel(category)}
                </option>
              ))}
            </select>
          </label>

          <div className="operator-statistics-filter-actions">
            <button
              type="button"
              className="primary-button"
              onClick={applyStatisticsFilters}
              disabled={statisticsLoading}
            >
              გაფილტვრა
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={clearStatisticsFilters}
              disabled={statisticsLoading}
            >
              გასუფთავება
            </button>
          </div>
        </div>

        {statisticsLoading && (
          <div className="details-loading">სტატისტიკა იტვირთება...</div>
        )}

        {!statisticsLoading && (
          <>
            <div className="operator-report-grid">
              <div className="mini-stat-card">
                <span>სულ ოჯახები</span>
                <strong>{operatorStatisticsTotals.totalFamilies ?? 0}</strong>
              </div>

              <div className="mini-stat-card">
                <span>გაფორმებული</span>
                <strong>{operatorStatisticsTotals.signedFamilies ?? 0}</strong>
              </div>

              <div className="mini-stat-card">
                <span>გაუქმებული</span>
                <strong>{operatorStatisticsTotals.cancelledFamilies ?? 0}</strong>
              </div>

              <div className="mini-stat-card">
                <span>დარჩენილი</span>
                <strong>{operatorStatisticsTotals.remainingFamilies ?? 0}</strong>
              </div>
            </div>

            <div className="operator-statistics-tables">
              <div className="operator-statistics-table-card wide">
                <h4>მიმართულებები და ქვეპროგრამები</h4>

                <div className="table-wrapper">
                  <table className="data-table operator-statistics-table operator-category-tree-table">
                    <thead>
                      <tr>
                        <th>მიმართულება / ქვეპროგრამა</th>
                        <th>სულ</th>
                        <th>გაფორმდა</th>
                        <th>გაუქმდა</th>
                        <th>დარჩა</th>
                      </tr>
                    </thead>

                    <tbody>
                      {operatorCategoryTreeRows.map((row) => (
                        <tr
                          key={row.key}
                          className={
                            row.type === "main"
                              ? "operator-category-parent-row"
                              : "operator-category-child-row"
                          }
                        >
                          <td>
                            <span>{row.label}</span>
                          </td>
                          <td>{row.totalFamilies}</td>
                          <td>{row.signedFamilies}</td>
                          <td>{row.cancelledFamilies}</td>
                          <td>{row.remainingFamilies}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="operator-statistics-table-card wide">
                <h4>თვეების მიხედვით</h4>

                <div className="table-wrapper">
                  <table className="data-table operator-statistics-table">
                    <thead>
                      <tr>
                        <th>წელი/თვე</th>
                        <th>გაფორმდა</th>
                        <th>გაუქმდა</th>
                      </tr>
                    </thead>

                    <tbody>
                      {operatorMonthlyRows.map((row) => (
                        <tr key={row.yearMonth}>
                          <td>{row.yearMonth}</td>
                          <td>{row.signedFamilies}</td>
                          <td>{row.cancelledFamilies}</td>
                        </tr>
                      ))}

                      {operatorMonthlyRows.length === 0 && (
                        <tr>
                          <td colSpan="3" className="empty-table-cell">
                            თვიური სტატისტიკა ჯერ არ არის.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {caseModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card operator-case-modal">
            <div className="modal-header">
              <div>
                <h3>
                  {selectedCaseData?.case
                    ? getCaseDisplayNumber(selectedCaseData.case)
                    : "ბრძანება"}
                </h3>
                <p>
                  {selectedCaseData?.case
                    ? `${getMainCategoryLabel(
                        selectedCaseData.case.mainCategory
                      )} / ${getSubCategoryLabel(
                        selectedCaseData.case.subCategory
                      )}`
                    : "იტვირთება..."}
                </p>
              </div>

              <button
                type="button"
                className="modal-close-button"
                onClick={closeCaseModal}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {caseLoading && (
                <div className="details-loading">ბრძანების ოჯახები იტვირთება...</div>
              )}

              {!caseLoading && selectedCaseData && (
                <>
                  <div className="operator-case-modal-toolbar">
                    <div className="operator-search-input-wrap">
                      <Search size={17} />
                      <input
                        value={caseSearch}
                        onChange={(event) => setCaseSearch(event.target.value)}
                        placeholder="ძებნა ამ ბრძანებაში"
                      />
                    </div>

                    <div className="operator-case-modal-info">
                      ნაჩვენებია {filteredSelectedFamilies.length} /{" "}
                      {selectedFamilies.length}
                    </div>
                  </div>

                  <div className="table-wrapper details-table-wrapper">
                    <table className="data-table operator-family-table">
                      <thead>
                        <tr>
                          <th>№</th>
                          <th>ბენეფიციარი</th>
                          <th>პირადი ნომერი</th>
                          <th>წევრები</th>
                          <th>გამყიდველი</th>
                          <th>ქონება</th>
                          <th>თანხა</th>
                          <th>სტატუსი</th>
                          <th>მოქმედება</th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredSelectedFamilies.map((family) => (
                          <tr
                            key={family.id}
                            className={
                              highlightFamilyId === family.id
                                ? "highlight-family-row"
                                : ""
                            }
                          >
                            <td>
                              <span className="count-badge">
                                {family.rowNumber || "—"}
                              </span>
                            </td>

                            <td>
                              <span
                                className="table-main-text"
                                title={family.primaryPersonFullName || ""}
                              >
                                {family.primaryPersonFullName || "—"}
                              </span>
                            </td>

                            <td>
                              <span className="table-secondary-text">
                                {family.primaryPersonPersonalNumber || "—"}
                              </span>
                            </td>

                            <td>
                              <span className="count-badge">
                                {getMembersCount(family)}
                              </span>
                            </td>

                            <td>
                              <span
                                className="table-secondary-text"
                                title={getSellerText(family)}
                              >
                                {getSellerText(family)}
                              </span>
                            </td>

                            <td>
                              <span
                                className="table-secondary-text"
                                title={getPropertyText(family)}
                              >
                                {getPropertyText(family)}
                              </span>
                            </td>

                            <td>
                              <span
                                className="table-secondary-text"
                                title={String(
                                  family.purchaseAmountText ||
                                    family.purchaseAmount ||
                                    "—"
                                )}
                              >
                                {family.purchaseAmountText ||
                                  family.purchaseAmount ||
                                  "—"}
                              </span>
                            </td>

                            <td>
                              <span
                                className={`case-status-badge ${getFamilyStatusClass(
                                  family
                                )}`}
                              >
                                {getFamilyStatusLabel(family)}
                              </span>
                            </td>

                            <td>
                              <div className="action-icon-group">
                                <button
                                  type="button"
                                  className="icon-action-button process"
                                  onClick={() => openFamilyModal(family.id)}
                                  title="დამუშავება"
                                  aria-label="დამუშავება"
                                >
                                  <PenLine size={15} />
                                </button>

                                {canSignFamilyRow(family) && (
                                  <button
                                    type="button"
                                    className="icon-action-button success"
                                    onClick={() => markSigned(family.id)}
                                    disabled={familyActionLoading}
                                    title="გაფორმებულად მონიშვნა"
                                    aria-label="გაფორმებულად მონიშვნა"
                                  >
                                    <CheckCircle size={15} />
                                  </button>
                                )}

                                {canCancelFamilyRow(family) && (
                                  <button
                                    type="button"
                                    className="icon-action-button danger"
                                    onClick={() => cancelSelectedFamily(family.id)}
                                    disabled={familyActionLoading}
                                    title="გაუქმება"
                                    aria-label="გაუქმება"
                                  >
                                    <X size={15} />
                                  </button>
                                )}

                                {canReactivateFamilyRow(family) && (
                                  <button
                                    type="button"
                                    className="icon-action-button restore"
                                    onClick={() => reactivateSelectedFamily(family.id)}
                                    disabled={familyActionLoading}
                                    title="რეაქტივაცია"
                                    aria-label="რეაქტივაცია"
                                  >
                                    <RotateCcw size={15} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}

                        {filteredSelectedFamilies.length === 0 && (
                          <tr>
                            <td colSpan="9" className="empty-table-cell">
                              ოჯახი ვერ მოიძებნა.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeCaseModal}
              >
                დახურვა
              </button>
            </div>
          </div>
        </div>
      )}

      {familyModalOpen && (
        <div className="modal-backdrop family-modal-layer">
          <div className="modal-card family-process-modal">
            <div className="modal-header">
              <div>
                <h3>ოჯახის დამუშავება</h3>
              </div>

              <button
                type="button"
                className="modal-close-button"
                onClick={closeFamilyModal}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {familyLoading && (
                <div className="details-loading">ოჯახის მონაცემები იტვირთება...</div>
              )}

              {!familyLoading && selectedFamily && (
                <>
                  {selectedFamilyCaseCancelled && (
                    <div className="danger-note family-top-note">
                      ეს ბრძანება გაუქმებულია. ოპერატორის მოქმედებები დაბლოკილია.
                    </div>
                  )}

                  {selectedFamilyCaseClosed && (
                    <div className="danger-note family-top-note">
                      ეს ქეისი დასრულებულია. ოჯახის რეაქტივაცია ან მონაცემების შეცვლა შეუძლებელია.
                    </div>
                  )}

                  <div className="family-compact-summary">
                    <div>
                      <span>სტატუსი</span>
                      <strong>
                        <span
                          className={`case-status-badge compact-status-badge ${getFamilyStatusClass(
                            selectedFamily
                          )}`}
                        >
                          {getFamilyStatusLabel(selectedFamily)}
                        </span>
                      </strong>
                    </div>

                    <div>
                      <span>ბრძანება</span>
                      <strong>{getCaseDisplayNumber(selectedFamily.case)}</strong>
                    </div>

                    <div>
                      <span>პროგრამა</span>
                      <strong>{getSubCategoryLabel(selectedFamily.case?.subCategory)}</strong>
                    </div>

                    <div>
                      <span>ბენეფიციარი</span>
                      <strong>{selectedFamily.primaryPersonFullName || "—"}</strong>
                    </div>

                    <div>
                      <span>პირადი ნომერი</span>
                      <strong>{selectedFamily.primaryPersonPersonalNumber || "—"}</strong>
                    </div>

                    <div>
                      <span>თანხა</span>
                      <strong>
                        {selectedFamily.purchaseAmountText || selectedFamily.purchaseAmount || "—"}
                      </strong>
                    </div>
                  </div>

                  <section className="family-process-section compact-info-section">
                    <h4>ქონება</h4>

                    <div className="property-compact-grid">
                      <div>
                        <span>მისამართი</span>
                        <strong>{selectedFamily.property?.address || "—"}</strong>
                      </div>

                      <div>
                        <span>საკადასტრო კოდი</span>
                        <strong>{selectedFamily.property?.cadastralCode || "—"}</strong>
                      </div>

                      {selectedFamilyIsEcomigrantPurchase && (
                        <div>
                          <span>დაზიანებული ქონების საკადასტრო</span>
                          <strong>
                            {selectedFamily.property?.damagedPropertyCadastralCode || "—"}
                          </strong>
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="family-process-section signature-section buyer-signature-section">
                    <div className="signature-section-header">
                      <h4>მყიდველები / ხელმომწერები</h4>
                      <span>აირჩიე ვინ აწერს ხელს და საჭიროებისას მიუთითე პირის მონაცემები</span>
                    </div>

                    <div className="signature-row-list">
                      {(selectedFamily.members || []).map((member) => {
                        const form = memberSignerForms[member.id] || {
                          signerType: "self",
                          representativeFullName: "",
                          representativePersonalNumber: "",
                        };

                        const needsRepresentative = form.signerType !== "self";

                        return (
                          <div className="signature-edit-row buyer-row" key={member.id}>
                            <div className="signature-person-cell">
                              <strong>{member.fullName || "—"}</strong>
                              <span>{member.personalNumber || "—"}</span>
                            </div>

                            <div className="signer-choice-group">
                              {signerTypeOptions.map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  className={
                                    form.signerType === option.value
                                      ? "signer-choice-button active"
                                      : "signer-choice-button"
                                  }
                                  onClick={() =>
                                    updateMemberForm(member.id, {
                                      signerType: option.value,
                                    })
                                  }
                                  disabled={!canEditSelectedFamily}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>

                            <input
                              className="signature-small-input"
                              value={form.representativeFullName}
                              onChange={(event) =>
                                updateMemberForm(member.id, {
                                  representativeFullName: event.target.value,
                                })
                              }
                              disabled={!canEditSelectedFamily || !needsRepresentative}
                              placeholder="სახელი/გვარი"
                            />

                            <input
                              className="signature-small-input"
                              value={form.representativePersonalNumber}
                              onChange={(event) =>
                                updateMemberForm(member.id, {
                                  representativePersonalNumber: event.target.value,
                                })
                              }
                              disabled={!canEditSelectedFamily || !needsRepresentative}
                              placeholder="პირადი ნომერი"
                            />

                            <button
                              type="button"
                              className="icon-action-button save"
                              onClick={() => saveMemberSigner(member.id)}
                              disabled={
                                !canEditSelectedFamily ||
                                savingKey === `member-${member.id}`
                              }
                              title="შენახვა"
                              aria-label="შენახვა"
                            >
                              <Save size={15} />
                            </button>
                          </div>
                        );
                      })}

                      {(selectedFamily.members || []).length === 0 && (
                        <div className="empty-process-card">
                          ოჯახის წევრები ვერ მოიძებნა.
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="family-process-section signature-section seller-signature-section">
                    <div className="signature-section-header">
                      <h4>გამყიდველები / ხელმომწერები</h4>
                      <span>გამყიდველის ძირითადი მონაცემები უცვლელია — ივსება მხოლოდ ხელმომწერის ტიპი</span>
                    </div>

                    <div className="signature-row-list">
                      {(selectedFamily.sellers || []).map((seller) => {
                        const form = sellerSignerForms[seller.id] || {
                          signerType: "self",
                          representativeFullName: "",
                          representativePersonalNumber: "",
                        };

                        const needsRepresentative = form.signerType !== "self";

                        return (
                          <div className="signature-edit-row seller-row" key={seller.id}>
                            <div className="signature-person-cell">
                              <strong>{seller.fullName || "—"}</strong>
                              <span>
                                {seller.personalNumber || "—"}
                                {seller.phone ? ` / ${seller.phone}` : ""}
                              </span>
                            </div>

                            <div className="signer-choice-group">
                              {signerTypeOptions.map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  className={
                                    form.signerType === option.value
                                      ? "signer-choice-button active"
                                      : "signer-choice-button"
                                  }
                                  onClick={() =>
                                    updateSellerForm(seller.id, {
                                      signerType: option.value,
                                    })
                                  }
                                  disabled={!canEditSelectedFamily}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>

                            <input
                              className="signature-small-input"
                              value={form.representativeFullName}
                              onChange={(event) =>
                                updateSellerForm(seller.id, {
                                  representativeFullName: event.target.value,
                                })
                              }
                              disabled={!canEditSelectedFamily || !needsRepresentative}
                              placeholder="სახელი/გვარი"
                            />

                            <input
                              className="signature-small-input"
                              value={form.representativePersonalNumber}
                              onChange={(event) =>
                                updateSellerForm(seller.id, {
                                  representativePersonalNumber: event.target.value,
                                })
                              }
                              disabled={!canEditSelectedFamily || !needsRepresentative}
                              placeholder="პირადი ნომერი"
                            />

                            <button
                              type="button"
                              className="icon-action-button save"
                              onClick={() => saveSellerSigner(seller.id)}
                              disabled={
                                !canEditSelectedFamily ||
                                savingKey === `seller-${seller.id}`
                              }
                              title="შენახვა"
                              aria-label="შენახვა"
                            >
                              <Save size={15} />
                            </button>
                          </div>
                        );
                      })}

                      {(selectedFamily.sellers || []).length === 0 && (
                        <div className="empty-process-card">
                          გამყიდველი ვერ მოიძებნა.
                        </div>
                      )}
                    </div>
                  </section>

                  {selectedFamily?.case?.subCategory === "idps_admin_promise_purchase" && (
                    <section className="family-process-section usd-conversion-section">
                      <div className="section-title compact-section-title">
                        <h4>USD → GEL კონვერტაცია</h4>

                        <button
                          type="button"
                          className="small-secondary-button"
                          onClick={() => {
                            setUsdRateEditable(true);
                            setUsdRateForm((prev) => ({
                              ...prev,
                              usdRateSource: "manual",
                              usdRateManualOverride: true,
                            }));
                          }}
                          disabled={!canEditSelectedFamily || usdRateLoading}
                        >
                          კურსის კორექტირება
                        </button>
                      </div>

                      {usdRateLoading && (
                        <div className="small-info-note">NBG კურსი იტვირთება...</div>
                      )}

                      {usdRateError && (
                        <div className="small-warning-note">{usdRateError}</div>
                      )}

                      <div className="usd-conversion-grid">
                        <label>
                          თანხა USD-ში
                          <input value={usdRateForm.sourceAmountUsd} disabled readOnly />
                        </label>

                        <label>
                          კურსი
                          <input
                            value={usdRateForm.usdRate}
                            onChange={(event) => {
                              const rate = event.target.value;

                              setUsdRateForm((prev) => ({
                                ...prev,
                                usdRate: rate,
                                convertedGelAmount: calculateConvertedGelAmount(
                                  prev.sourceAmountUsd,
                                  rate
                                ),
                                usdRateSource: "manual",
                                usdRateManualOverride: true,
                              }));
                            }}
                            disabled={!canEditSelectedFamily || !usdRateEditable}
                            readOnly={!usdRateEditable}
                          />
                        </label>

                        <label>
                          კურსის თარიღი
                          <input
                            type="text"
                            placeholder="დდ/თთ/წწწწ"
                            value={usdRateForm.usdRateDate || ""}
                            onChange={(event) =>
                              setUsdRateForm((prev) => ({
                                ...prev,
                                usdRateDate: sanitizeDisplayRateDate(event.target.value),
                                usdRateSource: "manual",
                                usdRateManualOverride: true,
                              }))
                            }
                            disabled={!canEditSelectedFamily || !usdRateEditable}
                            readOnly={!usdRateEditable}
                          />
                        </label>

                        <label>
                          თანხა GEL-ში
                          <input value={usdRateForm.convertedGelAmount} disabled readOnly />
                        </label>
                      </div>
                    </section>
                  )}

                  <section className="family-process-section bank-process-section">
                    <div className="section-title compact-section-title">
                      <h4>საბანკო რეკვიზიტები</h4>

                      <button
                        type="button"
                        className="small-secondary-button"
                        onClick={saveBankData}
                        disabled={!canEditSelectedFamily || savingKey === "bank"}
                      >
                        <Save size={14} />
                        {savingKey === "bank" ? "ინახება..." : "შენახვა"}
                      </button>
                    </div>

                    <div className="form-grid four compact-form-grid">
                      <label>
                        მიმღების ბანკი
                        <select
                          value={bankForm.bankName}
                          onChange={(event) => {
                            const selectedBank = bankOptions.find(
                              (bank) => bank.name === event.target.value
                            );

                            setBankForm((prev) => ({
                              ...prev,
                              bankName: selectedBank?.name || "",
                              bankCode: selectedBank?.code || "",
                            }));
                          }}
                          disabled={!canEditSelectedFamily}
                        >
                          <option value="">აირჩიე ბანკი</option>
                          {bankOptions.map((bank) => (
                            <option key={bank.code} value={bank.name}>
                              {bank.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        ბანკის კოდი
                        <input value={bankForm.bankCode} disabled readOnly />
                      </label>

                      <label>
                        მიმღები
                        <input
                          value={bankForm.bankRecipient}
                          onChange={(event) =>
                            setBankForm((prev) => ({
                              ...prev,
                              bankRecipient: event.target.value,
                            }))
                          }
                          disabled={!canEditSelectedFamily}
                        />
                      </label>

                      <label>
                        ანგარიში
                        <input
                          value={bankForm.bankAccount}
                          onChange={(event) =>
                            setBankForm((prev) => ({
                              ...prev,
                              bankAccount: event.target.value,
                            }))
                          }
                          disabled={!canEditSelectedFamily}
                        />
                      </label>
                    </div>
                  </section>

                  {missingFields.length > 0 && (
                    <div className="missing-fields-box">
                      <strong>ხელშეკრულების გენერირებისთვის შეავსე:</strong>
                      <ul>
                        {missingFields.map((field) => (
                          <li key={field}>{field}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="modal-actions family-process-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeFamilyModal}
                disabled={familyActionLoading || Boolean(savingKey)}
              >
                დახურვა
              </button>

              {canGenerateSelectedFamily && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={downloadGeneratedDocx}
                  disabled={familyActionLoading}
                >
                  <Download size={16} />
                  {familyActionLoading
                    ? "მუშავდება..."
                    : selectedFamily?.isSigned
                      ? "ხელახლა ჩამოტვირთვა"
                      : "ხელშეკრულების გენერირება"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default OperatorDashboardPage;