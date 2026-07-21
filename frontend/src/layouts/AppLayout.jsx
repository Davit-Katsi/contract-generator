import { LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const roleLabels = {
  admin: "ადმინისტრატორი",
  manager: "მენეჯერი",
  operator: "ოპერატორი",
  head: "ხელმძღვანელი",
};

const AppLayout = ({ children }) => {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-left">
          <div className="header-logo-box">
            <img src="/assets/logo2.png" alt="Logo" className="header-logo" />
          </div>

          <div className="header-title-block">
            <h1>ხელშეკრულებების გენერირების მოდული</h1>
            <p>სსიპ დევნილთა, ეკომიგრანტთა და საარსებო წყაროებით უზრუნველყოფის სააგენტო</p>
          </div>
        </div>

        <div className="header-right">
          <div className="user-box">
            <strong>{user?.fullName || user?.username}</strong>
            <span>{roleLabels[user?.role] || user?.role}</span>
          </div>

          <button className="logout-button" onClick={logout}>
            <LogOut size={17} />
            გასვლა
          </button>
        </div>
      </header>

      <main className="app-main">{children}</main>
    </div>
  );
};

export default AppLayout;