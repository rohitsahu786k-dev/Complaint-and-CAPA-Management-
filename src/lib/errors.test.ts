import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { describeError, errorText } from "@/lib/errors";

describe("Error detail shown to the user", () => {
  it("names the field that blocked a validation failure", () => {
    // The bug this pins: the server sent both a headline and the offending fields, but
    // the screens read only the headline, so a rejected save said "Validation failed".
    const detail = describeError(
      new ApiError("Validation failed", 400, [{ field: "password", message: "Password must include a number" }]),
      "Could not save"
    );
    expect(detail.title).toBe("Validation failed");
    expect(detail.description).toBe("Password: Password must include a number");
  });

  it("joins several issues and humanises a dotted field path", () => {
    const detail = describeError(
      new ApiError("Validation failed", 400, [
        { field: "companyIds.0", message: "Invalid id" },
        { field: "role", message: "Required" }
      ]),
      "Could not save"
    );
    expect(detail.description).toBe("Company Ids 0: Invalid id · Role: Required");
  });

  it("counts the issues it does not list", () => {
    const issues = Array.from({ length: 7 }, (_, index) => ({ field: `field${index}`, message: "Required" }));
    const detail = describeError(new ApiError("Validation failed", 400, issues), "Could not save");
    expect(detail.description).toContain("+3 more");
  });

  it("drops the field prefix for an issue that belongs to no single field", () => {
    const detail = describeError(new ApiError("Import failed", 422, [{ field: "body", message: "No rows were found" }]), "x");
    expect(detail.description).toBe("No rows were found");
  });

  it("carries a plain message through, and falls back when there is none", () => {
    expect(describeError(new ApiError("Too many sign-in attempts", 429, []), "x").title).toBe("Too many sign-in attempts");
    expect(describeError(new Error("Network down"), "x").title).toBe("Network down");
    expect(describeError("not an error", "Could not save").title).toBe("Could not save");
    expect(describeError(new Error(""), "Could not save").title).toBe("Could not save");
  });

  it("flattens to one line for an inline error message", () => {
    const text = errorText(new ApiError("Validation failed", 400, [{ field: "name", message: "Required" }]), "x");
    expect(text).toBe("Validation failed: Name: Required");
    expect(errorText(new ApiError("Not allowed", 403, []), "x")).toBe("Not allowed");
  });
});
