import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch } from "../services/api";
import { getRole } from "../utils/auth";
import "./Leads.css";

const STATUS_COLOR = {
  new:       "#6366f1",
  active:    "#22c55e",
  converted: "#f59e0b",
  lost:      "#ef4444",
};

const SOURCE_OPTIONS = ["Web", "LinkedIn", "Referral", "Cold Call", "Event"];

function ConvBadge({ prob }) {
  const pct = parseFloat(prob || 0) * 100;
  if (pct >= 65) return <span className="conv-badge conv-fort">Fort {pct.toFixed(1)}%</span>;
  if (pct >= 30) return <span className="conv-badge conv-moyen">Moyen {pct.toFixed(1)}%</span>;
  return <span className="conv-badge conv-faible">Faible {pct.toFixed(1)}%</span>;
}

// ── Create-lead modal ──────────────────────────────────────────────────────────

const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
};
const modalStyle = {
  background: "#fff", borderRadius: "12px", padding: "28px",
  width: "440px", maxWidth: "90vw", boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
};
const inputStyle = {
  width: "100%", padding: "10px 12px", marginTop: "4px", marginBottom: "14px",
  border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "14px", boxSizing: "border-box",
};

function CreateLeadModal({ users, isAdmin, onClose, onCreated }) {
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", company: "", source: "Web", assigned_to: "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.first_name || !form.last_name || !form.email) {
      setError("Nom, prénom et email sont obligatoires.");
      return;
    }
    setSaving(true);
    setError("");
    const res = await authFetch("/api/leads", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name:  form.first_name,
        last_name:   form.last_name,
        email:       form.email,
        company:     form.company || null,
        source:      form.source  || null,
        assigned_to: form.assigned_to || null,
      }),
    });
    setSaving(false);
    if (!res) return;
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Erreur lors de la création du lead.");
      return;
    }
    onCreated();
    onClose();
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0, marginBottom: 18 }}>Nouveau lead</h2>
        <form onSubmit={handleSubmit}>
          <label>Prénom *
            <input style={inputStyle} value={form.first_name} onChange={set("first_name")} />
          </label>
          <label>Nom *
            <input style={inputStyle} value={form.last_name} onChange={set("last_name")} />
          </label>
          <label>Email *
            <input style={inputStyle} type="email" value={form.email} onChange={set("email")} />
          </label>
          <label>Entreprise
            <input style={inputStyle} value={form.company} onChange={set("company")} />
          </label>
          <label>Source
            <select style={inputStyle} value={form.source} onChange={set("source")}>
              {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          {isAdmin && (
            <label>Commercial assigné
              <select style={inputStyle} value={form.assigned_to} onChange={set("assigned_to")}>
                <option value="">— Non assigné —</option>
                {users
                  .filter((u) => u.role === "sales")
                  .map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
              </select>
            </label>
          )}

          {error && <p style={{ color: "#ef4444", fontSize: 13, margin: "0 0 12px" }}>{error}</p>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose}
              style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #d1d5db",
                       background: "#fff", cursor: "pointer", fontWeight: 600 }}>
              Annuler
            </button>
            <button type="submit" disabled={saving}
              style={{ padding: "10px 18px", borderRadius: 8, border: "none",
                       background: "#6366f1", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
              {saving ? "Création…" : "Créer le lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Leads() {
  const navigate                = useNavigate();
  const [leads, setLeads]       = useState([]);
  const [search, setSearch]     = useState("");
  const [status, setStatus]     = useState("");
  const [sort, setSort]         = useState("desc");
  const [assignedTo, setAssignedTo] = useState("");
  const [users, setUsers]       = useState([]);
  const [page, setPage]         = useState(1);
  const [totalPages, setTotalPages] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [refresh, setRefresh]   = useState(0);

  const role      = getRole();
  const isAdmin   = role === "admin";
  const canCreate = role === "admin" || role === "sales";

  // Fetch the user list once (admin only — /api/users is admin-restricted)
  useEffect(() => {
    if (!isAdmin) return;
    authFetch("/api/users")
      .then((r) => r && r.json())
      .then((data) => { if (Array.isArray(data)) setUsers(data); })
      .catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 5 });
    if (search)     params.append("search", search);
    if (status)     params.append("status", status);
    if (sort)       params.append("sort", sort);
    if (assignedTo) params.append("assigned_to", assignedTo);

    authFetch(`/api/leads?${params}`)
      .then((r) => r && r.json())
      .then((data) => {
        if (data) {
          // Backend returns { data, total, total_pages } when paginated,
          // or a raw array if the older controller is running.
          const rows = Array.isArray(data) ? data : data.data || [];
          setLeads(rows);
          setTotalPages(Array.isArray(data) ? null : data.total_pages || null);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [search, status, sort, assignedTo, page, refresh]);

  return (
    <div className="leads-page">
      <div className="leads-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 className="leads-title">Leads</h1>
          <span className="leads-sub">{leads.length} prospect(s) trouvé(s)</span>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: 8,
                     padding: "10px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
          >
            + Nouveau lead
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="leads-filters">
        <input
          className="filter-input"
          placeholder="Rechercher un nom ou email ou source "
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select
          className="filter-select"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        >
          <option value="">Tous les statuts</option>
          <option value="new">Nouveau</option>
          <option value="active">Actif</option>
          <option value="converted">Converti</option>
          <option value="lost">Perdu</option>
        </select>
        <select
          className="filter-select"
          value={sort}
          onChange={(e) => { setSort(e.target.value); setPage(1); }}
        >
          <option value="desc">Score décroissant</option>
          <option value="asc">Score croissant</option>
        </select>
        {isAdmin && (
          <select
            className="filter-select"
            value={assignedTo}
            onChange={(e) => { setAssignedTo(e.target.value); setPage(1); }}
          >
            <option value="">Tous les commerciaux</option>
            {users
              .filter((u) => u.role === "sales")
              .map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
          </select>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="leads-state">Chargement…</div>
      ) : (
        <div className="leads-table-wrap">
          <table className="leads-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Email</th>
                <th>Entreprise</th>
                <th>Source</th>
                <th>Statut</th>
                <th>Score IA</th>
                <th>Prob. Conv.</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="lead-row-clickable"
                  onClick={() => navigate(`/leads/${lead.id}`)}
                  title="Voir la fiche lead"
                >
                  <td>{lead.first_name} {lead.last_name}</td>
                  <td className="text-muted">{lead.email}</td>
                  <td>{lead.company || "—"}</td>
                  <td>{lead.source || "—"}</td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background: (STATUS_COLOR[lead.status] || "#999") + "22",
                        color: STATUS_COLOR[lead.status] || "#999",
                      }}
                    >
                      {lead.status}
                    </span>
                  </td>
                  <td>
                    <span className="score-val">
                      {parseFloat(lead.current_score || 0).toFixed(1)}
                    </span>
                  </td>
                  <td>
                    <ConvBadge prob={lead.conversion_probability} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {leads.length === 0 && (
            <div className="leads-state">Aucun lead trouvé.</div>
          )}
        </div>
      )}

      {/* Pagination */}
      <div className="pagination">
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
          ← Précédent
        </button>
        <span>{totalPages ? `Page ${page} / ${totalPages}` : `Page ${page}`}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={totalPages ? page >= totalPages : leads.length < 10}
        >
          Suivant →
        </button>
      </div>

      {/* Create-lead modal */}
      {showCreate && (
        <CreateLeadModal
          users={users}
          isAdmin={isAdmin}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setPage(1); setRefresh((r) => r + 1); }}
        />
      )}
    </div>
  );
}

export default Leads;
