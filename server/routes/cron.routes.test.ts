import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const processReminders = vi.fn(async () => ({ complaintsChecked: 1 }));
const processEscalations = vi.fn(async () => ({ complaintsChecked: 1 }));
const processMonthlySummaries = vi.fn(async () => ({ sent: 0 }));

vi.mock("../services/reminder.service", () => ({ processReminders }));
vi.mock("../services/escalation.service", () => ({ processEscalations }));
vi.mock("../services/summary.service", () => ({ processMonthlySummaries }));
vi.mock("../services/email-schedule.service", () => ({ claimScheduledRun: vi.fn(async () => ({ run: true, reason: "test" })) }));

const SECRET = "test-cron-secret-0123456789abcdef";
let server: ReturnType<ReturnType<typeof express>["listen"]>;
let base = "";

beforeAll(async () => {
  vi.stubEnv("MONGODB_URI", "mongodb://127.0.0.1/unused");
  vi.stubEnv("JWT_SECRET", "j".repeat(40));
  vi.stubEnv("COOKIE_SECRET", "c".repeat(20));
  vi.stubEnv("CRON_SECRET", SECRET);
  const { cronRouter } = await import("./cron.routes");
  const app = express();
  app.use("/api/cron", cronRouter);
  // The real error middleware maps these to JSON; a plain handler is enough to read the status.
  app.use((error: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.status ?? 500).json({});
  });
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

const authed = { Authorization: `Bearer ${SECRET}` };

describe("cron endpoints", () => {
  // Vercel Cron always calls with GET. When only POST was registered, every scheduled run was a 404.
  it.each(["/reminders", "/escalations", "/summaries"])("%s answers a GET with the correct secret", async (path) => {
    const res = await fetch(`${base}/api/cron${path}`, { headers: authed });
    expect(res.status).toBe(200);
  });

  it("still answers a manual POST with the correct secret", async () => {
    const res = await fetch(`${base}/api/cron/escalations`, { method: "POST", headers: authed });
    expect(res.status).toBe(200);
    expect(processEscalations).toHaveBeenCalled();
  });

  it("rejects a call with a missing or wrong secret without running the job", async () => {
    processReminders.mockClear();
    expect((await fetch(`${base}/api/cron/reminders`)).status).toBe(401);
    expect((await fetch(`${base}/api/cron/reminders`, { headers: { Authorization: "Bearer wrong" } })).status).toBe(401);
    expect(processReminders).not.toHaveBeenCalled();
  });
});
