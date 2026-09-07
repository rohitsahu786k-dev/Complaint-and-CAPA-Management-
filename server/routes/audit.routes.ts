import { Router } from "express";
import { z } from "zod";
import { AUDIT_ACTIONS } from "@shared/constants/domain";
import { listQuerySchema, paginate } from "@shared/schemas/common";
import { connectDB } from "../config/db";
import { requirePermission, requireUser } from "../middleware/auth";
import { AuditLog } from "../models/AuditLog";
import { asyncHandler } from "../utils/async-handler";
import { ok } from "../utils/http";

export const auditRouter = Router();

auditRouter.use(requireUser);

/** Audit logs are append-only: the API exposes reads only, never a write or delete. */
auditRouter.get(
  "/",
  requirePermission("audit.view"),
  asyncHandler(async (req, res) => {
    const query = listQuerySchema
      .extend({
        action: z.enum(AUDIT_ACTIONS).optional(),
        entity: z.string().trim().max(60).optional(),
        entityId: z.string().trim().max(60).optional(),
        actor: z.string().trim().max(60).optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional()
      })
      .parse(req.query);

    await connectDB();
    const filter: Record<string, unknown> = {};
    if (query.action) filter.action = query.action;
    if (query.entity) filter.entity = query.entity;
    if (query.entityId) filter.entityId = query.entityId;
    if (query.actor) filter.actor = query.actor;
    if (query.from || query.to) {
      filter.createdAt = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
    }
    if (query.search) {
      const term = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(term, "i");
      filter.$or = [{ actorName: regex }, { entity: regex }, { entityId: regex }, { action: regex }];
    }

    const [rows, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: query.order === "asc" ? 1 : -1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean(),
      AuditLog.countDocuments(filter)
    ]);

    return ok(res, paginate(rows, total, query));
  })
);
