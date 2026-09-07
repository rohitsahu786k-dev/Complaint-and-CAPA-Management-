import { describe, expect, it } from "vitest";
import { passwordSchema } from "./auth";

describe("passwordSchema", () => {
  it("requires production-safe minimum standards", () => {
    expect(passwordSchema.safeParse("short1").success).toBe(false);
    expect(passwordSchema.safeParse("NoDigitsHere").success).toBe(false);
    expect(passwordSchema.safeParse("Complaint2026").success).toBe(true);
  });
});
