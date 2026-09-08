import type { NextFunction, Request, Response } from "express";
import { getEnv } from "../config/env";
import { connectDB } from "../config/db";
import { User } from "../models/User";
import { sanitizeUser, verifySession } from "../services/auth.service";
import { httpError } from "../utils/http";
import { unsignCookieValue } from "../utils/signed-cookie";

export const SESSION_COOKIE = "onepws_session";

function readSessionToken(req: Request) {
  const parsedToken = req.signedCookies?.[SESSION_COOKIE] as string | undefined;
  if (parsedToken) return parsedToken;

  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;

  const rawCookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!rawCookie) return undefined;

  const rawValue = rawCookie.slice(SESSION_COOKIE.length + 1);
  const decodedValue = decodeURIComponent(rawValue);
  return unsignCookieValue(decodedValue, getEnv().COOKIE_SECRET);
}

export async function optionalUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = readSessionToken(req);
    if (!token) return next();
    await connectDB();
    const payload = verifySession(token);
    const user = await User.findById(payload.sub).populate("role");
    if (user?.active) req.user = sanitizeUser(user);
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
