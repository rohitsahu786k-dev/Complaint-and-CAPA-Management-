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

export async function processDailySummaries(): Promise<{ sent: number }> {
  await connectDB();
  let sent = 0;
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

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

    const [openComplaints, openCapas] = await Promise.all([
      Complaint.find({
        ...compFilter,
        status: { $nin: ["Closed"] }
      })
        .populate("priority", "tatMultiplier")
        .lean(),
      Capa.find({
        ...compFilter,
        status: { $nin: ["Closed", "Completed", "Under Verification"] }
      }).lean()
    ]);

    let dueSoonCount = 0;
    let overdueCount = 0;

    for (const c of openComplaints) {
      const stage = getActiveStage(c);
      if (!stage) continue;

      const multiplier = (c.priority as { tatMultiplier?: number })?.tatMultiplier ?? 1;
      const dues = computeStageDueDates({ receivedAt: new Date(c.receivedAt).toISOString(), priorityMultiplier: multiplier }, tatConfig);
      const target = dues[stage];

      if (target < now) {
        overdueCount++;
      } else if (target.getTime() - now.getTime() < 24 * 60 * 60 * 1000) {
        dueSoonCount++;
      }
    }

    let capaOverdueCount = 0;
    for (const capa of openCapas) {
      if (capa.dueDate && new Date(capa.dueDate) < now) {
        capaOverdueCount++;
      }
    }

    const recipients = await resolveRecipients({
      companyId: comp._id || undefined,
      targetRoles: ["Quality Head", "Management", "Master Admin"]
    });

    if (recipients.length > 0) {
      const dedupeKey = `DAILY_SUMMARY_${comp._id || "GLOBAL"}_${todayStr}`;
      const res = await sendTemplatedEmail({
        triggerEvent: "DAILY_SUMMARY",
        recipients,
        dedupeKey,
        data: {
          companyName: comp.name,
          totalOpen: String(openComplaints.length),
          dueSoonCount: String(dueSoonCount),
          overdueCount: String(overdueCount),
          openCapasCount: String(openCapas.length),
          capaOverdueCount: String(capaOverdueCount)
        }
      });
      if (res.status === "sent") sent++;
    }
  }

  return { sent };
}

export async function processWeeklySummaries(): Promise<{ sent: number }> {
  await connectDB();
  let sent = 0;
  const now = new Date();
  const weekNumber = Math.ceil(now.getDate() / 7);
  const periodStr = `Week ${weekNumber}, ${now.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}`;
  const dedupeWeekKey = `${now.getFullYear()}_W${weekNumber}`;

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
      const dedupeKey = `WEEKLY_SUMMARY_${comp._id || "GLOBAL"}_${dedupeWeekKey}`;
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
