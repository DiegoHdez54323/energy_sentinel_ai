import { Router } from "express";
import { requireAuthContext } from "../../common/auth/auth-context.js";
import { validateRequest } from "../../common/validation/validate.js";
import { requireOwnedDeviceParam } from "../../common/ownership/device-ownership.js";
import { requireOwnedHomeParam } from "../../common/ownership/home-ownership.js";
import { requireAuth } from "../../common/auth/requireAuth.js";
import {
  createDeviceHandler,
  deleteDeviceByIdHandler,
  getDeviceByIdHandler,
  listDevicesByHomeHandler,
  updateDeviceByIdHandler,
} from "./devices.controller.js";
import {
  createDeviceSchema,
  deviceParamsSchema,
  homeDeviceParamsSchema,
  updateDeviceSchema,
} from "./devices.schemas.js";

export const devicesRouter = Router();

devicesRouter.use(requireAuth);
devicesRouter.use(requireAuthContext);

devicesRouter.post(
  "/homes/:homeId/devices",
  validateRequest({ params: homeDeviceParamsSchema, body: createDeviceSchema }),
  requireOwnedHomeParam("homeId"),
  createDeviceHandler,
);

devicesRouter.get(
  "/homes/:homeId/devices",
  validateRequest({ params: homeDeviceParamsSchema }),
  requireOwnedHomeParam("homeId"),
  listDevicesByHomeHandler,
);

devicesRouter.get(
  "/devices/:deviceId",
  validateRequest({ params: deviceParamsSchema }),
  requireOwnedDeviceParam("deviceId"),
  getDeviceByIdHandler,
);

devicesRouter.patch(
  "/devices/:deviceId",
  validateRequest({ params: deviceParamsSchema, body: updateDeviceSchema }),
  requireOwnedDeviceParam("deviceId"),
  updateDeviceByIdHandler,
);

devicesRouter.delete(
  "/devices/:deviceId",
  validateRequest({ params: deviceParamsSchema }),
  requireOwnedDeviceParam("deviceId"),
  deleteDeviceByIdHandler,
);
