import fs from "fs";
import csv from "csv-parser";
import pool from "../config/db.js";

// IMPORT LEADS CSV
export const importLeads = async (req, res) => {
  try {
    const results = [];

    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on("data", (data) => {
        results.push(data);
      })
      .on("end", async () => {
        for (const row of results) {
          // validation simple
          if (!row.email || !row.first_name) {
            continue;
          }

          await pool.query(
            `
            INSERT INTO leads
            (first_name, last_name, email, phone, company, job_title, source, status)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT (email) DO NOTHING
            `,
            [
              row.first_name,
              row.last_name,
              row.email,
              row.phone,
              row.company,
              row.job_title,
              row.source,
              row.status,
            ]
          );
        }

        res.json({
          message: "Leads imported successfully ✅",
          total: results.length,
        });
      });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
export const importInteractions = async (req, res) => {
  try {
    const results = [];

    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on("data", (data) => {
        results.push(data);
      })
      .on("end", async () => {
        for (const row of results) {

          // chercher lead par email
          const leadResult = await pool.query(
            "SELECT id FROM leads WHERE email = $1",
            [row.lead_email]
          );

          if (leadResult.rows.length === 0) {
            continue;
          }

          const leadId = leadResult.rows[0].id;

          await pool.query(
            `
            INSERT INTO interactions
            (lead_id, type, channel, duration, value)
            VALUES ($1,$2,$3,$4,$5)
            `,
            [
              leadId,
              row.type,
              row.channel,
              row.duration,
              row.value,
            ]
          );
        }

        res.json({
          message: "Interactions imported ✅",
          total: results.length,
        });
      });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};