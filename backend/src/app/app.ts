import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "../config/env.js";
import { authRouter } from "../modules/auth/auth.routes.js";
import { anomalyDetectionRouter } from "../modules/anomaly-detection/anomaly-detection.routes.js";
import { consumptionRouter } from "../modules/consumption/consumption.routes.js";
import { devicesRouter } from "../modules/devices/devices.routes.js";
import { homesRouter } from "../modules/homes/homes.routes.js";
import { shellyRouter } from "../modules/shelly/shelly.routes.js";

export function createApp() {
  const app = express();
  const corsMiddleware = env.CORS_ALLOWED_ORIGINS.length === 0
    ? cors()
    : cors({
      origin(origin, callback) {
        if (!origin || env.CORS_ALLOWED_ORIGINS.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error("Not allowed by CORS"));
      },
    });

  app.use(helmet());
  app.use(corsMiddleware);
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("dev"));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "Energy Sentinel AI API" });
  });

  app.use("/auth", authRouter);
  app.use("/integrations/shelly", shellyRouter);
  app.use("/homes", homesRouter);
  app.use("/", anomalyDetectionRouter);
  app.use("/", consumptionRouter);
  app.use("/", devicesRouter);

  return app;
}
