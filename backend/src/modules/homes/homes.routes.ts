import { Router } from "express";
import { validateRequest } from "../../common/validation/validate.js";
import { requireAuth } from "../auth/requireAuth.js";
import {
  createHomeHandler,
  deleteHomeByIdHandler,
  getHomeByIdHandler,
  listHomesHandler,
  updateHomeByIdHandler,
} from "./homes.controller.js";
import { createHomeSchema, homeParamsSchema, updateHomeSchema } from "./homes.schemas.js";

export const homesRouter = Router();

homesRouter.use(requireAuth);

homesRouter.post("/", validateRequest({ body: createHomeSchema }), createHomeHandler);
homesRouter.get("/", listHomesHandler);
homesRouter.get("/:id", validateRequest({ params: homeParamsSchema }), getHomeByIdHandler);
homesRouter.patch(
  "/:id",
  validateRequest({ params: homeParamsSchema, body: updateHomeSchema }),
  updateHomeByIdHandler,
);
homesRouter.delete("/:id", validateRequest({ params: homeParamsSchema }), deleteHomeByIdHandler);
