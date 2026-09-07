import { Router } from "express";
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
 * SLA Reminders & Due-soon notifications
 */
cronRouter.post(
  "/reminders",
  asyncHandler(async (_req, res) => {
    const result = await processReminders();
    return ok(res, { job: "reminders", ...result, timestamp: new Date().toISOString() });
  })
);

/**
 * Overdue multi-tier escalations
 */
cronRouter.post(
  "/escalations",
  asyncHandler(async (_req, res) => {
    const result = await processEscalations();
    return ok(res, { job: "escalations", ...result, timestamp: new Date().toISOString() });
  })
);

/**
 * Daily & Weekly Management summary digests
 */
cronRouter.post(
  "/summaries",
  asyncHandler(async (req, res) => {
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
  })
);
