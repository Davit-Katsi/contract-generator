import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

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

const LoginPage = () => {
  const { isAuthenticated, user, login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (isAuthenticated && user) {
    return <Navigate to={getRolePath(user.role)} replace />;
  }

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const loggedUser = await login(form);
      navigate(getRolePath(loggedUser.role), { replace: true });
      } catch (err) {
        console.log("LOGIN ERROR:", err);
        console.log("LOGIN ERROR RESPONSE:", err.response?.data);

        setError(
          err.response?.data?.message ||
            err.message ||
            "შესვლა ვერ მოხერხდა. გადაამოწმეთ მონაცემები."
        );
      } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <img src="/assets/logo.png" alt="Logo" className="login-logo" />

        <h1>ხელშეკრულებების გენერირების მოდული</h1>
        <p>სისტემაში შესასვლელად შეიყვანეთ მომხმარებელი და პაროლი</p>

        {error && <div className="alert-error">{error}</div>}

        <label>
          მომხმარებელი
          <input
            name="username"
            value={form.username}
            onChange={handleChange}
            autoComplete="username"
          />
        </label>

        <label>
          პაროლი
          <input
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            autoComplete="current-password"
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "მიმდინარეობს..." : "შესვლა"}
        </button>
      </form>
    </div>
  );
};

export default LoginPage;