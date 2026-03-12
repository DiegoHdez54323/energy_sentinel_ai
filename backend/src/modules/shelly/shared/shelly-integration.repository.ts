import { SHELLY_ACCESS_TOKEN_REFRESH_SKEW_MS } from "./shelly.constants.js";
import { prisma } from "../../../lib/prisma.js";
import type { ShellyIntegrationStatus } from "./shelly.types.js";

type ShellyIntegrationRecord = Awaited<ReturnType<typeof prisma.shellyIntegration.findUnique>>;

export async function setShellyIntegrationError(userId: string) {
  await prisma.shellyIntegration.updateMany({
    where: { userId },
    data: {
      status: "error",
      accessToken: null,
      accessTokenExpiresAt: null,
    },
  });
}

export async function setShellyIntegrationLastSync(userId: string, at: Date) {
  await prisma.shellyIntegration.updateMany({
    where: { userId },
    data: { lastSyncAt: at },
  });
}

export async function getShellyIntegrationOrThrow(userId: string) {
  const integration = await prisma.shellyIntegration.findUnique({
    where: { userId },
  });

  if (!integration?.authCode) {
    throw new Error("SHELLY_INTEGRATION_NOT_FOUND");
  }

  return integration;
}

export async function getShellyIntegrationByUserId(userId: string) {
  return prisma.shellyIntegration.findUnique({
    where: { userId },
  });
}

export function buildShellyIntegrationStatus(integration: ShellyIntegrationRecord): ShellyIntegrationStatus {
  if (!integration) {
    return {
      connected: false,
      status: "not_connected",
      userApiUrl: null,
      accessTokenExpiresAt: null,
      isAccessTokenValid: false,
      needsRefresh: false,
      lastSyncAt: null,
    };
  }

  const refreshThreshold = new Date(Date.now() + SHELLY_ACCESS_TOKEN_REFRESH_SKEW_MS);
  const isAccessTokenValid = Boolean(
    integration.accessToken
    && integration.accessTokenExpiresAt
    && integration.accessTokenExpiresAt > new Date(),
  );
  const needsRefresh = (
    !integration.accessToken
    || !integration.accessTokenExpiresAt
    || integration.accessTokenExpiresAt <= refreshThreshold
  );

  return {
    connected: true,
    status: integration.status,
    userApiUrl: integration.userApiUrl,
    accessTokenExpiresAt: integration.accessTokenExpiresAt,
    isAccessTokenValid,
    needsRefresh,
    lastSyncAt: integration.lastSyncAt,
  };
}
