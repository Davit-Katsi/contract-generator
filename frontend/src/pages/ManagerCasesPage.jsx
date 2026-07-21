import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  Eye,
  FilePlus2,
  FolderOpen,
  Send,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import AppLayout from "../layouts/AppLayout";
import api from "../api/axios";
import {
  getMainCategoryLabel,
  getSubCategoryLabel,
  mainCategoryOptions,
  subCategoryOptions,
} from "../constants/categories";

const PAGE_SIZE = 10;

const getCasesFromResponse = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.cases)) return data.cases;
  return [];
};

const getOperatorsFromResponse = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.operators)) return data.operators;
  if (Array.isArray(data?.users)) return data.users;
  return [];
};

const legalizationSubCategories = [
  "idps_legalization_lawful_possession",
  "idps_legalization_housing_rule",
  "ecomigrant_legalization",
];

const isLegalizationSubCategory = (subCategory) => {
  return legalizationSubCategories.includes(subCategory);
};

const ManagerCasesPage = () => {
  const [cases, setCases] = useState([]);
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [toast, setToast] = useState(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedCase, setSelectedCase] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [familyAssignModalOpen, setFamilyAssignModalOpen] = useState(false);
  const [familyAssigning, setFamilyAssigning] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [fileInputKey, setFileInputKey] = useState(1);

  const [createForm, setCreateForm] = useState({
    mainCategory: "",
    subCategory: "",
    orderNumber: "",
    orderDate: "",
    orderPdf: null,
    annexExcel: null,
  });

  const [assignForm, setAssignForm] = useState({
    caseId: null,
    caseTitle: "",
    caseSubCategory: "",
    mode: "single",
    operatorId: "",
    operatorIds: [],
  });

  const [cancelForm, setCancelForm] = useState({
    caseId: null,
    caseTitle: "",
  });

  const [familyAssignForm, setFamilyAssignForm] = useState({
    familyId: null,
    caseId: null,
    familyTitle: "",
    operatorId: "",
  });

  const toastTimerRef = useRef(null);
  const createInProgressRef = useRef(false);

  const availableSubCategories = useMemo(() => {
    return subCategoryOptions[createForm.mainCategory] || [];
  }, [createForm.mainCategory]);

  const sortedCases = useMemo(() => {
    return [...cases].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();

      return dateB - dateA;
    });
  }, [cases]);

  const totalPages = Math.max(1, Math.ceil(sortedCases.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedCases = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE;
    return sortedCases.slice(start, start + PAGE_SIZE);
  }, [sortedCases, safeCurrentPage]);

  const showToast = useCallback((message, type = "success") => {
    clearTimeout(toastTimerRef.current);

    setToast({
      message,
      type,
    });

    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 2800);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadInitialData = async () => {
      try {
        const [casesResponse, operatorsResponse] = await Promise.all([
          api.get("/cases"),
          api.get("/users/operators"),
        ]);

        if (!isMounted) return;

        setCases(getCasesFromResponse(casesResponse.data));
        setOperators(getOperatorsFromResponse(operatorsResponse.data));
      } catch (err) {
        if (!isMounted) return;

        showToast(
          err.response?.data?.message ||
            "მენეჯერის მონაცემების ჩატვირთვა ვერ მოხერხდა.",
          "error"
        );
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadInitialData();

    return () => {
      isMounted = false;
      clearTimeout(toastTimerRef.current);
    };
  }, [showToast]);

  const loadCases = async ({ silent = true, goFirstPage = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      const response = await api.get("/cases");
      setCases(getCasesFromResponse(response.data));

      if (goFirstPage) {
        setCurrentPage(1);
      }
    } catch (err) {
      showToast(
        err.response?.data?.message || "ბრძანებების/განკარგულებების სიის განახლება ვერ მოხერხდა.",
        "error"
      );
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const handleCreateChange = (event) => {
    const { name, value, files } = event.target;

    if (name === "mainCategory") {
      setCreateForm((prev) => ({
        ...prev,
        mainCategory: value,
        subCategory: "",
      }));

      return;
    }

    if (name === "orderPdf" || name === "annexExcel") {
      setCreateForm((prev) => ({
        ...prev,
        [name]: files?.[0] || null,
      }));

      return;
    }

    setCreateForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const resetCreateForm = () => {
    setCreateForm({
      mainCategory: "",
      subCategory: "",
      orderNumber: "",
      orderDate: "",
      orderPdf: null,
      annexExcel: null,
    });

    setFileInputKey((prev) => prev + 1);
  };

  const openCreateModal = () => {
    resetCreateForm();
    setCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    if (creating) return;
    setCreateModalOpen(false);
  };

  const createCase = async (event) => {
    event.preventDefault();

    if (createInProgressRef.current) {
      return;
    }

    if (!createForm.mainCategory) {
      showToast("აირჩიე მიმართულება.", "error");
      return;
    }

    if (!createForm.subCategory) {
      showToast("აირჩიე პროგრამა.", "error");
      return;
    }

    if (!createForm.orderNumber.trim()) {
      showToast("შეიყვანე ბრძანების ნომერი.", "error");
      return;
    }

    if (!createForm.orderDate) {
      showToast("შეიყვანე ბრძანების თარიღი.", "error");
      return;
    }

    if (!createForm.orderPdf) {
      showToast("ატვირთე ბრძანების PDF ფაილი.", "error");
      return;
    }

    if (!createForm.annexExcel) {
      showToast("ატვირთე დანართის Excel ფაილი.", "error");
      return;
    }

    createInProgressRef.current = true;
    setCreating(true);

    const formData = new FormData();
    const orderNumber = createForm.orderNumber.trim();

    formData.append("title", orderNumber);
    formData.append("caseName", orderNumber);
    formData.append("mainCategory", createForm.mainCategory);
    formData.append("subCategory", createForm.subCategory);
    formData.append("orderNumber", orderNumber);
    formData.append("orderDate", createForm.orderDate);
    formData.append("orderPdf", createForm.orderPdf);
    formData.append("annexExcel", createForm.annexExcel);

    try {
      await api.post("/cases", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      await loadCases({ silent: true, goFirstPage: true });

      setCreateModalOpen(false);
      resetCreateForm();
      showToast("ბრძანება/განკარგულება წარმატებით შეიქმნა.");
    } catch (err) {
      showToast(
        err.response?.data?.message || "ბრძანების/განკარგულების შექმნა ვერ მოხერხდა.",
        "error"
      );
    } finally {
      createInProgressRef.current = false;
      setCreating(false);
    }
  };

  const getCaseTitle = (caseItem) => {
    const orderNumber = caseItem.orderNumber || caseItem.title || "";
    const main = getMainCategoryLabel(caseItem.mainCategory);
    const sub = getSubCategoryLabel(caseItem.subCategory);

    return `${orderNumber} — ${main} / ${sub}`;
  };

  const getCaseDisplayNumber = (caseItem) => {
    return caseItem.orderNumber || caseItem.title || "—";
  };

  const getFamiliesCount = (caseItem) => {
    if (typeof caseItem.familiesCount === "number") return caseItem.familiesCount;
    if (typeof caseItem.totalFamilies === "number") return caseItem.totalFamilies;
    if (typeof caseItem.stats?.totalFamilies === "number") {
      return caseItem.stats.totalFamilies;
    }
    if (Array.isArray(caseItem.families)) return caseItem.families.length;

    return "—";
  };

  const getRemainingContracts = (caseItem) => {
    if (typeof caseItem.stats?.remainingContracts === "number") {
      return caseItem.stats.remainingContracts;
    }

    if (typeof caseItem.stats?.activeFamilies === "number") {
      return caseItem.stats.activeFamilies;
    }

    if (Array.isArray(caseItem.families)) {
      return caseItem.families.filter(
        (family) => family.isActive && !family.isSigned
      ).length;
    }

    return "—";
  };

  const getAssignedOperatorId = (caseItem) => {
    if (caseItem.assignedOperatorId) return caseItem.assignedOperatorId;
    if (caseItem.assignedOperator?.id) return caseItem.assignedOperator.id;

    if (Array.isArray(caseItem.assignedOperators) && caseItem.assignedOperators.length === 1) {
      return caseItem.assignedOperators[0].id;
    }

    return null;
  };

  const getAssignedOperatorIds = (caseItem) => {
    const ids = [];

    if (Array.isArray(caseItem.assignedOperators)) {
      caseItem.assignedOperators.forEach((operator) => {
        if (operator?.id) {
          ids.push(String(operator.id));
        }
      });
    }

    if (caseItem.assignedOperator?.id) {
      ids.push(String(caseItem.assignedOperator.id));
    }

    if (caseItem.assignedOperatorId) {
      ids.push(String(caseItem.assignedOperatorId));
    }

    return Array.from(new Set(ids));
  };

  const isLegalizationCase = (caseItem) => {
    return isLegalizationSubCategory(caseItem?.subCategory);
  };

  const toggleAssignOperatorId = (operatorId) => {
    const value = String(operatorId);

    setAssignForm((prev) => {
      const currentIds = Array.isArray(prev.operatorIds)
        ? prev.operatorIds
        : [];

      const exists = currentIds.includes(value);

      return {
        ...prev,
        operatorIds: exists
          ? currentIds.filter((item) => item !== value)
          : [...currentIds, value],
      };
    });
  };

  const getAssignedOperatorName = (caseItem) => {
    if (caseItem.hasMixedOperators) {
      return "გადაცემულია რამდენიმე ოპერატორზე";
    }

    if (caseItem.assignedOperator?.fullName || caseItem.assignedOperator?.username) {
      return caseItem.assignedOperator.fullName || caseItem.assignedOperator.username;
    }

    if (Array.isArray(caseItem.assignedOperators) && caseItem.assignedOperators.length === 1) {
      const operator = caseItem.assignedOperators[0];
      return operator.fullName || operator.username || `ID: ${operator.id}`;
    }

    const operatorId = getAssignedOperatorId(caseItem);

    if (!operatorId) return "არ არის გადაცემული";

    const operator = operators.find((item) => item.id === operatorId);

    return operator?.fullName || operator?.username || `ID: ${operatorId}`;
  };

  const isCaseAssigned = (caseItem) => {
    if (caseItem.hasMixedOperators) return true;
    if (getAssignedOperatorId(caseItem)) return true;
    if (Array.isArray(caseItem.assignedOperators) && caseItem.assignedOperators.length > 0) {
      return true;
    }

    return false;
  };

  const canAssignCase = (caseItem) => {
    return !caseItem.isClosed && !caseItem.isCancelled;
  };

  const canCancelCase = (caseItem) => {
    if (caseItem.isClosed || caseItem.isCancelled) return false;

    if (typeof caseItem.canCancel === "boolean") {
      return caseItem.canCancel;
    }

    const totalFamilies = getFamiliesCount(caseItem);
    const signedFamilies = caseItem.stats?.signedFamilies || 0;
    const cancelledFamilies = caseItem.stats?.cancelledFamilies || 0;

    return (
      typeof totalFamilies === "number" &&
      totalFamilies > 0 &&
      signedFamilies === 0 &&
      cancelledFamilies === 0
    );
  };

  const getCaseStatusLabel = (caseItem) => {
    if (caseItem.isCancelled) return "გაუქმებული";
    if (caseItem.isClosed) return "დასრულებული";
    return "აქტიური";
  };

  const getCaseStatusClass = (caseItem) => {
    if (caseItem.isCancelled) return "cancelled";
    if (caseItem.isClosed) return "closed";
    return "active";
  };

  const formatDate = (value) => {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString("ka-GE");
  };

  const openAssignModal = (caseItem) => {
    if (!canAssignCase(caseItem)) return;

    const assignedOperatorIds = getAssignedOperatorIds(caseItem);
    const fallbackOperatorId =
      assignedOperatorIds[0] ||
      (operators[0]?.id ? String(operators[0].id) : "");

    const legalizationCase = isLegalizationCase(caseItem);

    setAssignForm({
      caseId: caseItem.id,
      caseTitle: getCaseTitle(caseItem),
      caseSubCategory: caseItem.subCategory || "",
      mode:
        legalizationCase && assignedOperatorIds.length > 1
          ? "multiple"
          : "single",
      operatorId: fallbackOperatorId,
      operatorIds:
        assignedOperatorIds.length > 0
          ? assignedOperatorIds
          : fallbackOperatorId
            ? [fallbackOperatorId]
            : [],
    });

    setAssignModalOpen(true);
  };

  const closeAssignModal = () => {
    if (assigning) return;
    setAssignModalOpen(false);
  };

  const assignCase = async () => {
    if (!assignForm.caseId) {
      showToast("ვერ მოიძებნა.", "error");
      return;
    }

    const isMultipleMode =
      assignForm.mode === "multiple" &&
      isLegalizationSubCategory(assignForm.caseSubCategory);

    const selectedOperatorIds = Array.from(
      new Set(
        (assignForm.operatorIds || [])
          .map((value) => Number.parseInt(value, 10))
          .filter((value) => Number.isInteger(value) && value > 0)
      )
    );

    if (isMultipleMode) {
      if (selectedOperatorIds.length < 2) {
        showToast("რამდენიმე ოპერატორზე გადაცემისთვის აირჩიე მინიმუმ 2 ოპერატორი.", "error");
        return;
      }
    } else if (!assignForm.operatorId) {
      showToast("აირჩიე ოპერატორი.", "error");
      return;
    }

    setAssigning(true);

    try {
      if (isMultipleMode) {
        const response = await api.patch(
          `/cases/${assignForm.caseId}/assign-operators`,
          {
            operatorIds: selectedOperatorIds,
          }
        );

        await loadCases({ silent: true });

        setAssignModalOpen(false);

        showToast(
          response.data?.distributedFamilies
            ? `ქეისი გადაეცა რამდენიმე ოპერატორს. გადანაწილდა ${response.data.distributedFamilies} ოჯახი.`
            : "ქეისი გადაეცა რამდენიმე ოპერატორს."
        );

        return;
      }

      await api.patch(`/cases/${assignForm.caseId}/assign-operator`, {
        operatorId: Number(assignForm.operatorId),
      });

      await loadCases({ silent: true });

      setAssignModalOpen(false);
      showToast("ბრძანება/განკარგულება ოპერატორს გადაეცა.");
    } catch (err) {
      showToast(
        err.response?.data?.message || "ოპერატორზე გადაცემა ვერ მოხერხდა.",
        "error"
      );
    } finally {
      setAssigning(false);
    }
  };

  const openCancelModal = (caseItem) => {
    if (!canCancelCase(caseItem)) return;

    setCancelForm({
      caseId: caseItem.id,
      caseTitle: getCaseTitle(caseItem),
    });

    setCancelModalOpen(true);
  };

  const closeCancelModal = () => {
    if (cancelling) return;
    setCancelModalOpen(false);
  };

  const cancelCase = async () => {
    if (!cancelForm.caseId) {
      showToast("ქეისი ვერ მოიძებნა.", "error");
      return;
    }

    setCancelling(true);

    try {
      await api.patch(`/cases/${cancelForm.caseId}/cancel`);

      await loadCases({ silent: true });

      setCancelModalOpen(false);
      showToast("ქეისი გაუქმდა.");
    } catch (err) {
      showToast(
        err.response?.data?.message || "ქეისის გაუქმება ვერ მოხერხდა.",
        "error"
      );
    } finally {
      setCancelling(false);
    }
  };

  const openDetailsModal = async (caseItem) => {
  setDetailsModalOpen(true);
  setSelectedCase(null);
  setDetailsLoading(true);

  try {
    const response = await api.get(`/cases/${caseItem.id}`);
    setSelectedCase(response.data);
  } catch (err) {
    showToast(
      err.response?.data?.message || "ბრძანების დეტალების მიღება ვერ მოხერხდა.",
      "error"
    );
    setDetailsModalOpen(false);
  } finally {
    setDetailsLoading(false);
  }
};

const closeDetailsModal = () => {
  setDetailsModalOpen(false);
  setSelectedCase(null);
};

const getFamilyStatusLabel = (family) => {
  if (!family.isActive) return "გაუქმებული";
  if (family.isSigned) return "გაფორმებული";
  return "გასაფორმებელი";
};

const getFamilyStatusClass = (family) => {
  if (!family.isActive) return "cancelled";
  if (family.isSigned) return "closed";
  return "active";
};

const getFamilyOperatorName = (family) => {
  const operator = family.assignedOperator;

  if (!operator) return "არ არის გადაცემული";

  return operator.fullName || operator.username || `ID: ${family.assignedOperatorId}`;
};

const getFamilyMembersCount = (family) => {
  if (Array.isArray(family.members)) return family.members.length;
  return "—";
};

const getFamilySellerName = (family) => {
  if (family.seller?.fullName) return family.seller.fullName;
  if (Array.isArray(family.sellers) && family.sellers[0]?.fullName) {
    return family.sellers[0].fullName;
  }

  return "—";
};

const getFamilyPropertyText = (family) => {
  const address = family.property?.address || "";
  const cadastral = family.property?.cadastralCode || "";

  if (!address && !cadastral) return "—";

  return [address, cadastral].filter(Boolean).join(" / ");
};

const canAssignFamily = (family) => {
  if (!selectedCase) return false;
  if (selectedCase.isClosed || selectedCase.isCancelled) return false;
  if (!family.isActive || family.isSigned) return false;

  return true;
};

const reloadSelectedCase = async (caseId) => {
  const response = await api.get(`/cases/${caseId}`);
  setSelectedCase(response.data);
};

const openFamilyAssignModal = (family) => {
  if (!canAssignFamily(family)) return;

  setFamilyAssignForm({
    familyId: family.id,
    caseId: selectedCase?.id || null,
    familyTitle: `${family.rowNumber || "—"} — ${
      family.primaryPersonFullName || "ოჯახი"
    }`,
    operatorId: family.assignedOperatorId
      ? String(family.assignedOperatorId)
      : operators[0]?.id
        ? String(operators[0].id)
        : "",
  });

  setFamilyAssignModalOpen(true);
};

const closeFamilyAssignModal = () => {
  if (familyAssigning) return;

  setFamilyAssignModalOpen(false);
};

const assignFamily = async () => {
  if (!familyAssignForm.familyId) {
    showToast("ოჯახი ვერ მოიძებნა.", "error");
    return;
  }

  if (!familyAssignForm.operatorId) {
    showToast("აირჩიე ოპერატორი.", "error");
    return;
  }

  setFamilyAssigning(true);

  try {
    await api.patch(
      `/cases/families/${familyAssignForm.familyId}/assign-operator`,
      {
        operatorId: Number(familyAssignForm.operatorId),
      }
    );

    if (familyAssignForm.caseId) {
      await reloadSelectedCase(familyAssignForm.caseId);
    }

    await loadCases({ silent: true });

    setFamilyAssignModalOpen(false);
    showToast("ოჯახი ოპერატორს გადაეცა.");
  } catch (err) {
    showToast(
      err.response?.data?.message || "ოჯახის ოპერატორზე გადაცემა ვერ მოხერხდა.",
      "error"
    );
  } finally {
    setFamilyAssigning(false);
  }
};

  const activeCasesCount = cases.filter(
    (item) => !item.isClosed && !item.isCancelled
  ).length;

  const closedCasesCount = cases.filter((item) => item.isClosed).length;
  const cancelledCasesCount = cases.filter((item) => item.isCancelled).length;

  return (
    <AppLayout>
      {toast && (
        <div className={`floating-toast ${toast.type}`}>
          {toast.type === "success" ? (
            <CheckCircle size={18} />
          ) : (
            <AlertCircle size={18} />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="page-header">
        <div>
          <h2>მენეჯერის სამუშაო სივრცე</h2>
        </div>

        <button type="button" className="primary-button" onClick={openCreateModal}>
          <FilePlus2 size={17} />
          ახალი ბრძანების/განკარგულების დამატება
        </button>
      </div>

      <section className="manager-stats-grid">
        <div className="mini-stat-card">
          <span>სულ ბრძანებები/განკარგულებები</span>
          <strong>{loading ? "..." : cases.length}</strong>
        </div>

        <div className="mini-stat-card">
          <span>აქტიური</span>
          <strong>{loading ? "..." : activeCasesCount}</strong>
        </div>

        <div className="mini-stat-card">
          <span>დასრულებული</span>
          <strong>{loading ? "..." : closedCasesCount}</strong>
        </div>

        <div className="mini-stat-card">
          <span>გაუქმებული</span>
          <strong>{loading ? "..." : cancelledCasesCount}</strong>
        </div>
      </section>

      <section className="page-card section-card">
        <div className="section-title">
          <div className="section-title-left">
            <FolderOpen size={19} />
            <h3>სრული სია</h3>
          </div>

          <span className="muted-text">
            {loading ? "იტვირთება..." : `${cases.length} ბრძანება/განკარგულება`}
          </span>
        </div>

        <div className="table-wrapper">
          <table className="data-table cases-table">
            <thead>
              <tr>
                <th>ბრძანების ნომერი</th>
                <th>მიმართულება</th>
                <th>პროგრამა</th>
                <th>ოჯახები</th>
                <th>დარჩენილი</th>
                <th>ოპერატორი</th>
                <th>სტატუსი</th>
                <th>შექმნის თარიღი</th>
                <th>მოქმედება</th>
              </tr>
            </thead>

            <tbody>
              {paginatedCases.map((caseItem) => (
                <tr key={caseItem.id}>
                  <td>
                    <span className="table-main-text">
                      {getCaseDisplayNumber(caseItem)}
                    </span>
                  </td>

                  <td>
                    <span className="table-secondary-text">
                      {getMainCategoryLabel(caseItem.mainCategory)}
                    </span>
                  </td>

                  <td>
                    <span className="table-secondary-text">
                      {getSubCategoryLabel(caseItem.subCategory)}
                    </span>
                  </td>

                  <td>
                    <span className="count-badge">{getFamiliesCount(caseItem)}</span>
                  </td>

                  <td>
                    <span className="remaining-badge">
                      {getRemainingContracts(caseItem)}
                    </span>
                  </td>

                  <td>
                    <span
                      className={
                        isCaseAssigned(caseItem)
                          ? "assignment-text assigned"
                          : "assignment-text"
                      }
                    >
                      {getAssignedOperatorName(caseItem)}
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

                  <td>
                    <span className="table-secondary-text">
                      {formatDate(caseItem.createdAt)}
                    </span>
                  </td>
                  <td className="actions-column">
                    <div className="table-actions-group">
                      <button
                        type="button"
                        className="small-secondary-button"
                        onClick={() => openDetailsModal(caseItem)}
                      >
                        <Eye size={15} />
                        ნახვა
                      </button>

                      <button
                        type="button"
                        className="small-secondary-button"
                        onClick={() => openAssignModal(caseItem)}
                        disabled={!canAssignCase(caseItem)}
                        title={
                          !canAssignCase(caseItem)
                            ? "დასრულებული ან გაუქმებული ქეისის გადაცემა შეუძლებელია"
                            : isLegalizationCase(caseItem)
                              ? "დაკანონების ქეისი შეიძლება გადაეცეს რამდენიმე ოპერატორს"
                              : ""
                        }
                      >
                        <Send size={15} />
                        გადაცემა
                      </button>

                      <button
                        type="button"
                        className="small-danger-button"
                        onClick={() => openCancelModal(caseItem)}
                        disabled={!canCancelCase(caseItem)}
                        title={
                          !canCancelCase(caseItem)
                            ? "გაუქმება შესაძლებელია მხოლოდ მაშინ, როცა არცერთი ხელშეკრულება არ არის გაფორმებული ან გაუქმებული"
                            : ""
                        }
                      >
                        <Trash2 size={14} />
                        გაუქმება
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && sortedCases.length === 0 && (
                <tr>
                  <td colSpan="9" className="empty-table-cell">
                    ბრძანება/განკარგულება ჯერ არ არის შექმნილი.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {sortedCases.length > PAGE_SIZE && (
          <div className="pagination-bar">
            <div className="pagination-info">
              გვერდი {safeCurrentPage} / {totalPages}
            </div>

            <div className="pagination-actions">
              <button
                type="button"
                className="pagination-button"
                onClick={() =>
                  setCurrentPage((prev) => Math.max(1, prev - 1))
                }
                disabled={safeCurrentPage === 1}
              >
                წინა
              </button>

              <button
                type="button"
                className="pagination-button"
                onClick={() =>
                  setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                }
                disabled={safeCurrentPage === totalPages}
              >
                შემდეგი
              </button>
            </div>
          </div>
        )}
      </section>

      {createModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card manager-modal">
            <div className="modal-header">
              <div>
                <h3>ახალი საქმის შექმნა</h3>
                <p>აირჩიე მიმართულება და ატვირთე ბრძანება/დანართი.</p>
              </div>

              <button
                type="button"
                className="modal-close-button"
                onClick={closeCreateModal}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={createCase}>
              <div className="modal-body">
                <div className="form-grid two">
                  <label>
                    მიმართულება
                    <select
                      name="mainCategory"
                      value={createForm.mainCategory}
                      onChange={handleCreateChange}
                    >
                      <option value="">აირჩიე მიმართულება</option>
                      {mainCategoryOptions.map((category) => (
                        <option key={category.value} value={category.value}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    პროგრამა
                    <select
                      name="subCategory"
                      value={createForm.subCategory}
                      onChange={handleCreateChange}
                      disabled={!createForm.mainCategory}
                    >
                      <option value="">
                        {createForm.mainCategory ? "აირჩიე ქვეპროგრამა" : "ჯერ აირჩიე მიმართულება"}
                      </option>

                      {availableSubCategories.map((category) => (
                        <option key={category.value} value={category.value}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    ბრძანების ნომერი / ქეისის სახელი
                    <input
                      name="orderNumber"
                      value={createForm.orderNumber}
                      onChange={handleCreateChange}
                    />
                  </label>

                  <label>
                    ბრძანების თარიღი
                    <input
                      name="orderDate"
                      type="date"
                      value={createForm.orderDate}
                      onChange={handleCreateChange}
                    />
                  </label>
                </div>

                <div className="upload-grid" key={fileInputKey}>
                  <label className="upload-box">
                    <UploadCloud size={22} />
                    <strong>ბრძანების PDF</strong>
                    <span>
                      {createForm.orderPdf
                        ? createForm.orderPdf.name
                        : "აირჩიე PDF ფაილი"}
                    </span>
                    <input
                      name="orderPdf"
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={handleCreateChange}
                    />
                  </label>

                  <label className="upload-box">
                    <UploadCloud size={22} />
                    <strong>დანართის Excel</strong>
                    <span>
                      {createForm.annexExcel
                        ? createForm.annexExcel.name
                        : "აირჩიე Excel ფაილი"}
                    </span>
                    <input
                      name="annexExcel"
                      type="file"
                      accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                      onChange={handleCreateChange}
                    />
                  </label>
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeCreateModal}
                  disabled={creating}
                >
                  გაუქმება
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={
                    creating ||
                    !createForm.mainCategory ||
                    !createForm.subCategory ||
                    !createForm.orderNumber.trim() ||
                    !createForm.orderDate ||
                    !createForm.orderPdf ||
                    !createForm.annexExcel
                  }
                >
                  <FilePlus2 size={16} />
                  {creating ? "იქმნება..." : "საქმის შექმნა"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {assignModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card manager-assign-modal">
            <div className="modal-header">
              <div>
                <h3>საქმის ოპერატორზე გადაცემა</h3>
                <p>{assignForm.caseTitle}</p>
              </div>

              <button
                type="button"
                className="modal-close-button"
                onClick={closeAssignModal}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {isLegalizationSubCategory(assignForm.caseSubCategory) && (
                <div className="assign-mode-switch">
                  <button
                    type="button"
                    className={
                      assignForm.mode === "single"
                        ? "assign-mode-button active"
                        : "assign-mode-button"
                    }
                    onClick={() =>
                      setAssignForm((prev) => ({
                        ...prev,
                        mode: "single",
                      }))
                    }
                    disabled={assigning}
                  >
                    ერთ ოპერატორზე
                  </button>

                  <button
                    type="button"
                    className={
                      assignForm.mode === "multiple"
                        ? "assign-mode-button active"
                        : "assign-mode-button"
                    }
                    onClick={() =>
                      setAssignForm((prev) => ({
                        ...prev,
                        mode: "multiple",
                        operatorIds:
                          prev.operatorIds?.length > 0
                            ? prev.operatorIds
                            : prev.operatorId
                              ? [prev.operatorId]
                              : [],
                      }))
                    }
                    disabled={assigning}
                  >
                    რამდენიმე ოპერატორზე
                  </button>
                </div>
              )}

              {assignForm.mode === "multiple" &&
              isLegalizationSubCategory(assignForm.caseSubCategory) ? (
                <div className="multi-operator-box">
                  <div className="multi-operator-header">
                    <strong>ოპერატორები</strong>
                    <span>არჩეულია {assignForm.operatorIds.length}</span>
                  </div>

                  <div className="operator-checkbox-list">
                    {operators.map((operator) => {
                      const operatorId = String(operator.id);
                      const checked = assignForm.operatorIds.includes(operatorId);

                      return (
                        <label className="operator-checkbox-row" key={operator.id}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAssignOperatorId(operator.id)}
                            disabled={assigning}
                          />

                          <span>
                            <strong>{operator.fullName || operator.username}</strong>
                            {operator.fullName && operator.username && (
                              <small>{operator.username}</small>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  <p className="field-hint">
                    სისტემა სრულ სიას თანაბრად გადაანაწილებს არჩეულ ოპერატორებზე.
                    აირჩიე მინიმუმ 2 ოპერატორი.
                  </p>
                </div>
              ) : (
                <label className="single-field-label">
                  ოპერატორი
                  <select
                    value={assignForm.operatorId}
                    onChange={(event) =>
                      setAssignForm((prev) => ({
                        ...prev,
                        operatorId: event.target.value,
                        operatorIds: event.target.value ? [event.target.value] : [],
                      }))
                    }
                  >
                    <option value="">აირჩიე ოპერატორი</option>
                    {operators.map((operator) => (
                      <option key={operator.id} value={operator.id}>
                        {operator.fullName || operator.username}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {operators.length === 0 && (
                <p className="field-hint">
                  სისტემაში აქტიური ოპერატორი არ მოიძებნა.
                </p>
              )}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeAssignModal}
                disabled={assigning}
              >
                გაუქმება
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={assignCase}
                disabled={
                  assigning ||
                  operators.length === 0 ||
                  (assignForm.mode === "multiple" &&
                  isLegalizationSubCategory(assignForm.caseSubCategory)
                    ? assignForm.operatorIds.length < 2
                    : !assignForm.operatorId)
                }
              >
                <Send size={16} />
                {assigning
                  ? "იგზავნება..."
                  : assignForm.mode === "multiple" &&
                      isLegalizationSubCategory(assignForm.caseSubCategory)
                    ? "გადანაწილება"
                    : "გადაცემა"}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card manager-assign-modal">
            <div className="modal-header">
              <div>
                <h3>ქეისის გაუქმება</h3>
                <p>{cancelForm.caseTitle}</p>
              </div>

              <button
                type="button"
                className="modal-close-button"
                onClick={closeCancelModal}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="danger-note">
                ქეისის გაუქმების შემდეგ ის აღარ გამოჩნდება ოპერატორის სამუშაო
                სიაში. გაუქმება შესაძლებელია მხოლოდ იმ შემთხვევაში, თუ არცერთი
                ხელშეკრულება არ არის გაფორმებული ან გაუქმებული.
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeCancelModal}
                disabled={cancelling}
              >
                უკან
              </button>

              <button
                type="button"
                className="danger-button"
                onClick={cancelCase}
                disabled={cancelling}
              >
                <Trash2 size={16} />
                {cancelling ? "უქმდება..." : "ქეისის გაუქმება"}
              </button>
            </div>
          </div>
        </div>
      )}
      {detailsModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card manager-details-modal">
            <div className="modal-header">
              <div>
                <h3>ბრძანების დეტალები</h3>
                <p>
                  {selectedCase
                    ? `${selectedCase.orderNumber || selectedCase.title || ""} — ${getMainCategoryLabel(
                        selectedCase.mainCategory
                      )} / ${getSubCategoryLabel(selectedCase.subCategory)}`
                    : "იტვირთება..."}
                </p>
              </div>

              <button
                type="button"
                className="modal-close-button"
                onClick={closeDetailsModal}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {detailsLoading && (
                <div className="details-loading">ბრძანების დეტალები იტვირთება...</div>
              )}

              {!detailsLoading && selectedCase && (
                <>
                  <div className="details-section-title">
                    ოჯახები / ხელშეკრულებები
                  </div>

                  <div className="table-wrapper details-table-wrapper">
                    <table className="data-table family-details-table">
                      <thead>
                        <tr>
                          <th>№</th>
                          <th>ბენეფიციარი</th>
                          <th>პირადი ნომერი</th>
                          <th>წევრები</th>
                          <th>გამყიდველი</th>
                          <th>ქონება</th>
                          <th>თანხა</th>
                          <th>ოპერატორი</th>
                          <th>სტატუსი</th>
                          <th>მოქმედება</th>
                        </tr>
                      </thead>

                      <tbody>
                        {(selectedCase.families || [])
                          .slice()
                          .sort((a, b) => {
                            const aNo = a.rowNumber || a.id;
                            const bNo = b.rowNumber || b.id;
                            return aNo - bNo;
                          })
                          .map((family) => (
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
                                <span className="count-badge">
                                  {getFamilyMembersCount(family)}
                                </span>
                              </td>

                              <td>
                                <span className="table-secondary-text">
                                  {getFamilySellerName(family)}
                                </span>
                              </td>

                              <td>
                                <span className="table-secondary-text">
                                  {getFamilyPropertyText(family)}
                                </span>
                              </td>

                              <td>
                                <span className="table-secondary-text">
                                  {family.purchaseAmountText ||
                                    family.purchaseAmount ||
                                    "—"}
                                </span>
                              </td>

                              <td>
                                <span
                                  className={
                                    family.assignedOperator
                                      ? "assignment-text assigned"
                                      : "assignment-text"
                                  }
                                >
                                  {getFamilyOperatorName(family)}
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

                                <td className="actions-column">
                                  <button
                                    type="button"
                                    className="small-secondary-button family-assign-button"
                                    onClick={() => openFamilyAssignModal(family)}
                                    disabled={!canAssignFamily(family)}
                                    title={
                                      !canAssignFamily(family)
                                        ? "გადაცემა შესაძლებელია მხოლოდ აქტიურ და გასაფორმებელ ოჯახზე"
                                        : ""
                                    }
                                  >
                                    <Send size={14} />
                                    გადაცემა
                                  </button>
                                </td>
                            </tr>
                          ))}

                        {(selectedCase.families || []).length === 0 && (
                          <tr>
                            <td colSpan="10" className="empty-table-cell">
                              ოჯახები ვერ მოიძებნა.
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
                onClick={closeDetailsModal}
              >
                დახურვა
              </button>
            </div>
          </div>
        </div>
      )}
            {familyAssignModalOpen && (
              <div className="modal-backdrop">
                <div className="modal-card manager-assign-modal">
                  <div className="modal-header">
                    <div>
                      <h3>ოჯახის ოპერატორზე გადაცემა</h3>
                      <p>{familyAssignForm.familyTitle}</p>
                    </div>

                    <button
                      type="button"
                      className="modal-close-button"
                      onClick={closeFamilyAssignModal}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="modal-body">
                    <label className="single-field-label">
                      ოპერატორი
                      <select
                        value={familyAssignForm.operatorId}
                        onChange={(event) =>
                          setFamilyAssignForm((prev) => ({
                            ...prev,
                            operatorId: event.target.value,
                          }))
                        }
                      >
                        <option value="">აირჩიე ოპერატორი</option>
                        {operators.map((operator) => (
                          <option key={operator.id} value={operator.id}>
                            {operator.fullName || operator.username}
                          </option>
                        ))}
                      </select>
                    </label>

                    {operators.length === 0 && (
                      <p className="field-hint">
                        სისტემაში აქტიური ოპერატორი არ მოიძებნა.
                      </p>
                    )}
                  </div>

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={closeFamilyAssignModal}
                      disabled={familyAssigning}
                    >
                      გაუქმება
                    </button>

                    <button
                      type="button"
                      className="primary-button"
                      onClick={assignFamily}
                      disabled={familyAssigning}
                    >
                      <Send size={16} />
                      {familyAssigning ? "იგზავნება..." : "გადაცემა"}
                    </button>
                  </div>
                </div>
              </div>
            )}
    </AppLayout>
  );
};

export default ManagerCasesPage;