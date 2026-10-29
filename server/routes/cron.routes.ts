import { Router, type Request, type Response } from "express";
import { requireCronAuth } from "../lib/cron-auth";
import { asyncHandler } from "../utils/async-handler";
import { ok } from "../utils/http";
import { processReminders } from "../services/reminder.service";
import { processEscalations } from "../services/escalation.service";
import { processDailySummaries, processWeeklySummaries } from "../services/summary.service";

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
 * Daily & Weekly Management summary digests
 */
schedule("/summaries", async (req, res) => {
  const dailyResult = await processDailySummaries();

  // Check if weekly summary is also requested (e.g. on Mondays)
  let weeklyResult = null;
  const now = new Date();
  const isMonday = now.getDay() === 1;
  const forceWeekly = req.query.weekly === "true";

  if (isMonday || forceWeekly) {
    weeklyResult = await processWeeklySummaries();
  }

  return ok(res, {
    job: "summaries",
    dailySent: dailyResult.sent,
    weeklySent: weeklyResult?.sent ?? null,
    timestamp: new Date().toISOString()
  });
});
