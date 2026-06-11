import express from "express";
import {
  createLead,
  getLeads,
  getLeadById,
  updateLead,
  deleteLead,
  getLeadScoreHistory,
} from "../controllers/leadController.js";

import authMiddleware    from "../middleware/authMiddleware.js";
import roleMiddleware    from "../middleware/roleMiddleware.js";

const router = express.Router();

// Read access — all authenticated roles
router.get("/",                  authMiddleware, getLeads);
router.get("/:id",               authMiddleware, getLeadById);
router.get("/:id/score-history", authMiddleware, getLeadScoreHistory);

// Write access — admin and sales only (marketing cannot create/modify/delete leads)
router.post("/",    authMiddleware, roleMiddleware(["admin", "sales"]), createLead);
router.put("/:id",  authMiddleware, roleMiddleware(["admin", "sales"]), updateLead);
router.delete("/:id", authMiddleware, roleMiddleware(["admin"]),        deleteLead);

export default router;
