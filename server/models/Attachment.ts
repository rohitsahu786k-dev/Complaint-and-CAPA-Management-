import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { ATTACHMENT_PURPOSES } from "@shared/constants/domain";

/**
 * Only Cloudinary metadata is persisted. Binary content and base64 data URLs are
 * never stored in MongoDB, which is the main break from the legacy prototype.
 */
const AttachmentSchema = new Schema(
  {
    publicId: { type: String, required: true, trim: true, index: true },
    secureUrl: { type: String, required: true, trim: true },
    resourceType: { type: String, required: true, trim: true, default: "raw" },
    originalFilename: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    bytes: { type: Number, required: true },
    width: Number,
    height: Number,

    entityType: { type: String, required: true, trim: true, index: true },
    entityId: { type: Schema.Types.ObjectId, required: true, index: true },
    purpose: { type: String, enum: ATTACHMENT_PURPOSES, required: true, index: true },

    company: { type: Schema.Types.ObjectId, ref: "Company", index: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", index: true },
    uploadedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

AttachmentSchema.index({ entityType: 1, entityId: 1, purpose: 1 });

export type AttachmentDocument = InferSchemaType<typeof AttachmentSchema> & { _id: mongoose.Types.ObjectId };
export const Attachment =
  (mongoose.models.Attachment as Model<AttachmentDocument>) || mongoose.model<AttachmentDocument>("Attachment", AttachmentSchema);
