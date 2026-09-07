import { Router } from "express";
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

export const emailRouter = Router();

// ==================== SETTINGS & HEALTH ====================
emailRouter.get(
  "/settings",
  requireUser,
  asyncHandler(async (req, res) => {
    if (!req.user?.role?.name?.includes("Master Admin")) {
      throw httpError(403, "Only Master Admin can view SMTP settings");
    }
    const status = getSmtpStatus();
    return ok(res, status);
  })
);

emailRouter.post(
  "/settings/verify",
  requireUser,
  asyncHandler(async (req, res) => {
    if (!req.user?.role?.name?.includes("Master Admin")) {
      throw httpError(403, "Only Master Admin can verify SMTP connection");
    }
    const result = await verifySmtpConnection();
    return ok(res, result);
  })
);

emailRouter.post(
  "/settings/test",
  requireUser,
  asyncHandler(async (req, res) => {
    if (!req.user?.role?.name?.includes("Master Admin")) {
      throw httpError(403, "Only Master Admin can send test emails");
    }
    const input = sendTestEmailSchema.parse(req.body);
    const result = await sendRawTestEmail(input);
    return ok(res, result);
  })
);

// ==================== TEMPLATES ====================
emailRouter.get(
  "/templates",
  requireUser,
  asyncHandler(async (req, res) => {
    const triggerEvent = typeof req.query.triggerEvent === "string" ? req.query.triggerEvent : undefined;
    const activeOnly = req.query.activeOnly === "true";
    const search = typeof req.query.search === "string" ? req.query.search : undefined;

    const templates = await listEmailTemplates({ triggerEvent, activeOnly, search });
    return ok(res, templates);
  })
);

emailRouter.get(
  "/templates/:id",
  requireUser,
  asyncHandler(async (req, res) => {
    const template = await getEmailTemplateById(req.params.id);
    return ok(res, template);
  })
);

emailRouter.post(
  "/templates",
  requireUser,
  asyncHandler(async (req, res) => {
    if (!req.user?.role?.name?.includes("Master Admin")) {
      throw httpError(403, "Only Master Admin can create email templates");
    }
    const input = emailTemplateSchema.parse(req.body);
    const created = await createEmailTemplate(input, req.user.id);
    return ok(res, created, 201);
  })
);

emailRouter.patch(
  "/templates/:id",
  requireUser,
  asyncHandler(async (req, res) => {
    if (!req.user?.role?.name?.includes("Master Admin")) {
      throw httpError(403, "Only Master Admin can edit email templates");
    }
    const input = emailTemplateUpdateSchema.parse(req.body);
    const updated = await updateEmailTemplate(req.params.id, input, req.user.id);
    return ok(res, updated);
  })
);

emailRouter.post(
  "/templates/:id/preview",
  requireUser,
  asyncHandler(async (req, res) => {
    const input = templatePreviewSchema.parse(req.body);
    const preview = await previewEmailTemplate(req.params.id, input);
    return ok(res, preview);
  })
);

emailRouter.post(
  "/templates/:id/test-send",
  requireUser,
  asyncHandler(async (req, res) => {
    if (!req.user?.role?.name?.includes("Master Admin")) {
      throw httpError(403, "Only Master Admin can send template test emails");
    }
    const input = templateTestSendSchema.parse(req.body);
    const template = await getEmailTemplateById(req.params.id);

    const result = await sendTemplatedEmail({
      triggerEvent: template.triggerEvent,
      recipients: [input.to],
      data: (input.sampleData || {}) as Record<string, string | number>,
      sentBySystem: false
    });

    return ok(res, result);
  })
);

// ==================== LOGS & RETRY ====================
emailRouter.get(
  "/logs",
  requireUser,
  asyncHandler(async (req, res) => {
    if (!req.user?.role?.name?.includes("Master Admin")) {
      throw httpError(403, "Only Master Admin can view email delivery logs");
    }
    const query = emailLogQuerySchema.parse(req.query);
    const logs = await queryEmailLogs(query);
    return ok(res, logs);
  })
);

emailRouter.get(
  "/logs/:id",
  requireUser,
  asyncHandler(async (req, res) => {
    if (!req.user?.role?.name?.includes("Master Admin")) {
      throw httpError(403, "Only Master Admin can view email log details");
    }
    const log = await getEmailLogById(req.params.id);
    return ok(res, log);
  })
);

emailRouter.post(
  "/logs/retry",
  requireUser,
  asyncHandler(async (req, res) => {
    if (!req.user?.role?.name?.includes("Master Admin")) {
      throw httpError(403, "Only Master Admin can retry failed emails");
    }
    const input = retryEmailSchema.parse(req.body);
    const result = await retryEmail(input.logId);
    return ok(res, result);
  })
);

// ==================== MANUAL ESCALATION TRIGGER ====================
emailRouter.post(
  "/escalation/run",
  requireUser,
  asyncHandler(async (req, res) => {
    if (!req.user?.role?.name?.includes("Master Admin")) {
      throw httpError(403, "Only Master Admin can trigger manual escalations");
    }
    const result = await processEscalations();
    return ok(res, result);
  })
);

// ==================== REPORT SHARING ====================
emailRouter.post(
  "/share-report",
  requireUser,
  asyncHandler(async (req, res) => {
    const input = shareReportSchema.parse(req.body);
    const complaint = await Complaint.findById(input.complaintId)
      .populate("responsibleDepartment", "name")
      .populate("priority", "name")
      .lean();

    if (!complaint) throw httpError(404, "Complaint not found");

    const appUrl = getAppUrl();
    const reportUrl = `${appUrl}/complaints/${complaint._id}`;

    const result = await sendTemplatedEmail({
      triggerEvent: "COMPLAINT_REPORT_SHARED",
      recipients: [input.recipientEmail],
      relatedComplaintId: complaint._id,
      sentBySystem: false,
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

    return ok(res, result);
  })
);
