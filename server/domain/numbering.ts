/**
 * Complaint / CAPA numbering rules, ported from the legacy nextComplaintNumber
 * and nextCapaNumber. Kept pure so the atomic counter can be tested in isolation.
 */

/** Indian financial year label (April to March), e.g. 2026-05-01 becomes "26-27". */
export function financialYearLabel(reference: Date | string = new Date()): string {
  const date = reference instanceof Date ? reference : new Date(reference);
  const year = date.getFullYear();
  const month = date.getMonth();
  const startYear = month >= 3 ? year : year - 1;
  return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
}

export function counterKey(prefix: string, reference: Date | string = new Date()): string {
  return `${prefix}-${financialYearLabel(reference)}`;
}

export function formatComplaintNumber(prefix: string, reference: Date | string, sequence: number, padding = 5): string {
  return `${counterKey(prefix, reference)}-${String(sequence).padStart(padding, "0")}`;
}

export function formatCapaNumber(complaintNumber: string, index: number, padding = 2): string {
  return `${complaintNumber}-CAPA-${String(index).padStart(padding, "0")}`;
}
