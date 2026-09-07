import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    email: { type: String, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: Schema.Types.ObjectId, ref: "Role", required: true, index: true },
    companyIds: [{ type: Schema.Types.ObjectId, ref: "Company", index: true }],
    department: { type: Schema.Types.ObjectId, ref: "Department", index: true },
    employee: { type: Schema.Types.ObjectId, ref: "Employee", index: true },
    active: { type: Boolean, default: true, index: true },
    forcePasswordChange: { type: Boolean, default: false },
    failedLoginCount: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, select: false },
    lastLoginAt: Date,
    passwordChangedAt: Date,
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false }
  },
  { timestamps: true }
);

export type UserDocument = InferSchemaType<typeof UserSchema> & { _id: mongoose.Types.ObjectId };
export const User = (mongoose.models.User as Model<UserDocument>) || mongoose.model<UserDocument>("User", UserSchema);
