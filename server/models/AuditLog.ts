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

export type AuditLogDocument = InferSchemaType<typeof AuditLogSchema> & { _id: mongoose.Types.ObjectId };
export const AuditLog =
  (mongoose.models.AuditLog as Model<AuditLogDocument>) || mongoose.model<AuditLogDocument>("AuditLog", AuditLogSchema);
