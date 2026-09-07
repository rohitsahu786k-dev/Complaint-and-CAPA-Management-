import { connectDB } from "../config/db";
import { Complaint } from "../models/Complaint";
import { Capa } from "../models/Capa";
import { EscalationConfiguration, TATConfiguration } from "../models/configuration";
import { DEFAULT_REMINDER_PERCENTAGES, DEFAULT_TAT_CONFIG, type WorkflowStage } from "@shared/constants/domain";
import { computeStageDueDates } from "../domain/tat";
import { resolveRecipients } from "./email-recipient.service";
import { sendTemplatedEmail } from "./email.service";

export type ReminderRunResult = {
  complaintsChecked: number;
  complaintRemindersSent: number;
  capasChecked: number;
  capaRemindersSent: number;
};

function getActiveStage(c: {
  acknowledgedAt?: Date | null;
  containmentAt?: Date | null;
  rcaAt?: Date | null;
  capaAssignedAt?: Date | null;
}): WorkflowStage | null {
  if (!c.acknowledgedAt) return "ack";
  if (!c.containmentAt) return "cont";
  if (!c.rcaAt) return "rca";
  if (!c.capaAssignedAt) return "capa";
  return null;
}

export async function processReminders(): Promise<ReminderRunResult> {
  await connectDB();
  let complaintRemindersSent = 0;
  let capaRemindersSent = 0;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // 1. Load Configurations
  const [escalationConfig, tatConfigDoc] = await Promise.all([
    EscalationConfiguration.findOne({ company: null }).lean(),
    TATConfiguration.findOne({ company: null }).lean()
  ]);

  const thresholds = escalationConfig?.reminderPercentages?.length
    ? escalationConfig.reminderPercentages
    : [...DEFAULT_REMINDER_PERCENTAGES];

  const tatConfig = {
    ackHours: tatConfigDoc?.ackHours ?? DEFAULT_TAT_CONFIG.ackHours,
    containmentDays: tatConfigDoc?.containmentDays ?? DEFAULT_TAT_CONFIG.containmentDays,
    rcaDays: tatConfigDoc?.rcaDays ?? DEFAULT_TAT_CONFIG.rcaDays,
    capaDays: tatConfigDoc?.capaDays ?? DEFAULT_TAT_CONFIG.capaDays,
    d3ContainmentDays: tatConfigDoc?.d3ContainmentDays ?? DEFAULT_TAT_CONFIG.d3ContainmentDays,
    d5CorrectiveActionDays: tatConfigDoc?.d5CorrectiveActionDays ?? DEFAULT_TAT_CONFIG.d5CorrectiveActionDays,
    d6VerificationDays: tatConfigDoc?.d6VerificationDays ?? DEFAULT_TAT_CONFIG.d6VerificationDays,
    d7ShortTermDays: tatConfigDoc?.d7ShortTermDays ?? DEFAULT_TAT_CONFIG.d7ShortTermDays,
    d7LongTermDays: tatConfigDoc?.d7LongTermDays ?? DEFAULT_TAT_CONFIG.d7LongTermDays,
    repeatWindowDays: tatConfigDoc?.repeatWindowDays ?? DEFAULT_TAT_CONFIG.repeatWindowDays,
    dueSoonHours: tatConfigDoc?.dueSoonHours ?? DEFAULT_TAT_CONFIG.dueSoonHours
  };

  // 2. Process Open Complaints
  const openComplaints = await Complaint.find({
    status: { $nin: ["Closed"] }
  })
    .populate("owner", "name email")
    .populate("responsibleDept", "name")
    .populate("priority", "name tatMultiplier")
    .lean();

  for (const complaint of openComplaints) {
    const stage = getActiveStage(complaint);
    if (!stage) continue;

    const multiplier = (complaint.priority as { tatMultiplier?: number })?.tatMultiplier ?? 1;
    const stageDues = computeStageDueDates({ receivedAt: new Date(complaint.receivedAt).toISOString(), priorityMultiplier: multiplier }, tatConfig);
    const targetDate = stageDues[stage];

    const receivedAt = new Date(complaint.receivedAt);
    const totalDurationMs = Math.max(1, targetDate.getTime() - receivedAt.getTime());
    const elapsedMs = now.getTime() - receivedAt.getTime();
    const elapsedPct = Math.round((elapsedMs / totalDurationMs) * 100);

    const msUntilDue = targetDate.getTime() - now.getTime();
    const hoursUntilDue = msUntilDue / (1000 * 60 * 60);

    // Check SLA milestone thresholds (e.g. 50%, 75%, 90%)
    for (const pct of thresholds) {
      if (elapsedPct >= pct && elapsedPct < 100) {
        const dedupeKey = `REMINDER_CMP_${complaint._id}_${stage}_${pct}`;
        const recipients = await resolveRecipients({
          complaintId: complaint._id,
          targetRoles: ["Complaint Owner", "Coordinator"]
        });

        if (recipients.length > 0) {
          const res = await sendTemplatedEmail({
            triggerEvent: "TAT_REMINDER",
            recipients,
            dedupeKey,
            relatedComplaintId: complaint._id,
            data: {
              complaintNumber: complaint.number,
              thresholdPct: String(pct),
              stage: stage.toUpperCase(),
              dueDate: targetDate.toLocaleDateString("en-IN"),
              ownerName: (complaint.owner as { name?: string })?.name || "Assigned Owner",
              priority: (complaint.priority as { name?: string })?.name || "Standard",
              actionUrl: `/complaints/${complaint._id}`
            }
          });
          if (res.status === "sent") complaintRemindersSent++;
        }
      }
    }

    // Check Due Soon notice (< configured hours left, e.g. 24h, and not overdue yet)
    if (hoursUntilDue > 0 && hoursUntilDue <= tatConfig.dueSoonHours) {
      const dedupeKey = `DUESOON_CMP_${complaint._id}_${stage}_${todayStr}`;
      const recipients = await resolveRecipients({
        complaintId: complaint._id,
        targetRoles: ["Complaint Owner", "Coordinator"]
      });

      if (recipients.length > 0) {
        const res = await sendTemplatedEmail({
          triggerEvent: "TAT_DUE_SOON",
          recipients,
          dedupeKey,
          relatedComplaintId: complaint._id,
          data: {
            complaintNumber: complaint.number,
            stage: stage.toUpperCase(),
            hoursLeft: String(Math.max(1, Math.round(hoursUntilDue))),
            dueDate: targetDate.toLocaleDateString("en-IN"),
            priority: (complaint.priority as { name?: string })?.name || "Standard",
            actionUrl: `/complaints/${complaint._id}`
          }
        });
        if (res.status === "sent") complaintRemindersSent++;
      }
    }
  }

  // 3. Process Open CAPAs
  const openCapas = await Capa.find({
    status: { $nin: ["Closed", "Completed", "Under Verification"] }
  })
    .populate("owner", "name email")
    .populate("complaint", "number")
    .lean();

  for (const capa of openCapas) {
    if (!capa.dueDate) continue;
    const targetDate = new Date(capa.dueDate);
    const msUntilDue = targetDate.getTime() - now.getTime();
    const daysUntilDue = Math.round(msUntilDue / (1000 * 60 * 60 * 24));

    // Remind when within 3 days of target date and not overdue
    if (daysUntilDue >= 0 && daysUntilDue <= 3) {
      const dedupeKey = `REMINDER_CAPA_${capa._id}_${todayStr}`;
      const recipients = await resolveRecipients({
        capaId: capa._id,
        targetRoles: ["CAPA Owner"]
      });

      if (recipients.length > 0) {
        const res = await sendTemplatedEmail({
          triggerEvent: "CAPA_DUE_REMINDER",
          recipients,
          dedupeKey,
          relatedCapaId: capa._id,
          data: {
            capaNumber: capa.number,
            capaTitle: capa.action || "Corrective Action",
            targetDate: targetDate.toLocaleDateString("en-IN"),
            assignedTo: (capa.owner as { name?: string })?.name || "CAPA Owner",
            actionUrl: `/capa/tracker`
          }
        });
        if (res.status === "sent") capaRemindersSent++;
      }
    }
  }

  return {
    complaintsChecked: openComplaints.length,
    complaintRemindersSent,
    capasChecked: openCapas.length,
    capaRemindersSent
  };
}
