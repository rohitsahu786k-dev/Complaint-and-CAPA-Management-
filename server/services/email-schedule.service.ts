import { connectDB } from "../config/db";
import { EscalationConfiguration } from "../models/configuration";
import { shouldRunScheduledEmails, type ScheduleDecision } from "../domain/email-schedule";

type Job = "reminders" | "escalations";

/**
 * Called by the cron endpoints before a job runs. Honours the on/off switch and frequency saved on the
 * Escalation Rules tab, and records the run so the next send waits the full interval.
 */
export async function claimScheduledRun(job: Job): Promise<ScheduleDecision> {
  await connectDB();
  const config = await EscalationConfiguration.findOne({ company: null }).lean();
  const field = job === "reminders" ? "lastReminderRunAt" : "lastEscalationRunAt";
  const decision = shouldRunScheduledEmails({
    enabled: config?.autoEmailEnabled ?? true,
    frequencyDays: config?.frequencyDays ?? 7,
    lastRunAt: config?.[field] ?? null
  });
  if (decision.run) {
    await EscalationConfiguration.findOneAndUpdate({ company: null }, { $set: { [field]: new Date() } }, { upsert: true });
  }
  return decision;
}
