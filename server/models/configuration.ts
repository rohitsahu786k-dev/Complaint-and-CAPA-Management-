import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { DEFAULT_REMINDER_PERCENTAGES, DEFAULT_TAT_CONFIG } from "@shared/constants/domain";

/**
 * Configuration is stored per company with a single global fallback document
 * (company = null) so nothing has to be hardcoded inside email or UI functions.
 */
const TATConfigurationSchema = new Schema(
  {
    company: { type: Schema.Types.ObjectId, ref: "Company", default: null, unique: true, index: true },
    ackHours: { type: Number, default: DEFAULT_TAT_CONFIG.ackHours, min: 1 },
    containmentDays: { type: Number, default: DEFAULT_TAT_CONFIG.containmentDays, min: 1 },
    rcaDays: { type: Number, default: DEFAULT_TAT_CONFIG.rcaDays, min: 1 },
    capaDays: { type: Number, default: DEFAULT_TAT_CONFIG.capaDays, min: 1 },
    d3ContainmentDays: { type: Number, default: DEFAULT_TAT_CONFIG.d3ContainmentDays, min: 1 },
    d5CorrectiveActionDays: { type: Number, default: DEFAULT_TAT_CONFIG.d5CorrectiveActionDays, min: 1 },
    d6VerificationDays: { type: Number, default: DEFAULT_TAT_CONFIG.d6VerificationDays, min: 1 },
    d7ShortTermDays: { type: Number, default: DEFAULT_TAT_CONFIG.d7ShortTermDays, min: 1 },
    d7LongTermDays: { type: Number, default: DEFAULT_TAT_CONFIG.d7LongTermDays, min: 1 },
    repeatWindowDays: { type: Number, default: DEFAULT_TAT_CONFIG.repeatWindowDays, min: 1 },
    dueSoonHours: { type: Number, default: DEFAULT_TAT_CONFIG.dueSoonHours, min: 1 }
  },
  { timestamps: true }
);

export type TATConfigurationDocument = InferSchemaType<typeof TATConfigurationSchema> & { _id: mongoose.Types.ObjectId };
export const TATConfiguration =
  (mongoose.models.TATConfiguration as Model<TATConfigurationDocument>) ||
  mongoose.model<TATConfigurationDocument>("TATConfiguration", TATConfigurationSchema);

const EscalationLevelSchema = new Schema(
  {
    level: { type: Number, required: true, min: 1 },
    name: { type: String, required: true, trim: true },
    triggerHoursOverdue: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const EscalationConfigurationSchema = new Schema(
  {
    company: { type: Schema.Types.ObjectId, ref: "Company", default: null, unique: true, index: true },
    levels: { type: [EscalationLevelSchema], default: [] },
    reminderPercentages: { type: [Number], default: [...DEFAULT_REMINDER_PERCENTAGES] },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export type EscalationConfigurationDocument = InferSchemaType<typeof EscalationConfigurationSchema> & { _id: mongoose.Types.ObjectId };
export const EscalationConfiguration =
  (mongoose.models.EscalationConfiguration as Model<EscalationConfigurationDocument>) ||
  mongoose.model<EscalationConfigurationDocument>("EscalationConfiguration", EscalationConfigurationSchema);

const NumberingConfigurationSchema = new Schema(
  {
    company: { type: Schema.Types.ObjectId, ref: "Company", required: true, unique: true, index: true },
    prefix: { type: String, required: true, trim: true },
    sequencePadding: { type: Number, default: 5, min: 3, max: 10 },
    capaSequencePadding: { type: Number, default: 2, min: 2, max: 6 },
    resetOnFinancialYear: { type: Boolean, default: true },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

export type NumberingConfigurationDocument = InferSchemaType<typeof NumberingConfigurationSchema> & { _id: mongoose.Types.ObjectId };
export const NumberingConfiguration =
  (mongoose.models.NumberingConfiguration as Model<NumberingConfigurationDocument>) ||
  mongoose.model<NumberingConfigurationDocument>("NumberingConfiguration", NumberingConfigurationSchema);
