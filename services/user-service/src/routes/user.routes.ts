import { Router } from "express";
import { profile } from "../controllers/auth.controller.js";

const router = Router();

router.get("/profile", profile);

export default router;
