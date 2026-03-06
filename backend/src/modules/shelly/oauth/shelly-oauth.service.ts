import { randomBytes } from "node:crypto";
import { env } from "../../../config/env.js";
import { prisma } from "../../../lib/prisma.js";
import type { ShellyCallbackQueryInput } from "../shelly.schemas.js";
import {
  SHELLY_ACCESS_TOKEN_REFRESH_SKEW_MS,
  SHELLY_CLIENT_ID,
  SHELLY_OAUTH_LOGIN_URL,
  SHELLY_OAUTH_STATE_TTL_MS,
} from "../shared/shelly.constants.js";
import { performShellyTokenExchange } from "../shared/shelly-api-client.js";
import { decodeShellyJwt } from "../shared/shelly-jwt.js";
import {
  buildShellyIntegrationStatus,
  getShellyIntegrationByUserId,
  getShellyIntegrationOrThrow,
  setShellyIntegrationError,
} from "../shared/shelly-integration.repository.js";
import type {
  ShellyAccessTokenContext,
  ShellyIntegrationStatus,
} from "../shared/shelly.types.js";

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

  let codePayload;

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
  const integration = await getShellyIntegrationByUserId(userId);
  return buildShellyIntegrationStatus(integration);
}
