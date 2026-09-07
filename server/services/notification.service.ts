import { Types } from "mongoose";
import type { NotificationCategory } from "@shared/constants/domain";
import { Notification } from "../models/Notification";
import { Role } from "../models/Role";
import { User } from "../models/User";

export type NotifyInput = {
  recipients: (string | Types.ObjectId)[];
  message: string;
  category?: NotificationCategory;
  priority?: "normal" | "high";
  entityType?: string;
  entityId?: string | Types.ObjectId;
  link?: string;
};

export async function notify(input: NotifyInput) {
  const unique = [...new Set(input.recipients.filter(Boolean).map(String))];
  if (unique.length === 0) return [];
  return Notification.insertMany(
    unique.map((recipient) => ({
      recipient,
      message: input.message,
      category: input.category ?? "system",
      priority: input.priority ?? "normal",
      entityType: input.entityType,
      entityId: input.entityId,
      link: input.link
    }))
  );
}

/** Resolves every active user holding a role, scoped to a company. Used for Quality Head fan-out. */
export async function usersWithRole(roleName: string, companyId: string | Types.ObjectId) {
  const role = await Role.findOne({ name: roleName }).lean();
  if (!role) return [];
  const users = await User.find({ role: role._id, active: true }).select("_id companyIds").lean();
  return users
    .filter((user) => (user.companyIds ?? []).some((id) => String(id) === String(companyId)) || (user.companyIds ?? []).length === 0)
    .map((user) => String(user._id));
}

export async function listNotifications(userId: string, options: { unreadOnly?: boolean; limit: number; skip: number }) {
  const filter: Record<string, unknown> = { recipient: userId };
  if (options.unreadOnly) filter.read = false;
  const [items, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(options.skip).limit(options.limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipient: userId, read: false })
  ]);
  return { items, total, unread };
}

export async function markRead(userId: string, notificationId: string) {
  return Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId },
    { read: true, readAt: new Date() },
    { new: true }
  ).lean();
}

export async function markAllRead(userId: string) {
  const result = await Notification.updateMany({ recipient: userId, read: false }, { read: true, readAt: new Date() });
  return result.modifiedCount;
}
