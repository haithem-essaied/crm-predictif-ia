import express from "express";
import rateLimit from "express-rate-limit";
import { register, login } from "../controllers/authController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();

// Anti brute-force : 10 tentatives de connexion maximum par IP toutes les 15 minutes.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives de connexion. Réessayez dans 15 minutes." },
});

// Login is public — no auth required (protégé contre le brute-force)
router.post("/login", loginLimiter, login);

// Register is admin-only — only an existing admin can create new accounts
router.post("/register", authMiddleware, roleMiddleware(["admin"]), register);

export default router;
