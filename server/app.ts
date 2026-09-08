import { randomUUID } from "node:crypto";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { getEnv, isProduction } from "./config/env";
import { optionalUser } from "./middleware/auth";
import { errorHandler } from "./middleware/error";
import { analyticsRouter, reportRouter } from "./routes/analytics.routes";
import { attachmentRouter } from "./routes/attachment.routes";
import { auditRouter } from "./routes/audit.routes";
import { authRouter } from "./routes/auth.routes";
import { capaRouter } from "./routes/capa.routes";
import { complaintRouter } from "./routes/complaint.routes";
import { configurationRouter } from "./routes/configuration.routes";
import { healthRouter } from "./routes/health.routes";
import { importRouter } from "./routes/import.routes";
import { masterAdminRouter } from "./routes/master-admin.routes";
import { masterRouter } from "./routes/master.routes";
import { notificationRouter } from "./routes/notification.routes";
import { emailRouter } from "./routes/email.routes";
import { cronRouter } from "./routes/cron.routes";

export function createApp() {
  const app = express();
  const env = getEnv();
  const production = isProduction();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: production ? undefined : false,
      crossOriginResourcePolicy: { policy: "same-site" }
    })
  );
  app.use(
    cors({
      origin: production ? env.APP_BASE_URL || false : env.APP_BASE_URL || true,
      credentials: true,
      methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
    })
  );
  // Imports and legacy migrations carry large JSON payloads; every other route stays small.
  app.use("/api/import", express.json({ limit: "25mb" }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser(env.COOKIE_SECRET));

  // Correlation id, so an audit entry can be tied back to a single request.
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    next();
  });

  app.use(optionalUser);

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/master", masterRouter);
  app.use("/api/master", masterAdminRouter);
  app.use("/api/configuration", configurationRouter);
  app.use("/api/complaints", complaintRouter);
  app.use("/api/capas", capaRouter);
  app.use("/api/attachments", attachmentRouter);
  app.use("/api/notifications", notificationRouter);
  app.use("/api/audit", auditRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/reports", reportRouter);
  app.use("/api/import", importRouter);
  app.use("/api/email", emailRouter);
  app.use("/api/cron", cronRouter);

  app.use((_req, res) => res.status(404).json({ message: "API route not found" }));
  app.use(errorHandler);

  return app;
}
