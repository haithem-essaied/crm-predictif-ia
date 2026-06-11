import express from "express";
import authRoutes from "./routes/authRoutes.js";
import leadRoutes from "./routes/leadRoutes.js";
import cors from "cors";
import importRoutes from "./routes/importRoutes.js";
import opportunityRoutes from "./routes/opportunityRoutes.js";
import interactionRoutes from "./routes/interactionRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import automationRoutes from "./routes/automationRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import { startScheduler } from "./services/schedulerService.js";

const app = express();

app.use(cors({
  origin: [
    process.env.FRONTEND_URL || "http://localhost:3001",
    "http://127.0.0.1:3001",
  ],
}));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/leads", leadRoutes);

app.use("/api/import", importRoutes);
app.use("/api/opportunities", opportunityRoutes);
app.use("/api/leads/:id/interactions", interactionRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/automation", automationRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/users", userRoutes);

startScheduler();

// Export the app instance for testing and server initialization
export default app;