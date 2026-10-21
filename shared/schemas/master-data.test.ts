import { describe, expect, it } from "vitest";
import { employeeCreateSchema, parseEmailList } from "./master-data";

const base = {
  employeeCode: "E1",
  name: "Test User",
  department: "a".repeat(24),
  company: "b".repeat(24)
};

describe("employee Manager / HOD email lists", () => {
  it("splits on commas, semicolons and newlines and de-duplicates", () => {
    expect(parseEmailList("A@x.com; b@x.com,a@x.com\n c@x.com ")).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
  });

  it("normalises multiple addresses to a comma separated list", () => {
    const parsed = employeeCreateSchema.parse({ ...base, managerEmail: "m1@x.com;m2@x.com", hodEmail: "h@x.com" });
    expect(parsed.managerEmail).toBe("m1@x.com, m2@x.com");
    expect(parsed.hodEmail).toBe("h@x.com");
  });

  it("accepts blank values and rejects malformed addresses", () => {
    expect(employeeCreateSchema.parse({ ...base, managerEmail: "" }).managerEmail).toBe("");
    expect(employeeCreateSchema.safeParse({ ...base, hodEmail: "ok@x.com, nope" }).success).toBe(false);
  });
});
