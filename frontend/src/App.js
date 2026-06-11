import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login      from "./pages/Login";
import Dashboard  from "./pages/Dashboard";
import Leads      from "./pages/Leads";
import ImportPage from "./pages/ImportPage";
import Navbar     from "./components/Navbar";
import Topbar     from "./components/Topbar";
import Automation from "./pages/Automation";
import Analytics  from "./pages/Analytics";
import Pipeline   from "./pages/Pipeline";
import LeadDetail from "./pages/LeadDetail";
import Users      from "./pages/Users";
import { getRole, getRoleHome } from "./utils/auth";
import "./App.css";

/**
 * Redirect to the role-specific home if logged in, otherwise to /login.
 * Used for "/" and catch-all "*".
 */
function RoleRedirect() {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;
  return <Navigate to={getRoleHome()} replace />;
}

/**
 * Layout wrapper that:
 * 1. Redirects to /login if no token.
 * 2. Redirects to the user's role home if they try to access a route
 *    their role is not allowed on.
 *
 * allowedRoles — if omitted, any authenticated role may access the route.
 */
function PrivateLayout({ children, allowedRoles }) {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;

  if (allowedRoles) {
    const role = getRole();
    if (!allowedRoles.includes(role)) {
      return <Navigate to={getRoleHome()} replace />;
    }
  }

  return (
    <div className="app-layout">
      <Navbar />
      <div className="app-content">
        <Topbar />
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}

/**
 * Route permission matrix
 * ─────────────────────────────────────────────────────────
 * Route          Admin   Sales   Marketing
 * /admin         ✅      ❌      ❌          (admin home)
 * /sales         ✅      ✅      ❌          (sales home)
 * /marketing     ✅      ❌      ✅          (marketing home)
 * /leads         ✅      ✅      ✅
 * /leads/:id     ✅      ✅      ✅
 * /pipeline      ✅      ✅      ❌
 * /import        ✅      ❌      ✅
 * /automation    ✅      ❌      ✅
 * /analytics     ✅      ✅      ✅
 * /users         ✅      ❌      ❌
 * ─────────────────────────────────────────────────────────
 */

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ── Public ─────────────────────────────────────── */}
        <Route path="/login" element={<Login />} />

        {/* ── Role home routes ───────────────────────────── */}
        <Route path="/admin"
          element={
            <PrivateLayout allowedRoles={["admin"]}>
              <Dashboard />
            </PrivateLayout>
          }
        />
        <Route path="/sales"
          element={
            <PrivateLayout allowedRoles={["admin", "sales"]}>
              <Dashboard />
            </PrivateLayout>
          }
        />
        <Route path="/marketing"
          element={
            <PrivateLayout allowedRoles={["admin", "marketing"]}>
              <Dashboard />
            </PrivateLayout>
          }
        />

        {/* ── Shared feature routes ──────────────────────── */}
        <Route path="/leads"
          element={
            <PrivateLayout allowedRoles={["admin", "sales", "marketing"]}>
              <Leads />
            </PrivateLayout>
          }
        />
        <Route path="/leads/:id"
          element={
            <PrivateLayout allowedRoles={["admin", "sales", "marketing"]}>
              <LeadDetail />
            </PrivateLayout>
          }
        />
        <Route path="/pipeline"
          element={
            <PrivateLayout allowedRoles={["admin", "sales"]}>
              <Pipeline />
            </PrivateLayout>
          }
        />
        <Route path="/import"
          element={
            <PrivateLayout allowedRoles={["admin", "marketing"]}>
              <ImportPage />
            </PrivateLayout>
          }
        />
        <Route path="/automation"
          element={
            <PrivateLayout allowedRoles={["admin", "marketing"]}>
              <Automation />
            </PrivateLayout>
          }
        />
        <Route path="/analytics"
          element={
            <PrivateLayout allowedRoles={["admin", "sales", "marketing"]}>
              <Analytics />
            </PrivateLayout>
          }
        />
        <Route path="/users"
          element={
            <PrivateLayout allowedRoles={["admin"]}>
              <Users />
            </PrivateLayout>
          }
        />

        {/* ── Legacy /dashboard alias → role home ────────── */}
        <Route path="/dashboard" element={<RoleRedirect />} />

        {/* ── Catch-all ──────────────────────────────────── */}
        <Route path="/"  element={<RoleRedirect />} />
        <Route path="*"  element={<RoleRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
