import type { DomainComplaint } from "./types";

export type RepeatCandidate = Pick<DomainComplaint, "id" | "companyId" | "customer" | "product" | "category" | "receivedAt">;

export type RepeatMatch = {
  complaintId: string;
  basis: ("customer" | "product")[];
};

/**
 * Legacy findPotentialDuplicates: same company, same category, and a matching
 * customer OR product, within the configured repeat window measured from now.
 */
export function matchesRepeatRule(candidate: RepeatCandidate, existing: RepeatCandidate, cutoff: Date): RepeatMatch | null {
  if (existing.id === candidate.id) return null;
  if (existing.companyId !== candidate.companyId) return null;
  if (!existing.category || existing.category !== candidate.category) return null;
  if (new Date(existing.receivedAt) < cutoff) return null;

  const basis: ("customer" | "product")[] = [];
  if (candidate.customer && existing.customer === candidate.customer) basis.push("customer");
  if (candidate.product && existing.product === candidate.product) basis.push("product");
  if (basis.length === 0) return null;

  return { complaintId: existing.id, basis };
}

export function repeatCutoff(windowDays: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - windowDays * 86400000);
}

export function findRepeatMatches(
  candidate: RepeatCandidate,
  population: RepeatCandidate[],
  windowDays: number,
  now: Date = new Date()
): RepeatMatch[] {
  const cutoff = repeatCutoff(windowDays, now);
  return population
    .map((existing) => matchesRepeatRule(candidate, existing, cutoff))
    .filter((match): match is RepeatMatch => match !== null);
}

export function describeRepeatBasis(matches: RepeatMatch[]): string {
  const basis = new Set(matches.flatMap((match) => match.basis));
  if (basis.size === 0) return "";
  const parts = [...basis].map((entry) => (entry === "customer" ? "same customer" : "same product"));
  return `Same company and category with ${parts.join(" and ")} inside the repeat window`;
}
