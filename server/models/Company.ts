import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const CompanyLogoSchema = new Schema(
  {
    secureUrl: { type: String, trim: true },
    publicId: { type: String, trim: true }
  },
  { _id: false }
);

const CompanySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    logo: CompanyLogoSchema,
    documentNumber: { type: String, trim: true },
    revision: { type: String, trim: true },
    effectiveDate: Date,
    complaintNumberingPrefix: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

export type CompanyDocument = InferSchemaType<typeof CompanySchema> & { _id: mongoose.Types.ObjectId };
export const Company = (mongoose.models.Company as Model<CompanyDocument>) || mongoose.model<CompanyDocument>("Company", CompanySchema);
