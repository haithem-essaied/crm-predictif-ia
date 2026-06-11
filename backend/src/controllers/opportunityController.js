import pool from "../config/db.js";
import { invalidateAnalyticsCache } from "./analyticsController.js";

// CREATE OPPORTUNITY
export const createOpportunity = async (req, res) => {
  try {
    const {
      lead_id,
      amount,
      assigned_to,
      expected_closing_date,
    } = req.body;

    // If the request did not provide assigned_to, inherit it from the lead
    // so the new opportunity is naturally attributed to the lead's salesperson.
    let effectiveAssignedTo = assigned_to ?? null;
    if (!effectiveAssignedTo) {
      const leadResult = await pool.query(
        "SELECT assigned_to FROM leads WHERE id = $1",
        [lead_id]
      );
      if (leadResult.rows.length > 0) {
        effectiveAssignedTo = leadResult.rows[0].assigned_to || null;
      }
    }

    const result = await pool.query(
      `
      INSERT INTO opportunities
      (lead_id, amount, assigned_to, expected_closing_date, stage)
      VALUES ($1,$2,$3,$4,'discovery')
      RETURNING *
      `,
      [
        lead_id,
        amount,
        effectiveAssignedTo,
        expected_closing_date,
      ]
    );

    // R1 — A new opportunity means the lead is now actively worked on:
    // promote 'new' → 'active'. The "AND status = 'new'" guard avoids
    // downgrading a lead already marked 'active', 'converted' or 'lost'
    // (a lead can have several opportunities).
    await pool.query(
      "UPDATE leads SET status = 'active', updated_at = NOW() WHERE id = $1 AND status = 'new'",
      [lead_id]
    );

    // Une nouvelle opportunité change les agrégats du dashboard (nb d'opps,
    // CA pipeline) : on invalide le cache analytics pour un affichage immédiat.
    invalidateAnalyticsCache();

    res.json(result.rows[0]);

  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

export const getPipeline = async (req, res) => {
  try {

    // Row-level scoping: a 'sales' user only sees the opportunities of the
    // leads assigned to them. Admin and marketing see the whole pipeline.
    const params = [];
    let where = "";
    if (req.user.role === "sales") {
      params.push(req.user.id);
      where = "WHERE leads.assigned_to = $1";
    }

    const result = await pool.query(`
      SELECT
        opportunities.*,
        leads.first_name,
        leads.last_name,
        leads.company
      FROM opportunities
      JOIN leads
      ON opportunities.lead_id = leads.id
      ${where}
      ORDER BY created_at DESC
    `, params);

    res.json(result.rows);

  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};
export const updateOpportunityStage = async (req, res) => {
  try {

    const { id } = req.params;
    const { stage } = req.body;

    // récupérer ancien stage
    const oldResult = await pool.query(
      "SELECT stage FROM opportunities WHERE id = $1",
      [id]
    );

    const oldStage = oldResult.rows[0].stage;

    // update opportunity
    const result = await pool.query(
      `
      UPDATE opportunities
      SET stage = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
      `,
      [stage, id]
    );

    // save history
    await pool.query(
      `
      INSERT INTO pipeline_history
      (opportunity_id, old_stage, new_stage, changed_by)
      VALUES ($1,$2,$3,$4)
      `,
      [id, oldStage, stage, req.user.id]
    );

    // R2 — Winning an opportunity converts its lead. One closed_won is
    // enough to consider the lead converted, even if the lead has other
    // opportunities still open. (closed_lost stays manual — R3 — because
    // one lost deal doesn't mean the whole lead is lost.)
    if (stage === "closed_won") {
      await pool.query(
        "UPDATE leads SET status = 'converted', updated_at = NOW() WHERE id = $1",
        [result.rows[0].lead_id]
      );
    }

    // Le changement d'étape (notamment vers closed_won/closed_lost) modifie
    // les colonnes « Gagnées / Perdues / CA généré » de la table Performance
    // et les KPI d'overview : on invalide le cache pour éviter d'afficher une
    // photo périmée jusqu'à l'expiration du TTL (5 min).
    invalidateAnalyticsCache();

    res.json(result.rows[0]);

  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

// DELETE OPPORTUNITY
export const deleteOpportunity = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Vérifier l'existence + récupérer le propriétaire du lead
    const existing = await client.query(
      `SELECT o.id, l.assigned_to
         FROM opportunities o
         JOIN leads l ON l.id = o.lead_id
        WHERE o.id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Opportunity not found" });
    }

    // Row-level scoping : un 'sales' ne supprime que les opportunités
    // de ses propres leads. Admin voit tout.
    if (req.user.role === "sales" && existing.rows[0].assigned_to !== req.user.id) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Access forbidden" });
    }

    // Supprimer l'historique dépendant (FK) puis l'opportunité
    await client.query("DELETE FROM pipeline_history WHERE opportunity_id = $1", [id]);
    await client.query("DELETE FROM opportunities WHERE id = $1", [id]);

    await client.query("COMMIT");

    // La suppression réduit le nb d'opps / le CA : on rafraîchit les agrégats.
    invalidateAnalyticsCache();

    res.status(204).send();
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Erreur interne du serveur" });
  } finally {
    client.release();
  }
};