import nodemailer from "nodemailer";
import { getEnv } from "../config/env";

export async function sendMail(input: { to: string[]; subject: string; html: string; text: string }) {
  const env = getEnv();
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_APP_PASSWORD) return { status: "skipped" as const };

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_APP_PASSWORD }
  });

  await transporter.sendMail({
    from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL || env.SMTP_USER}>`,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text
  });
  return { status: "sent" as const };
}
