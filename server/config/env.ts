import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  COOKIE_SECRET: z.string().min(16),
  APP_BASE_URL: z.string().url().optional().or(z.literal("")),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_UPLOAD_FOLDER: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_APP_PASSWORD: z.string().optional(),
  SMTP_FROM_EMAIL: z.string().optional(),
  SMTP_FROM_NAME: z.string().default("ONEPWS Complaint & CAPA Portal"),
  CRON_SECRET: z.string().optional()
});

export type ServerEnv = z.infer<typeof envSchema>;

let cachedEnv: ServerEnv | null = null;

export function getEnv() {
  if (cachedEnv) return cachedEnv;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Server environment is not configured correctly: ${keys}`);
  }

  if (parsed.data.NODE_ENV === "production") {
    const missing: string[] = [];
    if (!parsed.data.APP_BASE_URL) missing.push("APP_BASE_URL");
    if (!parsed.data.CRON_SECRET || parsed.data.CRON_SECRET.length < 24) missing.push("CRON_SECRET");
    if (missing.length) throw new Error(`Production environment is missing required configuration: ${missing.join(", ")}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function isProduction() {
  return getEnv().NODE_ENV === "production";
}
