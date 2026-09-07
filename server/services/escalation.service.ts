import { connectDB } from "../config/db";
import { Complaint } from "../models/Complaint";
import { Capa } from "../models/Capa";
import { EscalationConfiguration, TATConfiguration } from "../models/configuration";
import { DEFAULT_ESCALATION_LEVELS, DEFAULT_TAT_CONFIG, type WorkflowStage } from "@shared/constants/domain";
import { computeStageDueDates } from "../domain/tat";
import { resolveRecipients } from "./email-recipient.service";
import { sendTemplatedEmail } from "./email.service";

export type EscalationRunResult = {
  complaintsChecked: number;
  complaintsEscalated: number;
  capasChecked: number;
  capasEscalated: number;
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

export async function processEscalations(): Promise<EscalationRunResult> {
  await connectDB();
  let complaintsEscalated = 0;
  let capasEscalated = 0;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // 1. Load Configurations
  const [escalationConfig, tatConfigDoc] = await Promise.all([
    EscalationConfiguration.findOne({ company: null, active: true }).lean(),
    TATConfiguration.findOne({ company: null }).lean()
  ]);

  const levels =
    escalationConfig?.levels && escalationConfig.levels.length > 0
      ? escalationConfig.levels
      : [...DEFAULT_ESCALATION_LEVELS];

  const sortedLevels = [...levels].sort((a, b) => a.triggerHoursOverdue - b.triggerHoursOverdue);

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

  // 2. Scan Open Complaints
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

    if (now <= targetDate) {
      continue; // Not overdue
    }

    const overdueDurationMs = now.getTime() - targetDate.getTime();
    const overdueHours = Math.floor(overdueDurationMs / (1000 * 60 * 60));

    let matchedLevel = null;
    for (const lvl of sortedLevels) {
      if (overdueHours >= lvl.triggerHoursOverdue) {
        matchedLevel = lvl;
      }
    }

    if (matchedLevel) {
      const dedupeKey = `ESCALATION_CMP_${complaint._id}_${stage}_L${matchedLevel.level}_${todayStr}`;

      let targetRoles: string[] = ["Complaint Owner"];
      if (matchedLevel.level === 2) {
        targetRoles = ["Complaint Owner", "Department Head"];
      } else if (matchedLevel.level === 3) {
        targetRoles = ["Complaint Owner", "Department Head", "Quality Head"];
      } else if (matchedLevel.level >= 4) {
        targetRoles = ["Complaint Owner", "Department Head", "Quality Head", "Management"];
      }

      const recipients = await resolveRecipients({
        complaintId: complaint._id,
        targetRoles
      });

      if (recipients.length > 0) {
        const res = await sendTemplatedEmail({
          triggerEvent: "TAT_ESCALATION",
          recipients,
          dedupeKey,
          relatedComplaintId: complaint._id,
          data: {
            complaintNumber: complaint.number,
            stage: stage.toUpperCase(),
            escalationLevel: `Level ${matchedLevel.level} (${matchedLevel.name})`,
            dueDate: targetDate.toLocaleDateString("en-IN"),
            overdueHours: String(overdueHours),
            departmentName: (complaint.responsibleDept as { name?: string })?.name || "General",
            ownerName: (complaint.owner as { name?: string })?.name || "Assigned Owner",
            priority: (complaint.priority as { name?: string })?.name || "Standard",
            actionUrl: `/complaints/${complaint._id}`
          }
        });
        if (res.status === "sent") complaintsEscalated++;
      }
    }
  }

  // 3. Scan Overdue CAPAs
  const overdueCapas = await Capa.find({
    status: { $nin: ["Closed", "Completed", "Under Verification"] },
    dueDate: { $lt: now }
  })
    .populate("owner", "name email")
    .populate("complaint", "number")
    .lean();

  for (const capa of overdueCapas) {
    if (!capa.dueDate) continue;
    const targetDate = new Date(capa.dueDate);
    const dedupeKey = `ESCALATION_CAPA_${capa._id}_${todayStr}`;

    const recipients = await resolveRecipients({
      capaId: capa._id,
      targetRoles: ["CAPA Owner", "Department Head"]
    });

    if (recipients.length > 0) {
      const res = await sendTemplatedEmail({
        triggerEvent: "CAPA_OVERDUE",
        recipients,
        dedupeKey,
        relatedCapaId: capa._id,
        data: {
          capaNumber: capa.number,
          assignedTo: (capa.owner as { name?: string })?.name || "CAPA Owner",
          targetDate: targetDate.toLocaleDateString("en-IN"),
          complaintNumber: (capa.complaint as { number?: string })?.number || "N/A",
          actionUrl: `/capa/tracker`
        }
      });
      if (res.status === "sent") capasEscalated++;
    }
  }

  return {
    complaintsChecked: openComplaints.length,
    complaintsEscalated,
    capasChecked: overdueCapas.length,
    capasEscalated
  };
}
