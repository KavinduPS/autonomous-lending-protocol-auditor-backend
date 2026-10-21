import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../config/db.js";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
};

const createSession = (res: Response, userId: string) => {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET!, {
    expiresIn: "7d",
  });

  res.cookie("token", token, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

export const signup = async (req: Request, res: Response) => {
  const { email, password, name } = req.body ?? {};

  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Email and password are required" });
  }
  if (password.length < 8) {
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters" });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { email: normalizedEmail, passwordHash, name },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    return res.status(201).json(user);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Something went wrong" });
  }
};

export const signin = async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user || !user.passwordHash || !user.isActive) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    createSession(res, user.id);

    return res.status(200).json({
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Something went wrong" });
  }
};

export const signinWithGoogle = async (req: Request, res: Response) => {
  const { idToken } = req.body ?? {};

  if (typeof idToken !== "string") {
    return res.status(400).json({ error: "idToken is required" });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email || !payload.email_verified) {
      return res.status(401).json({ error: "Invalid Google account" });
    }

    const email = payload.email.toLowerCase();

    const identity = await prisma.authIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider: "google",
          providerUserId: payload.sub,
        },
      },
      include: { user: true },
    });

    let user = identity?.user ?? null;

    if (!user) {
      user = await prisma.user.findUnique({ where: { email } });

      if (user) {
        await prisma.authIdentity.create({
          data: {
            userId: user.id,
            provider: "google",
            providerUserId: payload.sub,
          },
        });
      } else {
        user = await prisma.user.create({
          data: {
            email,
            name: payload.name,
            identities: {
              create: { provider: "google", providerUserId: payload.sub },
            },
          },
        });
      }
    }

    if (!user.isActive) {
      return res.status(401).json({ error: "Account disabled" });
    }

    createSession(res, user.id);

    return res.status(200).json({
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    console.error(err);
    return res.status(401).json({ error: "Google verification failed" });
  }
};

export const signout = async (req: Request, res: Response) => {
  res.clearCookie("token", cookieOptions);
  return res.status(204).send();
};

export const profile = async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Something went wrong" });
  }
};
