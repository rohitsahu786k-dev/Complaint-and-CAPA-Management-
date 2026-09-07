import type { NextFunction, Request, Response } from "express";
import { fail } from "../utils/http";

/** Express only treats a middleware as an error handler when it declares four parameters. */
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  return fail(res, error);
}
