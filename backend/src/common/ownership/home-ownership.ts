import type { NextFunction, Request, Response } from "express";
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";

export const ownedHomeContextSelect = {
  id: true,
  userId: true,
  name: true,
  timezone: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.HomeSelect;

export type OwnedHomeContext = Prisma.HomeGetPayload<{
  select: typeof ownedHomeContextSelect;
}>;

export async function findOwnedHomeOrThrow<T extends Prisma.HomeSelect>(
  userId: string,
  homeId: string,
  select: T,
): Promise<Prisma.HomeGetPayload<{ select: T }>> {
  const home = await prisma.home.findFirst({
    where: { id: homeId, userId },
    select,
  });

  if (!home) {
    throw new Error("HOME_NOT_FOUND");
  }

  return home;
}

export function requireOwnedHomeParam(paramName = "homeId") {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUserId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const homeId = req.params[paramName];
    if (typeof homeId !== "string" || !homeId) {
      return res.status(400).json({ error: "INVALID_PARAMS" });
    }

    try {
      req.ownedHome = await findOwnedHomeOrThrow(
        req.authUserId,
        homeId,
        ownedHomeContextSelect,
      );
      return next();
    } catch (error) {
      if (error instanceof Error && error.message === "HOME_NOT_FOUND") {
        return res.status(404).json({ error: "HOME_NOT_FOUND" });
      }

      return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
    }
  };
}
