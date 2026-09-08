import { describe, expect, it } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { createRateLimit } from "./rate-limit";

function mockResponse() {
  const headers = new Map<string, string>();
  let statusCode = 200;
  let body: unknown;
  const response = {
    setHeader(name: string, value: string) {
      headers.set(name, value);
      return response;
    },
    status(code: number) {
      statusCode = code;
      return response;
    },
    json(value: unknown) {
      body = value;
      return response;
    }
  } as unknown as Response;
  return { response, headers, get statusCode() { return statusCode; }, get body() { return body; } };
}

describe("createRateLimit", () => {
  it("allows requests within the limit and blocks the next burst request", () => {
    const limiter = createRateLimit({ windowMs: 60_000, max: 2, keyPrefix: `test:${Date.now()}` });
    const request = {
      headers: { "x-forwarded-for": "203.0.113.10" },
      ip: "203.0.113.10",
      socket: { remoteAddress: "203.0.113.10" }
    } as unknown as Request;
    let nextCalls = 0;
    const next = (() => { nextCalls += 1; }) as NextFunction;

    const first = mockResponse();
    limiter(request, first.response, next);
    const second = mockResponse();
    limiter(request, second.response, next);
    const third = mockResponse();
    limiter(request, third.response, next);

    expect(nextCalls).toBe(2);
    expect(third.statusCode).toBe(429);
    expect(third.headers.get("Retry-After")).toBeTruthy();
    expect(third.body).toEqual({ message: "Too many requests. Please try again later." });
  });
});
