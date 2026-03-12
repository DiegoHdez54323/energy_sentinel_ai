import {
  getValidShellyAccessToken,
  refreshShellyAccessToken,
} from "../oauth/shelly-oauth.service.js";
import { requestShellyAllStatus } from "./shelly-api-client.js";

export async function fetchShellyAllStatusWithRetry(userId: string): Promise<unknown> {
  const tokenContext = await getValidShellyAccessToken(userId);

  try {
    return await requestShellyAllStatus(tokenContext.accessToken, tokenContext.userApiUrl);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "SHELLY_INVALID_TOKEN") {
      throw error;
    }
  }

  const refreshedContext = await refreshShellyAccessToken(userId);

  try {
    return await requestShellyAllStatus(refreshedContext.accessToken, refreshedContext.userApiUrl);
  } catch (error) {
    if (error instanceof Error && error.message === "SHELLY_INVALID_TOKEN") {
      throw new Error("SHELLY_DISCOVERY_FAILED");
    }

    throw error;
  }
}
