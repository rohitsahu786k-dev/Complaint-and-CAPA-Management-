import { Router } from "express";
import { z } from "zod";
import { objectIdSchema } from "@shared/schemas/common";
import { connectDB } from "../config/db";
import { requireUser } from "../middleware/auth";
import { EFFECTIVENESS_CHECK_RESULTS } from "../models/EffectivenessCheck";
import { listEffectivenessChecks, listEffectivenessTracker, recordEffectivenessCheck } from "../services/effectiveness.service";
import { asyncHandler } from "../utils/async-handler";
import { ok } from "../utils/http";

export const effectivenessRouter = Router();

effectivenessRouter.use(requireUser);

const trackerQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(["Upcoming", "Due Soon", "Overdue"]).optional(),
  search: z.string().trim().max(160).optional(),
  company: objectIdSchema.optional()
});

const checkInput = z.object({
  result: z.enum(EFFECTIVENESS_CHECK_RESULTS),
  remarks: z.string().trim().min(5, "Remarks are required (at least 5 characters)").max(2000),
  checkedAt: z.coerce.date().optional()
});

/** Closed complaints with the date their next periodic effectiveness check falls due. */
effectivenessRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = trackerQuery.parse(req.query);
    await connectDB();
    return ok(res, await listEffectivenessTracker(query, req.user));
  })
);

effectivenessRouter.get(
  "/:complaintId/checks",
  asyncHandler(async (req, res) => {
    await connectDB();
    return ok(res, { checks: await listEffectivenessChecks(req.params.complaintId, req.user) });
  })
);

effectivenessRouter.post(
  "/:complaintId/checks",
  asyncHandler(async (req, res) => {
    const input = checkInput.parse(req.body);
    await connectDB();
    const check = await recordEffectivenessCheck(req.params.complaintId, input, req.user);
    return ok(res, { check }, 201);
  })
);
