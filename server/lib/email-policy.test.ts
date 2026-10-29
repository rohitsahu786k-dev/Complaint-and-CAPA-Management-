import { afterEach, describe, expect, it, vi } from "vitest";
import { allowedEmailDomains, isInternalAddress, splitByEmailPolicy } from "./email-policy";

afterEach(() => vi.unstubAllEnvs());

describe("email policy: company addresses only", () => {
  it("allows company addresses in any letter case", () => {
    expect(isInternalAddress("ritik.porwal@onepws.com")).toBe(true);
    expect(isInternalAddress("  Service@OnePWS.com ")).toBe(true);
  });

  it("allows the group companies' domains, not only onepws.com", () => {
    expect(isInternalAddress("someone@wmspl.co.in")).toBe(true);
    expect(isInternalAddress("someone@pwsfloor.com")).toBe(true);
    expect(isInternalAddress("someone@wmspl.co.in.evil.com")).toBe(false);
    expect(isInternalAddress("someone@notpwsfloor.com")).toBe(false);
  });

  it("blocks customers and any other outside domain", () => {
    expect(isInternalAddress("buyer@thalesgroup.com")).toBe(false);
    expect(isInternalAddress("someone@gmail.com")).toBe(false);
  });

  it("blocks look-alike domains and subdomains", () => {
    expect(isInternalAddress("a@onepws.com.evil.com")).toBe(false);
    expect(isInternalAddress("a@notonepws.com")).toBe(false);
    expect(isInternalAddress("a@mail.onepws.com")).toBe(false);
    expect(isInternalAddress("a@evil.com@onepws.com")).toBe(false);
  });

  it("blocks values that hide a second address or are not an address", () => {
    expect(isInternalAddress("a@onepws.com, b@gmail.com")).toBe(false);
    expect(isInternalAddress("Name <a@onepws.com>")).toBe(false);
    expect(isInternalAddress("a@onepws.com;b@gmail.com")).toBe(false);
    expect(isInternalAddress("not-an-email")).toBe(false);
    expect(isInternalAddress("")).toBe(false);
  });

  it("splits a list into allowed and blocked, ignoring blanks", () => {
    const { allowed, blocked } = splitByEmailPolicy(["a@onepws.com", "customer@client.com", "", "b@onepws.com"]);
    expect(allowed).toEqual(["a@onepws.com", "b@onepws.com"]);
    expect(blocked).toEqual(["customer@client.com"]);
    expect(splitByEmailPolicy(undefined)).toEqual({ allowed: [], blocked: [] });
  });

  it("can be widened to another company domain with EMAIL_ALLOWED_DOMAINS", () => {
    vi.stubEnv("EMAIL_ALLOWED_DOMAINS", "onepws.com, @pws-group.in");
    expect(allowedEmailDomains()).toEqual(["onepws.com", "pws-group.in"]);
    expect(isInternalAddress("x@pws-group.in")).toBe(true);
    expect(isInternalAddress("x@client.com")).toBe(false);
  });
});
