import { useState, useEffect, useRef } from "react";
import { authFetch } from "../services/api";
import "./Pipeline.css";

// ── Stage config ─────────────────────────────────────────────────────────────

const STAGES = [
  { key: "discovery",   label: "Découverte",   color: "#6366f1" },
  { key: "proposal",    label: "Proposition",  color: "#f59e0b" },
  { key: "negotiation", label: "Négociation",  color: "#3b82f6" },
  { key: "closed_won",  label: "Gagné",        color: "#10b981" },
  { key: "closed_lost", label: "Perdu",        color: "#ef4444" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount) {
  if (!amount && amount !== 0) return "—";
  return new Intl.NumberFormat("fr-TN", {
    style: "currency", currency: "TND", maximumFractionDigits: 0,
  }).format(amount);
}

function initials(first, last) {
  return `${(first || "?")[0]}${(last || "?")[0]}`.toUpperCase();
}

// ── Opportunity card ─────────────────────────────────────────────────────────

function OppCard({ opp, onDragStart, onDelete }) {
  return (
    <div
      className="opp-card"
      draggable
      onDragStart={(e) => onDragStart(e, opp.id)}
    >
      {/* Bouton supprimer */}
      <button
        className="opp-delete"
        title="Supprimer l'opportunité"
        onClick={(e) => { e.stopPropagation(); onDelete(opp); }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        ✕
      </button>

      {/* Avatar + nom */}
      <div className="opp-card-header">
        <div className="opp-avatar">{initials(opp.first_name, opp.last_name)}</div>
        <div>
          <div className="opp-name">
            {opp.first_name} {opp.last_name}
          </div>
          {opp.company && (
            <div className="opp-company">{opp.company}</div>
          )}
        </div>
      </div>

      {/* Montant */}
      <div className="opp-amount">{fmt(opp.amount)}</div>

      {/* Date de clôture prévue */}
      {opp.expected_closing_date && (
        <div className="opp-date">
          <span className="opp-date-icon">📅</span>
          {new Date(opp.expected_closing_date).toLocaleDateString("fr-TN")}
        </div>
      )}
    </div>
  );
}

// ── Kanban column ────────────────────────────────────────────────────────────

function KanbanColumn({ stage, cards, onDragStart, onDrop, onDragOver, total, onDelete }) {
  return (
    <div
      className="kanban-col"
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, stage.key)}
    >
      {/* Column header */}
      <div className="kanban-col-header" style={{ borderTopColor: stage.color }}>
        <div className="kanban-col-title">
          <span className="kanban-col-dot" style={{ background: stage.color }} />
          {stage.label}
          <span className="kanban-col-count">{cards.length}</span>
        </div>
        {total > 0 && (
          <div className="kanban-col-total" style={{ color: stage.color }}>
            {fmt(total)}
          </div>
        )}
      </div>

      {/* Cards */}
      <div className="kanban-col-body">
        {cards.length === 0 ? (
          <div className="kanban-col-empty">Aucune opportunité</div>
        ) : (
          cards.map((opp) => (
            <OppCard key={opp.id} opp={opp} onDragStart={onDragStart} onDelete={onDelete} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Modal : créer une opportunité ────────────────────────────────────────────

function CreateModal({ leads, onClose, onCreated }) {
  const [form, setForm] = useState({
    lead_id: "",
    amount: "",
    expected_closing_date: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.lead_id) { setError("Sélectionnez un lead."); return; }
    setSaving(true);
    const res = await authFetch("/api/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_id:               form.lead_id,
        amount:                form.amount ? parseFloat(form.amount) : 0,
        expected_closing_date: form.expected_closing_date || null,
      }),
    });
    setSaving(false);
    if (!res) return;
    if (!res.ok) { const d = await res.json(); setError(d.error || "Erreur"); return; }
    onCreated();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Nouvelle opportunité</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <label>Lead *
            <select
              value={form.lead_id}
              onChange={(e) => setForm({ ...form, lead_id: e.target.value })}
              required
            >
              <option value="">— Sélectionner —</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.first_name} {l.last_name}{l.company ? ` — ${l.company}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label>Montant estimé (TND)
            <input
              type="number"
              min="0"
              placeholder="Ex : 12000"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </label>

          <label>Date de clôture prévue
            <input
              type="date"
              value={form.expected_closing_date}
              onChange={(e) => setForm({ ...form, expected_closing_date: e.target.value })}
            />
          </label>

          {error && <p className="modal-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Création…" : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function Pipeline() {
  const [opps,    setOpps]    = useState([]);
  const [leads,   setLeads]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [showModal, setShowModal] = useState(false);

  const draggingId = useRef(null); // id of the card being dragged

  // ── Data loading ───────────────────────────────────────────────────────────

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [oppRes, leadRes] = await Promise.all([
        authFetch("/api/opportunities"),
        authFetch("/api/leads?limit=200"),
      ]);
      if (!oppRes || !leadRes) return;

      const oppData  = await oppRes.json();
      const leadData = await leadRes.json();

      setOpps(Array.isArray(oppData) ? oppData : []);
      // Backend returns { data: [...] } when paginated, or a raw array (legacy).
      const leadList = Array.isArray(leadData)
        ? leadData
        : (leadData.data ?? leadData.leads ?? []);
      setLeads(Array.isArray(leadList) ? leadList : []);
    } catch (err) {
      setError("Impossible de charger le pipeline.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── Drag-and-drop handlers ─────────────────────────────────────────────────

  const handleDragStart = (e, id) => {
    draggingId.current = id;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e, targetStage) => {
    e.preventDefault();
    const id = draggingId.current;
    if (!id) return;

    const opp = opps.find((o) => o.id === id);
    if (!opp || opp.stage === targetStage) return;

    // Optimistic update
    setOpps((prev) =>
      prev.map((o) => (o.id === id ? { ...o, stage: targetStage } : o))
    );

    const res = await authFetch(`/api/opportunities/${id}/stage`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: targetStage }),
    });

    if (!res || !res.ok) {
      // Rollback on error
      setOpps((prev) =>
        prev.map((o) => (o.id === id ? { ...o, stage: opp.stage } : o))
      );
    }

    draggingId.current = null;
  };

  // ── Delete handler ─────────────────────────────────────────────────────────

  const handleDelete = async (opp) => {
    const name = `${opp.first_name} ${opp.last_name}`;
    if (!window.confirm(`Supprimer l'opportunité de ${name} ? Cette action est irréversible.`)) {
      return;
    }

    // Retrait optimiste
    const prev = opps;
    setOpps((list) => list.filter((o) => o.id !== opp.id));

    const res = await authFetch(`/api/opportunities/${opp.id}`, { method: "DELETE" });
    if (!res || !res.ok) {
      setOpps(prev); // rollback en cas d'échec
      alert("Suppression impossible.");
    }
  };

  // ── Derived data ───────────────────────────────────────────────────────────

  const byStage = (stageKey) => opps.filter((o) => o.stage === stageKey);

  const stageTotal = (stageKey) =>
    byStage(stageKey).reduce((s, o) => s + (parseFloat(o.amount) || 0), 0);

  const totalPipeline = opps
    .filter((o) => o.stage !== "closed_lost")
    .reduce((s, o) => s + (parseFloat(o.amount) || 0), 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="pipeline-state">Chargement du pipeline…</div>;
  if (error)   return <div className="pipeline-state error">{error}</div>;

  return (
    <div className="pipeline-page">

      {/* Header */}
      <div className="pipeline-header">
        <div>
          <h1 className="pipeline-title">Pipeline commercial</h1>
          <p className="pipeline-subtitle">
            {opps.length} opportunité{opps.length !== 1 ? "s" : ""} ·{" "}
            CA pipeline : <strong>{fmt(totalPipeline)}</strong>
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          + Nouvelle opportunité
        </button>
      </div>

      {/* Kanban board */}
      <div className="kanban-board">
        {STAGES.map((stage) => (
          <KanbanColumn
            key={stage.key}
            stage={stage}
            cards={byStage(stage.key)}
            total={stageTotal(stage.key)}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {/* Create modal */}
      {showModal && (
        <CreateModal
          leads={leads}
          onClose={() => setShowModal(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}
