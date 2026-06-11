import { useEffect, useState } from "react";
import { authFetch } from "../services/api";
import "./Automation.css";

const TYPE_LABELS  = { score_threshold: "Seuil de score IA", inactivity: "Inactivité" };
const ACTION_LABELS = { notify: "Notification", email: "Email", both: "Notification + Email" };

function Automation() {
  const [rules,    setRules]    = useState([]);
  const [notifs,   setNotifs]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [form,     setForm]     = useState({
    name: "", type: "score_threshold", threshold: 70,
    inactivity_days: 7, action: "notify",
  });
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  const load = async () => {
    const [rRes, nRes] = await Promise.all([
      authFetch("/api/automation/rules"),
      authFetch("/api/automation/notifications"),
    ]);
    if (rRes) setRules(await rRes.json());
    if (nRes) setNotifs(await nRes.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setError("");
    if (!form.name.trim()) { setError("Le nom est requis."); return; }
    setSaving(true);
    const res = await authFetch("/api/automation/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res) return;
    if (!res.ok) {
      const d = await res.json();
      setError(d.error || "Erreur lors de la création.");
      return;
    }
    setForm({ name: "", type: "score_threshold", threshold: 70, inactivity_days: 7, action: "notify" });
    load();
  };

  const handleToggle = async (id) => {
    const res = await authFetch(`/api/automation/rules/${id}/toggle`, { method: "PATCH" });
    if (res) load();
  };

  const handleDelete = async (id) => {
    const res = await authFetch(`/api/automation/rules/${id}`, { method: "DELETE" });
    if (res) load();
  };

  const markAllRead = async () => {
    const res = await authFetch("/api/automation/notifications/read-all", { method: "PATCH" });
    if (res) load();
  };

  const runNow = async () => {
    setSaving(true);
    await authFetch("/api/automation/run-now", { method: "POST" });
    setSaving(false);
    load();
  };

  if (loading) return <div className="auto-state">Chargement…</div>;

  const unreadCount = notifs.filter((n) => !n.is_read).length;

  return (
    <div className="automation-page">
      <div className="auto-header">
        <h1 className="auto-title">Automatisation Marketing</h1>
        <span className="auto-sub">Configurez des règles de relance automatique</span>
      </div>

      <div className="auto-actions-bar">
        <button className="run-now-btn" onClick={runNow} disabled={saving}>
          {saving ? "Exécution…" : "▶ Exécuter les règles maintenant"}
        </button>
      </div>

      <div className="auto-layout">
        {/* LEFT — rule form + rule list */}
        <div className="auto-left">

          {/* Create rule form */}
          <div className="auto-card">
            <h3 className="auto-card-title">Nouvelle règle</h3>

            {error && <div className="auto-error">{error}</div>}

            <div className="form-field">
              <label>Nom de la règle</label>
              <input
                placeholder="ex: Leads à fort potentiel"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Type de déclencheur</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="score_threshold">Seuil de score IA</option>
                  <option value="inactivity">Inactivité</option>
                </select>
              </div>
              <div className="form-field">
                <label>Action</label>
                <select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
                  <option value="notify">Notification</option>
                  <option value="email">Email</option>
                  <option value="both">Notification + Email</option>
                </select>
              </div>
            </div>

            {form.type === "score_threshold" && (
              <div className="form-field">
                <label>Seuil de score (0 – 100)</label>
                <div className="slider-row">
                  <input
                    type="range" min="0" max="100" step="5"
                    value={form.threshold}
                    onChange={(e) => setForm({ ...form, threshold: parseInt(e.target.value) })}
                  />
                  <span className="slider-val">{form.threshold}</span>
                </div>
              </div>
            )}

            {form.type === "inactivity" && (
              <div className="form-field">
                <label>Jours d'inactivité</label>
                <input
                  type="number" min="1" max="365"
                  value={form.inactivity_days}
                  onChange={(e) => setForm({ ...form, inactivity_days: parseInt(e.target.value) })}
                />
              </div>
            )}

            <button className="auto-btn" onClick={handleCreate} disabled={saving}>
              {saving ? "Création…" : "+ Créer la règle"}
            </button>
          </div>

          {/* Rules list */}
          <div className="auto-card">
            <h3 className="auto-card-title">Règles actives ({rules.length})</h3>
            {rules.length === 0 && <p className="auto-empty">Aucune règle configurée.</p>}
            {rules.map((rule) => (
              <div key={rule.id} className={`rule-row ${rule.is_active ? "" : "inactive"}`}>
                <div className="rule-info">
                  <span className="rule-name">{rule.name}</span>
                  <span className="rule-meta">
                    {TYPE_LABELS[rule.type]}
                    {rule.type === "score_threshold" && ` ≥ ${rule.threshold}`}
                    {rule.type === "inactivity" && ` — ${rule.inactivity_days} j`}
                    {" · "}{ACTION_LABELS[rule.action]}
                  </span>
                </div>
                <div className="rule-actions">
                  <button
                    className={`toggle-btn ${rule.is_active ? "on" : "off"}`}
                    onClick={() => handleToggle(rule.id)}
                    title={rule.is_active ? "Désactiver" : "Activer"}
                  >
                    {rule.is_active ? "ON" : "OFF"}
                  </button>
                  <button className="del-btn" onClick={() => handleDelete(rule.id)} title="Supprimer">✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — notifications */}
        <div className="auto-right">
          <div className="auto-card notif-card">
            <div className="notif-header-row">
              <h3 className="auto-card-title">
                Notifications
                {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
              </h3>
              {unreadCount > 0 && (
                <button className="read-all-btn" onClick={markAllRead}>
                  Tout marquer comme lu
                </button>
              )}
            </div>

            {notifs.length === 0 && <p className="auto-empty">Aucune notification.</p>}
            <div className="notif-list">
              {notifs.map((n) => (
                <div key={n.id} className={`notif-item ${n.type} ${n.is_read ? "read" : ""}`}>
                  <div className="notif-dot" />
                  <div className="notif-body">
                    <p className="notif-msg">{n.message}</p>
                    <span className="notif-time">
                      {new Date(n.created_at).toLocaleDateString("fr-FR", {
                        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Automation;
