import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const EmployeeSchema = new Schema(
  {
    employeeCode: { type: String, required: true, uppercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true, index: true },
    designation: { type: String, trim: true },
    department: { type: Schema.Types.ObjectId, ref: "Department", required: true, index: true },
    company: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    managerName: { type: String, trim: true },
    managerEmail: { type: String, lowercase: true, trim: true },
    hodName: { type: String, trim: true },
    hodEmail: { type: String, lowercase: true, trim: true },
    linkedUser: { type: Schema.Types.ObjectId, ref: "User", index: true },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

EmployeeSchema.index({ employeeCode: 1, company: 1 }, { unique: true });

export type EmployeeDocument = InferSchemaType<typeof EmployeeSchema> & { _id: mongoose.Types.ObjectId };
export const Employee =
  (mongoose.models.Employee as Model<EmployeeDocument>) || mongoose.model<EmployeeDocument>("Employee", EmployeeSchema);
