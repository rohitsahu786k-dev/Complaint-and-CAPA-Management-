import { describe, expect, it } from "vitest";
import { counterKey, financialYearLabel, formatCapaNumber, formatComplaintNumber } from "./numbering";
import type { CounterStore } from "../services/numbering.service";

describe("financialYearLabel", () => {
  it("starts a new financial year on 1 April", () => {
    expect(financialYearLabel("2026-03-31T18:00:00.000Z")).toBe("25-26");
    expect(financialYearLabel("2026-04-01T04:00:00.000Z")).toBe("26-27");
    expect(financialYearLabel("2026-12-31T04:00:00.000Z")).toBe("26-27");
  });
});

describe("complaint numbering", () => {
  it("pads the sequence and keys on prefix plus financial year", () => {
    expect(counterKey("ONEPWS-COMP", "2026-05-02T00:00:00.000Z")).toBe("ONEPWS-COMP-26-27");
    expect(formatComplaintNumber("ONEPWS-COMP", "2026-05-02T00:00:00.000Z", 7)).toBe("ONEPWS-COMP-26-27-00007");
  });

  it("derives the CAPA number from its complaint", () => {
    expect(formatCapaNumber("ONEPWS-COMP-26-27-00007", 3)).toBe("ONEPWS-COMP-26-27-00007-CAPA-03");
  });
});

/** Mirrors the atomic findOneAndUpdate: every caller gets its own sequence value. */
function inMemoryCounterStore(): CounterStore {
  const counters = new Map<string, number>();
  return {
    async increment(key) {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    }
  };
}

describe("numbering concurrency", () => {
  it("never issues the same number twice under concurrent registration", async () => {
    const store = inMemoryCounterStore();
    const results = await Promise.all(
      Array.from({ length: 50 }, async () => {
        const sequence = await store.increment("ONEPWS-COMP-26-27", "company", "26-27");
        return formatComplaintNumber("ONEPWS-COMP", "2026-05-02T00:00:00.000Z", sequence);
      })
    );
    expect(new Set(results).size).toBe(50);
    expect(results).toContain("ONEPWS-COMP-26-27-00050");
  });

  it("keeps separate sequences per company prefix and financial year", async () => {
    const store = inMemoryCounterStore();
    await store.increment("A-26-27", "c1", "26-27");
    const second = await store.increment("B-26-27", "c2", "26-27");
    const third = await store.increment("A-27-28", "c1", "27-28");
    expect(second).toBe(1);
    expect(third).toBe(1);
  });
});
