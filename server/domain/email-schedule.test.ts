import { describe, expect, it } from "vitest";
import { shouldRunScheduledEmails } from "./email-schedule";

// 2026-11-02 is a Monday; 03:00 UTC = 08:30 IST.
const monday = new Date("2026-11-02T03:00:00Z");
const tuesday = new Date("2026-11-03T03:00:00Z");

describe("shouldRunScheduledEmails", () => {
  it("never runs when switched off", () => {
    expect(shouldRunScheduledEmails({ enabled: false, frequencyDays: 7, now: monday }).run).toBe(false);
  });
  it("first weekly run waits for Monday", () => {
    expect(shouldRunScheduledEmails({ enabled: true, frequencyDays: 7, now: tuesday }).run).toBe(false);
    expect(shouldRunScheduledEmails({ enabled: true, frequencyDays: 7, now: monday }).run).toBe(true);
  });
  it("weekly repeats the next Monday, not before", () => {
    expect(shouldRunScheduledEmails({ enabled: true, frequencyDays: 7, lastRunAt: monday, now: new Date("2026-11-08T03:00:00Z") }).run).toBe(false);
    expect(shouldRunScheduledEmails({ enabled: true, frequencyDays: 7, lastRunAt: monday, now: new Date("2026-11-09T03:00:00Z") }).run).toBe(true);
  });
  it("custom shorter interval", () => {
    expect(shouldRunScheduledEmails({ enabled: true, frequencyDays: 3, now: tuesday }).run).toBe(true);
    expect(shouldRunScheduledEmails({ enabled: true, frequencyDays: 3, lastRunAt: monday, now: tuesday }).run).toBe(false);
    expect(shouldRunScheduledEmails({ enabled: true, frequencyDays: 3, lastRunAt: monday, now: new Date("2026-11-05T03:00:00Z") }).run).toBe(true);
  });
});
