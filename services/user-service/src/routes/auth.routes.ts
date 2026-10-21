import { Router } from "express";
import {
  signin,
  signinWithGoogle,
  signout,
  signup,
} from "../controllers/auth.controller.js";

const router = Router();

router.post("/signup", signup);
router.post("/signin", signin);
router.post("/google", signinWithGoogle);
router.post("/signout", signout);

export default router;
