import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { authFetch } from "../services/api";
import { getRole } from "../utils/auth";
import "./LeadDetail.css";

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ["new", "active", "converted", "lost"];
const SOURCE_OPTIONS = ["Web", "LinkedIn", "Referral", "Cold Call", "Event"];

const STATUS_META = {
  new:       { label: "Nouveau",   color: "#6366f1" },
  active:    { label: "Actif",     color: "#22c55e" },
  converted: { label: "Converti",  color: "#f59e0b" },
  lost:      { label: "Perdu",     color: "#ef4444" },
};

const INTERACTION_TYPES    = ["website_visit","form_submit","email_opened","meeting","call","demo"];
const INTERACTION_CHANNELS = ["web","email","phone","physical"];

const TYPE_LABEL = {
  website_visit: "Visite du site web",
  form_submit:   "Soumission de formulaire",
  email_opened:  "Email ouvert",
  meeting:       "Réunion",
  call:          "Appel téléphonique",
  demo:          "Démonstration",
  email_sent:    "Email envoyé",
};

const CHANNEL_LABEL = {
  web:      "Web",
  email:    "Email",
  phone:    "Téléphone",
  physical: "Présentiel",
};

const TYPE_ICON = {
  website_visit: "🌐",
  form_submit:   "📋",
  email_opened:  "📧",
  meeting:       "🤝",
  call:          "📞",
  demo:          "🖥️",
  email_sent:    "📤",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-TN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtDateShort(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("fr-TN", { day: "2-digit", month: "short" });
}

function timeAgo(d) {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "il y a 1 jour";
  return `il y a ${days} jours`;
}

function fmtDuration(sec) {
  if (!sec || sec === 0) return "—";
  const m = Math.floor(sec / 60);
  return m > 0 ? `${m} min` : `${sec}s`;
}

// ── Score ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score }) {
  const pct   = Math.min(100, Math.max(0, parseFloat(score) || 0));
  const color = pct >= 70 ? "#10b981" : pct >= 40 ? "#f59e0b" : "#ef4444";
  const r = 44;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className="score-ring-wrap">
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} fill="none" stroke="#f0f2f5" strokeWidth="10" />
        <circle
          cx="55" cy="55" r={r} fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 55 55)"
          style={{ transition: "stroke-dasharray .6s ease" }}
        />
      </svg>
      <div className="score-ring-label">
        <span className="score-ring-val" style={{ color }}>{pct.toFixed(1)}</span>
        <span className="score-ring-max">/100</span>
      </div>
    </div>
  );
}

// ── Conversion badge ──────────────────────────────────────────────────────────

function ConvBadge({ prob }) {
  const pct = parseFloat(prob || 0) * 100;
  if (pct >= 65) return <span className="conv-badge conv-fort">Fort  {pct.toFixed(1)}%</span>;
  if (pct >= 30) return <span className="conv-badge conv-moyen">Moyen {pct.toFixed(1)}%</span>;
  return               <span className="conv-badge conv-faible">Faible {pct.toFixed(1)}%</span>;
}

// ── Add interaction form ──────────────────────────────────────────────────────

