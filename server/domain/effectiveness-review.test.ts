import { describe, expect, it } from "vitest";
import { addMonthsClamped, daysUntil, effectivenessReminderBucket, effectivenessReviewDue } from "./effectiveness-review";

describe("effectiveness review deadline", () => {
  it("adds six calendar months and clamps to the month end", () => {
    expect(addMonthsClamped(new Date("2026-10-27T10:00:00Z"), 6).toISOString().slice(0, 10)).toBe("2027-04-27");
    expect(addMonthsClamped(new Date("2026-08-31T00:00:00Z"), 6).toISOString().slice(0, 10)).toBe("2027-02-28");
  });

  it("is six months after the last completed CAPA, else after closure, else unscheduled", () => {
    const due = effectivenessReviewDue({ capaCompletedAts: ["2026-01-10T00:00:00Z", null, "2026-03-05T00:00:00Z"], closedAt: "2026-02-01T00:00:00Z" });
    expect(due?.toISOString().slice(0, 10)).toBe("2026-09-05");
    expect(effectivenessReviewDue({ capaCompletedAts: [], closedAt: "2026-02-01T00:00:00Z" })?.toISOString().slice(0, 10)).toBe("2026-08-01");
    expect(effectivenessReviewDue({ capaCompletedAts: [null], closedAt: null })).toBeNull();
  });

  it("counts whole days to the due date", () => {
    const now = new Date("2026-10-27T08:00:00Z");
    expect(daysUntil(new Date("2026-10-27T00:00:00Z"), now)).toBe(0);
    expect(daysUntil(new Date("2026-11-03T00:00:00Z"), now)).toBe(7);
    expect(daysUntil(new Date("2026-10-26T00:00:00Z"), now)).toBe(-1);
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
