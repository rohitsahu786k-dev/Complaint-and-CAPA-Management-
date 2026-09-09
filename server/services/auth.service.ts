import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import type { ApiRole, ApiUser } from "@shared/types/api";
import { getEnv } from "../config/env";
import "../models/Role";
import { User, type UserDocument } from "../models/User";
import { httpError } from "../utils/http";
import { randomToken, sha256 } from "../utils/crypto";
import { LOCKOUT_MS, MAX_FAILED_LOGINS, isLocked, lockMinutesRemaining, registerFailedAttempt } from "../domain/lockout";

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
    .exec();

  const generic = httpError(401, "Invalid username or password");
  if (!user) throw generic;

  const lockState = { failedLoginCount: user.failedLoginCount, lockedUntil: user.lockedUntil };

  // A live lockout is reported explicitly. Hiding it behind the generic message left
  // users retrying a known-good password against a locked account with no way to
  // understand why sign-in kept failing.
  if (isLocked(lockState)) {
    const minutes = lockMinutesRemaining(lockState);
    throw httpError(
      423,
      `This account is temporarily locked after ${MAX_FAILED_LOGINS} failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or use "Forgot password" to reset it.`
    );
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const attempt = registerFailedAttempt(lockState);
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          failedLoginCount: attempt.failedLoginCount,
          ...(attempt.lockedUntil ? { lockedUntil: attempt.lockedUntil } : {})
        },
        // Clear a spent lock so the stale timestamp cannot resurrect the old streak.
        ...(user.lockedUntil && !attempt.locked ? { $unset: { lockedUntil: "" } } : {})
      }
    );
    if (attempt.locked) {
      throw httpError(
        423,
        `This account is now temporarily locked after ${MAX_FAILED_LOGINS} failed sign-in attempts. Try again in ${Math.round(LOCKOUT_MS / 60000)} minutes, or use "Forgot password" to reset it.`
      );
    }
    throw generic;
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: { failedLoginCount: 0, lastLoginAt: new Date() },
      $unset: { lockedUntil: "" }
    }
  );
  await user.populate("role");
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
