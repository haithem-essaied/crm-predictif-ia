import pool from "../config/db.js";

// GET all rules
export const getRules = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM automation_rules ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

// CREATE a rule
export const createRule = async (req, res) => {
  const { name, type, threshold, inactivity_days, action } = req.body;

  if (!name || !type) {
    return res.status(400).json({ error: "name and type are required" });
  }
  if (type === "score_threshold" && (threshold == null || threshold < 0 || threshold > 100)) {
    return res.status(400).json({ error: "threshold must be between 0 and 100" });
  }
  if (type === "inactivity" && (!inactivity_days || inactivity_days < 1)) {
    return res.status(400).json({ error: "inactivity_days must be >= 1" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO automation_rules (name, type, threshold, inactivity_days, action, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, type, threshold ?? null, inactivity_days ?? null, action || "notify", req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

// TOGGLE active/inactive
export const toggleRule = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE automation_rules
       SET is_active = NOT is_active
       WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Rule not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

// DELETE a rule
export const deleteRule = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM automation_rules WHERE id = $1", [id]);
    res.json({ message: "Rule deleted" });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

// GET notifications (unread first)
export const getNotifications = async (req, res) => {
  try {
    // Row-level scoping: a 'sales' user only sees notifications attached to
    // the leads assigned to them. Admin and marketing see everything.
    const params = [];
    let where = "";
    if (req.user.role === "sales") {
      params.push(req.user.id);
      where = "WHERE l.assigned_to = $1";
    }

    const result = await pool.query(`
      SELECT
        n.*,
        l.first_name,
        l.last_name,
        l.current_score,
        l.conversion_probability
      FROM notifications n
      LEFT JOIN leads l ON n.lead_id = l.id
      ${where}
      ORDER BY n.is_read ASC, n.created_at DESC
      LIMIT 50
    `, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

// GET unread count only
export const getUnreadCount = async (req, res) => {
  try {
    // Sales users only count unread notifications of their own leads.
    const params = [];
    let scope = "";
    if (req.user.role === "sales") {
      params.push(req.user.id);
      scope = "AND lead_id IN (SELECT id FROM leads WHERE assigned_to = $1)";
    }

    const result = await pool.query(
      `SELECT COUNT(*) AS count FROM notifications WHERE is_read = false ${scope}`,
      params
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

// MARK all as read
export const markAllRead = async (req, res) => {
  try {
    // Sales users only mark their own leads' notifications as read,
    // so they don't clear other commercials' unread notifications.
    const params = [];
    let scope = "";
    if (req.user.role === "sales") {
      params.push(req.user.id);
      scope = "AND lead_id IN (SELECT id FROM leads WHERE assigned_to = $1)";
    }

    await pool.query(
      `UPDATE notifications SET is_read = true WHERE is_read = false ${scope}`,
      params
    );
    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};
