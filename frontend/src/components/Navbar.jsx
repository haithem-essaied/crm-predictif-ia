import { NavLink } from "react-router-dom";
import { getRole, getRoleHome } from "../utils/auth";
import "./Navbar.css";

/**
 * Nav items per role
 * ─────────────────────────────────────────────────────
 * Admin     : Dashboard, Leads, Pipeline, Import CSV,
 *             Analytics, Automatisation, Utilisateurs
 * Sales     : Dashboard, Leads, Pipeline, Analytics
 * Marketing : Dashboard, Leads, Analytics, Automatisation
 * ─────────────────────────────────────────────────────
 */
const NAV_ITEMS = {
  admin: [
    { to: null,          icon: "▦",  label: "Dashboard"      }, // resolved to role home
    { to: "/leads",      icon: "◉",  label: "Leads"          },
    { to: "/pipeline",   icon: "⬡",  label: "Pipeline"       },
    { to: "/import",     icon: "⇪",  label: "Import CSV"     },
    { to: "/analytics",  icon: "📊", label: "Analytics"      },
    { to: "/automation", icon: "⚙",  label: "Automatisation" },
    { to: "/users",      icon: "👥", label: "Utilisateurs"   },
  ],
  sales: [
    { to: null,          icon: "▦",  label: "Dashboard"  },
    { to: "/leads",      icon: "◉",  label: "Leads"      },
    { to: "/pipeline",   icon: "⬡",  label: "Pipeline"   },
    { to: "/analytics",  icon: "📊", label: "Analytics"  },
  ],
  marketing: [
    { to: null,          icon: "▦",  label: "Dashboard"      },
    { to: "/leads",      icon: "◉",  label: "Leads"          },
    { to: "/import",     icon: "⇪",  label: "Import CSV"     }, 
    { to: "/analytics",  icon: "📊", label: "Analytics"      },
    { to: "/automation", icon: "⚙",  label: "Automatisation" },
  ],
};

const ROLE_LABEL = {
  admin:     "Administrateur",
  sales:     "Commercial",
  marketing: "Marketing",
};

function Navbar() {
  const role    = getRole();
  const home    = getRoleHome();
  const items   = NAV_ITEMS[role] ?? NAV_ITEMS.sales;
  const navCls  = ({ isActive }) => isActive ? "nav-item active" : "nav-item";

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-icon">◈</span>
        <span className="logo-text">CRM<span className="logo-ai"> IA</span></span>
      </div>

      {/* Role badge */}
      <div className="sidebar-role">{ROLE_LABEL[role] ?? role}</div>

      <nav className="sidebar-nav">
        {items.map(({ to, icon, label }) => (
          <NavLink
            key={label}
            to={to ?? home}
            className={navCls}
          >
            <span className="nav-icon">{icon}</span> {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

export default Navbar;
