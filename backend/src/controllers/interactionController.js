import pool from "../config/db.js";
import { scoreLeadWithAI, convertLeadWithAI } from "../services/aiService.js";

/**
 * POST /api/leads/:id/interactions
 *
 * 1. Saves the new interaction.
 * 2. Fetches all interactions for the lead and calls the ML service.
 * 3. Updates leads.current_score / conversion_probability / last_ai_update.
 * 4. Inserts a row in ai_scoring_history.
 *
 * If the ML service is down the interaction is still saved and the response
 * includes { ai_update: null } so the caller knows scoring was skipped.
 */
export const createInteraction = async (req, res) => {
  const { id: lead_id } = req.params;
  const { type, channel, duration, value } = req.body;

  if (!type || !channel) {
    return res.status(400).json({ error: "type and channel are required" });
  }

  try {
    // --- 1. persist interaction ---
    const insertResult = await pool.query(
      `INSERT INTO interactions (lead_id, type, channel, duration, value)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [lead_id, type, channel, duration ?? 0, value ?? null]
    );
    const interaction = insertResult.rows[0];

    // --- 2. fetch lead source + all interactions in parallel ---
    const [leadResult, interactionsResult] = await Promise.all([
      pool.query("SELECT source, created_at FROM leads WHERE id = $1", [lead_id]),
      pool.query(
        "SELECT type, channel, duration, timestamp FROM interactions WHERE lead_id = $1",
        [lead_id]
      ),
    ]);

    if (leadResult.rows.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const source     = leadResult.rows[0].source     || "Web";
    const created_at = leadResult.rows[0].created_at || null;
    const interactions = interactionsResult.rows;

    // --- 3. call ML service ---
    try {
      const [scoreResult, convResult] = await Promise.all([
        scoreLeadWithAI(lead_id, source, interactions, created_at),
        convertLeadWithAI(lead_id, source, interactions, created_at),
      ]);

      // --- 4. update lead AI fields ---
      await pool.query(
        `UPDATE leads
         SET current_score = $1,
             conversion_probability = $2,
             last_ai_update = NOW()
         WHERE id = $3`,
        [scoreResult.score, convResult.conversion_probability, lead_id]
      );

      // --- 5. record in history ---
      await pool.query(
        `INSERT INTO ai_scoring_history (lead_id, score_value, change_reason)
         VALUES ($1, $2, $3)`,
        [lead_id, scoreResult.score, "new_interaction"]
      );

      return res.status(201).json({
        interaction,
        ai_update: {
          score: scoreResult.score,
          conversion_probability: convResult.conversion_probability,
        },
      });
    } catch (aiErr) {
      // ML service unavailable — still return the saved interaction
      console.error("[AI] Scoring skipped:", aiErr.message);
      return res.status(201).json({ interaction, ai_update: null });
    }
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

/**
 * GET /api/leads/:id/interactions
 * Returns all interactions for a lead, newest first.
 */
export const getInteractionsByLead = async (req, res) => {
  const { id: lead_id } = req.params;

  try {
    // Cloisonnement : un 'sales' ne voit que les interactions de ses propres leads.
    const values = [lead_id];
    let scope = "";
    if (req.user.role === "sales") {
      values.push(req.user.id);
      scope = ` AND lead_id IN (SELECT id FROM leads WHERE assigned_to = $${values.length})`;
    }

    const result = await pool.query(
      `SELECT * FROM interactions
       WHERE lead_id = $1${scope}
       ORDER BY timestamp DESC`,
      values
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};
