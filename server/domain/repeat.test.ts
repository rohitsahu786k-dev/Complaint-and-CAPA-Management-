import { describe, expect, it } from "vitest";
import { findRepeatMatches, matchesRepeatRule, repeatCutoff } from "./repeat";
import { makeComplaint } from "./fixtures";
import type { DomainComplaint } from "./types";

describe("Repeat Complaint Detection Engine", () => {
  const baseComplaint = makeComplaint({
    id: "cmp-origin",
    companyId: "comp-1",
    category: "Dimensional Deviation",
    customer: "Global Auto Industries",
    product: "FL-Arm-Bracket",
    receivedAt: "2026-05-01T10:00:00.000Z"
  });

  it("calculates correct cutoff date based on configurable repeat window days", () => {
    const windowDays = 90;
    const refDate = new Date("2026-05-01T10:00:00.000Z");
    const cutoff = repeatCutoff(windowDays, refDate);

    // 90 days before May 1, 2026 is Jan 31, 2026
    const diffMs = refDate.getTime() - cutoff.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(90);
  });

  const cutoff = new Date("2026-01-01T00:00:00.000Z");

  it("identifies matching repeat by same company, category, and customer", () => {
    const candidate: DomainComplaint = {
      ...baseComplaint,
      id: "cmp-new-1",
      receivedAt: "2026-05-20T10:00:00.000Z"
    };

    const match = matchesRepeatRule(candidate, baseComplaint, cutoff);
    expect(match).not.toBeNull();
    expect(match?.basis).toContain("customer");
  });

  it("identifies matching repeat by same company, category, and product", () => {
    const candidate: DomainComplaint = {
      ...baseComplaint,
      id: "cmp-new-2",
      customer: "Different Customer OEM", // customer differs
      product: "FL-Arm-Bracket", // product matches
      receivedAt: "2026-05-20T10:00:00.000Z"
    };

    const match = matchesRepeatRule(candidate, baseComplaint, cutoff);
    expect(match).not.toBeNull();
    expect(match?.basis).toContain("product");
  });

  it("does NOT match if category is different", () => {
    const candidate: DomainComplaint = {
      ...baseComplaint,
      id: "cmp-new-3",
      category: "Paint Flaking" // Different category
    };

    expect(matchesRepeatRule(candidate, baseComplaint, cutoff)).toBeNull();
  });

  it("does NOT match if from a different company (strict tenant isolation)", () => {
    const candidate: DomainComplaint = {
      ...baseComplaint,
      id: "cmp-new-4",
      companyId: "comp-2" // Different company
    };

    expect(matchesRepeatRule(candidate, baseComplaint, cutoff)).toBeNull();
  });

  it("finds repeat candidates inside window and ignores complaints outside window", () => {
    const inWindowComplaint = makeComplaint({
      id: "cmp-in-window",
      companyId: "comp-1",
      category: "Dimensional Deviation",
      customer: "Global Auto Industries",
      receivedAt: "2026-04-10T00:00:00.000Z" // 21 days earlier
    });

    const outWindowComplaint = makeComplaint({
      id: "cmp-out-window",
      companyId: "comp-1",
      category: "Dimensional Deviation",
      customer: "Global Auto Industries",
      receivedAt: "2025-10-01T00:00:00.000Z" // >200 days earlier
    });

    const newArrival = makeComplaint({
      id: "cmp-current",
      companyId: "comp-1",
      category: "Dimensional Deviation",
      customer: "Global Auto Industries",
      receivedAt: "2026-05-01T00:00:00.000Z"
    });

    const refDate = new Date("2026-05-01T00:00:00.000Z");
    const matches = findRepeatMatches(newArrival, [inWindowComplaint, outWindowComplaint], 90, refDate);
    expect(matches).toHaveLength(1);
    expect(matches[0].complaintId).toBe("cmp-in-window");
  });
});
