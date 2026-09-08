import { Router } from "express";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { ok } from "../utils/http";
import { asyncHandler } from "../utils/async-handler";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) =>
  ok(res, {
    status: "ok",
    service: "onepws-complaint-capa-api",
    commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "local"
  })
);

healthRouter.get(
  "/db",
  asyncHandler(async (_req, res) => {
    await connectDB();
    return ok(res, { status: mongoose.connection.readyState === 1 ? "connected" : "not-connected" });
  })
);
