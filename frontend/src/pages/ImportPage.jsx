import { useState } from "react";
import { API_URL } from "../services/api";
import "./ImportPage.css";

function ImportResult({ result }) {
  if (!result) return null;

  if (result.error) {
    return (
      <div className="import-result error">
        <strong>Erreur :</strong> {result.error}
      </div>
    );
  }

  return (
    <div className="import-result success">
      <div className="report-summary">
        <span className="report-stat created">✅ {result.created} créé(s)</span>
        <span className="report-stat skipped">⚠ {result.duplicates ?? result.missing ?? 0} ignoré(s)</span>
        <span className="report-stat invalid">❌ {result.invalid} invalide(s)</span>
        <span className="report-stat total">📄 {result.total} ligne(s) au total</span>
      </div>

      {result.errors?.length > 0 && (
        <div className="report-errors">
          <p className="report-errors-title">Lignes rejetées :</p>
          <ul>
            {result.errors.map((e, i) => (
              <li key={i}>
                Ligne {e.line}{e.email && e.email !== "—" ? ` (${e.email})` : ""} — {e.reasons.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.skipped?.length > 0 && (
        <div className="report-errors">
          <p className="report-errors-title">Doublons ignorés :</p>
          <ul>
            {result.skipped.map((email, i) => (
              <li key={i}>{email}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ImportPage() {
  const [leadsFile,        setLeadsFile]        = useState(null);
  const [interactionsFile, setInteractionsFile] = useState(null);
  const [leadsResult,      setLeadsResult]      = useState(null);
  const [intResult,        setIntResult]        = useState(null);
  const [loading,          setLoading]          = useState(false);

  const upload = async (file, endpoint, setResult) => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    const formData = new FormData();
    formData.append("file", file);

    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
        body:    formData,
      });
      if (res.status === 401 || res.status === 400) {
        localStorage.removeItem("token");
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="import-page">
      <div className="import-header">
        <h1 className="import-title">Import CSV</h1>
        <span className="import-sub">Importez vos leads et interactions depuis un fichier CSV</span>
      </div>

      <div className="import-cards">

        {/* ── Leads ── */}
        <div className="import-card">
          <h3 className="import-card-title">📋 Leads</h3>
          <p className="import-card-desc">
            Colonnes requises : <code>first_name, last_name, email</code><br />
            Colonnes optionnelles : <code>phone, company, job_title, source, status</code>
          </p>
          <label className="file-label">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => { setLeadsFile(e.target.files[0]); setLeadsResult(null); }}
            />
            <span>{leadsFile ? leadsFile.name : "Choisir un fichier CSV…"}</span>
          </label>
          <button
            className="import-btn"
            onClick={() => upload(leadsFile, "/api/import/leads", setLeadsResult)}
            disabled={!leadsFile || loading}
          >
            {loading ? "Import en cours…" : "Importer les leads"}
          </button>
          <ImportResult result={leadsResult} />
        </div>

        {/* ── Interactions ── */}
        <div className="import-card">
          <h3 className="import-card-title">🔗 Interactions</h3>
          <p className="import-card-desc">
            Colonnes requises : <code>lead_email, type</code><br />
            Colonnes optionnelles : <code>channel, duration, value</code>
          </p>
          <label className="file-label">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => { setInteractionsFile(e.target.files[0]); setIntResult(null); }}
            />
            <span>{interactionsFile ? interactionsFile.name : "Choisir un fichier CSV…"}</span>
          </label>
          <button
            className="import-btn"
            onClick={() => upload(interactionsFile, "/api/import/interactions", setIntResult)}
            disabled={!interactionsFile || loading}
          >
            {loading ? "Import en cours…" : "Importer les interactions"}
          </button>
          <ImportResult result={intResult} />
        </div>

      </div>
    </div>
  );
}

export default ImportPage;
