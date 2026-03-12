import type { Request, Response } from "express";
import { loginSchema, refreshTokenSchema, registerSchema } from "./auth.schemas.js";
import { loginUser, logoutUser, refreshSession, registerUser } from "./auth.service.js";

export async function registerHandler(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_BODY", details: parsed.error.flatten() });
  }

  try {
    const result = await registerUser(parsed.data);
    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_ALREADY_IN_USE") {
      return res.status(409).json({ error: "EMAIL_ALREADY_IN_USE" });
    }
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

export async function loginHandler(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_BODY", details: parsed.error.flatten() });
  }

  try {
    const result = await loginUser(parsed.data);
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_CREDENTIALS") {
      return res.status(401).json({ error: "INVALID_CREDENTIALS" });
    }
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

export async function refreshHandler(req: Request, res: Response) {
  const parsed = refreshTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_BODY", details: parsed.error.flatten() });
  }

  try {
    const result = await refreshSession(parsed.data);
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_REFRESH_TOKEN") {
      return res.status(401).json({ error: "INVALID_REFRESH_TOKEN" });
    }
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

export async function logoutHandler(req: Request, res: Response) {
  const parsed = refreshTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_BODY", details: parsed.error.flatten() });
  }

  await logoutUser(parsed.data);
  return res.status(204).send();
}

export function meHandler(req: Request, res: Response) {
  return res.status(200).json({ user: req.user });
}
