import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import LoginPage from "./pages/LoginPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import ManagerCasesPage from "./pages/ManagerCasesPage";
import OperatorDashboardPage from "./pages/OperatorDashboardPage";
import HeadDashboardPage from "./pages/HeadDashboardPage";

const getRolePath = (role) => {
  switch (role) {
    case "admin":
      return "/admin";
    case "manager":
      return "/manager";
    case "operator":
      return "/operator";
    case "head":
      return "/head";
    default:
      return "/login";
  }
};

const ProtectedRoute = ({ allowedRoles, children }) => {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to={getRolePath(user?.role)} replace />;
  }

  return children;
};

const RootRedirect = () => {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={getRolePath(user?.role)} replace />;
};

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminUsersPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/manager"
        element={
          <ProtectedRoute allowedRoles={["manager", "admin"]}>
            <ManagerCasesPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/operator"
        element={
          <ProtectedRoute allowedRoles={["operator"]}>
            <OperatorDashboardPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/head"
        element={
          <ProtectedRoute allowedRoles={["head", "admin"]}>
            <HeadDashboardPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;