function AddInteractionForm({ leadId, onAdded }) {
  const [open,    setOpen]    = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [form, setForm] = useState({
    type: "meeting", channel: "physical", duration: "", value: "",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await authFetch(`/api/leads/${leadId}/interactions`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type:     form.type,
        channel:  form.channel,
        duration: form.duration ? parseInt(form.duration) * 60 : 0,
        value:    form.value || null,
      }),
    });
    setSaving(false);
    if (!res) return;
    if (!res.ok) { const d = await res.json(); setError(d.error || "Erreur"); return; }
    setOpen(false);
    setForm({ type: "meeting", channel: "physical", duration: "", value: "" });
    onAdded();
  };

  if (!open) {
    return (
      <button className="btn-add-interaction" onClick={() => setOpen(true)}>
        + Ajouter une interaction
      </button>
    );
  }

  return (
    <form className="interaction-form" onSubmit={handleSubmit}>
      <div className="iform-row">
        <label>Type
          <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
            {INTERACTION_TYPES.map(t => (
              <option key={t} value={t}>{TYPE_ICON[t] || "•"} {TYPE_LABEL[t] || t}</option>
            ))}
          </select>
        </label>
        <label>Canal
          <select value={form.channel} onChange={e => setForm({...form, channel: e.target.value})}>
            {INTERACTION_CHANNELS.map(c => <option key={c} value={c}>{CHANNEL_LABEL[c] || c}</option>)}
          </select>
        </label>
        <label>Durée (min)
          <input
            type="number" min="0" placeholder="Ex: 30"
            value={form.duration}
            onChange={e => setForm({...form, duration: e.target.value})}
          />
        </label>
      </div>
      <label>Note (optionnel)
        <input
          type="text" placeholder="Compte-rendu, remarques…"
          value={form.value}
          onChange={e => setForm({...form, value: e.target.value})}
        />
      </label>
      {error && <p className="iform-error">{error}</p>}
      <div className="iform-actions">
        <button type="button" className="btn-cancel" onClick={() => setOpen(false)}>
          Annuler
        </button>
        <button type="submit" className="btn-save" disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer + Rescorer"}
        </button>
      </div>
    </form>
  );
}

// ── Edit-lead modal ─────────────────────────────────────────────────────────

const _overlay = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
};
const _modal = {
  background: "#fff", borderRadius: 12, padding: 28,
  width: 460, maxWidth: "90vw", maxHeight: "90vh", overflowY: "auto",
  boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
};
const _input = {
  width: "100%", padding: "10px 12px", marginTop: 4, marginBottom: 14,
  border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, boxSizing: "border-box",
};

