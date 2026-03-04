import { Router } from "express";
import { requireAuth } from "../../common/auth/requireAuth.js";
import { requireAuthContext } from "../../common/auth/auth-context.js";
import { validateRequest } from "../../common/validation/validate.js";
import {
  deleteShellyIntegrationHandler,
  getShellyIntegrationStatusHandler,
  refreshShellyAccessTokenHandler,
  shellyCallbackHandler,
  startShellyOAuthHandler,
} from "./shelly.controller.js";
import { shellyCallbackQuerySchema } from "./shelly.schemas.js";

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
