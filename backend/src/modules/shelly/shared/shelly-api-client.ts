import { env } from "../../../config/env.js";
import { SHELLY_CLIENT_ID, SHELLY_DISCOVERY_PATH } from "./shelly.constants.js";
import { buildShellyOrigin, decodeShellyJwt } from "./shelly-jwt.js";
import type { ShellyAccessTokenContext } from "./shelly.types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isShellyUnauthorizedPayload(payload: unknown): boolean {
  if (!isRecord(payload)) {
    return false;
  }

  if (payload.error === "UNAUTHORIZED") {
    return true;
  }

  const errors = payload.errors;
  return isRecord(errors) && "invalid_token" in errors;
}

export async function requestShellyAllStatus(accessToken: string, userApiUrl: string): Promise<unknown> {
  const discoveryUrl = `${buildShellyOrigin(userApiUrl)}${SHELLY_DISCOVERY_PATH}`;
  let response: Response;

  try {
    response = await fetch(discoveryUrl, {
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("SHELLY_DISCOVERY_FAILED");
  }

  if (!response.ok && (response.status === 401 || response.status === 403)) {
    throw new Error("SHELLY_INVALID_TOKEN");
  }

  if (!response.ok) {
    throw new Error("SHELLY_DISCOVERY_FAILED");
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("SHELLY_DISCOVERY_FAILED");
  }

  if (isShellyUnauthorizedPayload(data)) {
    throw new Error("SHELLY_INVALID_TOKEN");
  }

  if (isRecord(data) && data.isok === false) {
    throw new Error("SHELLY_DISCOVERY_FAILED");
  }

  return data;
}

export async function performShellyTokenExchange(
  authCode: string,
  userApiUrl: string,
): Promise<ShellyAccessTokenContext> {
  const exchangeUrl = `${buildShellyOrigin(userApiUrl)}/oauth/auth`;
  const body = new URLSearchParams({
    client_id: SHELLY_CLIENT_ID,
    grant_type: "code",
    code: authCode,
    redirect_uri: env.SHELLY_OAUTH_REDIRECT_URI,
  }).toString();

  let response: Response;

  try {
    response = await fetch(exchangeUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("SHELLY_TOKEN_EXCHANGE_FAILED");
  }

  if (!response.ok) {
    throw new Error("SHELLY_TOKEN_EXCHANGE_FAILED");
  }

  let data: unknown;

  try {
    data = await response.json();
  } catch {
    throw new Error("SHELLY_TOKEN_EXCHANGE_FAILED");
  }

  const accessToken = data && typeof data === "object" && "access_token" in data
    ? data.access_token
    : undefined;

  if (typeof accessToken !== "string" || !accessToken.trim()) {
    throw new Error("SHELLY_TOKEN_EXCHANGE_FAILED");
  }

  let accessPayload;

  try {
    accessPayload = decodeShellyJwt(accessToken);
  } catch {
    throw new Error("INVALID_SHELLY_ACCESS_TOKEN");
  }

  if (typeof accessPayload.exp !== "number") {
    throw new Error("INVALID_SHELLY_ACCESS_TOKEN");
  }

  if (buildShellyOrigin(accessPayload.user_api_url) !== buildShellyOrigin(userApiUrl)) {
    throw new Error("SHELLY_HOST_MISMATCH");
  }

  return {
    accessToken,
    accessTokenExpiresAt: new Date(accessPayload.exp * 1000),
    userApiUrl: accessPayload.user_api_url,
  };
}
