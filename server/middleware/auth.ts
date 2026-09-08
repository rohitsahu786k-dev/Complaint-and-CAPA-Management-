import type { NextFunction, Request, Response } from "express";
import { connectDB } from "../config/db";
import { User } from "../models/User";
import { sanitizeUser, verifySession } from "../services/auth.service";
import { httpError } from "../utils/http";

export const SESSION_COOKIE = "onepws_session";

export async function optionalUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!token) return next();
    await connectDB();
    const payload = verifySession(token);
    const user = await User.findById(payload.sub).populate("role");
    if (!user?.active) return next();

    // Password reset/change invalidates all sessions created before the change.
    // JWT iat is second precision, so allow a one-second boundary for the newly-issued session.
    if (user.passwordChangedAt && payload.iat && user.passwordChangedAt.getTime() > payload.iat * 1000 + 1000) {
      return next();
    }

    req.user = sanitizeUser(user);
    return next();
  } catch {
    return next();
  }
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(httpError(401, "Unauthorized"));
  return next();
}

export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(httpError(401, "Unauthorized"));
    const permissions = req.user.role?.permissions || [];
    if (permissions.includes("*") || permissions.includes(permission as never)) return next();
    return next(httpError(403, "Forbidden"));
  };
}
