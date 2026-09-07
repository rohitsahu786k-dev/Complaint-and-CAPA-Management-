import { Router } from "express";
import { changePasswordSchema, forgotPasswordSchema, loginSchema, resetPasswordSchema } from "@shared/schemas/auth";
import { getEnv, isProduction } from "../config/env";
import { connectDB } from "../config/db";
import { SESSION_COOKIE, requireUser } from "../middleware/auth";
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
import { sendMail } from "../services/email.service";
import { writeAudit } from "../services/audit.service";
import { asyncHandler } from "../utils/async-handler";
import { httpError, ok } from "../utils/http";

export const authRouter = Router();

function cookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax" as const,
    maxAge: sessionMaxAgeMs(),
    path: "/"
  };
}

authRouter.post(
  "/login",
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
  asyncHandler(async (req, res) => {
    const input = forgotPasswordSchema.parse(req.body);
    await connectDB();
    const result = await createPasswordResetToken(input.emailOrUsername);
    if (result?.user.email) {
      const baseUrl = getEnv().APP_BASE_URL || `${req.protocol}://${req.get("host") || "localhost:5173"}`;
      const resetUrl = new URL(`/reset-password?token=${result.token}`, baseUrl).toString();
      await sendMail({
        to: [result.user.email],
        subject: "Reset your ONEPWS Complaint & CAPA Portal password",
        html: `<p>Hello ${result.user.name},</p><p>Use the secure link below to reset your password. It expires in 1 hour.</p><p><a href="${resetUrl}">Reset Password</a></p>`,
        text: `Hello ${result.user.name},\n\nReset your password: ${resetUrl}\n\nThis link expires in 1 hour.`
      });
      await writeAudit({ action: "PASSWORD_RESET_REQUESTED", entity: "User", entityId: String(result.user._id) });
    }
    return ok(res, { requested: true });
  })
);

authRouter.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const input = resetPasswordSchema.parse(req.body);
    await connectDB();
    const user = await resetPasswordWithToken(input.token, input.newPassword);
    await writeAudit({ action: "PASSWORD_RESET_COMPLETED", entity: "User", entityId: String(user._id) });
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
    user.passwordHash = await hashPassword(input.newPassword);
    user.passwordChangedAt = new Date();
    user.forcePasswordChange = false;
    await user.save();
    await writeAudit({ actor: req.user, action: "PASSWORD_CHANGED", entity: "User", entityId: String(user._id) });
    return ok(res, { changed: true });
  })
);
