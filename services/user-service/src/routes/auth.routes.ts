import { Router } from "express";
import {
  profile,
  signin,
  signinWithGoogle,
  signout,
  signup,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/signup", signup);
router.post("/signin", signin);
router.post("/google", signinWithGoogle);
router.post("/signout", signout);
router.get("/profile", requireAuth, profile);

export default router;
