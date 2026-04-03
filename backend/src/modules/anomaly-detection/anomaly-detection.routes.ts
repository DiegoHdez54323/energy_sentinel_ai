import { Router } from "express";
import { requireAuth } from "../../common/auth/requireAuth.js";
import { requireAuthContext } from "../../common/auth/auth-context.js";
import { requireOwnedDeviceParam } from "../../common/ownership/device-ownership.js";
import { validateRequest } from "../../common/validation/validate.js";
import {
  getDeviceStateHandler,
  listDeviceAnomaliesHandler,
} from "./anomaly-detection.controller.js";
import {
  deviceAnomaliesQuerySchema,
  deviceAnomalyParamsSchema,
} from "./anomaly-detection.schemas.js";

export const anomalyDetectionRouter = Router();

anomalyDetectionRouter.use(requireAuth);
anomalyDetectionRouter.use(requireAuthContext);

anomalyDetectionRouter.get(
  "/devices/:deviceId/state",
  validateRequest({ params: deviceAnomalyParamsSchema }),
  requireOwnedDeviceParam("deviceId"),
  getDeviceStateHandler,
);

anomalyDetectionRouter.get(
  "/devices/:deviceId/anomalies",
  validateRequest({ params: deviceAnomalyParamsSchema, query: deviceAnomaliesQuerySchema }),
  requireOwnedDeviceParam("deviceId"),
  listDeviceAnomaliesHandler,
);
