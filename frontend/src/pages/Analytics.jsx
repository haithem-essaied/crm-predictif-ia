import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line, Legend,
  PieChart, Pie,
} from "recharts";
import { authFetch } from "../services/api";
import "./Analytics.css";

// ── constants ─────────────────────────────────────────────────────────────────

const SOURCE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4"];

const STAGE_LABELS = {
  discovery:   "Découverte",
  proposal:    "Proposition",
  negotiation: "Négociation",
  closed_won:  "Gagné",
  closed_lost: "Perdu",
};

const STAGE_COLORS = ["#6366f1", "#06b6d4", "#f59e0b", "#22c55e", "#ef4444"];

const BUCKET_COLORS = {
  "0-20":   "#ef4444",
  "20-40":  "#f97316",
  "40-60":  "#f59e0b",
  "60-80":  "#22c55e",
  "80-100": "#6366f1",
};

const PERIOD_OPTIONS = [
  { label: "7 jours",  value: 7  },
  { label: "14 jours", value: 14 },
  { label: "30 jours", value: 30 },
  { label: "90 jours", value: 90 },
];

// ── helpers ───────────────────────────────────────────────────────────────────

const fmtDay = (day) => {
  if (!day) return "";
  const s = String(day).slice(0, 10);
  return s.slice(5).replace("-", "/");   // "MM/DD"
};

// ── sub-components ────────────────────────────────────────────────────────────

function SectionCard({ title, children }) {
  return (
    <div className="an-card">
      <h3 className="an-card-title">{title}</h3>
      {children}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

function Analytics() {
  const [convRate,  setConvRate]  = useState([]);
  const [aiScores,  setAiScores]  = useState({ distribution: [], trend: [] });
  const [pipeline,  setPipeline]  = useState([]);
  const [period,    setPeriod]    = useState(30);
  const [trend,     setTrend]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  // Initial load — conversion rate + AI scores
  useEffect(() => {
    const load = async () => {
      try {
        const [convRes, aiRes, pipRes] = await Promise.all([
          authFetch("/api/analytics/conversion-rate"),
          authFetch("/api/analytics/ai-scores"),
          authFetch("/api/analytics/pipeline"),
        ]);
        if (!convRes || !aiRes || !pipRes) return;
        const [conv, ai, pip] = await Promise.all([convRes.json(), aiRes.json(), pipRes.json()]);
        setConvRate(conv);
        setAiScores(ai);
        setPipeline(pip);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Reload sales trend when period changes
  useEffect(() => {
    const load = async () => {
      const res = await authFetch(`/api/analytics/sales-trend?days=${period}`);
      if (!res) return;
      const data = await res.json();
      setTrend(data);
    };
    load();
  }, [period]);

  if (loading) return <div className="an-state">Chargement…</div>;
  if (error)   return <div className="an-state error">Erreur : {error}</div>;

  // Prepare chart data
  const convData = convRate.map((r, i) => ({
    source:    r.source,
    rate:      r.rate,
    converted: r.converted,
    total:     r.total,
    fill:      SOURCE_COLORS[i % SOURCE_COLORS.length],
  }));

  const distData = aiScores.distribution.map((r) => ({
    bucket: r.bucket,
    count:  r.count,
    fill:   BUCKET_COLORS[r.bucket] || "#6366f1",
  }));

  const trendData = trend.map((r) => ({
    ...r,
    label: fmtDay(r.day),
  }));

  // rolling 7-day avg for score trend
  const scoreTrend = aiScores.trend.map((r) => ({
    label:     fmtDay(r.day),
    avg_score: r.avg_score,
  }));

  // pipeline distribution for the pie chart
  const pipelineData = pipeline.map((r, i) => ({
    name:  STAGE_LABELS[r.stage] || r.stage,
    count: r.count,
    fill:  STAGE_COLORS[i % STAGE_COLORS.length],
  }));

  return (
    <div className="analytics-page">
      <div className="an-header">
        <h1 className="an-title">Analytics détaillée</h1>
        <span className="an-sub">Exploration approfondie des données commerciales et IA</span>
      </div>

      {/* ── 1. Taux de conversion par source ─────────────────────────────── */}
      <SectionCard title="Taux de conversion par source d'acquisition">
        <div className="an-conv-grid">
          {/* Bar chart */}
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={convData} barSize={32} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11 }}
              />
              <YAxis type="category" dataKey="source" tick={{ fontSize: 12 }} width={80} />
              <Tooltip
                formatter={(val, name, props) => [
                  `${val}% (${props.payload.converted}/${props.payload.total})`,
                  "Taux de conversion",
                ]}
              />
              <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                {convData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Stats table */}
          <div className="conv-stat-list">
            {convData.map((r) => (
              <div key={r.source} className="conv-stat-row">
                <span
                  className="conv-stat-dot"
                  style={{ background: r.fill }}
                />
                <span className="conv-stat-source">{r.source}</span>
                <span className="conv-stat-nums">
                  {r.converted}/{r.total}
                </span>
                <span
                  className="conv-stat-rate"
                  style={{ color: r.fill }}
                >
                  {r.rate}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* ── 2. Distribution des scores IA ────────────────────────────────── */}
      <div className="an-two-col">
        <SectionCard title="Distribution des scores IA — leads actifs">
          {distData.length === 0 ? (
            <div className="an-empty">Aucun score disponible.</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={distData} barSize={48}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(val) => [val, "Leads"]} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Leads">
                    {distData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="dist-legend">
                {distData.map((r) => (
                  <div key={r.bucket} className="dist-legend-item">
                    <span className="dist-dot" style={{ background: r.fill }} />
                    <span>{r.bucket}</span>
                    <strong>{r.count}</strong>
                  </div>
                ))}
              </div>
            </>
          )}
        </SectionCard>

        {/* ── 3. Évolution du score moyen ──────────────────────────────────── */}
        <SectionCard title="Évolution du score IA moyen — 30 derniers jours">
          {scoreTrend.length === 0 ? (
            <div className="an-empty">
              Aucun historique de scoring disponible.
              <br />
              <span className="an-hint">Les scores s'accumulent après chaque nouvelle interaction.</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={scoreTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={2} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val) => [`${val}/100`, "Score moyen"]} />
                <Line
                  type="monotone"
                  dataKey="avg_score"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#6366f1" }}
                  name="Score moyen"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      {/* ── 4. Répartition du pipeline (PieChart) ────────────────────────── */}
      <SectionCard title="Répartition des opportunités par étape du pipeline">
        {pipelineData.length === 0 ? (
          <div className="an-empty">Aucune opportunité dans le pipeline.</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={pipelineData}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={95}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {pipelineData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip formatter={(val) => [val, "Opportunités"]} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      {/* ── 5. Évolution des ventes avec sélecteur de période ────────────── */}
      <SectionCard title="Évolution des leads et conversions">
        {/* Period selector */}
        <div className="period-selector">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`period-btn ${period === opt.value ? "active" : ""}`}
              onClick={() => setPeriod(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              interval={Math.floor(period / 7)}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(val, name) => [
                val,
                name === "leads_created" ? "Leads créés" : "Opportunités gagnées",
              ]}
            />
            <Legend
              formatter={(val) =>
                val === "leads_created" ? "Leads créés" : "Opportunités gagnées"
              }
            />
            <Line
              type="monotone"
              dataKey="leads_created"
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="won"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </SectionCard>
    </div>
  );
}

export default Analytics;
