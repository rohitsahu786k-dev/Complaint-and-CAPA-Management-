import { Types } from "mongoose";
import {
  DEFAULT_DELAY_REASONS,
  DEFAULT_ESCALATION_LEVELS,
  DEFAULT_REMINDER_PERCENTAGES,
  DEFAULT_TAT_CONFIG
} from "@shared/constants/domain";
import type { TatConfig } from "../domain/types";
import { EscalationConfiguration, NumberingConfiguration, TATConfiguration } from "../models/configuration";
import { DelayReason } from "../models/masters";
import { Company } from "../models/Company";
import { httpError } from "../utils/http";

type EscalationLevel = { level: number; name: string; triggerHoursOverdue: number };

/**
 * Configuration always resolves company first, then the global fallback document,
 * then the shipped defaults. Nothing is hardcoded at the point of use.
 */
export async function resolveTatConfig(companyId: string | Types.ObjectId | null): Promise<TatConfig> {
  const [specific, global] = await Promise.all([
    companyId ? TATConfiguration.findOne({ company: companyId }).lean() : null,
    TATConfiguration.findOne({ company: null }).lean()
  ]);
  const source = specific ?? global;
  if (!source) return { ...DEFAULT_TAT_CONFIG };
  return {
    ackHours: source.ackHours ?? DEFAULT_TAT_CONFIG.ackHours,
    containmentDays: source.containmentDays ?? DEFAULT_TAT_CONFIG.containmentDays,
    rcaDays: source.rcaDays ?? DEFAULT_TAT_CONFIG.rcaDays,
    capaDays: source.capaDays ?? DEFAULT_TAT_CONFIG.capaDays,
    d3ContainmentDays: source.d3ContainmentDays ?? DEFAULT_TAT_CONFIG.d3ContainmentDays,
    d5CorrectiveActionDays: source.d5CorrectiveActionDays ?? DEFAULT_TAT_CONFIG.d5CorrectiveActionDays,
    d6VerificationDays: source.d6VerificationDays ?? DEFAULT_TAT_CONFIG.d6VerificationDays,
    d7ShortTermDays: source.d7ShortTermDays ?? DEFAULT_TAT_CONFIG.d7ShortTermDays,
    d7LongTermDays: source.d7LongTermDays ?? DEFAULT_TAT_CONFIG.d7LongTermDays,
    repeatWindowDays: source.repeatWindowDays ?? DEFAULT_TAT_CONFIG.repeatWindowDays,
    dueSoonHours: source.dueSoonHours ?? DEFAULT_TAT_CONFIG.dueSoonHours
  };
}

export async function resolveEscalation(companyId: string | Types.ObjectId | null): Promise<{
  levels: EscalationLevel[];
  reminderPercentages: number[];
}> {
  const [specific, global] = await Promise.all([
    companyId ? EscalationConfiguration.findOne({ company: companyId }).lean() : null,
    EscalationConfiguration.findOne({ company: null }).lean()
  ]);
  const source = specific ?? global;
  const levels = source?.levels?.length
    ? source.levels.map((entry) => ({ ...entry }))
    : DEFAULT_ESCALATION_LEVELS.map((entry) => ({ ...entry }));
  const reminderPercentages = source?.reminderPercentages?.length ? [...source.reminderPercentages] : [...DEFAULT_REMINDER_PERCENTAGES];
  return { levels, reminderPercentages };
}

export async function activeDelayReasons(): Promise<string[]> {
  const rows = await DelayReason.find({ active: true }).sort({ order: 1, name: 1 }).lean();
  return rows.length ? rows.map((row) => row.name) : [...DEFAULT_DELAY_REASONS];
}

export async function resolveNumbering(companyId: string | Types.ObjectId) {
  const [config, company] = await Promise.all([
    NumberingConfiguration.findOne({ company: companyId, active: true }).lean(),
    Company.findById(companyId).lean()
  ]);
  if (!company) throw httpError(404, "Company not found");
  return {
    prefix: config?.prefix || company.complaintNumberingPrefix,
    sequencePadding: config?.sequencePadding ?? 5,
    capaSequencePadding: config?.capaSequencePadding ?? 2,
    resetOnFinancialYear: config?.resetOnFinancialYear ?? true
  };
}
