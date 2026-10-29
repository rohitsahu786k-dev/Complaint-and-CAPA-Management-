import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const EFFECTIVENESS_CHECK_RESULTS = ["Sustained", "Not Sustained"] as const;

/**
 * One periodic check that a closed complaint's actions are still being followed. Checks belong to
 * a closure: if the complaint is reopened and closed again the new closedAt starts a fresh series.
 */
const EffectivenessCheckSchema = new Schema(
  {
    complaint: { type: Schema.Types.ObjectId, ref: "Complaint", required: true, index: true },
    closedAt: { type: Date, required: true },
    cycle: { type: Number, required: true, min: 1 },
    dueAt: { type: Date, required: true },
    result: { type: String, enum: EFFECTIVENESS_CHECK_RESULTS, required: true },
    remarks: { type: String, trim: true, default: "" },
    checkedAt: { type: Date, required: true },
    checkedBy: { type: Schema.Types.ObjectId, ref: "User" },
    checkedByName: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

EffectivenessCheckSchema.index({ complaint: 1, closedAt: 1, cycle: 1 }, { unique: true });

export type EffectivenessCheckDocument = InferSchemaType<typeof EffectivenessCheckSchema> & { _id: mongoose.Types.ObjectId };
export const EffectivenessCheck =
  (mongoose.models.EffectivenessCheck as Model<EffectivenessCheckDocument>) ||
  mongoose.model<EffectivenessCheckDocument>("EffectivenessCheck", EffectivenessCheckSchema);
