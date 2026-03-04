import { randomBytes } from "node:crypto";
import { decodeJwt } from "jose";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import type { ShellyCallbackQueryInput } from "./shelly.schemas.js";

const SHELLY_CLIENT_ID = "shelly-diy";
const SHELLY_OAUTH_LOGIN_URL = "https://my.shelly.cloud/oauth_login.html";
const SHELLY_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const SHELLY_ACCESS_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

type ShellyJwtPayload = {
  user_api_url: string;
  exp?: number;
};

export type ShellyAccessTokenContext = {
  accessToken: string;
  accessTokenExpiresAt: Date;
  userApiUrl: string;
};

export type ShellyIntegrationStatus = {
  connected: boolean;
  status: string;
  userApiUrl: string | null;
  accessTokenExpiresAt: Date | null;
  isAccessTokenValid: boolean;
  needsRefresh: boolean;
  lastSyncAt: Date | null;
};

function buildShellyOrigin(userApiUrl: string): string {
  const rawUrl = userApiUrl.startsWith("http://") || userApiUrl.startsWith("https://")
    ? userApiUrl
    : `https://${userApiUrl}`;

  return new URL(rawUrl).origin;
}

function decodeShellyJwt(token: string): ShellyJwtPayload {
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

async function setShellyIntegrationError(userId: string) {
  await prisma.shellyIntegration.updateMany({
    where: { userId },
    data: {
      status: "error",
      accessToken: null,
      accessTokenExpiresAt: null,
    },
  });
}

function buildShellyIntegrationStatus(integration: Awaited<ReturnType<typeof prisma.shellyIntegration.findUnique>>): ShellyIntegrationStatus {
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

export async function startShellyOAuth(userId: string) {
  const state = randomBytes(32).toString("base64url");

  await prisma.shellyOAuthState.create({
    data: {
      userId,
      state,
      expiresAt: new Date(Date.now() + SHELLY_OAUTH_STATE_TTL_MS),
    },
  });

  const authUrl = new URL(SHELLY_OAUTH_LOGIN_URL);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", SHELLY_CLIENT_ID);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("redirect_uri", env.SHELLY_OAUTH_REDIRECT_URI);

  return { authUrl: authUrl.toString() };
}

async function performShellyTokenExchange(
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

  let accessPayload: ShellyJwtPayload;

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

async function getShellyIntegrationOrThrow(userId: string) {
  const integration = await prisma.shellyIntegration.findUnique({
    where: { userId },
  });

  if (!integration?.authCode) {
    throw new Error("SHELLY_INTEGRATION_NOT_FOUND");
  }

  return integration;
}

export async function completeShellyOAuth({ code, state }: ShellyCallbackQueryInput) {
  const oauthState = await prisma.shellyOAuthState.findUnique({
    where: { state },
  });

  if (!oauthState || oauthState.consumedAt || oauthState.expiresAt <= new Date()) {
    throw new Error("INVALID_STATE");
  }

  const consumeResult = await prisma.shellyOAuthState.updateMany({
    where: {
      id: oauthState.id,
      consumedAt: null,
    },
    data: {
      consumedAt: new Date(),
    },
  });

  if (consumeResult.count === 0) {
    throw new Error("INVALID_STATE");
  }

  let codePayload: ShellyJwtPayload;

  try {
    codePayload = decodeShellyJwt(code);
  } catch {
    throw new Error("INVALID_SHELLY_CODE");
  }

  await prisma.shellyIntegration.upsert({
    where: { userId: oauthState.userId },
    create: {
      userId: oauthState.userId,
      clientId: SHELLY_CLIENT_ID,
      authCode: code,
      userApiUrl: codePayload.user_api_url,
      accessToken: null,
      accessTokenExpiresAt: null,
      status: "pending_oauth",
    },
    update: {
      clientId: SHELLY_CLIENT_ID,
      authCode: code,
      accessToken: null,
      accessTokenExpiresAt: null,
      status: "pending_oauth",
    },
  });

  let tokenContext: ShellyAccessTokenContext;

  try {
    tokenContext = await performShellyTokenExchange(code, codePayload.user_api_url);
  } catch (error) {
    await setShellyIntegrationError(oauthState.userId);
    throw error;
  }

  await prisma.shellyIntegration.update({
    where: { userId: oauthState.userId },
    data: {
      clientId: SHELLY_CLIENT_ID,
      authCode: code,
      userApiUrl: tokenContext.userApiUrl,
      accessToken: tokenContext.accessToken,
      accessTokenExpiresAt: tokenContext.accessTokenExpiresAt,
      status: "active",
    },
  });
}

export async function refreshShellyAccessToken(userId: string): Promise<ShellyAccessTokenContext> {
  const integration = await getShellyIntegrationOrThrow(userId);

  try {
    const tokenContext = await performShellyTokenExchange(
      integration.authCode as string,
      integration.userApiUrl,
    );

    await prisma.shellyIntegration.update({
      where: { userId },
      data: {
        accessToken: tokenContext.accessToken,
        accessTokenExpiresAt: tokenContext.accessTokenExpiresAt,
        userApiUrl: tokenContext.userApiUrl,
        status: "active",
      },
    });

    return tokenContext;
  } catch (error) {
    await setShellyIntegrationError(userId);
    throw error;
  }
}

export async function getValidShellyAccessToken(userId: string): Promise<ShellyAccessTokenContext> {
  const integration = await getShellyIntegrationOrThrow(userId);
  const refreshThreshold = new Date(Date.now() + SHELLY_ACCESS_TOKEN_REFRESH_SKEW_MS);

  if (
    !integration.accessToken
    || !integration.accessTokenExpiresAt
    || integration.accessTokenExpiresAt <= refreshThreshold
  ) {
    return refreshShellyAccessToken(userId);
  }

  return {
    accessToken: integration.accessToken,
    accessTokenExpiresAt: integration.accessTokenExpiresAt,
    userApiUrl: integration.userApiUrl,
  };
}

export async function deleteShellyIntegration(userId: string) {
  await prisma.$transaction([
    prisma.shellyOAuthState.deleteMany({
      where: { userId },
    }),
    prisma.shellyIntegration.deleteMany({
      where: { userId },
    }),
  ]);
}

export async function getShellyIntegrationStatus(userId: string): Promise<ShellyIntegrationStatus> {
  const integration = await prisma.shellyIntegration.findUnique({
    where: { userId },
  });

  return buildShellyIntegrationStatus(integration);
}
