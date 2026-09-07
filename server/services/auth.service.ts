import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import type { ApiRole, ApiUser } from "@shared/types/api";
import { getEnv } from "../config/env";
import { User, type UserDocument } from "../models/User";
import { httpError } from "../utils/http";
import { randomToken, sha256 } from "../utils/crypto";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const SESSION_TTL_SECONDS = 8 * 60 * 60;

type JwtPayload = { sub: string; typ: "session" };

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export function signSession(userId: string) {
  return jwt.sign({ sub: userId, typ: "session" } satisfies JwtPayload, getEnv().JWT_SECRET, {
    expiresIn: SESSION_TTL_SECONDS
  });
}

export function verifySession(token: string) {
  return jwt.verify(token, getEnv().JWT_SECRET) as JwtPayload;
}

export function sessionMaxAgeMs() {
  return SESSION_TTL_SECONDS * 1000;
}

export function sanitizeUser(user: UserDocument | (Record<string, unknown> & { _id: Types.ObjectId })): ApiUser {
  const role = user.role as unknown as { _id?: Types.ObjectId; name?: string; permissions?: string[] };
  const companyIds = Array.isArray(user.companyIds) ? user.companyIds.map((id) => String(id)) : [];
  return {
    id: String(user._id),
    name: String(user.name),
    username: String(user.username),
    email: typeof user.email === "string" ? user.email : undefined,
    role:
      role && role.name
        ? {
            id: String(role._id),
            name: role.name as ApiRole["name"],
            permissions: (role.permissions || []) as ApiRole["permissions"]
          }
        : undefined,
    companyIds,
    department: user.department ? String(user.department) : undefined,
    employee: user.employee ? String(user.employee) : undefined,
    active: Boolean(user.active),
    forcePasswordChange: Boolean(user.forcePasswordChange)
  };
}

export async function authenticate(username: string, password: string) {
  const user = await User.findOne({ username: username.toLowerCase(), active: true })
    .select("+passwordHash +failedLoginCount +lockedUntil")
    .populate("role");

  const generic = httpError(401, "Invalid username or password");
  if (!user) throw generic;
  if (user.lockedUntil && user.lockedUntil > new Date()) throw generic;

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    user.failedLoginCount = (user.failedLoginCount || 0) + 1;
    if (user.failedLoginCount >= 5) user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();
    throw generic;
  }

  user.failedLoginCount = 0;
  user.lockedUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();
  return user;
}

export async function createPasswordResetToken(emailOrUsername: string) {
  const query = emailOrUsername.includes("@")
    ? { email: emailOrUsername.toLowerCase(), active: true }
    : { username: emailOrUsername.toLowerCase(), active: true };
  const user = await User.findOne(query).select("+passwordResetTokenHash +passwordResetExpires");
  if (!user) return null;

  const token = randomToken();
  user.passwordResetTokenHash = sha256(token);
  user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await user.save();
  return { user, token };
}

export async function resetPasswordWithToken(token: string, newPassword: string) {
  const user = await User.findOne({
    passwordResetTokenHash: sha256(token),
    passwordResetExpires: { $gt: new Date() },
    active: true
  }).select("+passwordResetTokenHash +passwordResetExpires +passwordHash");

  if (!user) throw httpError(400, "This reset link is invalid or has expired");
  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  user.forcePasswordChange = false;
  await user.save();
  return user;
}
