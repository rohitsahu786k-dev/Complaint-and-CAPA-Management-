import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const AuditLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: "User", index: true },
    actorName: { type: String, trim: true },
    action: { type: String, required: true, trim: true, index: true },
    entity: { type: String, required: true, trim: true, index: true },
    entityId: { type: String, trim: true, index: true },
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    metadata: Schema.Types.Mixed
  },
  { timestamps: true }
);

/**
 * Every audit query sorts by createdAt, and the collection grows faster than any other
 * (a row per login, edit and stage change). Without these the server had to scan the whole
 * collection and sort it in memory on each read, which slowed down as history accumulated
 * and would eventually trip MongoDB's 32MB in-memory sort limit outright.
 *
 * Each index pairs a filter used by the audit routes with the createdAt sort, so the filter
 * and the ordering are both served straight from the index.
 */
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ entityId: 1, createdAt: -1 });
AuditLogSchema.index({ entity: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ actor: 1, createdAt: -1 });

export type AuditLogDocument = InferSchemaType<typeof AuditLogSchema> & { _id: mongoose.Types.ObjectId };
export const AuditLog =
  (mongoose.models.AuditLog as Model<AuditLogDocument>) || mongoose.model<AuditLogDocument>("AuditLog", AuditLogSchema);
