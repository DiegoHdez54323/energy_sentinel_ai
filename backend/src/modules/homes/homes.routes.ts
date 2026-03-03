import { Router } from "express";
import { requireAuthContext } from "../../common/auth/auth-context.js";
import { requireOwnedHomeParam } from "../../common/ownership/home-ownership.js";
import { validateRequest } from "../../common/validation/validate.js";
import { requireAuth } from "../../common/auth/requireAuth.js";
import {
  createHomeHandler,
  deleteHomeByIdHandler,
  getHomeByIdHandler,
  listHomesHandler,
  updateHomeByIdHandler,
} from "./homes.controller.js";
import {
  createHomeSchema,
  homeParamsSchema,
  updateHomeSchema,
} from "./homes.schemas.js";

export const homesRouter = Router();

homesRouter.use(requireAuth);
homesRouter.use(requireAuthContext);

homesRouter.post(
  "/",
  validateRequest({ body: createHomeSchema }),
  createHomeHandler,
);
homesRouter.get("/", listHomesHandler);
homesRouter.get(
  "/:id",
  validateRequest({ params: homeParamsSchema }),
  requireOwnedHomeParam("id"),
  getHomeByIdHandler,
);
homesRouter.patch(
  "/:id",
  validateRequest({ params: homeParamsSchema, body: updateHomeSchema }),
  requireOwnedHomeParam("id"),
  updateHomeByIdHandler,
);
homesRouter.delete(
  "/:id",
  validateRequest({ params: homeParamsSchema }),
  requireOwnedHomeParam("id"),
  deleteHomeByIdHandler,
);
