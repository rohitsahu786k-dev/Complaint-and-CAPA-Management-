import { z } from "zod";

export const usernameSchema = z.string().trim().min(3).max(80).toLowerCase();
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200)
  .regex(/[A-Za-z]/, "Password must include a letter")
  .regex(/[0-9]/, "Password must include a number");

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1).max(200)
});

export const forgotPasswordSchema = z.object({
  emailOrUsername: z.string().trim().min(3).max(160)
});

export const resetPasswordSchema = z.object({
  token: z.string().min(32).max(256),
  newPassword: passwordSchema
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
