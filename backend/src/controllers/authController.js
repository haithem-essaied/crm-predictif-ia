import pool from "../config/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// REGISTER
export const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING id, email`,
      [name, email, hashedPassword, role || "sales"]
    );

    res.json({
      message: "User created ✅",
      user: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};

// LOGIN
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];

    if (user.is_active === false) {
      return res.status(401).json({ error: "Account disabled" });
    }

    // compare password
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // generate token — include name & email so the UI can display the
    // logged-in user (the topbar decodes these straight from the JWT).
    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Login success ✅",
      token,
    });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
};