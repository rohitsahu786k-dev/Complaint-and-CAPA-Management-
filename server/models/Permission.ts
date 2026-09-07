import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const PermissionSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, index: true },
    label: { type: String, required: true, trim: true },
    group: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

export type PermissionDocument = InferSchemaType<typeof PermissionSchema> & { _id: mongoose.Types.ObjectId };
export const Permission =
  (mongoose.models.Permission as Model<PermissionDocument>) || mongoose.model<PermissionDocument>("Permission", PermissionSchema);
