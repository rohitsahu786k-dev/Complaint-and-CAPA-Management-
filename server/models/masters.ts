import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { COMPLAINT_TYPES } from "@shared/constants/domain";

/** Complaint categories and sub-categories, split by complaint type as in the legacy master data. */
const CategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    complaintType: { type: String, enum: COMPLAINT_TYPES, required: true, index: true },
    parent: { type: Schema.Types.ObjectId, ref: "Category", default: null, index: true },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);
CategorySchema.index({ complaintType: 1, parent: 1, name: 1 }, { unique: true });

export type CategoryDocument = InferSchemaType<typeof CategorySchema> & { _id: mongoose.Types.ObjectId };
export const Category =
  (mongoose.models.Category as Model<CategoryDocument>) || mongoose.model<CategoryDocument>("Category", CategorySchema);

const PrioritySchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },
    color: { type: String, required: true, trim: true },
    /** Scales every TAT window: below 1 tightens the target, above 1 relaxes it. */
    tatMultiplier: { type: Number, required: true, default: 1, min: 0.1, max: 10 },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

export type PriorityDocument = InferSchemaType<typeof PrioritySchema> & { _id: mongoose.Types.ObjectId };
export const Priority =
  (mongoose.models.Priority as Model<PriorityDocument>) || mongoose.model<PriorityDocument>("Priority", PrioritySchema);

const DelayReasonSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

export type DelayReasonDocument = InferSchemaType<typeof DelayReasonSchema> & { _id: mongoose.Types.ObjectId };
export const DelayReason =
  (mongoose.models.DelayReason as Model<DelayReasonDocument>) || mongoose.model<DelayReasonDocument>("DelayReason", DelayReasonSchema);

/** 6M plus Management and Supplier, per the final legacy patch. */
const RootCauseCategorySchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

export type RootCauseCategoryDocument = InferSchemaType<typeof RootCauseCategorySchema> & { _id: mongoose.Types.ObjectId };
export const RootCauseCategory =
  (mongoose.models.RootCauseCategory as Model<RootCauseCategoryDocument>) ||
  mongoose.model<RootCauseCategoryDocument>("RootCauseCategory", RootCauseCategorySchema);
