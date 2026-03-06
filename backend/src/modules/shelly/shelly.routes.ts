import { Router } from "express";
import { requireAuth } from "../../common/auth/requireAuth.js";
import { requireAuthContext } from "../../common/auth/auth-context.js";
import { validateRequest } from "../../common/validation/validate.js";
import { requireOwnedHomeParam } from "../../common/ownership/home-ownership.js";
import {
  discoverShellyDevicesHandler,
  deleteShellyIntegrationHandler,
  getShellyIntegrationStatusHandler,
  importShellyDevicesHandler,
  refreshShellyAccessTokenHandler,
  shellyCallbackHandler,
  startShellyOAuthHandler,
} from "./shelly.controller.js";
import {
  shellyCallbackQuerySchema,
  shellyImportDevicesBodySchema,
  shellyImportHomeParamsSchema,
} from "./shelly.schemas.js";

export const shellyRouter = Router();

shellyRouter.get(
  "/",
  requireAuth,
  requireAuthContext,
  getShellyIntegrationStatusHandler,
);

shellyRouter.post(
  "/",
  requireAuth,
  requireAuthContext,
  startShellyOAuthHandler,
);

shellyRouter.post(
  "/devices/discover",
  requireAuth,
  requireAuthContext,
  discoverShellyDevicesHandler,
);

shellyRouter.post(
  "/homes/:homeId/devices/import",
  requireAuth,
  requireAuthContext,
  validateRequest({
    params: shellyImportHomeParamsSchema,
    body: shellyImportDevicesBodySchema,
  }),
  requireOwnedHomeParam("homeId"),
  importShellyDevicesHandler,
);

shellyRouter.post(
  "/refresh",
  requireAuth,
  requireAuthContext,
  refreshShellyAccessTokenHandler,
);

shellyRouter.delete(
  "/",
  requireAuth,
  requireAuthContext,
  deleteShellyIntegrationHandler,
);

shellyRouter.get(
  "/callback",
  validateRequest({ query: shellyCallbackQuerySchema }),
  shellyCallbackHandler,
);
