import { connectDB } from "../config/db";
import { Complaint } from "../models/Complaint";
import { Capa } from "../models/Capa";
import { Company } from "../models/Company";
import { TATConfiguration } from "../models/configuration";
import { DEFAULT_TAT_CONFIG, type WorkflowStage } from "@shared/constants/domain";
import { computeStageDueDates } from "../domain/tat";
import { resolveRecipients } from "./email-recipient.service";
import { sendTemplatedEmail } from "./email.service";

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

/**
 * The management digest goes out once a month. It keeps the stored WEEKLY_SUMMARY trigger key so
 * the existing template and email-log history stay linked; only the cadence and period changed.
 */
export async function processMonthlySummaries(): Promise<{ sent: number }> {
  await connectDB();
  let sent = 0;
  const now = new Date();
  const periodStr = now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const dedupeMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const tatConfigDoc = await TATConfiguration.findOne({ company: null }).lean();
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

  const companies = await Company.find({ active: true }).lean();
  const companyList = [...companies, { _id: null, name: "ONEPWS All-Plant Division" }];

  for (const comp of companyList) {
    const compFilter = comp._id ? { company: comp._id } : {};

    const [openComplaints, openCapas, repeatComplaints] = await Promise.all([
      Complaint.find({
        ...compFilter,
        status: { $nin: ["Closed"] }
      })
        .populate("priority", "tatMultiplier")
        .lean(),
      Capa.find({
        ...compFilter,
        status: { $nin: ["Closed", "Completed"] }
      }).lean(),
      Complaint.find({
        ...compFilter,
        isRepeat: true
      }).lean()
    ]);

    let overdueCount = 0;
    for (const c of openComplaints) {
      const stage = getActiveStage(c);
      if (!stage) continue;

      const multiplier = (c.priority as { tatMultiplier?: number })?.tatMultiplier ?? 1;
      const dues = computeStageDueDates({ receivedAt: new Date(c.receivedAt).toISOString(), priorityMultiplier: multiplier }, tatConfig);
      const target = dues[stage];

      if (target < now) {
        overdueCount++;
      }
    }

    const recipients = await resolveRecipients({
      companyId: comp._id || undefined,
      targetRoles: ["Quality Head", "Management", "Master Admin"]
    });

    if (recipients.length > 0) {
      const dedupeKey = `MONTHLY_SUMMARY_${comp._id || "GLOBAL"}_${dedupeMonthKey}`;
      const res = await sendTemplatedEmail({
        triggerEvent: "WEEKLY_SUMMARY",
        recipients,
        dedupeKey,
        data: {
          companyName: comp.name,
          period: periodStr,
          totalOpen: String(openComplaints.length),
          overdueCount: String(overdueCount),
          repeatCount: String(repeatComplaints.length),
          openCapasCount: String(openCapas.length)
        }
      });
      if (res.status === "sent") sent++;
    }
  }

  return { sent };
}
