import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../../modules/auth/jwt.js";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.header("authorization");

  if (!authHeader) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }

  const [scheme, rawToken] = authHeader.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !rawToken) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }

  try {
    const payload = await verifyAccessToken(rawToken.trim());
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }
}
