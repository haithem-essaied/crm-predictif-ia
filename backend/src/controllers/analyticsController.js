/**
 * analyticsController.js — Sprint 3 analytics endpoints.
 *
 * GET /api/analytics/overview        — KPIs globaux + variation vs J-30
 * GET /api/analytics/pipeline        — Opportunités par étape (count + montant)
 * GET /api/analytics/sales-trend     — Leads créés + closed_won par jour (30j)
 * GET /api/analytics/conversion-rate — Taux de conversion par source
 * GET /api/analytics/performance     — Performance individuelle par commercial
 * GET /api/analytics/ai-scores       — Distribution scores IA + évolution score moyen
 */

import pool from "../config/db.js";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Compute % variation between current and previous value. */
function variation(current, previous) {
  if (!previous || previous === 0) return null;
  return parseFloat(((current - previous) / previous * 100).toFixed(1));
}

// ── In-memory cache (TTL 5 min) ───────────────────────────────────────────────
// Les KPI globaux et la performance par commercial reposent sur des agrégats
// lourds, mais le dashboard est rechargé fréquemment. On met le résultat en
// cache mémoire pendant 5 minutes pour éviter de recalculer les mêmes agrégats
// à chaque appel. Le cache est invalidé naturellement par expiration du TTL.
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const _cache = new Map();           // key -> { expires, payload }

function getCached(key) {
  const hit = _cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.payload;
  _cache.delete(key);
  return null;
}

function setCached(key, payload) {
  _cache.set(key, { expires: Date.now() + CACHE_TTL_MS, payload });
}

/**
 * Invalide le cache analytics. Appelé par les contrôleurs qui mutent des
 * données entrant dans les agrégats du dashboard (opportunités, etc.) afin
 * que la table « Performance » et les KPI reflètent immédiatement le
 * changement au lieu d'attendre l'expiration du TTL (5 min).
 * Sans clé : vide tout le cache. Avec clé(s) : n'invalide que celles-ci.
 */
export function invalidateAnalyticsCache(...keys) {
  if (keys.length === 0) {
    _cache.clear();
    return;
  }
  for (const k of keys) _cache.delete(k);
}

// ── 1. overview ──────────────────────────────────────────────────────────────

