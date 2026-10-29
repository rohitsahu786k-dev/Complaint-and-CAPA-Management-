import { describe, expect, it } from "vitest";
import { addMonthsClamped, daysUntil, effectivenessReminderBucket, nextReviewDue, reviewStatus } from "./effectiveness-review";

const day = (date: Date) => date.toISOString().slice(0, 10);

describe("effectiveness check schedule", () => {
  it("adds calendar months and clamps to the month end", () => {
    expect(day(addMonthsClamped(new Date("2026-10-27T10:00:00Z"), 6))).toBe("2027-04-27");
    expect(day(addMonthsClamped(new Date("2026-08-31T00:00:00Z"), 6))).toBe("2027-02-28");
  });

  it("is due six months after closure, then every six months", () => {
    const closed = "2026-02-01T00:00:00Z";
    expect(day(nextReviewDue(closed, 0))).toBe("2026-08-01");
    expect(day(nextReviewDue(closed, 1))).toBe("2027-02-01");
    expect(day(nextReviewDue(closed, 2))).toBe("2027-08-01");
  });

  it("counts from the closure date so month-end clamping does not drift", () => {
    // 31 Aug closure: the 12-month check is 31 Aug again, not 28 Aug carried forward from February.
    expect(day(nextReviewDue("2026-08-31T00:00:00Z", 0))).toBe("2027-02-28");
    expect(day(nextReviewDue("2026-08-31T00:00:00Z", 1))).toBe("2027-08-31");
  });

  it("counts whole days to the due date", () => {
    const now = new Date("2026-10-27T08:00:00Z");
    expect(daysUntil(new Date("2026-10-27T00:00:00Z"), now)).toBe(0);
    expect(daysUntil(new Date("2026-11-03T00:00:00Z"), now)).toBe(7);
    expect(daysUntil(new Date("2026-10-26T00:00:00Z"), now)).toBe(-1);
  });

  it("classifies a check as upcoming, due soon or overdue", () => {
    expect(reviewStatus(120)).toBe("Upcoming");
    expect(reviewStatus(31)).toBe("Upcoming");
    expect(reviewStatus(30)).toBe("Due Soon");
    expect(reviewStatus(0)).toBe("Due Soon");
    expect(reviewStatus(-1)).toBe("Overdue");
  });

  it("sends one reminder per bucket and repeats weekly once overdue", () => {
    expect(effectivenessReminderBucket(60)).toBeNull();
    expect(effectivenessReminderBucket(30)?.key).toBe("due-30");
    expect(effectivenessReminderBucket(20)?.key).toBe("due-30");
    expect(effectivenessReminderBucket(14)?.key).toBe("due-14");
    expect(effectivenessReminderBucket(2)?.key).toBe("due-3");
    expect(effectivenessReminderBucket(1)?.key).toBe("due-1");
    expect(effectivenessReminderBucket(0)?.key).toBe("due-0");
    expect(effectivenessReminderBucket(-1)).toEqual({ key: "overdue-0", overdue: true });
    expect(effectivenessReminderBucket(-7)?.key).toBe("overdue-0");
    expect(effectivenessReminderBucket(-8)?.key).toBe("overdue-1");
  });
});
