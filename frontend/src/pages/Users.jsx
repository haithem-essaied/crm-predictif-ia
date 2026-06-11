import { useEffect, useState } from "react";
import { authFetch } from "../services/api";
import "./Users.css";

const ROLE_LABELS = { admin: "Admin", sales: "Commercial", marketing: "Marketing" };
const ROLE_COLORS = { admin: "role-admin", sales: "role-sales", marketing: "role-marketing" };

const emptyForm = { name: "", email: "", password: "", role: "sales" };

function Users() {
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null); // null | "create" | {user}
  const [form,    setForm]    = useState(emptyForm);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  const load = async () => {
    setLoading(true);
    const res = await authFetch("/api/users");
    if (res) setUsers(await res.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setError("");
    setModal("create");
  };

  const openEdit = (user) => {
    setForm({ name: user.name, email: user.email, password: "", role: user.role });
    setError("");
    setModal(user);
  };

  const closeModal = () => { setModal(null); setError(""); };

  const handleSave = async () => {
    setError("");
    if (!form.name.trim() || !form.email.trim()) {
      setError("Nom et email sont requis.");
      return;
    }
    if (modal === "create" && !form.password.trim()) {
      setError("Le mot de passe est requis pour un nouvel utilisateur.");
      return;
    }
    setSaving(true);
    const isCreate = modal === "create";
    const body = isCreate
      ? form
      : { name: form.name, email: form.email, role: form.role, ...(form.password ? { password: form.password } : {}) };

    const res = await authFetch(
      isCreate ? "/api/users" : `/api/users/${modal.id}`,
      { method: isCreate ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    setSaving(false);
    if (!res) return;
    if (!res.ok) { const d = await res.json(); setError(d.error || "Erreur."); return; }
    closeModal();
    load();
  };

  const handleToggle = async (user) => {
    const res = await authFetch(`/api/users/${user.id}/status`, { method: "PATCH" });
    if (res) load();
  };

  if (loading) return <div className="users-state">Chargement…</div>;

  return (
    <div className="users-page">
      <div className="users-header">
        <div>
          <h1 className="users-title">Gestion des utilisateurs</h1>
          <span className="users-sub">{users.length} compte(s) enregistré(s)</span>
        </div>
        <button className="btn-create" onClick={openCreate}>+ Nouvel utilisateur</button>
      </div>

      <div className="users-table-wrap">
        <table className="users-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Email</th>
              <th>Rôle</th>
              <th>Statut</th>
              <th>Créé le</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.is_active ? "" : "row-inactive"}>
                <td className="cell-name">{u.name}</td>
                <td className="cell-email">{u.email}</td>
                <td><span className={`role-badge ${ROLE_COLORS[u.role]}`}>{ROLE_LABELS[u.role] || u.role}</span></td>
                <td>
                  <span className={`status-badge ${u.is_active ? "status-active" : "status-inactive"}`}>
                    {u.is_active ? "Actif" : "Désactivé"}
                  </span>
                </td>
                <td className="cell-date">
                  {u.created_at ? new Date(u.created_at).toLocaleDateString("fr-FR") : "—"}
                </td>
                <td className="cell-actions">
                  <button className="btn-edit" onClick={() => openEdit(u)}>Modifier</button>
                  <button
                    className={u.is_active ? "btn-deactivate" : "btn-activate"}
                    onClick={() => handleToggle(u)}
                  >
                    {u.is_active ? "Désactiver" : "Activer"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">
              {modal === "create" ? "Créer un utilisateur" : `Modifier — ${modal.name}`}
            </h2>

            {error && <div className="modal-error">{error}</div>}

            <label className="modal-label">Nom complet</label>
            <input className="modal-input" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />

            <label className="modal-label">Email</label>
            <input className="modal-input" type="email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />

            <label className="modal-label">
              Mot de passe {modal !== "create" && <span className="label-hint">(laisser vide pour ne pas changer)</span>}
            </label>
            <input className="modal-input" type="password"
              placeholder={modal === "create" ? "••••••••" : "Nouveau mot de passe…"}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />

            <label className="modal-label">Rôle</label>
            <select className="modal-select" value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="sales">Commercial</option>
              <option value="marketing">Marketing</option>
              <option value="admin">Admin</option>
            </select>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={closeModal}>Annuler</button>
              <button className="btn-save" onClick={handleSave} disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Users;
