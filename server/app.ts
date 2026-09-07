import { randomUUID } from "node:crypto";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { getEnv } from "./config/env";
import { optionalUser } from "./middleware/auth";
import { errorHandler } from "./middleware/error";
import { attachmentRouter } from "./routes/attachment.routes";
import { auditRouter } from "./routes/audit.routes";
import { authRouter } from "./routes/auth.routes";
import { capaRouter } from "./routes/capa.routes";
import { complaintRouter } from "./routes/complaint.routes";
import { configurationRouter } from "./routes/configuration.routes";
import { healthRouter } from "./routes/health.routes";
import { masterRouter } from "./routes/master.routes";
import { notificationRouter } from "./routes/notification.routes";

export function createApp() {
  const app = express();
  const env = getEnv();

  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: env.APP_BASE_URL || true,
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser(env.COOKIE_SECRET));

  // Correlation id, so an audit entry can be tied back to a single request.
  app.use((req, _res, next) => {
    req.requestId = randomUUID();
    next();
  });

  app.use(optionalUser);

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/master", masterRouter);
  app.use("/api/configuration", configurationRouter);
  app.use("/api/complaints", complaintRouter);
  app.use("/api/capas", capaRouter);
  app.use("/api/attachments", attachmentRouter);
  app.use("/api/notifications", notificationRouter);
  app.use("/api/audit", auditRouter);

  app.use((_req, res) => res.status(404).json({ message: "API route not found" }));
  app.use(errorHandler);

  return app;
}
