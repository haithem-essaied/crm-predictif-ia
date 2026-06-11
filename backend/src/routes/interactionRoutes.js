import express from "express";
import {
  createInteraction,
  getInteractionsByLead,
} from "../controllers/interactionController.js";
import authMiddleware    from "../middleware/authMiddleware.js";
import roleMiddleware    from "../middleware/roleMiddleware.js";

// mergeParams: true lets us read :id from the parent /api/leads/:id route
const router = express.Router({ mergeParams: true });

// GET  — Sales, Admin, Marketing  (le marketing voit le nombre/liste des interactions)
// POST — Sales, Marketing, Admin
router.get("/",  authMiddleware, roleMiddleware(["admin", "sales", "marketing"]), getInteractionsByLead);
router.post("/", authMiddleware, roleMiddleware(["admin", "sales", "marketing"]), createInteraction);

export default router;
