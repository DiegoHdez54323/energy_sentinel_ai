import type { JwtUserPayload } from "../modules/auth/jwt.js";
import type { OwnedDeviceContext } from "../common/ownership/device-ownership.js";
import type { OwnedHomeContext } from "../common/ownership/home-ownership.js";

declare global {
  namespace Express {
    interface Request {
      user?: JwtUserPayload;
      authUserId?: string;
      ownedHome?: OwnedHomeContext;
      ownedDevice?: OwnedDeviceContext;
    }
  }
}

export {};
