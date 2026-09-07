import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * One document per company prefix and financial year, incremented with an atomic
 * findOneAndUpdate so concurrent complaint registrations never share a number.
 */
const CounterSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, index: true },
    company: { type: Schema.Types.ObjectId, ref: "Company", index: true },
    financialYear: { type: String, trim: true },
    sequence: { type: Number, required: true, default: 0 }
  },
  { timestamps: true }
);

export type CounterDocument = InferSchemaType<typeof CounterSchema> & { _id: mongoose.Types.ObjectId };
export const Counter = (mongoose.models.Counter as Model<CounterDocument>) || mongoose.model<CounterDocument>("Counter", CounterSchema);
