import express from "express";
import { getUsers, createUser, updateUser, toggleUserStatus } from "../controllers/userController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import roleMiddleware from "../middleware/roleMiddleware.js";

const router = express.Router();

const adminOnly = [authMiddleware, roleMiddleware(["admin"])];

router.get("/",            ...adminOnly, getUsers);
router.post("/",           ...adminOnly, createUser);
router.put("/:id",         ...adminOnly, updateUser);
router.patch("/:id/status",...adminOnly, toggleUserStatus);

export default router;
