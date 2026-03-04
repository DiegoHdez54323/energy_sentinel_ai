import type { Request, Response } from "express";
import { getAuthUserIdOrThrow } from "../../common/auth/auth-context.js";
import {
  completeShellyOAuth,
  deleteShellyIntegration,
  getShellyIntegrationStatus,
  refreshShellyAccessToken,
  startShellyOAuth,
} from "./shelly.service.js";
import type { ShellyCallbackQueryInput } from "./shelly.schemas.js";

const SHELLY_CONNECTED_HTML = "<!doctype html><html><body>Shelly conectado, ya puedes cerrar esta ventana</body></html>";

export async function startShellyOAuthHandler(req: Request, res: Response) {
  try {
    const result = await startShellyOAuth(getAuthUserIdOrThrow(req));
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

export async function getShellyIntegrationStatusHandler(req: Request, res: Response) {
  try {
    const integration = await getShellyIntegrationStatus(getAuthUserIdOrThrow(req));

    return res.status(200).json({
      integration: {
        ...integration,
        accessTokenExpiresAt: integration.accessTokenExpiresAt?.toISOString() ?? null,
        lastSyncAt: integration.lastSyncAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

export async function shellyCallbackHandler(req: Request, res: Response) {
  try {
    await completeShellyOAuth(req.query as ShellyCallbackQueryInput);
    return res.status(200).type("html").send(SHELLY_CONNECTED_HTML);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_STATE") {
      return res.status(400).json({ error: "INVALID_STATE" });
    }

    if (
      error instanceof Error
      && (
        error.message === "INVALID_SHELLY_CODE"
        || error.message === "SHELLY_TOKEN_EXCHANGE_FAILED"
        || error.message === "INVALID_SHELLY_ACCESS_TOKEN"
        || error.message === "SHELLY_HOST_MISMATCH"
      )
    ) {
      return res.status(502).json({ error: error.message });
    }

    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

export async function refreshShellyAccessTokenHandler(req: Request, res: Response) {
  try {
    const tokenContext = await refreshShellyAccessToken(getAuthUserIdOrThrow(req));
    return res.status(200).json({
      ok: true,
      status: "active",
      accessTokenExpiresAt: tokenContext.accessTokenExpiresAt.toISOString(),
      userApiUrl: tokenContext.userApiUrl,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    if (error instanceof Error && error.message === "SHELLY_INTEGRATION_NOT_FOUND") {
      return res.status(404).json({ error: "SHELLY_INTEGRATION_NOT_FOUND" });
    }

    if (
      error instanceof Error
      && (
        error.message === "SHELLY_TOKEN_EXCHANGE_FAILED"
        || error.message === "INVALID_SHELLY_ACCESS_TOKEN"
        || error.message === "SHELLY_HOST_MISMATCH"
      )
    ) {
      return res.status(502).json({ error: error.message });
    }

    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

export async function deleteShellyIntegrationHandler(req: Request, res: Response) {
  try {
    await deleteShellyIntegration(getAuthUserIdOrThrow(req));
    return res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}
