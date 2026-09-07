import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const DepartmentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    code: { type: String, trim: true },
    company: { type: Schema.Types.ObjectId, ref: "Company", index: true },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

DepartmentSchema.index({ name: 1, company: 1 }, { unique: true });

export type DepartmentDocument = InferSchemaType<typeof DepartmentSchema> & { _id: mongoose.Types.ObjectId };
export const Department =
  (mongoose.models.Department as Model<DepartmentDocument>) || mongoose.model<DepartmentDocument>("Department", DepartmentSchema);
