import pool from "../config/db.js";

export const getDashboardStats = async (req, res) => {
  try {
    const [leadsStats, sourceStats, pipelineStats, topLeads] = await Promise.all([

      // KPIs: totals, per-status counts, avg score, conversion rate
      pool.query(`
        SELECT
          COUNT(*)                                                          AS total,
          COUNT(CASE WHEN status = 'new'       THEN 1 END)                 AS new_count,
          COUNT(CASE WHEN status = 'active'    THEN 1 END)                 AS active_count,
          COUNT(CASE WHEN status = 'converted' THEN 1 END)                 AS converted_count,
          COUNT(CASE WHEN status = 'lost'      THEN 1 END)                 AS lost_count,
          ROUND(AVG(current_score)::numeric, 2)                            AS avg_score,
          ROUND(
            (COUNT(CASE WHEN status = 'converted' THEN 1 END)::float
              / NULLIF(COUNT(*), 0) * 100)::numeric, 1
          )                                                                 AS conversion_rate
        FROM leads
      `),

      // Leads per acquisition source
      pool.query(`
        SELECT source, COUNT(*) AS count
        FROM leads
        WHERE source IS NOT NULL
        GROUP BY source
        ORDER BY count DESC
      `),

      // Opportunities per pipeline stage
      pool.query(`
        SELECT
          stage,
          COUNT(*)        AS count,
          COALESCE(SUM(amount), 0) AS total_amount
        FROM opportunities
        GROUP BY stage
        ORDER BY
          CASE stage
            WHEN 'discovery'    THEN 1
            WHEN 'proposal'     THEN 2
            WHEN 'negotiation'  THEN 3
            WHEN 'closed_won'   THEN 4
            WHEN 'closed_lost'  THEN 5
          END
      `),

      // Top 5 leads by current AI score
      pool.query(`
        SELECT
          id, first_name, last_name, company, status,
          ROUND(current_score::numeric, 1)           AS current_score,
          ROUND(conversion_probability::numeric, 4)  AS conversion_probability
        FROM leads
        ORDER BY current_score DESC
        LIMIT 5
      `),
    ]);

    const kpi = leadsStats.rows[0];

    res.json({
      kpi: {
        total:           parseInt(kpi.total),
        new:             parseInt(kpi.new_count),
        active:          parseInt(kpi.active_count),
        converted:       parseInt(kpi.converted_count),
        lost:            parseInt(kpi.lost_count),
        avg_score:       parseFloat(kpi.avg_score) || 0,
        conversion_rate: parseFloat(kpi.conversion_rate) || 0,
      },
      leads_by_source:   sourceStats.rows,
      pipeline:          pipelineStats.rows,
      top_leads:         topLeads.rows,
    });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

