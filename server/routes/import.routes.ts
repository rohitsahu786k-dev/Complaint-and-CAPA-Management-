import { Router } from "express";
import { z } from "zod";
import { connectDB } from "../config/db";
import { requirePermission, requireUser } from "../middleware/auth";
import {
  commitComplaintImport,
  getImportReference,
  migrateLegacyDatabase,
  previewComplaintImport
} from "../services/import.service";
import { exportSystemBackup, restoreSystemBackup } from "../services/system-backup.service";
import { asyncHandler } from "../utils/async-handler";
import { ok } from "../utils/http";

export const importRouter = Router();

importRouter.use(requireUser);

const rowsSchema = z.object({
  rows: z.array(z.record(z.union([z.string(), z.number(), z.undefined()]))).max(2000)
});

/**
 * Template and reference data. Both the sample row and the lists the screen shows are
 * derived from live master data, so the codes offered are always ones the portal accepts.
 */
importRouter.get(
  "/template",
  asyncHandler(async (req, res) => {
    await connectDB();
    return ok(res, await getImportReference(req.user));
  })
);

importRouter.post(
  "/complaints/preview",
  requirePermission("complaint.create"),
  asyncHandler(async (req, res) => {
    const input = rowsSchema.parse(req.body);
    await connectDB();
    return ok(res, await previewComplaintImport(input.rows, req.user));
  })
);

importRouter.post(
  "/complaints/commit",
  requirePermission("complaint.create"),
  asyncHandler(async (req, res) => {
    const input = rowsSchema.extend({ strategy: z.enum(["skip-duplicates", "import-and-flag"]).default("skip-duplicates") }).parse(req.body);
    await connectDB();
    return ok(res, await commitComplaintImport(input.rows, input.strategy, req.user), 201);
  })
);

importRouter.get(
  "/backup",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    await connectDB();
    return ok(res, await exportSystemBackup(req.user));
  })
);

/**
 * Safe system restore. A dry-run is the default. Confirmed execution is merge-only:
 * existing production records are never overwritten or deleted.
 */
importRouter.post(
  "/restore",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        payload: z.unknown(),
        dryRun: z.boolean().default(true),
        confirmation: z.string().optional()
      })
      .parse(req.body);
    await connectDB();
    return ok(res, await restoreSystemBackup(input.payload, { dryRun: input.dryRun, confirmation: input.confirmation }, req.user));
  })
);

/**
 * Legacy prototype migration. A dry run is always available and the caller must
 * confirm explicitly before anything is written.
 */
importRouter.post(
  "/legacy",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        payload: z.unknown(),
        dryRun: z.boolean().default(true),
        confirmation: z.string().optional()
      })
      .parse(req.body);
    await connectDB();
    const dryRun = input.dryRun || input.confirmation !== "MIGRATE";
    return ok(res, await migrateLegacyDatabase(input.payload, { dryRun }, req.user));
  })
);
