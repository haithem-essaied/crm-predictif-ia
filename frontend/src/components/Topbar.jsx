import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { authFetch } from "../services/api";
import "./Topbar.css";

// ── Page title map ────────────────────────────────────────────────────────────

const PAGE_TITLES = {
  "/dashboard":  { title: "Dashboard",            icon: "▦"  },
  "/leads":      { title: "Leads",                icon: "◉"  },
  "/pipeline":   { title: "Pipeline commercial",  icon: "⬡"  },
  "/import":     { title: "Import CSV",           icon: "⇪"  },
  "/analytics":  { title: "Analytics IA",         icon: "📊" },
  "/automation": { title: "Automatisation",       icon: "⚙"  },
};

function getPageMeta(pathname) {
  // Handle /leads/:id
  if (pathname.startsWith("/leads/") && pathname.length > 7) {
    return { title: "Fiche lead", icon: "◉" };
  }
  return PAGE_TITLES[pathname] || { title: "CRM IA", icon: "◈" };
}

// ── Decode JWT payload (no library needed) ────────────────────────────────────

function decodeToken() {
  try {
    const token = localStorage.getItem("token");
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload;
  } catch {
    return null;
  }
}

// ── Topbar component ──────────────────────────────────────────────────────────

export default function Topbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const pageMeta = getPageMeta(location.pathname);

  const [unread,      setUnread]      = useState(0);
  const [showNotifs,  setShowNotifs]  = useState(false);
  const [notifs,      setNotifs]      = useState([]);
  const [showUser,    setShowUser]    = useState(false);
  const [user,        setUser]        = useState(null);

  const notifRef = useRef(null);
  const userRef  = useRef(null);

  // ── Decode user from JWT ───────────────────────────────────────────────────
  useEffect(() => {
    const payload = decodeToken();
    if (payload) setUser(payload);
  }, []);

  // ── Poll unread count every 30s ────────────────────────────────────────────
  useEffect(() => {
    const fetchCount = async () => {
      const res = await authFetch("/api/automation/notifications/unread");
      if (res) {
        const data = await res.json();
        setUnread(data.count || 0);
      }
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // ── Fetch notifications when bell clicked ──────────────────────────────────
  const handleBellClick = async () => {
    const next = !showNotifs;
    setShowNotifs(next);
    setShowUser(false);
    if (next) {
      const res = await authFetch("/api/automation/notifications?limit=8");
      if (res) {
        const data = await res.json();
        setNotifs(Array.isArray(data) ? data : (data.notifications ?? []));
      }
    }
  };

  // ── Close dropdowns on outside click ──────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false);
      if (userRef.current  && !userRef.current.contains(e.target))  setShowUser(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Mark all read ──────────────────────────────────────────────────────────
  const markAllRead = async () => {
    await authFetch("/api/automation/notifications/read-all", { method: "PATCH" });
    setUnread(0);
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  // ── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const roleLabel = {
    admin:     "Administrateur",
    sales:     "Commercial",
    marketing: "Marketing",
  }[user?.role] || user?.role || "Utilisateur";

  return (
    <header className="topbar">

      {/* Left — page title */}
      <div className="topbar-left">
        <span className="topbar-page-icon">{pageMeta.icon}</span>
        <span className="topbar-page-title">{pageMeta.title}</span>
      </div>

      {/* Right — actions */}
      <div className="topbar-right">

        {/* Notification bell */}
        <div className="topbar-bell-wrap" ref={notifRef}>
          <button
            className={`topbar-bell ${unread > 0 ? "has-unread" : ""}`}
            onClick={handleBellClick}
            title="Notifications"
          >
            🔔
            {unread > 0 && (
              <span className="topbar-bell-badge">{unread > 9 ? "9+" : unread}</span>
            )}
          </button>

          {showNotifs && (
            <div className="notif-dropdown">
              <div className="notif-header">
                <span>Notifications</span>
                {unread > 0 && (
                  <button className="notif-mark-read" onClick={markAllRead}>
                    Tout marquer lu
                  </button>
                )}
              </div>
              <div className="notif-list">
                {notifs.length === 0 ? (
                  <div className="notif-empty">Aucune notification</div>
                ) : (
                  notifs.map((n) => (
                    <div
                      key={n.id}
                      className={`notif-item ${!n.is_read ? "unread" : ""} notif-${n.type || "info"}`}
                    >
                      <div className="notif-msg">{n.message}</div>
                      <div className="notif-time">
                        {new Date(n.created_at).toLocaleDateString("fr-TN", {
                          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User chip */}
        <div className="topbar-user-wrap" ref={userRef}>
          <button
            className="topbar-user-chip"
            onClick={() => { setShowUser(v => !v); setShowNotifs(false); }}
          >
            <div className="topbar-avatar">
              {(user?.name || user?.email || "A")[0].toUpperCase()}
            </div>
            <div className="topbar-user-info">
              <span className="topbar-user-name">{user?.name || user?.email || "Admin"}</span>
              <span className="topbar-user-role">{roleLabel}</span>
            </div>
            <span className="topbar-chevron">›</span>
          </button>

          {showUser && (
            <div className="user-dropdown">
              <div className="user-dropdown-header">
                <div className="user-dd-name">{user?.name || "Admin"}</div>
                <div className="user-dd-email">{user?.email || ""}</div>
                <div className="user-dd-role">{roleLabel}</div>
              </div>
              <button className="user-dd-logout" onClick={handleLogout}>
                ⏻ Déconnexion
              </button>
            </div>
          )}
        </div>

      </div>
    </header>
  );
}
