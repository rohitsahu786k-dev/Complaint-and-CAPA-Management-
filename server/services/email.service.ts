import { Types } from "mongoose";
import { getAppUrl } from "../lib/app-url";
import { DEFAULT_EMAIL_LOGO_URL } from "../lib/email-layout";
import { escapeHtml, renderTemplate } from "../lib/email-template-renderer";
import { createTransporter, fromAddress, isSmtpConfigured } from "../lib/mailer";
import { getActiveTemplateByTrigger } from "./email-template.service";
import { hasDedupeKeyBeenSent, writeEmailLog, getEmailLogById } from "./email-log.service";
import { EmailLog } from "../models/EmailLog";
import { httpError } from "../utils/http";

export type SendTemplatedEmailInput = {
  triggerEvent: string;
  recipients: string[];
  cc?: string[];
  bcc?: string[];
  data: Record<string, string | number | undefined | null>;
  relatedComplaintId?: string | Types.ObjectId;
  relatedCapaId?: string | Types.ObjectId;
  dedupeKey?: string;
  sentBySystem?: boolean;
};

export type SendEmailResult = {
  status: "sent" | "failed" | "skipped";
  logId?: string;
  message?: string;
};

function normalizePortalLinks(data: Record<string, string | number | undefined | null>, appUrl: string) {
  const normalized = { ...data };
  for (const [key, value] of Object.entries(normalized)) {
    if (!/(url|link)$/i.test(key) || typeof value !== "string" || !value.startsWith("/")) continue;
    normalized[key] = new URL(value, appUrl).toString();
  }
  return normalized;
}

export async function sendTemplatedEmail(input: SendTemplatedEmailInput): Promise<SendEmailResult> {
  if (input.dedupeKey) {
    const alreadySent = await hasDedupeKeyBeenSent(input.dedupeKey);
    if (alreadySent) {
      const skippedLog = await writeEmailLog({
        triggerEvent: input.triggerEvent,
        recipients: input.recipients,
        cc: input.cc,
        bcc: input.bcc,
        status: "skipped",
        errorMessage: `Duplicate event suppressed (dedupeKey: ${input.dedupeKey})`,
        relatedComplaintId: input.relatedComplaintId,
        relatedCapaId: input.relatedCapaId,
        dedupeKey: input.dedupeKey,
        sentBySystem: input.sentBySystem !== undefined ? input.sentBySystem : true
      });
      return { status: "skipped", logId: String(skippedLog._id), message: "Duplicate event suppressed" };
    }
  }

  const template = await getActiveTemplateByTrigger(input.triggerEvent);
  if (!template) {
    const skippedLog = await writeEmailLog({
      triggerEvent: input.triggerEvent,
      recipients: input.recipients,
      status: "skipped",
      errorMessage: `No active template found for trigger: ${input.triggerEvent}`,
      relatedComplaintId: input.relatedComplaintId,
      relatedCapaId: input.relatedCapaId,
      dedupeKey: input.dedupeKey,
      sentBySystem: input.sentBySystem !== undefined ? input.sentBySystem : true
    });
    return { status: "skipped", logId: String(skippedLog._id), message: "No active template" };
  }

  const cleanRecipients = (input.recipients || []).filter(Boolean);
  if (cleanRecipients.length === 0) {
    const skippedLog = await writeEmailLog({
      templateKey: template.templateKey,
      triggerEvent: input.triggerEvent,
      recipients: [],
      status: "skipped",
      errorMessage: "No valid recipient email addresses resolved",
      relatedComplaintId: input.relatedComplaintId,
      relatedCapaId: input.relatedCapaId,
      dedupeKey: input.dedupeKey,
      sentBySystem: input.sentBySystem !== undefined ? input.sentBySystem : true
    });
    return { status: "skipped", logId: String(skippedLog._id), message: "No recipients" };
  }

  const appUrl = getAppUrl();
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const normalizedInputData = normalizePortalLinks(input.data, appUrl);
  const mergedData: Record<string, string | number | undefined | null> = {
    companyName: "ONEPWS Private Limited",
    appUrl,
    logoUrl: DEFAULT_EMAIL_LOGO_URL,
    today,
    recipientName: cleanRecipients[0],
    ...normalizedInputData
  };

  const renderedSubject = renderTemplate(template.subject, mergedData).rendered;
  const renderedHtml = renderTemplate(template.htmlBody, mergedData).rendered;
  const renderedText = renderTemplate(template.textBody, mergedData).rendered;

  if (!isSmtpConfigured()) {
    const skippedLog = await writeEmailLog({
      templateKey: template.templateKey,
      triggerEvent: input.triggerEvent,
      recipients: cleanRecipients,
      cc: input.cc,
      bcc: input.bcc,
      subject: renderedSubject,
      status: "skipped",
      errorMessage: "SMTP is not configured on server; delivery skipped",
      relatedComplaintId: input.relatedComplaintId,
      relatedCapaId: input.relatedCapaId,
      dedupeKey: input.dedupeKey,
      sentBySystem: input.sentBySystem !== undefined ? input.sentBySystem : true,
      payload: { data: mergedData }
    });
    return { status: "skipped", logId: String(skippedLog._id), message: "SMTP not configured" };
  }

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: fromAddress(),
      to: cleanRecipients,
      cc: input.cc && input.cc.length > 0 ? input.cc : undefined,
      bcc: input.bcc && input.bcc.length > 0 ? input.bcc : undefined,
      subject: renderedSubject,
      html: renderedHtml,
      text: renderedText
    });

    const sentLog = await writeEmailLog({
      templateKey: template.templateKey,
      triggerEvent: input.triggerEvent,
      recipients: cleanRecipients,
      cc: input.cc,
      bcc: input.bcc,
      subject: renderedSubject,
      status: "sent",
      relatedComplaintId: input.relatedComplaintId,
      relatedCapaId: input.relatedCapaId,
      dedupeKey: input.dedupeKey,
      sentBySystem: input.sentBySystem !== undefined ? input.sentBySystem : true
    });

    return { status: "sent", logId: String(sentLog._id) };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "SMTP transport error";
    const failedLog = await writeEmailLog({
      templateKey: template.templateKey,
      triggerEvent: input.triggerEvent,
      recipients: cleanRecipients,
      cc: input.cc,
      bcc: input.bcc,
      subject: renderedSubject,
      status: "failed",
      errorMessage: errorMsg,
      relatedComplaintId: input.relatedComplaintId,
      relatedCapaId: input.relatedCapaId,
      dedupeKey: input.dedupeKey,
      sentBySystem: input.sentBySystem !== undefined ? input.sentBySystem : true,
      payload: {
        triggerEvent: input.triggerEvent,
        recipients: cleanRecipients,
        cc: input.cc,
        bcc: input.bcc,
        data: mergedData,
        relatedComplaintId: input.relatedComplaintId,
        relatedCapaId: input.relatedCapaId
      }
    });

    return { status: "failed", logId: String(failedLog._id), message: errorMsg };
  }
}

