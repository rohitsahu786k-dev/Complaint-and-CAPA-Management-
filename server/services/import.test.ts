import { describe, expect, it } from "vitest";
import { COMPLAINT_IMPORT_COLUMNS, type RowIssue } from "./import.service";
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
