import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line, AreaChart, Area,
} from "recharts";
import { authFetch } from "../services/api";
import "./Dashboard.css";

// ── constants ────────────────────────────────────────────────────────────────

const STAGE_LABELS = {
  discovery:   "Découverte",
  proposal:    "Proposition",
  negotiation: "Négociation",
  closed_won:  "Gagné",
  closed_lost: "Perdu",
};

const SOURCE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4"];

// Format monétaire — devise locale (Dinar tunisien), cohérent avec le Pipeline.
// Produit par ex. « 1 400 DT ».
function fmtTND(amount) {
  const n = Number(amount) || 0;
  return `${n.toLocaleString("fr-TN")} DT`;
}

// ── sub-components ───────────────────────────────────────────────────────────

function Variation({ val }) {
  if (val === null || val === undefined) return null;
  const up    = val >= 0;
  const label = `${up ? "+" : ""}${val}%`;
  return (
    <span className={`kpi-variation ${up ? "up" : "down"}`}>
      {up ? "↑" : "↓"} {label}
    </span>
  );
}

function KpiCard({ label, value, sub, color, variation }) {
  return (
    <div className="kpi-card">
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <span className="kpi-dot" style={{ background: color }} />
      </div>
      <div className="kpi-value" style={{ color }}>{value}</div>
      <div className="kpi-footer">
        {sub && <span className="kpi-sub">{sub}</span>}
        <Variation val={variation} />
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

function Dashboard() {
  const [overview,    setOverview]    = useState(null);
  const [pipeline,    setPipeline]    = useState([]);
  const [trend,       setTrend]       = useState([]);
  const [convRate,    setConvRate]    = useState([]);
  const [performance, setPerformance] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const [ovRes, pipRes, trendRes, convRes, perfRes] = await Promise.all([
          authFetch("/api/analytics/overview"),
          authFetch("/api/analytics/pipeline"),
          authFetch("/api/analytics/sales-trend?days=30"),
          authFetch("/api/analytics/conversion-rate"),
          authFetch("/api/analytics/performance"),
        ]);

        // authFetch returns null on 401 → redirect handled inside
        if (!ovRes) return;

        const [ov, pip, tr, conv, perf] = await Promise.all([
          ovRes.json(),
          pipRes.json(),
          trendRes.json(),
          convRes.json(),
          perfRes.json(),
        ]);

        setOverview(ov);
        setPipeline(pip);
        setTrend(tr);
        setConvRate(conv);
        setPerformance(perf);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [navigate]);

  if (loading) return <div className="dash-state">Chargement…</div>;
  if (error)   return <div className="dash-state error">Erreur : {error}</div>;
  if (!overview) return null;

  const { kpi, variation } = overview;

  // Pipeline chart data
  const pipelineChartData = pipeline.map((r) => ({
    name:   STAGE_LABELS[r.stage] || r.stage,
    count:  r.count,
    amount: r.total_amount,
  }));

  // Trend chart — format date label as "DD/MM"
  const trendData = trend.map((r) => ({
    ...r,
    label: r.day.slice(5).replace("-", "/"),
  }));

  // Conversion rate chart
  const convData = convRate.map((r) => ({
    name: r.source,
    rate: r.rate,
    total: r.total,
  }));

  return (
    <div className="dashboard">
      <div className="dash-header">
        <h1 className="dash-title">Dashboard Analytics</h1>
        <span className="dash-subtitle">Vue d'ensemble des performances commerciales</span>
      </div>

      {/* ── KPI row ──────────────────────────────────────────────────────── */}
      <div className="kpi-row">
        <KpiCard
          label="Leads Actifs"
          value={kpi.active_leads}
          sub={`${kpi.total_leads} au total`}
          color="#6366f1"
          variation={variation.active_leads}
        />
        <KpiCard
          label="Taux de Conversion"
          value={`${kpi.conversion_rate}%`}
          sub={`${kpi.converted} convertis`}
          color="#22c55e"
          variation={variation.conversion_rate}
        />
        <KpiCard
          label="CA Prévisionnel"
          value={fmtTND(kpi.ca_previsionnel)}
          sub={`${fmtTND(kpi.ca_pipeline)} en pipeline`}
          color="#f59e0b"
          variation={null}
        />
        <KpiCard
          label="Score IA Moyen"
          value={kpi.avg_score.toFixed(1)}
          sub="sur 100"
          color="#0ea5e9"
          variation={variation.avg_score}
        />
      </div>

      {/* ── Sales trend + Pipeline ───────────────────────────────────────── */}
      <div className="charts-row">

        {/* Sales trend — 30 derniers jours */}
        <div className="chart-card">
          <h3 className="chart-title">Évolution des ventes — 30 derniers jours</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="gradLeads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}   />
                </linearGradient>
                <linearGradient id="gradWon" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                interval={4}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(val, name) =>
                  [val, name === "leads_created" ? "Leads créés" : "Opportunités gagnées"]
                }
              />
              <Legend
                formatter={(val) =>
                  val === "leads_created" ? "Leads créés" : "Opportunités gagnées"
                }
              />
              <Area
                type="monotone"
                dataKey="leads_created"
                stroke="#6366f1"
                fill="url(#gradLeads)"
                strokeWidth={2}
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="won"
                stroke="#22c55e"
                fill="url(#gradWon)"
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Pipeline par étape */}
        <div className="chart-card">
          <h3 className="chart-title">Pipeline commercial — opportunités par étape</h3>
          {pipelineChartData.length === 0 ? (
            <div className="chart-empty">Aucune opportunité dans le pipeline.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={pipelineChartData} barSize={36}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(val, name) =>
                    [val, name === "count" ? "Opportunités" : "Montant (DT)"]
                  }
                />
                <Bar dataKey="count" name="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Conversion rate by source ────────────────────────────────────── */}
      <div className="charts-row">
        <div className="chart-card">
          <h3 className="chart-title">Taux de conversion par source</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={convData} barSize={36} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
              <Tooltip formatter={(val) => [`${val}%`, "Taux de conversion"]} />
              <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                {convData.map((_, i) => (
                  <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Leads by source pie */}
        <div className="chart-card">
          <h3 className="chart-title">Leads par source d'acquisition</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={convData}
                dataKey="total"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={75}
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {convData.map((_, i) => (
                  <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(val) => [val, "Leads"]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Performance par commercial ───────────────────────────────────── */}
      <div className="table-card">
        <h3 className="chart-title">Performance par commercial</h3>
        <table className="dash-table">
          <thead>
            <tr>
              <th>Commercial</th>
              <th>Opportunités</th>
              <th>Gagnées</th>
              <th>Perdues</th>
              <th>Taux de succès</th>
              <th>CA généré</th>
              <th>CA pipeline</th>
            </tr>
          </thead>
          <tbody>
            {performance.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "#9ca3af" }}>
                  Aucune donnée de performance.
                </td>
              </tr>
            ) : (
              performance.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="perf-name">{p.name}</div>
                    <div className="perf-email">{p.email}</div>
                  </td>
                  <td>{p.total_opps}</td>
                  <td><span className="perf-badge won">{p.won}</span></td>
                  <td><span className="perf-badge lost">{p.lost}</span></td>
                  <td>
                    <div className="win-rate-bar-wrap">
                      <div className="win-rate-bar">
                        <div
                          className="win-rate-fill"
                          style={{ width: `${p.win_rate ?? 0}%` }}
                        />
                      </div>
                      <span>{p.win_rate === null ? "—" : `${p.win_rate}%`}</span>
                    </div>
                  </td>
                  <td className="ca-cell">{fmtTND(p.ca_genere)}</td>
                  <td className="ca-cell muted">{fmtTND(p.ca_pipeline)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Dashboard;
