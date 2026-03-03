import type { Request, Response } from "express";
import { getAuthUserIdOrThrow } from "../../common/auth/auth-context.js";
import {
  createDevice,
  deleteDeviceById,
  listDevicesByHome,
  updateDeviceById,
} from "./devices.service.js";
import type { CreateDeviceInput, UpdateDeviceInput } from "./devices.schemas.js";

function getOwnedHomeId(req: Request): string {
  if (!req.ownedHome?.id) {
    throw new Error("INTERNAL_SERVER_ERROR");
  }

  return req.ownedHome.id;
}

function getOwnedDeviceId(req: Request): string {
  if (!req.ownedDevice?.id) {
    throw new Error("INTERNAL_SERVER_ERROR");
  }

  return req.ownedDevice.id;
}

export async function createDeviceHandler(req: Request, res: Response) {
  try {
    const device = await createDevice(
      getAuthUserIdOrThrow(req),
      getOwnedHomeId(req),
      req.body as CreateDeviceInput,
    );
    return res.status(201).json({ device });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    if (error instanceof Error && error.message === "DEVICE_ALREADY_EXISTS") {
      return res.status(409).json({ error: "DEVICE_ALREADY_EXISTS" });
    }
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

export async function listDevicesByHomeHandler(req: Request, res: Response) {
  try {
    const devices = await listDevicesByHome(getAuthUserIdOrThrow(req), getOwnedHomeId(req));
    return res.status(200).json({ devices });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

export async function getDeviceByIdHandler(req: Request, res: Response) {
  try {
    if (!req.ownedDevice) {
      throw new Error("INTERNAL_SERVER_ERROR");
    }

    const device = req.ownedDevice;
    return res.status(200).json({ device });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

export async function updateDeviceByIdHandler(req: Request, res: Response) {
  try {
    const device = await updateDeviceById(
      getAuthUserIdOrThrow(req),
      getOwnedDeviceId(req),
      req.body as UpdateDeviceInput,
    );
    return res.status(200).json({ device });
  } catch (error) {
    if (error instanceof Error && error.message === "HOME_NOT_FOUND") {
      return res.status(404).json({ error: "HOME_NOT_FOUND" });
    }
    if (error instanceof Error && error.message === "DEVICE_NOT_FOUND") {
      return res.status(404).json({ error: "DEVICE_NOT_FOUND" });
    }
    if (error instanceof Error && error.message === "DEVICE_ALREADY_EXISTS") {
      return res.status(409).json({ error: "DEVICE_ALREADY_EXISTS" });
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

export async function deleteDeviceByIdHandler(req: Request, res: Response) {
  try {
    await deleteDeviceById(getOwnedDeviceId(req));
    return res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message === "DEVICE_NOT_FOUND") {
      return res.status(404).json({ error: "DEVICE_NOT_FOUND" });
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}
