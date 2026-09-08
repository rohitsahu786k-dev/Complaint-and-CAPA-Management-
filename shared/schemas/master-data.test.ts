import { describe, expect, it } from "vitest";
import { userCreateSchema, userUpdateSchema } from "./master-data";

const roleId = "64b64c15a1b2c3d4e5f67890";

describe("master data user schemas", () => {
  it("requires a valid temporary password on user creation and defaults first-login change", () => {
    const parsed = userCreateSchema.parse({
      name: "Quality User",
      username: "quality.user",
      email: "quality.user@example.com",
      password: "SecurePass123",
      role: roleId,
      companyIds: []
    });
    expect(parsed.forcePasswordChange).toBe(true);
  });

  it("rejects password replacement through administrative profile updates", () => {
    expect(() => userUpdateSchema.parse({ password: "AnotherPass123" })).toThrow();
  });
});
