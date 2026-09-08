import { Router, type NextFunction, type Request, type Response } from "express";
import { asyncHandler } from "../utils/async-handler";
import { httpError, ok } from "../utils/http";
import { requireUser } from "../middleware/auth";
import { getSmtpStatus, verifySmtpConnection } from "../lib/mailer";
import {
  emailLogQuerySchema,
  emailTemplateSchema,
  emailTemplateUpdateSchema,
  retryEmailSchema,
  sendTestEmailSchema,
  shareReportSchema,
  templatePreviewSchema,
  templateTestSendSchema
} from "@shared/schemas/email";
import {
  createEmailTemplate,
  getEmailTemplateById,
  listEmailTemplates,
  previewEmailTemplate,
  updateEmailTemplate
} from "../services/email-template.service";
import { queryEmailLogs, getEmailLogById } from "../services/email-log.service";
import { retryEmail, sendRawTestEmail, sendTemplatedEmail } from "../services/email.service";
import { processEscalations } from "../services/escalation.service";
import { Complaint } from "../models/Complaint";
import { getAppUrl } from "../lib/app-url";
import { hasPermission } from "../domain/rbac";
import { loadComplaintContext } from "../services/complaint.service";
import { writeAudit } from "../services/audit.service";

export const emailRouter = Router();
emailRouter.use(requireUser);

function requireMasterAdmin(req: Request, _res: Response, next: NextFunction) {
  const permissions = req.user?.role?.permissions ?? [];
  if (req.user?.role?.name === "Master Admin" || permissions.includes("*")) return next();
  return next(httpError(403, "Only Master Admin can access email administration"));
}

emailRouter.get("/settings", requireMasterAdmin, (_req, res) => ok(res, getSmtpStatus()));

emailRouter.post(
  "/settings/verify",
  requireMasterAdmin,
  asyncHandler(async (_req, res) => ok(res, await verifySmtpConnection()))
);

emailRouter.post(
  "/settings/test",
  requireMasterAdmin,
  asyncHandler(async (req, res) => {
    const input = sendTestEmailSchema.parse(req.body);
    return ok(res, await sendRawTestEmail(input));
  })
);

emailRouter.get(
  "/templates",
  requireMasterAdmin,
  asyncHandler(async (req, res) => {
    const triggerEvent = typeof req.query.triggerEvent === "string" ? req.query.triggerEvent : undefined;
    const activeOnly = req.query.activeOnly === "true";
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    return ok(res, await listEmailTemplates({ triggerEvent, activeOnly, search }));
  })
);

emailRouter.get(
  "/templates/:id",
  requireMasterAdmin,
  asyncHandler(async (req, res) => ok(res, await getEmailTemplateById(req.params.id)))
);

emailRouter.post(
  "/templates",
  requireMasterAdmin,
  asyncHandler(async (req, res) => {
    const input = emailTemplateSchema.parse(req.body);
    return ok(res, await createEmailTemplate(input, req.user?.id), 201);
  })
);

emailRouter.patch(
  "/templates/:id",
  requireMasterAdmin,
  asyncHandler(async (req, res) => {
    const input = emailTemplateUpdateSchema.parse(req.body);
    return ok(res, await updateEmailTemplate(req.params.id, input, req.user?.id));
  })
);

emailRouter.post(
  "/templates/:id/preview",
  requireMasterAdmin,
  asyncHandler(async (req, res) => {
    const input = templatePreviewSchema.parse(req.body);
    return ok(res, await previewEmailTemplate(req.params.id, input));
  })
);

emailRouter.post(
  "/templates/:id/test-send",
  requireMasterAdmin,
  asyncHandler(async (req, res) => {
    const input = templateTestSendSchema.parse(req.body);
    const template = await getEmailTemplateById(req.params.id);
    return ok(
      res,
      await sendTemplatedEmail({
        triggerEvent: template.triggerEvent,
        recipients: [input.to],
        data: (input.sampleData || {}) as Record<string, string | number>,
        sentBySystem: false,
        bypassRecipientRules: true
      })
    );
  })
);

emailRouter.get(
  "/logs",
  requireMasterAdmin,
  asyncHandler(async (req, res) => ok(res, await queryEmailLogs(emailLogQuerySchema.parse(req.query))))
);

emailRouter.get(
  "/logs/:id",
  requireMasterAdmin,
  asyncHandler(async (req, res) => ok(res, await getEmailLogById(req.params.id)))
);

emailRouter.post(
  "/logs/retry",
  requireMasterAdmin,
  asyncHandler(async (req, res) => {
    const input = retryEmailSchema.parse(req.body);
    return ok(res, await retryEmail(input.logId));
  })
);

emailRouter.post(
  "/escalation/run",
  requireMasterAdmin,
  asyncHandler(async (_req, res) => ok(res, await processEscalations()))
);

emailRouter.post(
  "/share-report",
  asyncHandler(async (req, res) => {
    const input = shareReportSchema.parse(req.body);
    const context = await loadComplaintContext(input.complaintId, req.user);
    if (
      !hasPermission(context.actor, "report.all") &&
      !hasPermission(context.actor, "export.all") &&
      !hasPermission(context.actor, "complaint.edit") &&
      !hasPermission(context.actor, "complaint.assign")
    ) {
      throw httpError(403, "You do not have permission to share complaint reports");
    }

    const complaint = await Complaint.findById(input.complaintId).populate("responsibleDept", "name").populate("priority", "name").lean();
    if (!complaint) throw httpError(404, "Complaint not found");

    const reportUrl = `${getAppUrl()}/complaints/${complaint._id}`;
    const result = await sendTemplatedEmail({
      triggerEvent: "COMPLAINT_REPORT_SHARED",
      recipients: [input.recipientEmail],
      relatedComplaintId: complaint._id,
      sentBySystem: false,
      bypassRecipientRules: true,
      data: {
        sharedBy: req.user?.name || "Quality Team",
        recipientName: input.recipientName,
        complaintNumber: complaint.number,
        customerName: complaint.customer || "Customer",
        partName: complaint.product || "Component",
        status: complaint.status,
        notes: input.notes || "Please find the formal Quality 8D report linked below.",
        reportUrl
      }
    });

    await writeAudit({
      actor: req.user,
      action: "EXPORT",
      entity: "ComplaintReportShare",
      entityId: input.complaintId,
      metadata: { recipient: input.recipientEmail, status: result.status }
    });
    return ok(res, result);
  })
);
