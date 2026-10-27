import { EFFECTIVENESS_REVIEW_MONTHS } from "@shared/constants/domain";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days before the due date at which a reminder bucket starts; the smallest matching bucket is sent. */
export const EFFECTIVENESS_REMINDER_MILESTONES = [30, 14, 7, 3, 1, 0] as const;

/** Adds calendar months in UTC, clamping to the month end (31 Aug + 6 months = 28/29 Feb). */
export function addMonthsClamped(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const monthEnd = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, monthEnd));
  return result;
}

/**
 * The review is due six months after the last CAPA was completed. A complaint with no completed
 * CAPA falls back to its closure date; with neither there is nothing to schedule.
 */
export function effectivenessReviewDue(input: {
  capaCompletedAts: (Date | string | null | undefined)[];
  closedAt?: Date | string | null;
}): Date | null {
  const completed = input.capaCompletedAts
    .filter((value): value is Date | string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((time) => !Number.isNaN(time));
  const base = completed.length > 0 ? new Date(Math.max(...completed)) : input.closedAt ? new Date(input.closedAt) : null;
  if (!base || Number.isNaN(base.getTime())) return null;
  return addMonthsClamped(base, EFFECTIVENESS_REVIEW_MONTHS);
}

/** Whole days from `now` to `due`, rounded up so "due today" is 0 and yesterday is -1. */
export function daysUntil(due: Date, now: Date): number {
  // `+ 0` turns -0 (a due time earlier today) into 0.
  return Math.ceil((due.getTime() - now.getTime()) / DAY_MS) + 0;
}

/**
 * The reminder to send today, as a stable key for de-duplication, or null when none is due yet.
 * Inside the 30-day window it is the smallest milestone not yet passed; once overdue it repeats weekly.
 */
export function effectivenessReminderBucket(daysLeft: number): { key: string; overdue: boolean } | null {
  if (daysLeft < 0) return { key: `overdue-${Math.floor((-daysLeft - 1) / 7)}`, overdue: true };
  const milestone = [...EFFECTIVENESS_REMINDER_MILESTONES].reverse().find((value) => daysLeft <= value);
  return milestone === undefined ? null : { key: `due-${milestone}`, overdue: false };
}
