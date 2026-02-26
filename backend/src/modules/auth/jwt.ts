import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

export type JwtUserPayload = {
  sub: string;
  email: string;
};

export function signAccessToken(payload: JwtUserPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): JwtUserPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtUserPayload;
}
