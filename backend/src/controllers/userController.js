import pool from "../config/db.js";
import bcrypt from "bcrypt";

const USER_FIELDS = "id, name, email, role, is_active, created_at, updated_at";

// GET /api/users
export const getUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${USER_FIELDS} FROM users ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

// POST /api/users
export const createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email and password are required" });
    }

    const validRoles = ["admin", "sales", "marketing"];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Email already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING ${USER_FIELDS}`,
      [name, email, hashedPassword, role || "sales"]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

// PUT /api/users/:id
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role } = req.body;

    if (!name && !email && !role) {
      return res.status(400).json({ error: "Provide at least one field to update" });
    }

    const existing = await pool.query(`SELECT ${USER_FIELDS} FROM users WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    if (email && email !== existing.rows[0].email) {
      const duplicate = await pool.query(
        "SELECT id FROM users WHERE email = $1 AND id != $2",
        [email, id]
      );
      if (duplicate.rows.length > 0) {
        return res.status(409).json({ error: "Email already in use" });
      }
    }

    const validRoles = ["admin", "sales", "marketing"];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const result = await pool.query(
      `UPDATE users
       SET name       = COALESCE($1, name),
           email      = COALESCE($2, email),
           role       = COALESCE($3, role),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING ${USER_FIELDS}`,
      [name || null, email || null, role || null, id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

// PATCH /api/users/:id/status
export const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent admin from deactivating their own account
    if (String(id) === String(req.user.id)) {
      return res.status(400).json({ error: "Cannot change your own account status" });
    }

    const existing = await pool.query(`SELECT ${USER_FIELDS} FROM users WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const result = await pool.query(
      `UPDATE users
       SET is_active   = NOT is_active,
           updated_at  = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING ${USER_FIELDS}`,
      [id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};
