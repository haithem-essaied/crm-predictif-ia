import pool from "../config/db.js";

// CREATE LEAD
export const createLead = async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      email,
      company,
      source,
      assigned_to = null,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO leads (first_name, last_name, email, company, source, assigned_to)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [first_name, last_name, email, company, source, assigned_to]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

// GET ALL (avec pagination + filtre)
export const getLeads = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search, score_min, assigned_to, sort } = req.query;

    const offset = (page - 1) * limit;

    let baseWhere = `WHERE 1=1`;
    let values = [];

    // filtre status
    if (status) {
      values.push(status);
      baseWhere += ` AND status = $${values.length}`;
    }

    // Row-level scoping: a 'sales' user only sees the leads assigned to them.
    // Admin and marketing see everything (and may filter by assigned_to).
    if (req.user.role === "sales") {
      values.push(req.user.id);
      baseWhere += ` AND assigned_to = $${values.length}`;
    } else if (assigned_to) {
      values.push(assigned_to);
      baseWhere += ` AND assigned_to = $${values.length}`;
    }

    // filtre score minimum
    if (score_min !== undefined && score_min !== "") {
      values.push(parseFloat(score_min));
      baseWhere += ` AND current_score >= $${values.length}`;
    }

    // recherche nom/email
    if (search) {
      values.push(`%${search}%`);
      baseWhere += ` AND (first_name ILIKE $${values.length} OR last_name ILIKE $${values.length} OR email ILIKE $${values.length} OR source ILIKE $${values.length})`;
    }

    // Total count (same filters, no pagination)
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM leads ${baseWhere}`,
      values
    );
    const total = parseInt(countResult.rows[0].count);

    // Sort order — only "asc" or "desc" allowed (no SQL injection: explicit mapping)
    const sortOrder = sort === "asc" ? "ASC" : "DESC";

    // Paginated data
    const dataQuery = `SELECT * FROM leads ${baseWhere} ORDER BY current_score ${sortOrder} NULLS LAST, created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    values.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(dataQuery, values);

    res.json({
      data:        result.rows,
      total,
      page:        parseInt(page),
      limit:       parseInt(limit),
      total_pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

// GET ONE
export const getLeadById = async (req, res) => {
  try {
    const { id } = req.params;

    // Cloisonnement : un 'sales' ne peut consulter que ses propres leads.
    const values = [id];
    let scope = "";
    if (req.user.role === "sales") {
      values.push(req.user.id);
      scope = ` AND l.assigned_to = $${values.length}`;
    }

    const result = await pool.query(
      `SELECT l.*,
              u.name  AS assigned_to_name,
              u.email AS assigned_to_email
       FROM leads l
       LEFT JOIN users u ON u.id = l.assigned_to
       WHERE l.id = $1${scope}`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

// UPDATE
export const updateLead = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      first_name, last_name, email,
      phone, company, job_title, source,
      status, assigned_to,
    } = req.body;

    const values = [
      first_name, last_name, email,
      phone ?? null, company ?? null, job_title ?? null, source ?? null,
      status, assigned_to ?? null,
      id,
    ];
    // Cloisonnement : un 'sales' ne peut modifier que ses propres leads.
    let scope = "";
    if (req.user.role === "sales") {
      values.push(req.user.id);
      scope = ` AND assigned_to = $${values.length}`;
    }

    const result = await pool.query(
      `UPDATE leads
       SET first_name  = $1,
           last_name   = $2,
           email       = $3,
           phone       = $4,
           company     = $5,
           job_title   = $6,
           source      = $7,
           status      = $8,
           assigned_to = $9,
           updated_at  = NOW()
       WHERE id = $10${scope}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

// DELETE
export const deleteLead = async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query("DELETE FROM leads WHERE id=$1", [id]);

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

// GET SCORE HISTORY — last 30 entries from ai_scoring_history
export const getLeadScoreHistory = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT score_value, change_reason, calculated_at
       FROM ai_scoring_history
       WHERE lead_id = $1
       ORDER BY calculated_at ASC
       LIMIT 30`,
      [id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};