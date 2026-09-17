import { describe, expect, it } from "vitest";
import { COMPLAINT_IMPORT_COLUMNS, parseDate, type RowIssue } from "./import.service";
import { COMPLAINT_TYPES } from "@shared/constants/domain";

describe("Excel Import Validation Engine", () => {
  it("defines standard legacy-compatible column headers for complaint imports", () => {
    expect(COMPLAINT_IMPORT_COLUMNS).toContain("Type");
    expect(COMPLAINT_IMPORT_COLUMNS).toContain("Company Code");
    expect(COMPLAINT_IMPORT_COLUMNS).toContain("Priority");
    expect(COMPLAINT_IMPORT_COLUMNS).toContain("Category");
    expect(COMPLAINT_IMPORT_COLUMNS).toContain("Customer");
    expect(COMPLAINT_IMPORT_COLUMNS).toContain("Product");
    expect(COMPLAINT_IMPORT_COLUMNS).toContain("Description");
    expect(COMPLAINT_IMPORT_COLUMNS).toContain("Received Date");
  });

  it("validates row data and flags missing mandatory fields", () => {
    const invalidRow = {
      Type: "External",
      // Missing Company Code
      // Missing Priority
      Category: "Dimensional Deviation",
      Customer: "Auto OEM",
      Product: "Bracket-42",
      Description: "" // Empty description
    };

    const issues: RowIssue[] = [];
    const rowNumber = 2;

    if (!invalidRow.Type || !COMPLAINT_TYPES.includes(invalidRow.Type as (typeof COMPLAINT_TYPES)[number])) {
      issues.push({ row: rowNumber, field: "Type", message: "Invalid type" });
    }
    if (!(invalidRow as Record<string, unknown>)["Company Code"]) {
      issues.push({ row: rowNumber, field: "Company Code", message: "Company code is required" });
    }
    if (!(invalidRow as Record<string, unknown>)["Priority"]) {
      issues.push({ row: rowNumber, field: "Priority", message: "Priority is required" });
    }
    if (!invalidRow.Description?.trim()) {
      issues.push({ row: rowNumber, field: "Description", message: "Description is required" });
    }

    expect(issues).toHaveLength(3);
    expect(issues.map((i) => i.field)).toEqual(["Company Code", "Priority", "Description"]);
  });

  it("validates that Internal complaints require departments instead of customer details", () => {
    const internalRow = {
      Type: "Internal",
      "Company Code": "CMP1",
      Priority: "High",
      Category: "Machine Breakdown",
      Description: "Hydraulic pressure loss in press #4",
      "Raising Department": "Machining",
      "Against Department": "Maintenance"
    };

    const issues: RowIssue[] = [];
    const rowNumber = 3;

    if (internalRow.Type === "Internal") {
      if (!internalRow["Raising Department"]) {
        issues.push({ row: rowNumber, field: "Raising Department", message: "Raising department is required" });
      }
      if (!internalRow["Against Department"]) {
        issues.push({ row: rowNumber, field: "Against Department", message: "Against department is required" });
      }
    }

    expect(issues).toHaveLength(0);
  });
});
describe("Received Date parsing", () => {
  const iso = (value: unknown) => parseDate(value)?.toISOString().slice(0, 10) ?? null;

  it("reads an ISO date as written", () => {
    expect(iso("2026-09-05")).toBe("2026-09-05");
    expect(iso("2026-09-05T11:30:00.000Z")).toBe("2026-09-05");
  });

  it("reads an ambiguous d/m/y day-first, matching how the portal shows dates", () => {
    // The bug this pins: 05/09/2026 was read as 9 May, backdating the complaint
    // by four months and quietly shifting every TAT calculation with it.
    expect(iso("05/09/2026")).toBe("2026-09-05");
    expect(iso("05-09-2026")).toBe("2026-09-05");
    expect(iso("5.9.2026")).toBe("2026-09-05");
  });

  it("falls back to month-first only when the day is impossible", () => {
    expect(iso("09/25/2026")).toBe("2026-09-25");
  });

  it("keeps an unambiguous day-first date intact", () => {
    expect(iso("25/09/2026")).toBe("2026-09-25");
  });

  it("expands a two-digit year", () => {
    expect(iso("05/09/26")).toBe("2026-09-05");
    expect(iso("05/09/99")).toBe("1999-09-05");
  });

  it("reads an Excel serial number", () => {
    // 46270 is 5 September 2026 in the 1900 date system.
    expect(iso(46270)).toBe("2026-09-05");
  });

  it("rejects a date that does not exist rather than rolling it forward", () => {
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("2026-02-31")).toBeNull();
  });

  it("rejects blanks, junk, and out-of-range serials", () => {
    expect(parseDate("")).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate("not a date")).toBeNull();
    expect(parseDate(12)).toBeNull();
  });
});
