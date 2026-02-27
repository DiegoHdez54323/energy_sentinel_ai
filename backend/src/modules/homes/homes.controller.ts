import type { Request, Response } from "express";
import {
  createHome,
  deleteHomeById,
  getHomeById,
  listHomes,
  updateHomeById,
} from "./homes.service.js";
import type { CreateHomeInput, UpdateHomeInput } from "./homes.schemas.js";

function getAuthUserId(req: Request): string {
  if (!req.user?.sub) {
    throw new Error("UNAUTHORIZED");
  }

  return req.user.sub;
}

function getHomeIdParam(req: Request): string {
  const id = req.params.id;
  if (!id) {
    throw new Error("INVALID_HOME_ID");
  }

  if (Array.isArray(id)) {
    if (!id[0]) {
      throw new Error("INVALID_HOME_ID");
    }
    return id[0];
  }

  return id;
}

export async function createHomeHandler(req: Request, res: Response) {
  try {
    const home = await createHome(
      getAuthUserId(req),
      req.body as CreateHomeInput,
    );
    return res.status(201).json({ home });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

export async function listHomesHandler(req: Request, res: Response) {
  try {
    const homes = await listHomes(getAuthUserId(req));
    return res.status(200).json({ homes });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

export async function getHomeByIdHandler(req: Request, res: Response) {
  try {
    const home = await getHomeById(getAuthUserId(req), getHomeIdParam(req));
    return res.status(200).json({ home });
  } catch (error) {
    if (error instanceof Error && error.message === "HOME_NOT_FOUND") {
      return res.status(404).json({ error: "HOME_NOT_FOUND" });
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

export async function updateHomeByIdHandler(req: Request, res: Response) {
  try {
    const home = await updateHomeById(
      getAuthUserId(req),
      getHomeIdParam(req),
      req.body as UpdateHomeInput,
    );
    return res.status(200).json({ home });
  } catch (error) {
    if (error instanceof Error && error.message === "HOME_NOT_FOUND") {
      return res.status(404).json({ error: "HOME_NOT_FOUND" });
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

export async function deleteHomeByIdHandler(req: Request, res: Response) {
  try {
    await deleteHomeById(getAuthUserId(req), getHomeIdParam(req));
    return res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message === "HOME_NOT_FOUND") {
      return res.status(404).json({ error: "HOME_NOT_FOUND" });
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}
