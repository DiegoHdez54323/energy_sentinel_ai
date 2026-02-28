import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

type SchemaBag = {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
};

export function validateRequest(schemas: SchemaBag) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (schemas.body) {
      const parsed = schemas.body.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "INVALID_BODY", details: parsed.error.flatten() });
      }
      req.body = parsed.data;
    }

    if (schemas.params) {
      const parsed = schemas.params.safeParse(req.params);
      if (!parsed.success) {
        return res.status(400).json({ error: "INVALID_PARAMS", details: parsed.error.flatten() });
      }
      req.params = parsed.data as Request["params"];
    }

    if (schemas.query) {
      const parsed = schemas.query.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: "INVALID_QUERY", details: parsed.error.flatten() });
      }
      req.query = parsed.data as Request["query"];
    }

    return next();
  };
}
