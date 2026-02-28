import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { authRouter } from "../modules/auth/auth.routes.js";
import { homesRouter } from "../modules/homes/homes.routes.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("dev"));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "Energy Sentinel AI API" });
  });

  app.use("/auth", authRouter);
  app.use("/homes", homesRouter);

  return app;
}
