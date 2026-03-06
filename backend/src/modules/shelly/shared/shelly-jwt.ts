import { decodeJwt } from "jose";
import type { ShellyJwtPayload } from "./shelly.types.js";

export function buildShellyOrigin(userApiUrl: string): string {
  const rawUrl = userApiUrl.startsWith("http://") || userApiUrl.startsWith("https://")
    ? userApiUrl
    : `https://${userApiUrl}`;

  return new URL(rawUrl).origin;
}

export function decodeShellyJwt(token: string): ShellyJwtPayload {
  const payload = decodeJwt(token);
  const userApiUrl = payload.user_api_url;

  if (typeof userApiUrl !== "string" || !userApiUrl.trim()) {
    throw new Error("INVALID_SHELLY_JWT");
  }

  try {
    buildShellyOrigin(userApiUrl);
  } catch {
    throw new Error("INVALID_SHELLY_JWT");
  }

  const decoded: ShellyJwtPayload = {
    user_api_url: userApiUrl,
  };

  if (typeof payload.exp === "number") {
    decoded.exp = payload.exp;
  }

  return decoded;
}
