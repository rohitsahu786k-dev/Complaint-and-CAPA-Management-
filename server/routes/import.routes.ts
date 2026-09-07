import { Router } from "express";
import { z } from "zod";
import { connectDB } from "../config/db";
import { requirePermission, requireUser } from "../middleware/auth";
import {
  COMPLAINT_IMPORT_COLUMNS,
  commitComplaintImport,
  exportBackup,
  migrateLegacyDatabase,
  previewComplaintImport
} from "../services/import.service";
import { asyncHandler } from "../utils/async-handler";
import { ok } from "../utils/http";

export const importRouter = Router();

importRouter.use(requireUser);

const rowsSchema = z.object({
  rows: z.array(z.record(z.union([z.string(), z.number(), z.undefined()]))).max(2000)
});

importRouter.get(
  "/template",
  asyncHandler(async (_req, res) => {
    return ok(res, {
      columns: COMPLAINT_IMPORT_COLUMNS,
      sample: {
        Type: "External",
        "Company Code": "ONEPWS",
        "Received Date": new Date().toISOString().slice(0, 10),
        Priority: "Medium",
        Category: "Product quality issue",
        Customer: "Example Customer Ltd",
        Product: "Workstation",
        "Responsible Department": "Production",
        "Owner Username": "",
        Description: "Describe the complaint in at least ten characters"
      }
    });
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
    return ok(res, await exportBackup(req.user));
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
