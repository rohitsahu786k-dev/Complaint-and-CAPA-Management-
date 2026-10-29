import { Router, type Request, type Response } from "express";
import { requireCronAuth } from "../lib/cron-auth";
import { asyncHandler } from "../utils/async-handler";
import { ok } from "../utils/http";
import { processReminders } from "../services/reminder.service";
import { processEscalations } from "../services/escalation.service";
import { processMonthlySummaries } from "../services/summary.service";

export const cronRouter = Router();

// All cron endpoints require CRON_SECRET authentication
cronRouter.use(requireCronAuth);

/**
 * Vercel Cron calls these paths with GET (sending the secret as a Bearer token). POST stays
 * available so an administrator or an external scheduler can trigger a run by hand. Registering
 * only POST made every scheduled run answer 404, so none of these jobs ever executed.
 */
function schedule(path: string, handler: (req: Request, res: Response) => Promise<unknown>) {
  const wrapped = asyncHandler(async (req, res) => {
    await handler(req, res);
  });
  cronRouter.get(path, wrapped);
  cronRouter.post(path, wrapped);
}

/**
 * SLA Reminders & Due-soon notifications
 */
schedule("/reminders", async (_req, res) => {
  const result = await processReminders();
  return ok(res, { job: "reminders", ...result, timestamp: new Date().toISOString() });
});

/**
 * Overdue multi-tier escalations
 */
schedule("/escalations", async (_req, res) => {
  const result = await processEscalations();
  return ok(res, { job: "escalations", ...result, timestamp: new Date().toISOString() });
});

/**
 * Monthly Management summary digest
 */
schedule("/summaries", async (_req, res) => {
  const result = await processMonthlySummaries();
  return ok(res, { job: "summaries", sent: result.sent, timestamp: new Date().toISOString() });
});
