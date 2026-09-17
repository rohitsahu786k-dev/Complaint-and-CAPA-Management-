import { describe, expect, it } from "vitest";
import { assertDeletable } from "./master-delete.service";
import type { HttpError } from "../utils/http";

describe("Master data deletion guard", () => {
  it("allows a delete when nothing references the record", async () => {
    await expect(
      assertDeletable("This department", [
        { label: "complaints", count: Promise.resolve(0) },
        { label: "CAPA actions", count: Promise.resolve(0) }
      ])
    ).resolves.toBeUndefined();
  });

  it("refuses a delete and names what is holding the record", async () => {
    const failure = await assertDeletable("This department", [
      { label: "complaints", count: Promise.resolve(12) },
      { label: "CAPA actions", count: Promise.resolve(0) },
      { label: "employees", count: Promise.resolve(3) }
    ]).catch((error: HttpError) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as HttpError).status).toBe(422);
    // The message has to carry the counts: it is what the toast shows the administrator.
    expect((failure as HttpError).message).toContain("12 complaints");
    expect((failure as HttpError).message).toContain("3 employees");
    expect((failure as HttpError).message).toContain("Deactivate it instead");
    // A check that came back clean must not be listed as a blocker.
    expect((failure as HttpError).message).not.toContain("CAPA actions");
  });

  it("reports every blocking reference as a field issue", async () => {
    const failure = await assertDeletable("This company", [
      { label: "complaints", count: Promise.resolve(5) },
      { label: "users", count: Promise.resolve(2) }
    ]).catch((error: HttpError) => error);

    expect((failure as HttpError).issues).toEqual([
      { field: "complaints", message: "5 complaints still reference this record" },
      { field: "users", message: "2 users still reference this record" }
    ]);
  });
});
