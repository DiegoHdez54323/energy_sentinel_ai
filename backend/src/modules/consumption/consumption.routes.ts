import { Router } from "express";
import { requireAuth } from "../../common/auth/requireAuth.js";
import { requireAuthContext } from "../../common/auth/auth-context.js";
import { requireOwnedDeviceParam } from "../../common/ownership/device-ownership.js";
import { requireOwnedHomeParam } from "../../common/ownership/home-ownership.js";
import { validateRequest } from "../../common/validation/validate.js";
import {
  getDeviceConsumptionHandler,
  getHomeConsumptionHandler,
} from "./consumption.controller.js";
import {
  consumptionQuerySchema,
  deviceConsumptionParamsSchema,
  homeConsumptionParamsSchema,
} from "./consumption.schemas.js";

export const consumptionRouter = Router();

consumptionRouter.use(requireAuth);
consumptionRouter.use(requireAuthContext);

consumptionRouter.get(
  "/devices/:deviceId/consumption",
  validateRequest({ params: deviceConsumptionParamsSchema, query: consumptionQuerySchema }),
  requireOwnedDeviceParam("deviceId"),
  getDeviceConsumptionHandler,
);

consumptionRouter.get(
  "/homes/:homeId/consumption",
  validateRequest({ params: homeConsumptionParamsSchema, query: consumptionQuerySchema }),
  requireOwnedHomeParam("homeId"),
  getHomeConsumptionHandler,
);
