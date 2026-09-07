import { Router } from "express";
import { z } from "zod";
import { connectDB } from "../config/db";
import { requireUser } from "../middleware/auth";
import { listNotifications, markAllRead, markRead } from "../services/notification.service";
import { asyncHandler } from "../utils/async-handler";
import { httpError, ok } from "../utils/http";

export const notificationRouter = Router();

notificationRouter.use(requireUser);

notificationRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        unreadOnly: z.coerce.boolean().default(false),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25)
      })
      .parse(req.query);
    await connectDB();
    const result = await listNotifications(req.user!.id, {
      unreadOnly: query.unreadOnly,
      limit: query.pageSize,
      skip: (query.page - 1) * query.pageSize
    });
    return ok(res, {
      items: result.items,
      unread: result.unread,
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
      totalPages: Math.max(1, Math.ceil(result.total / query.pageSize))
    });
  })
);

notificationRouter.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    await connectDB();
    const notification = await markRead(req.user!.id, req.params.id);
    if (!notification) throw httpError(404, "Notification not found");
    return ok(res, { notification });
  })
);

notificationRouter.post(
  "/read-all",
  asyncHandler(async (req, res) => {
    await connectDB();
    return ok(res, { updated: await markAllRead(req.user!.id) });
  })
);
