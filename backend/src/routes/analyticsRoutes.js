import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  getOverview,
  getPipelineAnalytics,
  getSalesTrend,
  getConversionRate,
  getPerformance,
  getAiScores,
} from "../controllers/analyticsController.js";

const router = express.Router();

router.get("/overview",         authMiddleware, getOverview);
router.get("/pipeline",         authMiddleware, getPipelineAnalytics);
router.get("/sales-trend",      authMiddleware, getSalesTrend);
router.get("/conversion-rate",  authMiddleware, getConversionRate);
router.get("/performance",      authMiddleware, getPerformance);
router.get("/ai-scores",        authMiddleware, getAiScores);

export default router;
