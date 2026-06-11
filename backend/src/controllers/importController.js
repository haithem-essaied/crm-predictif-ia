import fs   from "fs";
import csv  from "csv-parser";
import pool from "../config/db.js";
import { scoreLeadWithAI, convertLeadWithAI } from "../services/aiService.js";

// ── helpers ───────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateLeadRow(row, index) {
  const errors = [];
  if (!row.first_name?.trim()) errors.push("first_name manquant");
  if (!row.last_name?.trim())  errors.push("last_name manquant");
  if (!row.email?.trim())      errors.push("email manquant");
  else if (!EMAIL_RE.test(row.email.trim())) errors.push("format email invalide");
  return errors;
}

function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data",  (row) => rows.push(row))
      .on("end",   () => resolve(rows))
      .on("error", reject);
  });
}

function cleanFile(filePath) {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
}

// ── POST /api/import/leads ────────────────────────────────────────────────────

export const importLeads = async (req, res) => {
  const filePath = req.file?.path;
  try {
    const rows = await parseCSV(filePath);

    const invalid    = [];   // { line, reasons[] }
    const validRows  = [];

    // 1 — Per-row validation
    rows.forEach((row, i) => {
      const errors = validateLeadRow(row, i);
      if (errors.length > 0) {
        invalid.push({ line: i + 2, email: row.email || "—", reasons: errors });
      } else {
        validRows.push(row);
      }
    });

    // 2 — Duplicate detection: one query for all emails at once
    let duplicates = [];
    let toInsert   = validRows;

    if (validRows.length > 0) {
      const emails      = validRows.map((r) => r.email.trim().toLowerCase());
      const placeholders = emails.map((_, i) => `$${i + 1}`).join(", ");
      const existing    = await pool.query(
        `SELECT email FROM leads WHERE LOWER(email) IN (${placeholders})`,
        emails
      );
      const existingSet = new Set(existing.rows.map((r) => r.email.toLowerCase()));

      duplicates = validRows
        .filter((r) => existingSet.has(r.email.trim().toLowerCase()))
        .map((r) => r.email.trim());

      // also deduplicate within the CSV itself (keep first occurrence)
      const seenInFile = new Set();
      toInsert = validRows.filter((r) => {
        const key = r.email.trim().toLowerCase();
        if (existingSet.has(key) || seenInFile.has(key)) return false;
        seenInFile.add(key);
        return true;
      });

      // count intra-file duplicates as "duplicates" too
      validRows.forEach((r) => {
        const key = r.email.trim().toLowerCase();
        if (!existingSet.has(key) && !toInsert.find(t => t.email.trim().toLowerCase() === key)
            && !duplicates.includes(r.email.trim())) {
          duplicates.push(r.email.trim());
        }
      });
    }

    // 3 — Batch insert
    let created = 0;
    if (toInsert.length > 0) {
      // Résolution optionnelle de la colonne `assigned_to_email` vers l'id du commercial.
      // Une seule requête pour tous les e-mails d'assignation distincts.
      const assignEmails = [...new Set(
        toInsert.map((r) => (r.assigned_to_email || "").trim().toLowerCase()).filter(Boolean)
      )];
      let emailToId = {};
      if (assignEmails.length > 0) {
        const ph = assignEmails.map((_, i) => `$${i + 1}`).join(", ");
        const users = await pool.query(
          `SELECT id, LOWER(email) AS email FROM users WHERE LOWER(email) IN (${ph})`,
          assignEmails
        );
        emailToId = Object.fromEntries(users.rows.map((u) => [u.email, u.id]));
      }

      const valueClauses = [];
      const params       = [];

      toInsert.forEach((row, i) => {
        const b = i * 9;
        valueClauses.push(
          `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9})`
        );
        const assignKey = (row.assigned_to_email || "").trim().toLowerCase();
        params.push(
          row.first_name.trim(),
          row.last_name.trim(),
          row.email.trim(),
          row.phone     || null,
          row.company   || null,
          row.job_title || null,
          row.source    || null,
          row.status    || "new",
          emailToId[assignKey] || null   // assigned_to (null si e-mail absent/inconnu)
        );
      });

      await pool.query(
        `INSERT INTO leads
           (first_name, last_name, email, phone, company, job_title, source, status, assigned_to)
         VALUES ${valueClauses.join(", ")}`,
        params
      );
      created = toInsert.length;
    }

    cleanFile(filePath);

    // 4 — Detailed report
    res.status(201).json({
      message:    "Import terminé",
      total:      rows.length,
      created,
      duplicates: duplicates.length,
      invalid:    invalid.length,
      errors:     invalid,          // list of { line, email, reasons[] }
      skipped:    duplicates,       // list of duplicate emails
    });

  } catch (err) {
    cleanFile(filePath);
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

// ── POST /api/import/interactions ─────────────────────────────────────────────

export const importInteractions = async (req, res) => {
  const filePath = req.file?.path;
  try {
    const rows = await parseCSV(filePath);

    const invalid  = [];
    const inserted = [];
    const missing  = [];   // lead_email not found in DB

    for (const [i, row] of rows.entries()) {
      if (!row.lead_email?.trim()) {
        invalid.push({ line: i + 2, reasons: ["lead_email manquant"] });
        continue;
      }
      if (!row.type?.trim()) {
        invalid.push({ line: i + 2, email: row.lead_email, reasons: ["type manquant"] });
        continue;
      }

      const leadRes = await pool.query(
        "SELECT id FROM leads WHERE LOWER(email) = LOWER($1)",
        [row.lead_email.trim()]
      );

      if (leadRes.rows.length === 0) {
        missing.push(row.lead_email.trim());
        continue;
      }

      const leadId = leadRes.rows[0].id;
      await pool.query(
        `INSERT INTO interactions (lead_id, type, channel, duration, value)
         VALUES ($1, $2, $3, $4, $5)`,
        [leadId, row.type, row.channel || null, row.duration || null, row.value || null]
      );
      inserted.push(leadId);
    }

    cleanFile(filePath);

    res.status(201).json({
      message:  "Import interactions terminé",
      total:    rows.length,
      created:  inserted.length,
      invalid:  invalid.length,
      missing:  missing.length,
      errors:   invalid,
    });

    // AI rescore (background — after response sent)
    const uniqueLeadIds = [...new Set(inserted)];
    for (const leadId of uniqueLeadIds) {
      try {
        const leadRes = await pool.query(
          "SELECT source FROM leads WHERE id = $1", [leadId]
        );
        if (leadRes.rows.length === 0) continue;

        const source  = leadRes.rows[0].source || "Web";
        const intRes  = await pool.query(
          "SELECT type, channel, duration FROM interactions WHERE lead_id = $1",
          [leadId]
        );

        const [scoreResult, convResult] = await Promise.all([
          scoreLeadWithAI(leadId, source, intRes.rows),
          convertLeadWithAI(leadId, source, intRes.rows),
        ]);

        await pool.query(
          `UPDATE leads
           SET current_score = $1, conversion_probability = $2, last_ai_update = NOW()
           WHERE id = $3`,
          [scoreResult.score, convResult.conversion_probability, leadId]
        );
        await pool.query(
          `INSERT INTO ai_scoring_history (lead_id, score_value, change_reason)
           VALUES ($1, $2, $3)`,
          [leadId, scoreResult.score, "csv_import"]
        );
      } catch (aiErr) {
        console.error(`[AI] Score refresh failed for lead ${leadId}:`, aiErr.message);
      }
    }

  } catch (err) {
    cleanFile(filePath);
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};
