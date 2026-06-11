import express from "express";
import {
  createOpportunity,
  getPipeline,
  updateOpportunityStage,
  deleteOpportunity,
} from "../controllers/opportunityController.js";

import authMiddleware from "../middleware/authMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();

// Read — all authenticated roles
router.get("/", authMiddleware, getPipeline);

// Write — admin and sales only
router.post("/",         authMiddleware, roleMiddleware(["admin", "sales"]), createOpportunity);
router.put("/:id/stage", authMiddleware, roleMiddleware(["admin", "sales"]), updateOpportunityStage);
router.delete("/:id",    authMiddleware, roleMiddleware(["admin", "sales"]), deleteOpportunity);

export default router;
