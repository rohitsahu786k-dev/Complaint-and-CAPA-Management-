import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const RoleSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },
    permissions: [{ type: String, required: true }],
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

export type RoleDocument = InferSchemaType<typeof RoleSchema> & { _id: mongoose.Types.ObjectId };
export const Role = (mongoose.models.Role as Model<RoleDocument>) || mongoose.model<RoleDocument>("Role", RoleSchema);
