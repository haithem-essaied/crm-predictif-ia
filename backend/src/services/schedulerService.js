/**
 * schedulerService.js — node-cron automation engine.
 *
 * Runs every hour and evaluates all active automation rules:
 *
 *   score_threshold  — fires when a lead's current_score >= rule.threshold
 *                      and no notification was already created for this
 *                      lead+rule combo in the last 24 h.
 *
 *   inactivity       — fires when a lead has no interaction in the last
 *                      rule.inactivity_days days.
 *
 * For each match it inserts a row in `notifications`.
 */

import cron from "node-cron";
import pool from "../config/db.js";
import { sendLeadEmail } from "./emailService.js";

// ── helpers ─────────────────────────────────────────────────────────────────

async function alreadyNotified(leadId, ruleId) {
  const result = await pool.query(
    `SELECT 1 FROM notifications
     WHERE lead_id = $1 AND rule_id = $2
       AND created_at > NOW() - INTERVAL '24 hours'
     LIMIT 1`,
    [leadId, ruleId]
  );
  return result.rows.length > 0;
}

async function createNotification(leadId, ruleId, message, type = "info") {
  await pool.query(
    `INSERT INTO notifications (lead_id, rule_id, message, type)
     VALUES ($1, $2, $3, $4)`,
    [leadId, ruleId, message, type]
  );
}

// ── rule evaluators ──────────────────────────────────────────────────────────

async function handleActions(rule, lead, message, notifType) {
  // 1. In-app notification (always when action includes 'notify' or 'both')
  if (rule.action === "notify" || rule.action === "both") {
    await createNotification(lead.id, rule.id, message, notifType);
  }

  // 2. Email (when action includes 'email' or 'both')
  if ((rule.action === "email" || rule.action === "both") && lead.email) {
    const result = await sendLeadEmail({
      to:             lead.email,
      leadName:       `${lead.first_name} ${lead.last_name}`,
      score:          parseFloat(lead.current_score || 0).toFixed(1),
      conversionProb: parseFloat(lead.conversion_probability || 0),
      reason:         message,
    });

    // 3. Log sent email as interaction in DB (as per the report spec)
    if (result.success) {
      await pool.query(
        `INSERT INTO interactions (lead_id, type, channel, duration, value)
         VALUES ($1, 'email_sent', 'email', 0, $2)`,
        [
          lead.id,
          JSON.stringify({
            rule:       rule.name,
            subject:    `Action requise : ${lead.first_name} ${lead.last_name}`,
            messageId:  result.messageId,
            previewUrl: result.previewUrl,
            status:     "sent",
          }),
        ]
      );
      if (result.previewUrl) {
        console.log(`[Email] Preview → ${result.previewUrl}`);
      }
    }
  }
}

async function evalScoreThreshold(rule) {
  const leads = await pool.query(
    `SELECT id, first_name, last_name, email, current_score, conversion_probability
     FROM leads
     WHERE current_score >= $1 AND status != 'converted'`,
    [rule.threshold]
  );

  for (const lead of leads.rows) {
    if (await alreadyNotified(lead.id, rule.id)) continue;

    const msg =
      `Lead ${lead.first_name} ${lead.last_name} a atteint un score IA ` +
      `de ${parseFloat(lead.current_score).toFixed(1)} ` +
      `(seuil : ${rule.threshold}). Relance recommandée.`;

    await handleActions(rule, lead, msg, "success");
    console.log(`[Scheduler] Score threshold — ${lead.first_name} ${lead.last_name}`);
  }
}

async function evalInactivity(rule) {
  const leads = await pool.query(
    `SELECT l.id, l.first_name, l.last_name, l.email,
            l.current_score, l.conversion_probability,
            MAX(i.timestamp) AS last_interaction
     FROM leads l
     LEFT JOIN interactions i ON i.lead_id = l.id
     WHERE l.status NOT IN ('converted', 'lost')
     GROUP BY l.id
     HAVING MAX(i.timestamp) < NOW() - ($1 || ' days')::INTERVAL
         OR MAX(i.timestamp) IS NULL`,
    [rule.inactivity_days]
  );

  for (const lead of leads.rows) {
    if (await alreadyNotified(lead.id, rule.id)) continue;

    const days = rule.inactivity_days;
    const msg =
      `Lead ${lead.first_name} ${lead.last_name} est inactif depuis ` +
      `plus de ${days} jour${days > 1 ? "s" : ""}. Pensez à le relancer.`;

    await handleActions(rule, lead, msg, "warning");
    console.log(`[Scheduler] Inactivité — ${lead.first_name} ${lead.last_name}`);
  }
}

// ── main job ─────────────────────────────────────────────────────────────────

async function runAutomationJob() {
  console.log("[Scheduler] Évaluation des règles d'automatisation…");
  try {
    const result = await pool.query(
      "SELECT * FROM automation_rules WHERE is_active = true"
    );

    for (const rule of result.rows) {
      if (rule.type === "score_threshold") await evalScoreThreshold(rule);
      if (rule.type === "inactivity")      await evalInactivity(rule);
    }

    console.log(`[Scheduler] ${result.rows.length} règle(s) évaluée(s).`);
  } catch (err) {
    console.error("[Scheduler] Erreur :", err.message);
  }
}

// ── export ───────────────────────────────────────────────────────────────────

export { runAutomationJob };

export function startScheduler() {
  // Run every hour at minute 0
  cron.schedule("0 * * * *", runAutomationJob);

  // Also run once immediately at startup so rules take effect right away
  runAutomationJob();

  console.log("[Scheduler] Démarré — évaluation toutes les heures.");
}
