import type { Request, Response } from "express";
import { getDeviceConsumption, getHomeConsumption } from "./consumption.service.js";
import type { ConsumptionQueryInput } from "./consumption.schemas.js";

function getOwnedDeviceOrThrow(req: Request) {
  if (!req.ownedDevice) {
    throw new Error("INTERNAL_SERVER_ERROR");
  }

  return req.ownedDevice;
}

function getOwnedHomeOrThrow(req: Request) {
  if (!req.ownedHome) {
    throw new Error("INTERNAL_SERVER_ERROR");
  }

  return req.ownedHome;
}

function handleConsumptionError(error: unknown, res: Response) {
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }
  if (error instanceof Error && error.message === "DEVICE_NOT_FOUND") {
    return res.status(404).json({ error: "DEVICE_NOT_FOUND" });
  }
  if (error instanceof Error && error.message === "HOME_NOT_FOUND") {
    return res.status(404).json({ error: "HOME_NOT_FOUND" });
  }
  if (error instanceof Error && error.message === "INVALID_RANGE") {
    return res.status(400).json({ error: "INVALID_RANGE" });
  }
  if (error instanceof Error && error.message === "INVALID_GRANULARITY_FOR_RANGE") {
    return res.status(400).json({ error: "INVALID_GRANULARITY_FOR_RANGE" });
  }

  return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
}

export async function getDeviceConsumptionHandler(req: Request, res: Response) {
  try {
    const payload = await getDeviceConsumption(
      getOwnedDeviceOrThrow(req),
      req.query as ConsumptionQueryInput,
    );
    return res.status(200).json(payload);
  } catch (error) {
    return handleConsumptionError(error, res);
  }
}

export async function getHomeConsumptionHandler(req: Request, res: Response) {
  try {
    const payload = await getHomeConsumption(
      getOwnedHomeOrThrow(req),
      req.query as ConsumptionQueryInput,
    );
    return res.status(200).json(payload);
  } catch (error) {
    return handleConsumptionError(error, res);
  }
}
