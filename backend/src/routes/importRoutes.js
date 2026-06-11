import express        from "express";
import multer         from "multer";
import { importLeads, importInteractions } from "../controllers/importController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 5 * 1024 * 1024 },            // 5 Mo maximum
  fileFilter: (req, file, cb) => {                   // accepte uniquement les fichiers CSV
    const ok = file.mimetype === "text/csv" ||
               file.originalname.toLowerCase().endsWith(".csv");
    cb(ok ? null : new Error("Seuls les fichiers CSV sont acceptés."), ok);
  },
});

// Admin and Marketing — marketing imports leads issued from campaigns
const guard = [authMiddleware, roleMiddleware(["admin", "marketing"])];

router.post("/leads",        ...guard, upload.single("file"), importLeads);
router.post("/interactions", ...guard, upload.single("file"), importInteractions);

export default router;
