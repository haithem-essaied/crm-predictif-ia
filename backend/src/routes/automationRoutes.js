import express from "express";
import {
  getRules, createRule, toggleRule, deleteRule,
  getNotifications, getUnreadCount, markAllRead,
} from "../controllers/automationController.js";
import { runAutomationJob } from "../services/schedulerService.js";
import authMiddleware from "../middleware/authMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();

// Gestion des règles (création / activation / suppression / exécution) :
// réservée à l'administrateur et au marketing.
const manageRules = [authMiddleware, roleMiddleware(["admin", "marketing"])];

// Rules — lecture ouverte à tous les rôles ; gestion réservée à admin/marketing
router.get("/rules",              authMiddleware, getRules);
router.post("/rules",             ...manageRules, createRule);
router.patch("/rules/:id/toggle", ...manageRules, toggleRule);
router.delete("/rules/:id",       ...manageRules, deleteRule);

// Notifications
router.get("/notifications",            authMiddleware, getNotifications);
router.get("/notifications/unread",     authMiddleware, getUnreadCount);
router.patch("/notifications/read-all", authMiddleware, markAllRead);

// Manual trigger (for demo / testing) — admin/marketing only
router.post("/run-now", ...manageRules, async (req, res) => {
  await runAutomationJob();
  res.json({ message: "Automation job executed" });
});

export default router;
