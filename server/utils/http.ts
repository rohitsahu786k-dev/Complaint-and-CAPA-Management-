import type { Response } from "express";
import { ZodError } from "zod";

export type FieldIssue = { field: string; message: string; section?: string };

export type HttpError = Error & { status?: number; issues?: FieldIssue[] };

export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ data });
}

export function httpError(status: number, message: string, issues?: FieldIssue[]): HttpError {
  return Object.assign(new Error(message), { status, issues });
}

/** Business rule failures answer with the exact fields that blocked the action. */
export function businessRuleError(message: string, issues: FieldIssue[]) {
  return httpError(422, message, issues);
}

export function fail(res: Response, error: unknown) {
  if (error instanceof ZodError) {
    const issues: FieldIssue[] = error.issues.map((issue) => ({
      field: issue.path.join(".") || "body",
      message: issue.message
    }));
    return res.status(400).json({ message: "Validation failed", issues });
  }

  const err = error as HttpError;
  const status = err?.status ?? 500;
  return res.status(status).json({
    message: status === 500 ? "Unexpected server error" : err?.message || "Request failed",
    ...(err?.issues ? { issues: err.issues } : {})
  });
}
