import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { NOTE_KINDS } from "@shared/constants/domain";

const ComplaintNoteSchema = new Schema(
  {
    complaint: { type: Schema.Types.ObjectId, ref: "Complaint", required: true, index: true },
    company: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    kind: { type: String, enum: NOTE_KINDS, default: "Note", index: true },
    referenceDate: { type: Date, default: null },
    content: { type: String, required: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", index: true },
    createdByName: { type: String, trim: true }
  },
  { timestamps: true }
);

ComplaintNoteSchema.index({ complaint: 1, createdAt: -1 });

export type ComplaintNoteDocument = InferSchemaType<typeof ComplaintNoteSchema> & { _id: mongoose.Types.ObjectId };
export const ComplaintNote =
  (mongoose.models.ComplaintNote as Model<ComplaintNoteDocument>) ||
  mongoose.model<ComplaintNoteDocument>("ComplaintNote", ComplaintNoteSchema);
