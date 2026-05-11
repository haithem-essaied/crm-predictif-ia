import express from "express";
import multer from "multer";
import {
  importLeads,
  importInteractions,
} from "../controllers/importController.js";

const router = express.Router();

// stockage fichier
const upload = multer({ dest: "uploads/" });

router.post(
  "/leads",
  upload.single("file"),
  importLeads
);
router.post(
  "/interactions",
  upload.single("file"),
  importInteractions
);

export default router;