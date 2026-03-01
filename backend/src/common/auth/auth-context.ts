import type { NextFunction, Request, Response } from "express";

export function getAuthUserIdOrThrow(req: Request): string {
  const userId = req.authUserId ?? req.user?.sub;

  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }

  return userId;
}

export function requireAuthContext(req: Request, res: Response, next: NextFunction) {
  const userId = req.authUserId ?? req.user?.sub;

  if (!userId) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }

  req.authUserId = userId;
  return next();
}
