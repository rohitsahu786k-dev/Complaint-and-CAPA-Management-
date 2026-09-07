import { describe, expect, it } from "vitest";
import {
  computeStageDueDates,
  escalationLevelFor,
  reminderTimestamps
} from "./tat";
import { makeComplaint, tatConfig } from "./fixtures";
import { DEFAULT_ESCALATION_LEVELS, DEFAULT_REMINDER_PERCENTAGES } from "@shared/constants/domain";

describe("Deterministic TAT Milestones & Overdue Escalation Engine", () => {
  const complaint = makeComplaint({
    receivedAt: "2026-05-01T00:00:00.000Z",
    priorityMultiplier: 1.0
  });

  it("calculates exact deterministic stage deadlines based on hours", () => {
    const dueDates = computeStageDueDates(complaint, tatConfig);
    // ack: 24h -> 2026-05-02T00:00:00Z
    expect(dueDates.ack.toISOString()).toBe("2026-05-02T00:00:00.000Z");
    // containment: 72h -> 2026-05-04T00:00:00Z
    expect(dueDates.cont.toISOString()).toBe("2026-05-04T00:00:00.000Z");
    // rca: 168h -> 2026-05-08T00:00:00Z
    expect(dueDates.rca.toISOString()).toBe("2026-05-08T00:00:00.000Z");
    // capa: 360h -> 2026-05-16T00:00:00Z
    expect(dueDates.capa.toISOString()).toBe("2026-05-16T00:00:00.000Z");
  });

  it("places pre-overdue reminders at exact 50%, 75%, and 90% timestamps", () => {
    const dueAck = "2026-05-02T00:00:00.000Z";
    const timestamps = reminderTimestamps(complaint.receivedAt, dueAck, DEFAULT_REMINDER_PERCENTAGES);
    expect(timestamps).toHaveLength(3);

    // Window: 24 hours (1440 minutes).
    // 50% = 12h = 2026-05-01T12:00:00Z
    expect(timestamps[0].toISOString()).toBe("2026-05-01T12:00:00.000Z");

    // 75% = 18h = 2026-05-01T18:00:00Z
    expect(timestamps[1].toISOString()).toBe("2026-05-01T18:00:00.000Z");

    // 90% = 21.6h = 21h 36m = 2026-05-01T21:36:00Z
    expect(timestamps[2].toISOString()).toBe("2026-05-01T21:36:00.000Z");
  });

  it("evaluates overdue status and escalation tiers deterministically", () => {
    // Before due date (<0 hours overdue): not overdue
    expect(escalationLevelFor(-1, DEFAULT_ESCALATION_LEVELS)).toBeNull();

    // 1 hour overdue -> Level 1 (Owner: 0h)
    const lvl1 = escalationLevelFor(1, DEFAULT_ESCALATION_LEVELS);
    expect(lvl1?.level).toBe(1);
    expect(lvl1?.name).toBe("Owner");

    // 25 hours overdue -> Level 2 (Department Head: 24h)
    const lvl2 = escalationLevelFor(25, DEFAULT_ESCALATION_LEVELS);
    expect(lvl2?.level).toBe(2);
    expect(lvl2?.name).toBe("Department Head");

    // 73 hours overdue -> Level 3 (Quality Head: 72h)
    const lvl3 = escalationLevelFor(73, DEFAULT_ESCALATION_LEVELS);
    expect(lvl3?.level).toBe(3);
    expect(lvl3?.name).toBe("Quality Head");

    // 170 hours overdue -> Level 4 (Management: 168h)
    const lvl4 = escalationLevelFor(170, DEFAULT_ESCALATION_LEVELS);
    expect(lvl4?.level).toBe(4);
    expect(lvl4?.name).toBe("Management");
  });

  it("constructs unambiguous deduplication keys for cron repeat invocation safety", () => {
    const complaintId = "cmp-1001";
    const stage = "ack";
    const pct = 75;

    // Milestone reminder key pattern
    const reminderDedupeKey = `rem:${complaintId}:${stage}:${pct}`;
    expect(reminderDedupeKey).toBe("rem:cmp-1001:ack:75");

    // Escalation tier key pattern
    const escalationDedupeKey = `esc:${complaintId}:${stage}:lvl2`;
    expect(escalationDedupeKey).toBe("esc:cmp-1001:ack:lvl2");

    // Overdue daily key pattern
    const overdueDedupeKey = `overdue:${complaintId}:${stage}:2026-05-03`;
    expect(overdueDedupeKey).toBe("overdue:cmp-1001:ack:2026-05-03");
  });
});
