import type { JwtUserPayload } from "../modules/auth/jwt.js";

declare global {
  namespace Express {
    interface Request {
      user?: JwtUserPayload;
    }
  }
}

export {};
