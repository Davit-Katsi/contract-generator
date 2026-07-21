import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  Edit3,
  Save,
  UserPlus,
  X,
} from "lucide-react";
import AppLayout from "../layouts/AppLayout";
import api from "../api/axios";

const roleOptions = [
  { value: "admin", label: "ადმინისტრატორი" },
  { value: "manager", label: "მენეჯერი" },
  { value: "operator", label: "ოპერატორი" },
  { value: "head", label: "ხელმძღვანელი" },
];

const getRoleLabel = (role) => {
  return roleOptions.find((item) => item.value === role)?.label || role;
};

const fetchUsers = async () => {
  const response = await api.get("/admin/users");
  return response.data || [];
};

const AdminUsersPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [modalNotice, setModalNotice] = useState(null);

  const toastTimerRef = useRef(null);
  const modalTimerRef = useRef(null);

  const [createForm, setCreateForm] = useState({
    fullName: "",
    username: "",
    password: "",
    role: "operator",
    authorizedPersonFullName: "",
    authorizedPersonPersonalNumber: "",
    authorizedPersonPosition: "",
  });

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    id: null,
    fullName: "",
    username: "",
    password: "",
    role: "operator",
    isActive: true,
    authorizedPersonFullName: "",
    authorizedPersonPersonalNumber: "",
    authorizedPersonPosition: "",
  });

  const activeAdminCount = useMemo(() => {
    return users.filter((user) => user.role === "admin" && user.isActive).length;
  }, [users]);

  const showToast = useCallback((message, type = "success") => {
    clearTimeout(toastTimerRef.current);

    setToast({
      message,
      type,
    });

    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 2600);
  }, []);

  const showModalNotice = useCallback((message, type = "success") => {
    clearTimeout(modalTimerRef.current);

    setModalNotice({
      message,
      type,
    });

    modalTimerRef.current = setTimeout(() => {
      setModalNotice(null);
    }, 2200);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadInitialUsers = async () => {
      try {
        const list = await fetchUsers();

        if (!isMounted) return;

        setUsers(list);
      } catch (err) {
        if (!isMounted) return;

        showToast(
          err.response?.data?.message ||
            "მომხმარებლების სიის მიღება ვერ მოხერხდა.",
          "error"
        );
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadInitialUsers();

    return () => {
      isMounted = false;
      clearTimeout(toastTimerRef.current);
      clearTimeout(modalTimerRef.current);
    };
  }, [showToast]);

  const loadUsers = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      const list = await fetchUsers();
      setUsers(list);
    } catch (err) {
      showToast(
        err.response?.data?.message ||
          "მომხმარებლების სიის მიღება ვერ მოხერხდა.",
        "error"
      );
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const handleCreateChange = (event) => {
    const { name, value } = event.target;

    setCreateForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const createUser = async (event) => {
    event.preventDefault();

    if (!createForm.fullName.trim()) {
      showToast("შეიყვანე სახელი და გვარი.", "error");
      return;
    }

    if (!createForm.username.trim()) {
      showToast("შეიყვანე მომხმარებლის სახელი.", "error");
      return;
    }

    if (!createForm.password.trim()) {
      showToast("შეიყვანე პაროლი.", "error");
      return;
    }

    setCreating(true);

    try {
      await api.post("/admin/users", {
        fullName: createForm.fullName.trim(),
        username: createForm.username.trim(),
        password: createForm.password,
        role: createForm.role,
        authorizedPersonFullName: createForm.authorizedPersonFullName.trim(),
        authorizedPersonPersonalNumber:
          createForm.authorizedPersonPersonalNumber.trim(),
        authorizedPersonPosition: createForm.authorizedPersonPosition.trim(),
      });

      setCreateForm({
        fullName: "",
        username: "",
        password: "",
        role: "operator",
        authorizedPersonFullName: "",
        authorizedPersonPersonalNumber: "",
        authorizedPersonPosition: "",
      });

      await loadUsers({ silent: true });
      showToast("მომხმარებელი წარმატებით შეიქმნა.");
    } catch (err) {
      showToast(
        err.response?.data?.message || "მომხმარებლის შექმნა ვერ მოხერხდა.",
        "error"
      );
    } finally {
      setCreating(false);
    }
  };

  const isLastActiveAdmin = (user) => {
    return user.role === "admin" && user.isActive && activeAdminCount <= 1;
  };

  const openEditModal = (user) => {
    setModalNotice(null);

    setEditForm({
      id: user.id,
      fullName: user.fullName || "",
      username: user.username || "",
      password: "",
      role: user.role || "operator",
      isActive: Boolean(user.isActive),
      authorizedPersonFullName: user.authorizedPersonFullName || "",
      authorizedPersonPersonalNumber: user.authorizedPersonPersonalNumber || "",
      authorizedPersonPosition: user.authorizedPersonPosition || "",
    });

    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setModalNotice(null);
  };

  const handleEditChange = (field, value) => {
    setEditForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const wouldLeaveNoActiveAdmin = (originalUser, nextRole, nextIsActive) => {
    const currentlyActiveAdmin =
      originalUser.role === "admin" && originalUser.isActive === true;

    const willBeActiveAdmin = nextRole === "admin" && nextIsActive === true;

    const activeAdminCountAfter =
      activeAdminCount -
      (currentlyActiveAdmin ? 1 : 0) +
      (willBeActiveAdmin ? 1 : 0);

    return activeAdminCountAfter < 1;
  };

  const saveEdit = async () => {
    const originalUser = users.find((user) => user.id === editForm.id);

    if (!originalUser) {
      showModalNotice("მომხმარებელი ვერ მოიძებნა.", "error");
      return;
    }

    if (!editForm.fullName.trim()) {
      showModalNotice("შეიყვანე სახელი და გვარი.", "error");
      return;
    }

    if (!editForm.username.trim()) {
      showModalNotice("შეიყვანე მომხმარებლის სახელი.", "error");
      return;
    }

    if (
      wouldLeaveNoActiveAdmin(
        originalUser,
        editForm.role,
        Boolean(editForm.isActive)
      )
    ) {
      showModalNotice(
        "სისტემაში მინიმუმ ერთი აქტიური ადმინისტრატორი უნდა დარჩეს.",
        "error"
      );
      return;
    }

    setSavingId(editForm.id);

    try {
      const payload = {
        fullName: editForm.fullName.trim(),
        username: editForm.username.trim(),
        role: editForm.role,
        isActive: Boolean(editForm.isActive),
        authorizedPersonFullName: editForm.authorizedPersonFullName.trim(),
        authorizedPersonPersonalNumber:
          editForm.authorizedPersonPersonalNumber.trim(),
        authorizedPersonPosition: editForm.authorizedPersonPosition.trim(),
      };

      if (editForm.password.trim()) {
        payload.password = editForm.password.trim();
      }

      await api.patch(`/admin/users/${editForm.id}`, payload);

      await loadUsers({ silent: true });
      showModalNotice("მონაცემები შენახულია.");
      
    } catch (err) {
      showModalNotice(
        err.response?.data?.message || "მომხმარებლის განახლება ვერ მოხერხდა.",
        "error"
      );
    } finally {
      setSavingId(null);
    }
  };

  const toggleActive = async (user) => {
    const nextIsActive = !user.isActive;

    if (isLastActiveAdmin(user) && !nextIsActive) {
      showToast(
        "ბოლო აქტიური ადმინისტრატორის დეაქტივაცია შეუძლებელია.",
        "error"
      );
      return;
    }

    setSavingId(user.id);

    try {
      await api.patch(`/admin/users/${user.id}`, {
        fullName: user.fullName,
        role: user.role,
        isActive: nextIsActive,
      });

      await loadUsers({ silent: true });

      showToast(nextIsActive ? "მომხმარებელი გააქტიურდა." : "მომხმარებელი დეაქტივირდა.");
    } catch (err) {
      showToast(
        err.response?.data?.message || "სტატუსის შეცვლა ვერ მოხერხდა.",
        "error"
      );
    } finally {
      setSavingId(null);
    }
  };

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
          <h2>მომხმარებლების მართვა</h2>
          <p>შექმენი მომხმარებლები, მიანიჭე როლები და მართე მათი სტატუსი.</p>
        </div>
      </div>

      <section className="page-card section-card">
        <div className="section-title">
          <div className="section-title-left">
            <UserPlus size={19} />
            <h3>ახალი მომხმარებელი</h3>
          </div>
        </div>

        <form className="create-user-form" onSubmit={createUser}>
          <div className="form-grid four">
            <label>
              სახელი და გვარი
              <input
                name="fullName"
                value={createForm.fullName}
                onChange={handleCreateChange}
              />
            </label>

            <label>
              მომხმარებელი
              <input
                name="username"
                value={createForm.username}
                onChange={handleCreateChange}
                autoComplete="off"
              />
            </label>

            <label>
              პაროლი
              <input
                name="password"
                type="password"
                value={createForm.password}
                onChange={handleCreateChange}
                autoComplete="new-password"
              />
            </label>

            <label>
              როლი
              <select
                name="role"
                value={createForm.role}
                onChange={handleCreateChange}
              >
                {roleOptions.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {createForm.role === "operator" && (
            <div className="auth-person-panel">
              <div className="auth-person-title">
                უფლებამოსილი პირის მონაცემები
              </div>

              <div className="form-grid three">
                <label>
                  სახელი და გვარი
                  <input
                    name="authorizedPersonFullName"
                    value={createForm.authorizedPersonFullName}
                    onChange={handleCreateChange}
                  />
                </label>

                <label>
                  პირადი ნომერი
                  <input
                    name="authorizedPersonPersonalNumber"
                    value={createForm.authorizedPersonPersonalNumber}
                    onChange={handleCreateChange}
                  />
                </label>

                <label>
                  პოზიცია
                  <input
                    name="authorizedPersonPosition"
                    value={createForm.authorizedPersonPosition}
                    onChange={handleCreateChange}
                  />
                </label>
              </div>
            </div>
          )}

          <div className="form-actions">
            <button type="submit" className="primary-button" disabled={creating}>
              <UserPlus size={16} />
              {creating ? "იქმნება..." : "მომხმარებლის შექმნა"}
            </button>
          </div>
        </form>
      </section>

      <section className="page-card section-card">
        <div className="section-title">
          <div className="section-title-left">
            <h3>მომხმარებლების სია</h3>
          </div>

          <span className="muted-text">
            {loading ? "იტვირთება..." : `${users.length} მომხმარებელი`}
          </span>
        </div>

        <div className="table-wrapper">
          <table className="data-table users-table">
            <thead>
              <tr>
                <th>სახელი და გვარი</th>
                <th>მომხმარებელი</th>
                <th>როლი</th>
                <th>სტატუსი</th>
                <th>მოქმედება</th>
              </tr>
            </thead>

            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <span className="table-main-text">
                      {user.fullName || "—"}
                    </span>
                  </td>

                  <td>
                    <span className="username-text">{user.username}</span>
                  </td>

                  <td>
                    <span className={`role-badge role-${user.role}`}>
                      {getRoleLabel(user.role)}
                    </span>
                  </td>

                  <td className="status-column">
                    <button
                      type="button"
                      className={
                        user.isActive
                          ? "status-action-button active"
                          : "status-action-button inactive"
                      }
                      onClick={() => toggleActive(user)}
                      disabled={savingId === user.id}
                      title={
                        isLastActiveAdmin(user)
                          ? "ბოლო აქტიური ადმინისტრატორის დეაქტივაცია შეუძლებელია"
                          : ""
                      }
                    >
                      {user.isActive ? "აქტიური" : "დეაქტივირებული"}
                    </button>
                  </td>

                  <td className="actions-column">
                    <button
                      type="button"
                      className="small-secondary-button"
                      onClick={() => openEditModal(user)}
                    >
                      <Edit3 size={15} />
                      რედაქტირება
                    </button>
                  </td>
                </tr>
              ))}

              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan="5" className="empty-table-cell">
                    მომხმარებლები ვერ მოიძებნა.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h3>მომხმარებლის რედაქტირება</h3>
                <p>{editForm.username}</p>
              </div>

              <button
                type="button"
                className="modal-close-button"
                onClick={closeEditModal}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-grid two">
                <label>
                  სახელი და გვარი
                  <input
                    value={editForm.fullName}
                    onChange={(event) =>
                      handleEditChange("fullName", event.target.value)
                    }
                  />
                </label>

                <label>
                  მომხმარებელი
                  <input
                    value={editForm.username}
                    onChange={(event) =>
                      handleEditChange("username", event.target.value)
                    }
                    autoComplete="off"
                  />
                </label>

                <label>
                  ახალი პაროლი
                  <input
                    type="password"
                    value={editForm.password}
                    onChange={(event) =>
                      handleEditChange("password", event.target.value)
                    }
                    autoComplete="new-password"
                  />
                  <span className="field-hint">
                    თუ ცარიელს დატოვებ, პაროლი არ შეიცვლება.
                  </span>
                </label>

                <label>
                  როლი
                  <select
                    value={editForm.role}
                    onChange={(event) =>
                      handleEditChange("role", event.target.value)
                    }
                  >
                    {roleOptions.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {editForm.role === "operator" && (
                <div className="auth-person-panel modal-auth-panel">
                  <div className="auth-person-title">
                    უფლებამოსილი პირის მონაცემები
                  </div>

                  <div className="form-grid three">
                    <label>
                      სახელი და გვარი
                      <input
                        value={editForm.authorizedPersonFullName}
                        onChange={(event) =>
                          handleEditChange(
                            "authorizedPersonFullName",
                            event.target.value
                          )
                        }
                      />
                    </label>

                    <label>
                      პირადი ნომერი
                      <input
                        value={editForm.authorizedPersonPersonalNumber}
                        onChange={(event) =>
                          handleEditChange(
                            "authorizedPersonPersonalNumber",
                            event.target.value
                          )
                        }
                      />
                    </label>

                    <label>
                      პოზიცია
                      <input
                        value={editForm.authorizedPersonPosition}
                        onChange={(event) =>
                          handleEditChange(
                            "authorizedPersonPosition",
                            event.target.value
                          )
                        }
                      />
                    </label>
                  </div>

                  <p className="field-hint">
                    ეს მონაცემები ავტომატურად გადაჰყვება ქეისს ოპერატორზე გადაცემისას.
                  </p>
                </div>
              )}

              <div className="modal-status-row">
                <div>
                  <strong>სტატუსი</strong>
                  <span>მომხმარებლის სისტემაში შესვლის უფლება</span>
                </div>

                <button
                  type="button"
                  className={
                    editForm.isActive
                      ? "status-action-button active"
                      : "status-action-button inactive"
                  }
                  onClick={() =>
                    handleEditChange("isActive", !editForm.isActive)
                  }
                >
                  {editForm.isActive ? "აქტიური" : "დეაქტივირებული"}
                </button>
              </div>
            </div>

            <div className="modal-actions">
              {modalNotice && (
                <div className={`modal-inline-notice ${modalNotice.type}`}>
                  {modalNotice.type === "success" ? (
                    <CheckCircle size={16} />
                  ) : (
                    <AlertCircle size={16} />
                  )}
                  <span>{modalNotice.message}</span>
                </div>
              )}

              <button
                type="button"
                className="secondary-button"
                onClick={closeEditModal}
              >
                გაუქმება
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={saveEdit}
                disabled={savingId === editForm.id}
              >
                <Save size={16} />
                {savingId === editForm.id ? "ინახება..." : "შენახვა"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default AdminUsersPage;