export async function retryEmail(logId: string): Promise<SendEmailResult> {
  const log = await getEmailLogById(logId);
  if (!log) throw httpError(404, "Log record not found");
  if (log.status === "sent") return { status: "sent", logId: String(log._id), message: "Email was already sent successfully" };

  const payload = (log.payload || {}) as Record<string, unknown>;
  const data = (payload.data || {}) as Record<string, string | number>;
  const result = await sendTemplatedEmail({
    triggerEvent: log.triggerEvent,
    recipients: log.recipients,
    cc: log.cc,
    bcc: log.bcc,
    data,
    relatedComplaintId: log.relatedComplaintId?._id ? String(log.relatedComplaintId._id) : undefined,
    relatedCapaId: log.relatedCapaId?._id ? String(log.relatedCapaId._id) : undefined,
    sentBySystem: false
  });

  await EmailLog.findByIdAndUpdate(logId, { $inc: { attemptCount: 1 } });
  return result;
}

export async function sendRawTestEmail(input: { to: string; subject?: string; message?: string }): Promise<SendEmailResult> {
  if (!isSmtpConfigured()) throw httpError(400, "SMTP credentials are not configured on this server");

  const subject = input.subject || "ONEPWS Portal - SMTP Test Email";
  const appUrl = getAppUrl();
  const testMessage = input.message || "This is a verification test email from the ONEPWS Complaint & CAPA Management Portal.";
  const safeMessage = escapeHtml(testMessage);
  const safeAppUrl = escapeHtml(appUrl);
  const html = `
    <div style="font-family: 'DM Sans', Arial, sans-serif; padding: 24px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #E31E25; margin-top: 0;">SMTP Test Verification</h2>
      <p style="color: #1E293B; font-size: 14px;">${safeMessage}</p>
      <p style="color: #64748B; font-size: 12px; margin-top: 24px;">Sent from: <a href="${safeAppUrl}" style="color: #E31E25;">${safeAppUrl}</a></p>
    </div>
  `;

  try {
    const transporter = createTransporter();
    await transporter.sendMail({ from: fromAddress(), to: input.to, subject, html, text: `${subject}\n\n${testMessage}\n\nPortal: ${appUrl}` });
    const log = await writeEmailLog({ triggerEvent: "TEST_SMTP", recipients: [input.to], subject, status: "sent", sentBySystem: false });
    return { status: "sent", logId: String(log._id) };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to send test email";
    await writeEmailLog({ triggerEvent: "TEST_SMTP", recipients: [input.to], subject, status: "failed", errorMessage: msg, sentBySystem: false });
    throw httpError(500, `SMTP Test failed: ${msg}`);
  }
}

/** Backward compatible transport helper retained for non-templated internal calls. */
export async function sendMail(input: { to: string[]; subject: string; html: string; text: string }) {
  if (input.to.length === 0) return { status: "skipped" as const };
  return sendRawTestEmail({ to: input.to[0], subject: input.subject, message: input.text });
}
