import nodemailer, { type Transporter } from "nodemailer";
import { getEnv } from "../config/env";

export function isSmtpConfigured(): boolean {
  const env = getEnv();
  return Boolean(
    env.SMTP_HOST &&
      env.SMTP_USER &&
      env.SMTP_APP_PASSWORD &&
      env.SMTP_HOST.trim().length > 0 &&
      env.SMTP_USER.trim().length > 0 &&
      env.SMTP_APP_PASSWORD.trim().length > 0
  );
}

export function createTransporter(): Transporter {
  const env = getEnv();
  if (!isSmtpConfigured()) {
    throw new Error("SMTP service is not configured on this server");
  }

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT || 587,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_APP_PASSWORD
    }
  });
}

export function fromAddress(): string {
  const env = getEnv();
  const email = env.SMTP_FROM_EMAIL || env.SMTP_USER || "noreply@onepws.com";
  const name = env.SMTP_FROM_NAME || "ONEPWS Complaint & CAPA Portal";
  return `"${name}" <${email}>`;
}

export async function verifySmtpConnection(): Promise<{ success: boolean; message: string }> {
  if (!isSmtpConfigured()) {
    return { success: false, message: "SMTP environment variables are not configured" };
  }
  try {
    const transporter = createTransporter();
    await transporter.verify();
    return { success: true, message: "SMTP connection successfully verified" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "SMTP connection failed"
    };
  }
}

/**
 * Returns safe non-secret configuration status for Master Admin inspection.
 * Password is STRICTLY excluded.
 */
export function getSmtpStatus() {
  const env = getEnv();
  return {
    isConfigured: isSmtpConfigured(),
    host: env.SMTP_HOST || null,
    port: env.SMTP_PORT || 587,
    secure: env.SMTP_SECURE,
    fromName: env.SMTP_FROM_NAME || "ONEPWS Complaint & CAPA Portal",
    fromEmail: env.SMTP_FROM_EMAIL || env.SMTP_USER || null
  };
}
