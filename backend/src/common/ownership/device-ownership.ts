import type { NextFunction, Request, Response } from "express";
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";

export const ownedDeviceContextSelect = {
  id: true,
  homeId: true,
  userId: true,
  vendor: true,
  deviceCode: true,
  displayName: true,
  ipAddress: true,
  macAddress: true,
  externalDeviceId: true,
  status: true,
  lastSeenAt: true,
  dataSource: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.DeviceSelect;

export type OwnedDeviceContext = Prisma.DeviceGetPayload<{
  select: typeof ownedDeviceContextSelect;
}>;

export async function findOwnedDeviceOrThrow<T extends Prisma.DeviceSelect>(
  userId: string,
  deviceId: string,
  select: T,
): Promise<Prisma.DeviceGetPayload<{ select: T }>> {
  const device = await prisma.device.findFirst({
    where: { id: deviceId, userId },
    select,
  });

  if (!device) {
    throw new Error("DEVICE_NOT_FOUND");
  }

  return device;
}

export function requireOwnedDeviceParam(paramName = "deviceId") {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUserId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const deviceId = req.params[paramName];
    if (typeof deviceId !== "string" || !deviceId) {
      return res.status(400).json({ error: "INVALID_PARAMS" });
    }

    try {
      req.ownedDevice = await findOwnedDeviceOrThrow(
        req.authUserId,
        deviceId,
        ownedDeviceContextSelect,
      );
      return next();
    } catch (error) {
      if (error instanceof Error && error.message === "DEVICE_NOT_FOUND") {
        return res.status(404).json({ error: "DEVICE_NOT_FOUND" });
      }

      return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
    }
  };
}