export const getOverview = async (req, res) => {
  try {
    const cached = getCached("overview");
    if (cached) return res.json(cached);

    const [current, previous, caResult] = await Promise.all([

      // Current period — all-time snapshot
      pool.query(`
        SELECT
          COUNT(*)                                                           AS total_leads,
          COUNT(CASE WHEN status NOT IN ('lost','converted') THEN 1 END)    AS active_leads,
          COUNT(CASE WHEN status = 'converted' THEN 1 END)                  AS converted,
          ROUND(AVG(current_score)::numeric, 2)                             AS avg_score,
          ROUND(
            (COUNT(CASE WHEN status = 'converted' THEN 1 END)::float
              / NULLIF(COUNT(*), 0) * 100)::numeric, 1
          )                                                                  AS conversion_rate
        FROM leads
      `),

      // Previous period — leads created before 30 days ago (for variation baseline)
      pool.query(`
        SELECT
          COUNT(*)                                                           AS total_leads,
          COUNT(CASE WHEN status NOT IN ('lost','converted') THEN 1 END)    AS active_leads,
          COUNT(CASE WHEN status = 'converted' THEN 1 END)                  AS converted,
          ROUND(AVG(current_score)::numeric, 2)                             AS avg_score,
          ROUND(
            (COUNT(CASE WHEN status = 'converted' THEN 1 END)::float
              / NULLIF(COUNT(*), 0) * 100)::numeric, 1
          )                                                                  AS conversion_rate
        FROM leads
        WHERE created_at < NOW() - INTERVAL '30 days'
      `),

      // CA prévisionnel — sum of all non-lost opportunities
      pool.query(`
        SELECT
          COALESCE(SUM(amount), 0)                                          AS ca_previsionnel,
          COALESCE(SUM(CASE WHEN stage = 'closed_won' THEN amount END), 0) AS ca_realise,
          COALESCE(SUM(CASE WHEN stage != 'closed_won'
                             AND stage != 'closed_lost' THEN amount END), 0) AS ca_pipeline
        FROM opportunities
        WHERE stage != 'closed_lost'
      `),
    ]);

    const c  = current.rows[0];
    const p  = previous.rows[0];
    const ca = caResult.rows[0];

    const payload = {
      kpi: {
        total_leads:     parseInt(c.total_leads),
        active_leads:    parseInt(c.active_leads),
        converted:       parseInt(c.converted),
        avg_score:       parseFloat(c.avg_score)       || 0,
        conversion_rate: parseFloat(c.conversion_rate) || 0,
        ca_previsionnel: parseFloat(ca.ca_previsionnel),
        ca_realise:      parseFloat(ca.ca_realise),
        ca_pipeline:     parseFloat(ca.ca_pipeline),
      },
      variation: {
        total_leads:     variation(parseInt(c.total_leads),     parseInt(p.total_leads)),
        active_leads:    variation(parseInt(c.active_leads),    parseInt(p.active_leads)),
        conversion_rate: variation(parseFloat(c.conversion_rate), parseFloat(p.conversion_rate)),
        avg_score:       variation(parseFloat(c.avg_score),     parseFloat(p.avg_score)),
      },
    };

    setCached("overview", payload);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

// ── 2. pipeline ───────────────────────────────────────────────────────────────

export const getPipelineAnalytics = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        stage,
        COUNT(*)                    AS count,
        COALESCE(SUM(amount), 0)   AS total_amount
      FROM opportunities
      GROUP BY stage
      ORDER BY
        CASE stage
          WHEN 'discovery'   THEN 1
          WHEN 'proposal'    THEN 2
          WHEN 'negotiation' THEN 3
          WHEN 'closed_won'  THEN 4
          WHEN 'closed_lost' THEN 5
          ELSE 6
        END
    `);

    res.json(result.rows.map(r => ({
      stage:        r.stage,
      count:        parseInt(r.count),
      total_amount: parseFloat(r.total_amount),
    })));
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

// ── 3. sales-trend ────────────────────────────────────────────────────────────

export const getSalesTrend = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    const [leadsPerDay, wonPerDay] = await Promise.all([

      // New leads per day for the last N days
      pool.query(`
        SELECT
          DATE(created_at)   AS day,
          COUNT(*)           AS leads_created
        FROM leads
        WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
        GROUP BY DATE(created_at)
        ORDER BY day
      `, [days]),

      // Opportunities moved to closed_won per day (from pipeline_history)
      pool.query(`
        SELECT
          DATE(changed_at)   AS day,
          COUNT(*)           AS won
        FROM pipeline_history
        WHERE new_stage = 'closed_won'
          AND changed_at >= NOW() - ($1 || ' days')::INTERVAL
        GROUP BY DATE(changed_at)
        ORDER BY day
      `, [days]),
    ]);

    // Merge into a unified day-by-day series
    const map = {};

    // Seed every day in the range with zeros
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      map[key] = { day: key, leads_created: 0, won: 0 };
    }

    for (const r of leadsPerDay.rows) {
      const key = r.day instanceof Date
        ? r.day.toISOString().slice(0, 10)
        : String(r.day).slice(0, 10);
      if (map[key]) map[key].leads_created = parseInt(r.leads_created);
    }

    for (const r of wonPerDay.rows) {
      const key = r.day instanceof Date
        ? r.day.toISOString().slice(0, 10)
        : String(r.day).slice(0, 10);
      if (map[key]) map[key].won = parseInt(r.won);
    }

    res.json(Object.values(map));
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

// ── 4. conversion-rate ────────────────────────────────────────────────────────

export const getConversionRate = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        source,
        COUNT(*)                                                            AS total,
        COUNT(CASE WHEN status = 'converted' THEN 1 END)                   AS converted,
        ROUND(
          (COUNT(CASE WHEN status = 'converted' THEN 1 END)::float
            / NULLIF(COUNT(*), 0) * 100)::numeric, 1
        )                                                                   AS rate
      FROM leads
      WHERE source IS NOT NULL
      GROUP BY source
      ORDER BY rate DESC
    `);

    res.json(result.rows.map(r => ({
      source:    r.source,
      total:     parseInt(r.total),
      converted: parseInt(r.converted),
      rate:      parseFloat(r.rate) || 0,
    })));
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

// ── 5. performance ────────────────────────────────────────────────────────────

export const getPerformance = async (req, res) => {
  try {
    const cached = getCached("performance");
    if (cached) return res.json(cached);

    // Attribute each opportunity to the owner of its LEAD (leads.assigned_to),
    // exactly like the pipeline view. This keeps the performance table
    // consistent with the Kanban even when opportunities.assigned_to is stale
    // or NULL (e.g. opportunities created before assignment was inherited).
    const result = await pool.query(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        COUNT(o.id)                                                        AS total_opps,
        COUNT(CASE WHEN o.stage = 'closed_won'  THEN 1 END)               AS won,
        COUNT(CASE WHEN o.stage = 'closed_lost' THEN 1 END)               AS lost,
        ROUND(
          (COUNT(CASE WHEN o.stage = 'closed_won' THEN 1 END)::float
            / NULLIF(COUNT(CASE WHEN o.stage IN ('closed_won','closed_lost') THEN 1 END), 0)
            * 100)::numeric, 1
        )                                                                   AS win_rate,
        COALESCE(SUM(CASE WHEN o.stage = 'closed_won' THEN o.amount END), 0) AS ca_genere,
        COALESCE(SUM(o.amount), 0)                                         AS ca_pipeline
      FROM users u
      LEFT JOIN leads l         ON l.assigned_to = u.id
      LEFT JOIN opportunities o ON o.lead_id     = l.id
      WHERE u.role = 'sales'
      GROUP BY u.id, u.name, u.email, u.role
      ORDER BY ca_genere DESC
    `);

    // Defensive double-filter: even if the SQL somehow let through a non-sales user, drop it here.
    const sales = result.rows.filter(r => r.role === 'sales');

    const payload = sales.map(r => ({
      id:          r.id,
      name:        r.name,
      email:       r.email,
      role:        r.role,
      total_opps:  parseInt(r.total_opps),
      won:         parseInt(r.won),
      lost:        parseInt(r.lost),
      win_rate:    r.win_rate === null ? null : parseFloat(r.win_rate),
      ca_genere:   parseFloat(r.ca_genere),
      ca_pipeline: parseFloat(r.ca_pipeline),
    }));

    setCached("performance", payload);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

// ── 6. ai-scores ──────────────────────────────────────────────────────────────

export const getAiScores = async (req, res) => {
  try {
    const [distribution, trend] = await Promise.all([

      // Score distribution in buckets of 20
      pool.query(`
        SELECT
          CASE
            WHEN current_score < 20  THEN '0-20'
            WHEN current_score < 40  THEN '20-40'
            WHEN current_score < 60  THEN '40-60'
            WHEN current_score < 80  THEN '60-80'
            ELSE '80-100'
          END                        AS bucket,
          COUNT(*)                   AS count
        FROM leads
        WHERE current_score IS NOT NULL
          AND status NOT IN ('lost')
        GROUP BY bucket
        ORDER BY bucket
      `),

      // Average score per day from ai_scoring_history (last 30 days)
      pool.query(`
        SELECT
          DATE(calculated_at)        AS day,
          ROUND(AVG(score_value)::numeric, 2) AS avg_score
        FROM ai_scoring_history
        WHERE calculated_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(calculated_at)
        ORDER BY day
      `),
    ]);

    res.json({
      distribution: distribution.rows.map(r => ({
        bucket: r.bucket,
        count:  parseInt(r.count),
      })),
      trend: trend.rows.map(r => ({
        day:       r.day instanceof Date
          ? r.day.toISOString().slice(0, 10)
          : String(r.day).slice(0, 10),
        avg_score: parseFloat(r.avg_score),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};
