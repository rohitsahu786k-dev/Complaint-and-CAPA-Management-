import type { Types } from "mongoose";
import { counterKey, financialYearLabel, formatCapaNumber, formatComplaintNumber } from "../domain/numbering";
import { Counter } from "../models/Counter";
import { resolveNumbering } from "./config.service";

export type CounterStore = {
  increment(key: string, companyId: string, financialYear: string): Promise<number>;
};

/** Atomic increment. Concurrency safety comes from the single findOneAndUpdate with upsert. */
export const mongoCounterStore: CounterStore = {
  async increment(key, companyId, financialYear) {
    const counter = await Counter.findOneAndUpdate(
      { key },
      { $inc: { sequence: 1 }, $setOnInsert: { company: companyId, financialYear } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return counter?.sequence ?? 1;
  }
};

export async function nextComplaintNumber(
  companyId: string | Types.ObjectId,
  receivedAt: Date,
  store: CounterStore = mongoCounterStore
): Promise<string> {
  const config = await resolveNumbering(companyId);
  const reference = config.resetOnFinancialYear ? receivedAt : new Date(0);
  const key = counterKey(config.prefix, reference);
  const sequence = await store.increment(key, String(companyId), financialYearLabel(reference));
  return formatComplaintNumber(config.prefix, reference, sequence, config.sequencePadding);
}

export async function nextCapaNumber(companyId: string | Types.ObjectId, complaintNumber: string, sequence: number): Promise<string> {
  const config = await resolveNumbering(companyId);
  return formatCapaNumber(complaintNumber, sequence, config.capaSequencePadding);
}
