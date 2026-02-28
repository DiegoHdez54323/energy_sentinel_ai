import { SignJWT, jwtVerify } from "jose";
import { env } from "../../config/env.js";

export type JwtUserPayload = {
  sub: string;
  email: string;
};

export type JwtRefreshPayload = JwtUserPayload & {
  exp: number;
};

const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);

async function signToken(payload: JwtUserPayload, expiresIn: string, tokenType: "access" | "refresh") {
  return new SignJWT({ email: payload.email, type: tokenType })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(JWT_SECRET);
}

export async function signAccessToken(payload: JwtUserPayload): Promise<string> {
  return signToken(payload, env.JWT_EXPIRES_IN, "access");
}

export async function signRefreshToken(payload: JwtUserPayload): Promise<string> {
  return signToken(payload, env.JWT_REFRESH_EXPIRES_IN, "refresh");
}

export async function verifyAccessToken(token: string): Promise<JwtUserPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET);

  if (payload.type !== "access" || typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new Error("INVALID_ACCESS_TOKEN");
  }

  return { sub: payload.sub, email: payload.email };
}

export async function verifyRefreshToken(token: string): Promise<JwtRefreshPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET);

  if (
    payload.type !== "refresh"
    || typeof payload.sub !== "string"
    || typeof payload.email !== "string"
    || typeof payload.exp !== "number"
  ) {
    throw new Error("INVALID_REFRESH_TOKEN");
  }

  return { sub: payload.sub, email: payload.email, exp: payload.exp };
}
