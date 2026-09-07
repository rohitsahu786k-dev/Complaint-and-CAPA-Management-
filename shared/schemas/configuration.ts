import { z } from "zod";
import { COMPLAINT_TYPES } from "../constants/domain";
import { objectIdSchema } from "./common";

export const tatConfigSchema = z.object({
  company: objectIdSchema.nullable().optional(),
  ackHours: z.number().int().min(1).max(2000),
  containmentDays: z.number().int().min(1).max(365),
  rcaDays: z.number().int().min(1).max(365),
  capaDays: z.number().int().min(1).max(365),
  d3ContainmentDays: z.number().int().min(1).max(365),
  d5CorrectiveActionDays: z.number().int().min(1).max(365),
  d6VerificationDays: z.number().int().min(1).max(365),
  d7ShortTermDays: z.number().int().min(1).max(730),
  d7LongTermDays: z.number().int().min(1).max(730),
  repeatWindowDays: z.number().int().min(1).max(730),
  dueSoonHours: z.number().int().min(1).max(720)
});

export const escalationConfigSchema = z.object({
  company: objectIdSchema.nullable().optional(),
  levels: z
    .array(
      z.object({
        level: z.number().int().min(1).max(10),
        name: z.string().trim().min(2).max(80),
        triggerHoursOverdue: z.number().int().min(0).max(8760)
      })
    )
    .min(1)
    .max(10),
  reminderPercentages: z.array(z.number().int().min(1).max(100)).min(1).max(10),
  active: z.boolean().default(true)
});

export const numberingConfigSchema = z.object({
  company: objectIdSchema,
  prefix: z.string().trim().min(2).max(40),
  sequencePadding: z.number().int().min(3).max(10).default(5),
  capaSequencePadding: z.number().int().min(2).max(6).default(2),
  resetOnFinancialYear: z.boolean().default(true),
  active: z.boolean().default(true)
});

export const simpleListItemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  order: z.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true)
});

export const categorySchema = simpleListItemSchema.extend({
  complaintType: z.enum(COMPLAINT_TYPES),
  parent: objectIdSchema.nullable().optional()
});

export const prioritySchema = simpleListItemSchema.extend({
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour"),
  tatMultiplier: z.number().min(0.1).max(10)
});

export type TatConfigInput = z.infer<typeof tatConfigSchema>;
export type EscalationConfigInput = z.infer<typeof escalationConfigSchema>;
export type NumberingConfigInput = z.infer<typeof numberingConfigSchema>;
