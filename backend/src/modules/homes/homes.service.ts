import { prisma } from "../../lib/prisma.js";
import type { CreateHomeInput, UpdateHomeInput } from "./homes.schemas.js";

const homeSelect = {
  id: true,
  userId: true,
  name: true,
  timezone: true,
  createdAt: true,
  updatedAt: true,
};

export async function createHome(userId: string, input: CreateHomeInput) {
  return prisma.home.create({
    data: {
      userId,
      name: input.name,
      timezone: input.timezone,
    },
    select: homeSelect,
  });
}

export async function listHomes(userId: string) {
  return prisma.home.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: homeSelect,
  });
}

export async function getHomeById(userId: string, homeId: string) {
  const home = await prisma.home.findFirst({
    where: { id: homeId, userId },
    select: homeSelect,
  });

  if (!home) {
    throw new Error("HOME_NOT_FOUND");
  }

  return home;
}

export async function updateHomeById(userId: string, homeId: string, input: UpdateHomeInput) {
  const updated = await prisma.home.updateMany({
    where: { id: homeId, userId },
    data: input,
  });

  if (updated.count === 0) {
    throw new Error("HOME_NOT_FOUND");
  }

  return prisma.home.findFirstOrThrow({
    where: { id: homeId, userId },
    select: homeSelect,
  });
}

export async function deleteHomeById(userId: string, homeId: string) {
  const deleted = await prisma.home.deleteMany({
    where: { id: homeId, userId },
  });

  if (deleted.count === 0) {
    throw new Error("HOME_NOT_FOUND");
  }
}

