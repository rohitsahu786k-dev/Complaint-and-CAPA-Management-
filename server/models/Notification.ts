import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { NOTIFICATION_CATEGORIES } from "@shared/constants/domain";

const NotificationSchema = new Schema(
  {
    recipient: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    message: { type: String, required: true, trim: true },
    category: { type: String, enum: NOTIFICATION_CATEGORIES, default: "system", index: true },
    priority: { type: String, enum: ["normal", "high"], default: "normal" },
    entityType: { type: String, trim: true },
    entityId: { type: Schema.Types.ObjectId },
    link: { type: String, trim: true },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null }
  },
  { timestamps: true }
);

NotificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

export type NotificationDocument = InferSchemaType<typeof NotificationSchema> & { _id: mongoose.Types.ObjectId };
export const Notification =
  (mongoose.models.Notification as Model<NotificationDocument>) || mongoose.model<NotificationDocument>("Notification", NotificationSchema);
