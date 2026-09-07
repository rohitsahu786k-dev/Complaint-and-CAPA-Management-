import type { CapaEffectiveness, CapaStatus, EvidenceReviewStatus } from "@shared/constants/domain";
import type { DomainCapa } from "./types";

export type RuleIssue = { field: string; message: string };

const ALLOWED_TRANSITIONS: Record<CapaStatus, CapaStatus[]> = {
  Open: ["Open", "In Progress", "Completed"],
  "In Progress": ["In Progress", "Completed", "Open"],
  Completed: ["Completed", "Under Verification", "Closed", "In Progress"],
  "Under Verification": ["Under Verification", "Closed", "Rejected/Reopened"],
  Closed: ["Closed", "Rejected/Reopened"],
  "Rejected/Reopened": ["Rejected/Reopened", "In Progress", "Completed"]
};

export function isAllowedCapaTransition(from: CapaStatus, to: CapaStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Legacy rule: evidence text is mandatory before a CAPA can be closed. */
export function validateCapaStatusChange(capa: Pick<DomainCapa, "status" | "evidence">, next: CapaStatus, evidence?: string): RuleIssue[] {
  const issues: RuleIssue[] = [];
  if (!isAllowedCapaTransition(capa.status, next)) {
    issues.push({ field: "status", message: `A CAPA cannot move from ${capa.status} to ${next}` });
  }
  const effectiveEvidence = evidence ?? capa.evidence;
  if (next === "Closed" && !effectiveEvidence) {
    issues.push({ field: "evidence", message: "Evidence is required before a CAPA can be closed" });
  }
  return issues;
}

/** Rejection always needs remarks so the owner knows what to fix. */
export function validateEvidenceReview(decision: EvidenceReviewStatus, remarks: string | undefined): RuleIssue[] {
  const issues: RuleIssue[] = [];
  if (decision === "Pending") {
    issues.push({ field: "decision", message: "A review decision must be Accepted or Rejected" });
  }
  if (decision === "Rejected" && (!remarks || !remarks.trim())) {
    issues.push({ field: "remarks", message: "Remarks are mandatory when rejecting evidence" });
  }
  return issues;
}

/**
 * Re-uploading after a rejection returns the CAPA to Pending review while keeping
 * the previous rejection remarks visible, exactly as the final legacy patch did.
 */
export function reviewStateAfterReupload(
  current: { status: EvidenceReviewStatus; remarks?: string } | null | undefined
): { status: EvidenceReviewStatus; remarks: string } | null {
  if (current?.status !== "Rejected") return null;
  return {
    status: "Pending",
    remarks: `Re-uploaded after rejection. Previous remarks: ${current.remarks ?? ""}`.trim()
  };
}

export function validateEffectivenessVerification(
  capa: Pick<DomainCapa, "status">,
  result: CapaEffectiveness,
  input: { method?: string; evidence?: string }
): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const eligible: CapaStatus[] = ["Completed", "Under Verification", "Closed"];
  if (!eligible.includes(capa.status)) {
    issues.push({ field: "status", message: "Only a completed CAPA can be verified for effectiveness" });
  }
  if (!input.evidence || !input.evidence.trim()) {
    issues.push({ field: "effectivenessEvidence", message: "Evidence reference is required to record effectiveness" });
  }
  if (!input.method || !input.method.trim()) {
    issues.push({ field: "verificationMethod", message: "Verification method is required, for example audit or sample check" });
  }
  if (result !== "Effective" && result !== "Not Effective") {
    issues.push({ field: "result", message: "Result must be Effective or Not Effective" });
  }
  return issues;
}

/** Not Effective sends the CAPA back to the owner; Effective closes it. */
export function capaStatusAfterEffectiveness(result: CapaEffectiveness): CapaStatus {
  return result === "Not Effective" ? "Rejected/Reopened" : "Closed";
}

export function shouldReopenComplaint(result: CapaEffectiveness): boolean {
  return result === "Not Effective";
}
