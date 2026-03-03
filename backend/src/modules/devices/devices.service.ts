import { Prisma } from "../../generated/prisma/client.js";
import { ownedDeviceContextSelect } from "../../common/ownership/device-ownership.js";
import { findOwnedHomeOrThrow, ownedHomeContextSelect } from "../../common/ownership/home-ownership.js";
import { prisma } from "../../lib/prisma.js";
import type { CreateDeviceInput, UpdateDeviceInput } from "./devices.schemas.js";

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function createDevice(userId: string, homeId: string, input: CreateDeviceInput) {
  try {
    return await prisma.device.create({
      data: {
        userId,
        homeId,
        vendor: input.vendor,
        displayName: input.displayName,
        externalDeviceId: input.externalDeviceId,
        deviceCode: input.deviceCode,
        ipAddress: input.ipAddress,
        macAddress: input.macAddress,
        status: input.status,
        dataSource: input.dataSource,
      },
      select: ownedDeviceContextSelect,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Error("DEVICE_ALREADY_EXISTS");
    }

    throw error;
  }
}

export async function listDevicesByHome(userId: string, homeId: string) {
  return prisma.device.findMany({
    where: { userId, homeId },
    orderBy: { createdAt: "desc" },
    select: ownedDeviceContextSelect,
  });
}

export async function updateDeviceById(
  userId: string,
  deviceId: string,
  input: UpdateDeviceInput,
) {
  if (input.homeId) {
    await findOwnedHomeOrThrow(userId, input.homeId, ownedHomeContextSelect);
  }

  try {
    const updated = await prisma.device.updateMany({
      where: { id: deviceId },
      data: input,
    });

    if (updated.count === 0) {
      throw new Error("DEVICE_NOT_FOUND");
    }
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Error("DEVICE_ALREADY_EXISTS");
    }

    throw error;
  }

  const device = await prisma.device.findFirst({
    where: { id: deviceId },
    select: ownedDeviceContextSelect,
  });

  if (!device) {
    throw new Error("DEVICE_NOT_FOUND");
  }

  return device;
}

export async function deleteDeviceById(deviceId: string) {
  const deleted = await prisma.device.deleteMany({
    where: { id: deviceId },
  });

  if (deleted.count === 0) {
    throw new Error("DEVICE_NOT_FOUND");
  }
}
