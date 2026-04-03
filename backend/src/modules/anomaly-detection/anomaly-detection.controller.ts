import type { Request, Response } from "express";
import {
  getDeviceAnomalyState,
  listDeviceAnomalies,
} from "./anomaly-detection.service.js";
import type { DeviceAnomaliesQueryInput } from "./anomaly-detection.schemas.js";

function getOwnedDeviceOrThrow(req: Request) {
  if (!req.ownedDevice) {
    throw new Error("INTERNAL_SERVER_ERROR");
  }

  return req.ownedDevice;
}

function handleAnomalyError(error: unknown, res: Response) {
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }
  if (error instanceof Error && error.message === "DEVICE_NOT_FOUND") {
    return res.status(404).json({ error: "DEVICE_NOT_FOUND" });
  }
  if (error instanceof Error && error.message === "INVALID_RANGE") {
    return res.status(400).json({ error: "INVALID_RANGE" });
  }

  return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
}

export async function getDeviceStateHandler(req: Request, res: Response) {
  try {
    const payload = await getDeviceAnomalyState(getOwnedDeviceOrThrow(req));
    return res.status(200).json(payload);
  } catch (error) {
    return handleAnomalyError(error, res);
  }
}

export async function listDeviceAnomaliesHandler(req: Request, res: Response) {
  try {
    const payload = await listDeviceAnomalies(
      getOwnedDeviceOrThrow(req),
      req.query as unknown as DeviceAnomaliesQueryInput,
    );
    return res.status(200).json(payload);
  } catch (error) {
    return handleAnomalyError(error, res);
  }
}
