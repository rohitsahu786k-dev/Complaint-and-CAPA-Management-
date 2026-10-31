/** India Standard Time offset: the portal's "Monday morning" is an Indian calendar day. */
const IST_OFFSET_MS = 5.5 * 3600000;
const DAY_MS = 86400000;

const istDayNumber = (date: Date) => Math.floor((date.getTime() + IST_OFFSET_MS) / DAY_MS);
const istWeekday = (date: Date) => new Date(date.getTime() + IST_OFFSET_MS).getUTCDay(); // 0 = Sunday, 1 = Monday

export type ScheduleDecision = { run: boolean; reason: string };

/**
 * Decides whether a scheduled (cron) reminder/escalation run should send emails today.
 *
 * - Switched off: never.
 * - Never run before: on a Monday (weekly default), or immediately when the interval is shorter than a week.
 * - Otherwise: once at least `frequencyDays` calendar days have passed since the last run, so the default
 *   weekly setting repeats every Monday morning.
 */
export function shouldRunScheduledEmails(input: {
  enabled: boolean;
  frequencyDays: number;
  lastRunAt?: Date | null;
  now?: Date;
}): ScheduleDecision {
  const now = input.now ?? new Date();
  if (!input.enabled) return { run: false, reason: "Automatic emails are switched off" };
  const frequency = Math.max(1, Math.floor(input.frequencyDays || 7));
  if (!input.lastRunAt) {
    if (frequency >= 7 && istWeekday(now) !== 1) return { run: false, reason: "Waiting for Monday" };
    return { run: true, reason: "First scheduled run" };
  }
  const elapsed = istDayNumber(now) - istDayNumber(new Date(input.lastRunAt));
  if (elapsed >= frequency) return { run: true, reason: `${elapsed} days since last run` };
  return { run: false, reason: `Next run in ${frequency - elapsed} day(s)` };
}
