import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  ClipboardList,
  Filter,
  Search,
  Users,
  X,
} from "lucide-react";

import AppLayout from "../layouts/AppLayout";
import api from "../api/axios";
import {
  getMainCategoryLabel,
  getSubCategoryLabel,
} from "../constants/categories";

const mainCategoryOptions = ["idps", "ecomigrants", "homeless"];

const subCategoryOptionsByMain = {
  idps: [
    "idps_rural_house",
    "idps_admin_promise_purchase",
    "idps_legalization_lawful_possession",
    "idps_legalization_housing_rule",
  ],
  ecomigrants: ["ecomigrant_purchase", "ecomigrant_legalization"],
  homeless: ["homeless_purchase"],
};

const CASES_PAGE_SIZE = 10;
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

  return Array.from({ length: 6 }, (_, index) => String(currentYear - index));
};

const getCleanParams = (params = {}) => {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== "" && value !== null && value !== undefined
    )
  );
};

const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ka-GE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

const getHeadFamilyStatusClass = (family) => {
  if (family?.isSigned) return "signed";
  if (!family?.isActive) return "cancelled";
  return "remaining";
};

const getHeadFamilyStatusLabel = (family) => {
  if (family?.isSigned) return "გაფორმებული";
  if (!family?.isActive) return "გაუქმებული";
  return "გასაფორმებელი";
};

const getPeopleText = (people = []) => {
  if (!Array.isArray(people) || people.length === 0) return "—";

  return people
    .map((person) =>
      [person.fullName, person.personalNumber ? `პ/ნ ${person.personalNumber}` : ""]
        .filter(Boolean)
        .join(" — ")
    )
    .join("; ");
};

