import { Router } from "express";
import { z } from "zod";
import { paginate } from "@shared/schemas/common";
import { capaCreateSchema, capaListQuerySchema, capaUpdateSchema, effectivenessSchema, evidenceReviewSchema } from "@shared/schemas/capa";
import { objectIdSchema } from "@shared/schemas/common";
import { connectDB } from "../config/db";
import { requireUser } from "../middleware/auth";
import {
  attachEvidence,
  createCapa,
  deleteCapa,
  listCapas,
  reviewEvidence,
  updateCapa,
  verifyEffectiveness
} from "../services/capa.service";
import { writeAudit } from "../services/audit.service";
import { asyncHandler } from "../utils/async-handler";
import { httpError, ok } from "../utils/http";
import { Types } from "mongoose";

export const capaRouter = Router();

capaRouter.use(requireUser);

capaRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const isFullExport = req.query.pageSize === "5000";
    if (isFullExport) {
      const permissions = req.user?.role?.permissions || [];
      if (!permissions.includes("*") && !permissions.includes("export.all")) {
        throw httpError(403, "You do not have permission to export CAPAs");
      }
    }

    const query = capaListQuerySchema.parse({
      ...req.query,
      ...(isFullExport ? { page: 1, pageSize: 100 } : {})
    });
    const effectiveQuery = isFullExport ? { ...query, page: 1, pageSize: 5000 } : query;
    await connectDB();
    const { rows, total } = await listCapas(effectiveQuery, req.user);

    if (isFullExport) {
      await writeAudit({
        actor: req.user,
        action: "EXPORT",
        entity: "Capa",
        metadata: { count: rows.length, total, exportType: "full-entity" }
      });
    }

    return ok(res, paginate(rows, total, effectiveQuery));
  })
);

capaRouter.post(
  "/complaint/:complaintId",
  asyncHandler(async (req, res) => {
    const input = capaCreateSchema.parse(req.body);
    await connectDB();
    const capa = await createCapa(req.params.complaintId, input, req.user);
    return ok(res, { capa }, 201);
  })
);

capaRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = capaUpdateSchema.parse(req.body);
    await connectDB();
    const capa = await updateCapa(req.params.id, input, req.user);
    return ok(res, { capa });
  })
);

capaRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await connectDB();
    return ok(res, await deleteCapa(req.params.id, req.user));
  })
);

capaRouter.post(
  "/:id/evidence",
  asyncHandler(async (req, res) => {
    const input = z.object({ attachment: objectIdSchema, description: z.string().trim().max(500).optional().default("") }).parse(req.body);
    await connectDB();
    const capa = await attachEvidence(req.params.id, new Types.ObjectId(input.attachment), input.description, req.user);
    return ok(res, { capa }, 201);
  })
);

capaRouter.post(
  "/:id/evidence/review",
  asyncHandler(async (req, res) => {
    const input = evidenceReviewSchema.parse(req.body);
    await connectDB();
    const capa = await reviewEvidence(req.params.id, input.decision, input.remarks, req.user);
    return ok(res, { capa });
  })
);

capaRouter.post(
  "/:id/effectiveness",
  asyncHandler(async (req, res) => {
    const input = effectivenessSchema.parse(req.body);
    await connectDB();
    const capa = await verifyEffectiveness(req.params.id, input, req.user);
    return ok(res, { capa });
  })
);