function EditLeadModal({ lead, users, isAdmin, onClose, onUpdated }) {
  const [form, setForm] = useState({
    first_name:  lead.first_name  || "",
    last_name:   lead.last_name   || "",
    email:       lead.email       || "",
    phone:       lead.phone       || "",
    company:     lead.company     || "",
    job_title:   lead.job_title   || "",
    source:      lead.source      || "Web",
    status:      lead.status      || "new",
    assigned_to: lead.assigned_to || "",
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
    const res = await authFetch(`/api/leads/${lead.id}`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name:  form.first_name,
        last_name:   form.last_name,
        email:       form.email,
        phone:       form.phone     || null,
        company:     form.company   || null,
        job_title:   form.job_title || null,
        source:      form.source    || null,
        status:      form.status,
        assigned_to: form.assigned_to || null,
      }),
    });
    setSaving(false);
    if (!res) return;
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Erreur lors de la modification.");
      return;
    }
    onUpdated();
    onClose();
  };

  return (
    <div style={_overlay} onClick={onClose}>
      <div style={_modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0, marginBottom: 18 }}>Modifier le lead</h2>
        <form onSubmit={handleSubmit}>
          <label>Prénom *
            <input style={_input} value={form.first_name} onChange={set("first_name")} />
          </label>
          <label>Nom *
            <input style={_input} value={form.last_name} onChange={set("last_name")} />
          </label>
          <label>Email *
            <input style={_input} type="email" value={form.email} onChange={set("email")} />
          </label>
          <label>Téléphone
            <input style={_input} value={form.phone} onChange={set("phone")} />
          </label>
          <label>Entreprise
            <input style={_input} value={form.company} onChange={set("company")} />
          </label>
          <label>Fonction
            <input style={_input} value={form.job_title} onChange={set("job_title")} />
          </label>
          <label>Source
            <select style={_input} value={form.source} onChange={set("source")}>
              {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>Statut
            <select style={_input} value={form.status} onChange={set("status")}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_META[s]?.label || s}</option>
              ))}
            </select>
          </label>
          {isAdmin && (
            <label>Commercial assigné
              <select style={_input} value={form.assigned_to} onChange={set("assigned_to")}>
                <option value="">— Non assigné —</option>
                {users
                  .filter((u) => u.role === "sales")
                  .map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
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
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LeadDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();

  const [lead,         setLead]         = useState(null);
  const [interactions, setInteractions] = useState([]);
  const [scoreHistory, setScoreHistory] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [aiFlash,      setAiFlash]      = useState(false); // highlight after rescore
  const [showEdit,     setShowEdit]     = useState(false);
  const [users,        setUsers]        = useState([]);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = async (flash = false) => {
    setLoading(true);
    try {
      const [lRes, iRes, hRes] = await Promise.all([
        authFetch(`/api/leads/${id}`),
        authFetch(`/api/leads/${id}/interactions`),
        authFetch(`/api/leads/${id}/score-history`),
      ]);
      if (!lRes) return;

      const [lData, iData, hData] = await Promise.all([
        lRes.json(), iRes?.json(), hRes?.json(),
      ]);

      setLead(lData);
      setInteractions(Array.isArray(iData) ? iData : []);
      setScoreHistory(Array.isArray(hData) ? hData : []);

      if (flash) {
        setAiFlash(true);
        setTimeout(() => setAiFlash(false), 2000);
      }
    } catch {
      setError("Impossible de charger la fiche lead.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  // ── Delete (admin only) + Modify (admin + sales) ────────────────────────────

  const role      = getRole();
  const isAdmin   = role === "admin";
  const canModify = role === "admin" || role === "sales";

  // Fetch users once (admin only — /api/users is admin-restricted)
  useEffect(() => {
    if (!isAdmin) return;
    authFetch("/api/users")
      .then((r) => r && r.json())
      .then((data) => { if (Array.isArray(data)) setUsers(data); })
      .catch(() => {});
  }, [isAdmin]);

  const handleDelete = async () => {
    const ok = window.confirm(
      `Supprimer définitivement le lead ${lead?.first_name} ${lead?.last_name} ?\n` +
      `Cette action est irréversible.`
    );
    if (!ok) return;

    const res = await authFetch(`/api/leads/${id}`, { method: "DELETE" });
    if (res && res.ok) {
      navigate("/leads");
    } else if (res) {
      alert("Suppression impossible.");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <div className="ld-state">Chargement…</div>;
  if (error)   return <div className="ld-state error">{error}</div>;
  if (!lead)   return <div className="ld-state">Lead introuvable.</div>;

  const statusMeta = STATUS_META[lead.status] || { label: lead.status, color: "#999" };

  const chartData = scoreHistory.map((h, i) => ({
    idx:   i + 1,
    score: parseFloat(h.score_value).toFixed(1),
    date:  fmtDateShort(h.calculated_at),
  }));

  return (
    <div className="ld-page">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="ld-header">
        <div className="ld-header-top" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button className="ld-back" onClick={() => navigate("/leads")}>
            ← Leads
          </button>
          <div style={{ display: "flex", gap: 10 }}>
            {canModify && (
              <button
                onClick={() => setShowEdit(true)}
                style={{
                  background: "#eef2ff",
                  color: "#6366f1",
                  border: "1px solid #c7d2fe",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                ✏️ Modifier
              </button>
            )}
            {isAdmin && (
              <button
                onClick={handleDelete}
                style={{
                  background: "#fef2f2",
                  color: "#ef4444",
                  border: "1px solid #fecaca",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                🗑 Supprimer le lead
              </button>
            )}
          </div>
        </div>

        <div className="ld-hero">
          <div className="ld-avatar">
            {(lead.first_name?.[0] || "?")}{(lead.last_name?.[0] || "?")}
          </div>
          <div className="ld-hero-info">
            <h1 className="ld-name">{lead.first_name} {lead.last_name}</h1>
            <div className="ld-sub">
              <span>{lead.email}</span>
              {lead.company && <><span className="ld-sep">·</span><span>{lead.company}</span></>}
              {lead.source  && <><span className="ld-sep">·</span><span>{lead.source}</span></>}
            </div>
          </div>
          <span className="ld-status-badge" style={{
            background: statusMeta.color + "22",
            color:       statusMeta.color,
          }}>
            {statusMeta.label}
          </span>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="ld-body">

        {/* LEFT column */}
        <div className="ld-left">

          {/* Score card */}
          <div className={`ld-card score-card ${aiFlash ? "ai-flash" : ""}`}>
            <div className="card-title">🤖 Score IA</div>
            <div className="score-main">
              <ScoreRing score={lead.current_score} />
              <div className="score-details">
                <div className="score-detail-row">
                  <span className="score-detail-label">Probabilité conversion</span>
                  <ConvBadge prob={lead.conversion_probability} />
                </div>
                <div className="score-detail-row">
                  <span className="score-detail-label">Dernière mise à jour</span>
                  <span className="score-detail-val">{timeAgo(lead.last_ai_update)}</span>
                </div>
                <div className="score-detail-row">
                  <span className="score-detail-label">Nb interactions</span>
                  <span className="score-detail-val">{interactions.length}</span>
                </div>
              </div>
            </div>

            {/* Score evolution chart */}
            {chartData.length > 1 && (
              <div className="score-chart">
                <div className="chart-label">Évolution du score</div>
                <ResponsiveContainer width="100%" height={100}>
                  <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(v) => [`${v}/100`, "Score"]}
                      labelFormatter={(l) => l}
                      contentStyle={{ fontSize: 12, borderRadius: 6 }}
                    />
                    <Line
                      type="monotone" dataKey="score"
                      stroke="#6366f1" strokeWidth={2}
                      dot={{ r: 3, fill: "#6366f1" }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {chartData.length === 0 && (
              <p className="score-no-history">
                Aucun historique — ajoutez une interaction pour déclencher le scoring IA.
              </p>
            )}
          </div>

          {/* Info card */}
          <div className="ld-card">
            <div className="card-title">📋 Informations</div>
            <div className="info-grid">
              <span className="info-label">Entreprise</span>
              <span className="info-val">{lead.company || "—"}</span>

              <span className="info-label">Source</span>
              <span className="info-val">{lead.source || "—"}</span>

              <span className="info-label">Commercial assigné</span>
              <span className="info-val">
                {lead.assigned_to_name
                  ? lead.assigned_to_name
                  : <span style={{ color: "#9ca3af" }}>Non assigné</span>}
              </span>

              <span className="info-label">Statut</span>
              <span className="info-val" style={{ color: statusMeta.color, fontWeight: 600 }}>
                {statusMeta.label}
              </span>

              <span className="info-label">Créé le</span>
              <span className="info-val">{fmtDate(lead.created_at)}</span>

              <span className="info-label">Score actuel</span>
              <span className="info-val" style={{ fontWeight: 700 }}>
                {parseFloat(lead.current_score || 0).toFixed(1)} / 100
              </span>
            </div>
          </div>

        </div>

        {/* RIGHT column — interactions */}
        <div className="ld-right">
          <div className="ld-card interactions-card">
            <div className="card-title-row">
              <div className="card-title">💬 Interactions</div>
              <span className="interactions-count">{interactions.length}</span>
            </div>

            <AddInteractionForm
              leadId={id}
              onAdded={() => load(true)}
            />

            <div className="interactions-list">
              {interactions.length === 0 ? (
                <div className="interactions-empty">
                  Aucune interaction enregistrée.
                </div>
              ) : (
                interactions.map((intr) => (
                  <div key={intr.id} className="interaction-item">
                    <div className="intr-icon">
                      {TYPE_ICON[intr.type] || "•"}
                    </div>
                    <div className="intr-body">
                      <div className="intr-top">
                        <span className="intr-type">{TYPE_LABEL[intr.type] || intr.type?.replace(/_/g, " ")}</span>
                        <span className="intr-channel">{CHANNEL_LABEL[intr.channel] || intr.channel}</span>
                        {intr.duration > 0 && (
                          <span className="intr-duration">{fmtDuration(intr.duration)}</span>
                        )}
                      </div>
                      {intr.value && typeof intr.value === "string" && (
                        <div className="intr-note">{intr.value}</div>
                      )}
                      <div className="intr-date">{fmtDate(intr.timestamp)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Edit-lead modal */}
      {showEdit && (
        <EditLeadModal
          lead={lead}
          users={users}
          isAdmin={isAdmin}
          onClose={() => setShowEdit(false)}
          onUpdated={() => load()}
        />
      )}
    </div>
  );
}
