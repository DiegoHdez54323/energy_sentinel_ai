import type { Request, Response } from "express";
import { getAuthUserIdOrThrow } from "../../common/auth/auth-context.js";
import {
  createHome,
  deleteHomeById,
  listHomes,
  updateHomeById,
} from "./homes.service.js";
import type { CreateHomeInput, UpdateHomeInput } from "./homes.schemas.js";

function getOwnedHomeOrThrow(req: Request) {
  if (!req.ownedHome) {
    throw new Error("INTERNAL_SERVER_ERROR");
  }

  return req.ownedHome;
}

export async function createHomeHandler(req: Request, res: Response) {
  try {
    const home = await createHome(
      getAuthUserIdOrThrow(req),
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
    const homes = await listHomes(getAuthUserIdOrThrow(req));
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
    const home = getOwnedHomeOrThrow(req);
    return res.status(200).json({ home });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

export async function updateHomeByIdHandler(req: Request, res: Response) {
  try {
    const home = await updateHomeById(
      getOwnedHomeOrThrow(req).id,
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
    await deleteHomeById(getOwnedHomeOrThrow(req).id);
    return res.status(200).json({ ok: true });
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