const HeadDashboardPage = () => {
  const [dashboard, setDashboard] = useState(null);
  const [operatorOptions, setOperatorOptions] = useState([]);
  const [casesPage, setCasesPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const [familySearchQuery, setFamilySearchQuery] = useState("");
  const [familySearchResults, setFamilySearchResults] = useState([]);
  const [familySearchLoading, setFamilySearchLoading] = useState(false);
  const [familySearchPerformed, setFamilySearchPerformed] = useState(false);

  const [filters, setFilters] = useState({
    year: "",
    month: "",
    mainCategory: "",
    subCategory: "",
    operatorId: "",
  });

  const showError = useCallback((message) => {
    setToast(message);

    window.setTimeout(() => {
      setToast("");
    }, 3500);
  }, []);

  const loadDashboard = useCallback(
    async (nextFilters = filters) => {
      setLoading(true);

      try {
        const response = await api.get("/statistics/head/dashboard", {
          params: getCleanParams(nextFilters),
        });

        setDashboard(response.data);
        setCasesPage(1);

        if (
          operatorOptions.length === 0 &&
          Array.isArray(response.data?.operatorPerformance)
        ) {
          setOperatorOptions(response.data.operatorPerformance);
        }
      } catch (err) {
        showError(
          err.response?.data?.message ||
            "ხელმძღვანელის სტატისტიკის მიღება ვერ მოხერხდა."
        );
      } finally {
        setLoading(false);
      }
    },
    [filters, operatorOptions.length, showError]
  );

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadDashboard();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [loadDashboard]);

  const updateFilter = (field, value) => {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
      ...(field === "year" && !value ? { month: "" } : {}),
      ...(field === "mainCategory" ? { subCategory: "" } : {}),
    }));
  };

  const applyFilters = () => {
    loadDashboard(filters);
  };

  const clearFilters = () => {
    const emptyFilters = {
      year: "",
      month: "",
      mainCategory: "",
      subCategory: "",
      operatorId: "",
    };

    setFilters(emptyFilters);
    loadDashboard(emptyFilters);
  };

  const searchFamilies = async (event) => {
    event?.preventDefault();

    const query = familySearchQuery.trim();

    if (query.length < 2) {
      showError("ძიებისთვის შეიყვანე მინიმუმ 2 სიმბოლო.");
      return;
    }

    setFamilySearchLoading(true);
    setFamilySearchPerformed(true);

    try {
      const response = await api.get("/statistics/head/families/search", {
        params: {
          query,
        },
      });

      setFamilySearchResults(response.data?.results || []);
    } catch (err) {
      showError(
        err.response?.data?.message || "ოჯახის ძიება ვერ მოხერხდა."
      );
    } finally {
      setFamilySearchLoading(false);
    }
  };

  const clearFamilySearch = () => {
    setFamilySearchQuery("");
    setFamilySearchResults([]);
    setFamilySearchPerformed(false);
  };

  const availableSubCategories = filters.mainCategory
    ? subCategoryOptionsByMain[filters.mainCategory] || []
    : [];

  const totals = dashboard?.totals || {};

  const categoryTreeRows = useMemo(() => {
    return mainCategoryOptions.flatMap((mainCategory) => {
      const mainStats = dashboard?.byMainCategory?.[mainCategory] || {
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

      const childRows = (subCategoryOptionsByMain[mainCategory] || [])
        .map((subCategory) => ({
          type: "sub",
          key: subCategory,
          parentKey: mainCategory,
          label: getSubCategoryLabel(subCategory),
          ...(dashboard?.bySubCategory?.[subCategory] || {
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
  }, [dashboard]);

  const operatorRows = Array.isArray(dashboard?.operatorPerformance)
  ? dashboard.operatorPerformance
  : EMPTY_ROWS;

  const monthlyRows = Array.isArray(dashboard?.monthlyReport)
    ? dashboard.monthlyReport
    : EMPTY_ROWS;

  const caseRows = Array.isArray(dashboard?.cases)
    ? dashboard.cases
    : EMPTY_ROWS;

  const totalCasesPages = Math.max(
    1,
    Math.ceil(caseRows.length / CASES_PAGE_SIZE)
  );

  const safeCasesPage = Math.min(casesPage, totalCasesPages);

  const paginatedCaseRows = useMemo(() => {
    const start = (safeCasesPage - 1) * CASES_PAGE_SIZE;
    return caseRows.slice(start, start + CASES_PAGE_SIZE);
  }, [caseRows, safeCasesPage]);

  return (
    <AppLayout>
      {toast && <div className="floating-toast error">{toast}</div>}

      <div className="page-header">
        <div>
          <h2>ხელმძღვანელის სამუშაო სივრცე</h2>
        </div>
      </div>

      <section className="page-card section-card head-filter-card">
        <div className="section-title">
          <div className="section-title-left">
            <Filter size={19} />
            <h3>ფილტრები</h3>
          </div>
        </div>

        <div className="head-filters-grid">
          <label>
            წელი
            <select
              value={filters.year}
              onChange={(event) => updateFilter("year", event.target.value)}
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
              value={filters.month}
              onChange={(event) => updateFilter("month", event.target.value)}
              disabled={!filters.year}
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
              value={filters.mainCategory}
              onChange={(event) =>
                updateFilter("mainCategory", event.target.value)
              }
            >
              <option value="">ყველა</option>
              {mainCategoryOptions.map((category) => (
                <option key={category} value={category}>
                  {getMainCategoryLabel(category)}
                </option>
              ))}
            </select>
          </label>

          <label>
            ქვეპროგრამა
            <select
              value={filters.subCategory}
              onChange={(event) =>
                updateFilter("subCategory", event.target.value)
              }
            >
              <option value="">ყველა</option>
              {availableSubCategories.map((category) => (
                <option key={category} value={category}>
                  {getSubCategoryLabel(category)}
                </option>
              ))}
            </select>
          </label>

          <label>
            ოპერატორი
            <select
              value={filters.operatorId}
              onChange={(event) =>
                updateFilter("operatorId", event.target.value)
              }
            >
              <option value="">ყველა</option>
              {operatorOptions.map((operator) => (
                <option key={operator.operatorId} value={operator.operatorId}>
                  {operator.fullName || operator.username || "ოპერატორი"}
                </option>
              ))}
            </select>
          </label>

          <div className="head-filter-actions">
            <button
              type="button"
              className="primary-button"
              onClick={applyFilters}
              disabled={loading}
            >
              გაფილტვრა
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={clearFilters}
              disabled={loading}
            >
              გასუფთავება
            </button>
          </div>
        </div>
      </section>

      <section className="page-card section-card head-family-search-card">
        <div className="section-title">
          <div className="section-title-left">
            <Search size={19} />
            <h3>ოჯახის ძიება</h3>
          </div>

          <span className="muted-text">
            ძიება მყიდველის ან გამყიდველის სახელით, გვარით ან პირადი ნომრით
          </span>
        </div>

        <form className="head-family-search-form" onSubmit={searchFamilies}>
          <div className="head-family-search-input">
            <Search size={17} />
            <input
              value={familySearchQuery}
              onChange={(event) => setFamilySearchQuery(event.target.value)}
              placeholder="მაგ: გიორგი, ნინო, გვარი ან პირადი ნომერი"
            />
          </div>

          <button
            type="submit"
            className="primary-button"
            disabled={familySearchLoading}
          >
            {familySearchLoading ? "იძებნება..." : "ძებნა"}
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={clearFamilySearch}
            disabled={familySearchLoading}
          >
            <X size={16} />
            გასუფთავება
          </button>
        </form>

        {familySearchPerformed && (
          <div className="head-family-search-results">
            <div className="muted-text">
              ნაპოვნია: {familySearchResults.length}
            </div>

            <div className="table-wrapper">
              <table className="data-table head-family-search-table">
                <thead>
                  <tr>
                    <th>ოჯახი</th>
                    <th>ბრძანება</th>
                    <th>მიმართულება</th>
                    <th>ოპერატორი</th>
                    <th>სტატუსი</th>
                    <th>მყიდველები / ოჯახის წევრები</th>
                    <th>გამყიდველები</th>
                    <th>ქონება</th>
                  </tr>
                </thead>

                <tbody>
                  {familySearchResults.map((family) => (
                    <tr key={family.id}>
                      <td>
                        <span className="table-main-text">
                          {family.primaryPersonFullName || "—"}
                        </span>
                        <span className="table-secondary-text">
                          {family.primaryPersonPersonalNumber
                            ? `პ/ნ ${family.primaryPersonPersonalNumber}`
                            : "პ/ნ —"}
                        </span>
                      </td>

                      <td>
                        <span className="table-main-text">
                          {family.case?.title || `ბრძანება #${family.caseId}`}
                        </span>
                        <span className="table-secondary-text">
                          {family.case?.orderNumber || "ბრძანება —"}
                        </span>
                      </td>

                      <td>
                        <span className="table-main-text">
                          {getMainCategoryLabel(family.case?.mainCategory)}
                        </span>
                        <span className="table-secondary-text">
                          {getSubCategoryLabel(family.case?.subCategory)}
                        </span>
                      </td>

                      <td>
                        {family.assignedOperator ? (
                          <>
                            <span className="table-main-text">
                              {family.assignedOperator.fullName || "—"}
                            </span>
                            <span className="table-secondary-text">
                              {family.assignedOperator.username || "—"}
                            </span>
                          </>
                        ) : (
                          <span className="not-assigned-text">
                            არ არის დელეგირებული
                          </span>
                        )}
                      </td>

                      <td>
                        <span
                          className={`head-family-status ${getHeadFamilyStatusClass(
                            family
                          )}`}
                        >
                          {family.statusLabel || getHeadFamilyStatusLabel(family)}
                        </span>
                      </td>

                      <td>
                        <span className="people-list-text">
                          {getPeopleText(family.members)}
                        </span>
                      </td>

                      <td>
                        <span className="people-list-text">
                          {getPeopleText(family.sellers)}
                        </span>
                      </td>

                      <td>
                        <span className="table-main-text">
                          {family.property?.cadastralCode || "—"}
                        </span>
                        <span className="table-secondary-text">
                          {family.property?.address || "მისამართი —"}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {familySearchResults.length === 0 && (
                    <tr>
                      <td colSpan="8" className="empty-table-cell">
                        ამ მონაცემით ოჯახი ვერ მოიძებნა.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {loading && <div className="details-loading">სტატისტიკა იტვირთება...</div>}

      {!loading && (
        <>
          <div className="head-stats-grid">
            <div className="mini-stat-card">
              <span>სულ ბრძანებები</span>
              <strong>{totals.totalCases ?? 0}</strong>
            </div>

            <div className="mini-stat-card">
              <span>აქტიური ბრძანებები</span>
              <strong>{totals.activeCases ?? 0}</strong>
            </div>

            <div className="mini-stat-card">
              <span>დახურული ბრძანებები</span>
              <strong>{totals.closedCases ?? 0}</strong>
            </div>

            <div className="mini-stat-card">
              <span>სულ ოჯახები</span>
              <strong>{totals.totalFamilies ?? 0}</strong>
            </div>

            <div className="mini-stat-card">
              <span>დელეგირებული</span>
              <strong>{totals.delegatedFamilies ?? 0}</strong>
            </div>

            <div className="mini-stat-card">
              <span>დასადელეგირებელი</span>
              <strong>{totals.notDelegatedFamilies ?? 0}</strong>
            </div>

            <div className="mini-stat-card success-stat">
              <span>გაფორმებული</span>
              <strong>{totals.signedFamilies ?? 0}</strong>
            </div>

            <div className="mini-stat-card danger-stat">
              <span>გაუქმებული</span>
              <strong>{totals.cancelledFamilies ?? 0}</strong>
            </div>

            <div className="mini-stat-card new-stat">
              <span>დარჩენილი</span>
              <strong>{totals.remainingFamilies ?? 0}</strong>
            </div>
          </div>

          <section className="page-card section-card head-table-card">
            <div className="section-title">
              <div className="section-title-left">
                <Building2 size={19} />
                <h3>მიმართულებები და ქვეპროგრამები</h3>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="data-table head-category-tree-table">
                <thead>
                  <tr>
                    <th>დასახელება</th>
                    <th>სულ</th>
                    <th>გაფორმდა</th>
                    <th>გაუქმდა</th>
                    <th>დარჩა</th>
                  </tr>
                </thead>

                <tbody>
                  {categoryTreeRows.map((row) => (
                    <tr
                      key={row.key}
                      className={
                        row.type === "main"
                          ? "head-category-parent-row"
                          : "head-category-child-row"
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
          </section>

          <section className="page-card section-card">
            <div className="section-title">
              <div className="section-title-left">
                <Users size={19} />
                <h3>ოპერატორების შესრულება</h3>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="data-table head-operator-table">
                <thead>
                  <tr>
                    <th>ოპერატორი</th>
                    <th>Username</th>
                    <th>სულ</th>
                    <th>გაფორმდა</th>
                    <th>გაუქმდა</th>
                    <th>დარჩა</th>
                  </tr>
                </thead>

                <tbody>
                  {operatorRows.map((operator) => (
                    <tr key={operator.operatorId}>
                      <td>
                        <span className="table-main-text">
                          {operator.fullName || "—"}
                        </span>
                      </td>
                      <td>{operator.username || "—"}</td>
                      <td>{operator.totalFamilies}</td>
                      <td>{operator.signedFamilies}</td>
                      <td>{operator.cancelledFamilies}</td>
                      <td>{operator.remainingFamilies}</td>
                    </tr>
                  ))}

                  {operatorRows.length === 0 && (
                    <tr>
                      <td colSpan="6" className="empty-table-cell">
                        ოპერატორების მონაცემი არ არის.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="page-card section-card">
            <div className="section-title">
              <div className="section-title-left">
                <CalendarDays size={19} />
                <h3>თვიური ანგარიში</h3>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="data-table head-monthly-table">
                <thead>
                  <tr>
                    <th>წელი/თვე</th>
                    <th>გაფორმდა</th>
                    <th>გაუქმდა</th>
                  </tr>
                </thead>

                <tbody>
                  {monthlyRows.map((row) => (
                    <tr key={row.yearMonth}>
                      <td>{row.yearMonth}</td>
                      <td>{row.signedFamilies}</td>
                      <td>{row.cancelledFamilies}</td>
                    </tr>
                  ))}

                  {monthlyRows.length === 0 && (
                    <tr>
                      <td colSpan="3" className="empty-table-cell">
                        თვიური მონაცემი არ არის.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="page-card section-card">
            <div className="section-title">
              <div className="section-title-left">
                <ClipboardList size={19} />
                <h3>ბრძანებების საერთო მდგომარეობა</h3>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="data-table head-cases-table">
                <thead>
                  <tr>
                    <th>ბრძანება</th>
                    <th>თარიღი</th>
                    <th>მიმართულება</th>
                    <th>ქვეპროგრამა</th>
                    <th>სტატუსი</th>
                    <th>სულ</th>
                    <th>დელეგ.</th>
                    <th>გაფორმდა</th>
                    <th>გაუქმდა</th>
                    <th>დარჩა</th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedCaseRows.map((item) => (
                    <tr key={item.id}>
                      <td>{item.orderNumber || "—"}</td>
                      <td>{formatDate(item.orderDate)}</td>
                      <td>{getMainCategoryLabel(item.mainCategory)}</td>
                      <td>{getSubCategoryLabel(item.subCategory)}</td>
                      <td>
                        <span
                          className={`case-status-badge ${
                            item.isClosed ? "closed" : "active"
                          }`}
                        >
                          {item.isClosed ? "დახურული" : "აქტიური"}
                        </span>
                      </td>
                      <td>{item.stats?.totalFamilies ?? 0}</td>
                      <td>{item.stats?.delegatedFamilies ?? 0}</td>
                      <td>{item.stats?.signedFamilies ?? 0}</td>
                      <td>{item.stats?.cancelledFamilies ?? 0}</td>
                      <td>{item.stats?.remainingFamilies ?? 0}</td>
                    </tr>
                  ))}

                  {caseRows.length === 0 && (
                    <tr>
                      <td colSpan="10" className="empty-table-cell">
                        ბრძანების მონაცემი არ არის.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {caseRows.length > CASES_PAGE_SIZE && (
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
        </>
      )}
    </AppLayout>
  );
};

export default HeadDashboardPage;