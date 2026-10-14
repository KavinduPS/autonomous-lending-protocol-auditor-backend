import { Router } from "express";
import {
  profile,
  signin,
  signinWithGoogle,
  signout,
  signup,
} from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.post("/signup", signup);
router.post("/signin", signin);
router.post("/google", signinWithGoogle);
router.post("/signout", signout);
router.get("/profile", requireAuth, profile);

export default router;
