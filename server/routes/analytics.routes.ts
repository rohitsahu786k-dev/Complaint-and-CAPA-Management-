import { Router } from "express";
import { z } from "zod";
import { objectIdSchema } from "@shared/schemas/common";
import { connectDB } from "../config/db";
import { requireUser } from "../middleware/auth";
import { assignableUsers, capaAnalytics, dashboardAnalytics, repeatAnalytics, tatAnalytics } from "../services/analytics.service";
import { buildReport, eightDExcelSheets, eightDReportData, reportCatalog } from "../services/report.service";
import { requireActor } from "../services/complaint.service";
import { hasPermission } from "../domain/rbac";
import { writeAudit } from "../services/audit.service";
import { asyncHandler } from "../utils/async-handler";
import { httpError, ok } from "../utils/http";

const scopeQuery = z.object({ company: objectIdSchema.optional() });
const reportQuery = scopeQuery.extend({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });

export const analyticsRouter = Router();
analyticsRouter.use(requireUser);

analyticsRouter.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const query = scopeQuery.parse(req.query);
    await connectDB();
    return ok(res, await dashboardAnalytics(req.user, query.company));
  })
);

analyticsRouter.get(
  "/tat",
  asyncHandler(async (req, res) => {
    const query = scopeQuery.parse(req.query);
    await connectDB();
    return ok(res, await tatAnalytics(req.user, query.company));
  })
);

analyticsRouter.get(
  "/capa",
  asyncHandler(async (req, res) => {
    const query = scopeQuery.parse(req.query);
    await connectDB();
    return ok(res, await capaAnalytics(req.user, query.company));
  })
);

analyticsRouter.get(
  "/repeat",
  asyncHandler(async (req, res) => {
    const query = scopeQuery.parse(req.query);
    await connectDB();
    return ok(res, await repeatAnalytics(req.user, query.company));
  })
);

analyticsRouter.get(
  "/assignable-users",
  asyncHandler(async (req, res) => {
    const query = scopeQuery.parse(req.query);
    await connectDB();
    return ok(res, { users: await assignableUsers(req.user, query.company) });
  })
);

export const reportRouter = Router();
reportRouter.use(requireUser);

reportRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const actor = await requireActor(req.user);
    const catalog = reportCatalog().filter((entry) => hasPermission(actor, entry.permission));
    return ok(res, { reports: catalog });
  })
);

reportRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const query = reportQuery.parse(req.query);
    await connectDB();
    const actor = await requireActor(req.user);
    if (!hasPermission(actor, "report.all")) throw httpError(403, "You do not have permission to run reports");
    const rows = await buildReport(req.params.id, { user: req.user, companyId: query.company, from: query.from, to: query.to });
    return ok(res, { id: req.params.id, rows, generatedAt: new Date().toISOString() });
  })
);

reportRouter.post(
  "/:id/export",
  asyncHandler(async (req, res) => {
    const query = reportQuery.parse(req.query);
    await connectDB();
    const actor = await requireActor(req.user);
    if (!hasPermission(actor, "export.all") && !hasPermission(actor, "report.all")) {
      throw httpError(403, "You do not have permission to export reports");
    }
    const rows = await buildReport(req.params.id, { user: req.user, companyId: query.company, from: query.from, to: query.to });
    await writeAudit({ actor: req.user, action: "EXPORT", entity: "Report", entityId: req.params.id, metadata: { rows: rows.length } });
    return ok(res, { id: req.params.id, rows, generatedAt: new Date().toISOString() });
  })
);

reportRouter.get(
  "/complaint/:complaintId/8d",
  asyncHandler(async (req, res) => {
    await connectDB();
    const data = await eightDReportData(req.params.complaintId, req.user);
    await writeAudit({ actor: req.user, action: "EXPORT", entity: "Complaint8D", entityId: req.params.complaintId });
    return ok(res, { ...data, sheets: eightDExcelSheets(data) });
  })
);
