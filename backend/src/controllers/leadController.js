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
    } = req.body;

    const result = await pool.query(
      `INSERT INTO leads (first_name, last_name, email, company, source)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [first_name, last_name, email, company, source]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET ALL (avec pagination + filtre)
export const getLeads = async (req, res) => {
  try {
    const { page = 1, limit = 5, status, search } = req.query;

    const offset = (page - 1) * limit;

    let query = `SELECT * FROM leads WHERE 1=1`;
    let values = [];

    // filtre status
    if (status) {
      values.push(status);
      query += ` AND status = $${values.length}`;
    }

    // recherche nom/email
    if (search) {
      values.push(`%${search}%`);
      query += ` AND (first_name ILIKE $${values.length} OR email ILIKE $${values.length})`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET ONE
export const getLeadById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "SELECT * FROM leads WHERE id = $1",
      [id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// UPDATE
export const updateLead = async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, email, status } = req.body;

    const result = await pool.query(
      `UPDATE leads
       SET first_name=$1, last_name=$2, email=$3, status=$4
       WHERE id=$5 RETURNING *`,
      [first_name, last_name, email, status, id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE
export const deleteLead = async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query("DELETE FROM leads WHERE id=$1", [id]);

    res.json({ message: "Lead deleted ✅" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};