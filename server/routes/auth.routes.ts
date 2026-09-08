import { Router } from "express";
import { changePasswordSchema, forgotPasswordSchema, loginSchema, resetPasswordSchema } from "@shared/schemas/auth";
import { getEnv, isProduction } from "../config/env";
import { connectDB } from "../config/db";
import { SESSION_COOKIE, requireUser } from "../middleware/auth";
import { createRateLimit } from "../middleware/rate-limit";
import { User } from "../models/User";
import {
  authenticate,
  createPasswordResetToken,
  hashPassword,
  resetPasswordWithToken,
  sanitizeUser,
  sessionMaxAgeMs,
  signSession,
  verifyPassword
} from "../services/auth.service";
import { sendTemplatedEmail } from "../services/email.service";
import { writeAudit } from "../services/audit.service";
import { asyncHandler } from "../utils/async-handler";
import { httpError, ok } from "../utils/http";

export const authRouter = Router();

const loginRateLimit = createRateLimit({
  keyPrefix: "auth:login",
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many sign-in attempts from this network. Please try again later."
});
const forgotRateLimit = createRateLimit({
  keyPrefix: "auth:forgot",
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many password reset requests. Please try again later."
});
const resetRateLimit = createRateLimit({
  keyPrefix: "auth:reset",
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many password reset attempts. Please try again later."
});

function cookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax" as const,
    signed: true,
    maxAge: sessionMaxAgeMs(),
    path: "/"
  };
}

authRouter.post(
  "/login",
  loginRateLimit,
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    await connectDB();
    const user = await authenticate(input.username, input.password);
    res.cookie(SESSION_COOKIE, signSession(String(user._id)), cookieOptions());
    const apiUser = sanitizeUser(user);
    await writeAudit({ actor: apiUser, action: "LOGIN", entity: "User", entityId: apiUser.id });
    return ok(res, { user: apiUser });
  })
);

authRouter.post(
  "/logout",
  requireUser,
  asyncHandler(async (req, res) => {
    await writeAudit({ actor: req.user, action: "LOGOUT", entity: "User", entityId: req.user?.id });
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return ok(res, { loggedOut: true });
  })
);

authRouter.get("/me", requireUser, (req, res) => ok(res, { user: req.user }));

authRouter.post(
  "/forgot-password",
  forgotRateLimit,
  asyncHandler(async (req, res) => {
    const input = forgotPasswordSchema.parse(req.body);
    await connectDB();
    const result = await createPasswordResetToken(input.emailOrUsername);
    if (result?.user.email) {
      const baseUrl = getEnv().APP_BASE_URL || `${req.protocol}://${req.get("host") || "localhost:5173"}`;
      const resetUrl = new URL(`/reset-password?token=${result.token}`, baseUrl).toString();

      await sendTemplatedEmail({
        triggerEvent: "PASSWORD_RESET_REQUESTED",
        recipients: [result.user.email],
        data: {
          recipientName: result.user.name,
          resetUrl,
          expiresInHours: "1"
        },
        sentBySystem: true
      });

      await writeAudit({ action: "PASSWORD_RESET_REQUESTED", entity: "User", entityId: String(result.user._id) });
    }
    return ok(res, { requested: true });
  })
);

authRouter.post(
  "/reset-password",
  resetRateLimit,
  asyncHandler(async (req, res) => {
    const input = resetPasswordSchema.parse(req.body);
    await connectDB();
    const user = await resetPasswordWithToken(input.token, input.newPassword);
    await writeAudit({ action: "PASSWORD_RESET_COMPLETED", entity: "User", entityId: String(user._id) });

    if (user.email) {
      await sendTemplatedEmail({
        triggerEvent: "PASSWORD_CHANGED",
        recipients: [user.email],
        data: {
          recipientName: user.name,
          username: user.username
        },
        sentBySystem: true
      });
    }

    return ok(res, { reset: true });
  })
);

authRouter.post(
  "/change-password",
  requireUser,
  asyncHandler(async (req, res) => {
    const input = changePasswordSchema.parse(req.body);
    await connectDB();
    const user = await User.findById(req.user?.id).select("+passwordHash");
    if (!user) throw httpError(404, "User not found");
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) throw httpError(400, "Current password is incorrect");
    if (await verifyPassword(input.newPassword, user.passwordHash)) throw httpError(400, "New password must be different from the current password");
    user.passwordHash = await hashPassword(input.newPassword);
    user.passwordChangedAt = new Date();
    user.forcePasswordChange = false;
    await user.save();
    await writeAudit({ actor: req.user, action: "PASSWORD_CHANGED", entity: "User", entityId: String(user._id) });

    if (user.email) {
      await sendTemplatedEmail({
        triggerEvent: "PASSWORD_CHANGED",
        recipients: [user.email],
        data: {
          recipientName: user.name,
          username: user.username
        },
        sentBySystem: true
      });
    }

    return ok(res, { changed: true });
  })
);
