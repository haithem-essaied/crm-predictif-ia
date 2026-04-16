import express from "express";
import pool from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import authMiddleware from "./middleware/authMiddleware.js";
import roleMiddleware from "./middleware/roleMiddleware.js";
import leadRoutes from "./routes/leadRoutes.js";

const app = express();
app.use(express.json());

// Test DB
app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      message: "DB connected",
      time: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



app.use("/api/auth", authRoutes);

app.get("/protected", authMiddleware, (req, res) => {
  res.json({
    message: "Access granted ",
    user: req.user,
  });
});

app.use("/api/leads", leadRoutes);

app.get(
  "/admin",
  authMiddleware,
  roleMiddleware(["admin"]),
  (req, res) => {
    res.json({ message: "Admin access ✅" });
  }
);
app.get(
  "/sales",
  authMiddleware,
  roleMiddleware(["admin", "sales"]),
  (req, res) => {
    res.json({ message: "Sales access ✅" });
  }
);
app.get(
  "/marketing",
  authMiddleware,
  roleMiddleware(["admin", "marketing"]),
  (req, res) => {
    res.json({ message: "Marketing access ✅" });
  }
);
app.listen(3000, () => {
  console.log("Server running on port 3000");
});