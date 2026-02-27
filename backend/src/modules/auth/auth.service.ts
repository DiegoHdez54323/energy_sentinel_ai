import { createHash } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { comparePassword, hashPassword } from "./password.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type JwtUserPayload,
} from "./jwt.js";
import type { LoginInput, RefreshTokenInput, RegisterInput } from "./auth.schemas.js";

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function issueTokenPair(payload: JwtUserPayload) {
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(payload),
    signRefreshToken(payload),
  ]);

  const refreshPayload = await verifyRefreshToken(refreshToken);
  const refreshHash = hashRefreshToken(refreshToken);

  await prisma.refreshToken.create({
    data: {
      userId: refreshPayload.sub,
      tokenHash: refreshHash,
      expiresAt: new Date(refreshPayload.exp * 1000),
    },
  });

  return { accessToken, refreshToken };
}

export async function registerUser(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new Error("EMAIL_ALREADY_IN_USE");
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
    },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
    },
  });

  const tokens = await issueTokenPair({ sub: user.id, email: user.email });

  return { user, ...tokens };
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const validPassword = await comparePassword(input.password, user.passwordHash);
  if (!validPassword) {
    throw new Error("INVALID_CREDENTIALS");
  }

  await prisma.refreshToken.updateMany({
    where: {
      userId: user.id,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  const tokens = await issueTokenPair({ sub: user.id, email: user.email });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    },
    ...tokens,
  };
}

export async function refreshSession(input: RefreshTokenInput) {
  const payload = await verifyRefreshToken(input.refreshToken);
  const tokenHash = hashRefreshToken(input.refreshToken);

  const storedToken = await prisma.refreshToken.findFirst({
    where: {
      tokenHash,
      userId: payload.sub,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (!storedToken) {
    throw new Error("INVALID_REFRESH_TOKEN");
  }

  await prisma.refreshToken.update({
    where: { id: storedToken.id },
    data: { revokedAt: new Date() },
  });

  return issueTokenPair(payload);
}

export async function logoutUser(input: RefreshTokenInput) {
  const tokenHash = hashRefreshToken(input.refreshToken);

  await prisma.refreshToken.updateMany({
    where: {
      tokenHash,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}
