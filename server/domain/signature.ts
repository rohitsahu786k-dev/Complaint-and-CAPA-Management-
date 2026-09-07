import { SIGNATURE_ROLES, type SignatureRole } from "@shared/constants/domain";
import { canSeeCompany, isMasterAdmin, isQualityHead } from "./rbac";
import type { DomainActor, DomainComplaint, SignatureRecord } from "./types";

const PREPARE_ROLES = ["Complaint Coordinator", "Complaint Owner", "Department Head", "CAPA Owner", "Quality Head", "Management"];
const REVIEW_ROLES = ["Department Head", "Quality Head", "Management"];

export function canSignAs(role: SignatureRole, actor: DomainActor | undefined, complaint: Pick<DomainComplaint, "companyId">): boolean {
  if (!actor) return false;
  if (isMasterAdmin(actor)) return true;
  if (!canSeeCompany(actor, complaint.companyId)) return false;
  if (role === "prepared") return PREPARE_ROLES.includes(actor.roleName ?? "");
  if (role === "reviewed") return REVIEW_ROLES.includes(actor.roleName ?? "");
  return isQualityHead(actor);
}

export type SignatureIssue = { field: string; message: string };

/**
 * Prepared then Reviewed then Approved. Self review and self approval are blocked:
 * the legacy UI only warned, but a server side rule cannot rely on a browser confirm.
 * Master Admin keeps an explicit override so a single-person company is not deadlocked.
 */
export function validateSignature(
  role: SignatureRole,
  actor: DomainActor,
  complaint: Pick<DomainComplaint, "companyId" | "signatures" | "closedAt">,
  options: { allowSelfSign?: boolean } = {}
): SignatureIssue[] {
  const issues: SignatureIssue[] = [];
  const signatures = complaint.signatures ?? {};

  if (!canSignAs(role, actor, complaint)) {
    issues.push({ field: "role", message: `You are not authorized to sign as ${role}` });
    return issues;
  }

  if (signatures[role]) {
    issues.push({ field: "role", message: `This complaint is already signed as ${role}` });
    return issues;
  }

  if (role === "reviewed" && !signatures.prepared) {
    issues.push({ field: "sequence", message: "Prepared By signature is required first" });
  }
  if (role === "approved" && !signatures.reviewed) {
    issues.push({ field: "sequence", message: "Reviewed By signature is required first" });
  }

  const allowSelf = options.allowSelfSign === true && isMasterAdmin(actor);
  if (!allowSelf) {
    if (role === "reviewed" && signatures.prepared?.userId === actor.id) {
      issues.push({ field: "separationOfDuties", message: "You prepared this report, so it must be reviewed by someone else" });
    }
    if (role === "approved" && (signatures.prepared?.userId === actor.id || signatures.reviewed?.userId === actor.id)) {
      issues.push({ field: "separationOfDuties", message: "You signed at an earlier stage, so it must be approved by someone else" });
    }
  }

  return issues;
}

export function buildSignatureRecord(
  actor: DomainActor,
  profile: { designation?: string; department?: string },
  notes: string,
  at: Date = new Date()
): SignatureRecord {
  return {
    userId: actor.id,
    name: actor.name,
    designation: profile.designation || actor.roleName || "User",
    department: profile.department || actor.department || "",
    email: actor.email ?? "",
    at: at.toISOString(),
    notes: notes.trim()
  };
}

/** Revoking a stage invalidates that stage and every later stage. */
export function rolesInvalidatedBy(role: SignatureRole): SignatureRole[] {
  const index = SIGNATURE_ROLES.indexOf(role);
  return SIGNATURE_ROLES.slice(index);
}

export function validateRevocation(
  role: SignatureRole,
  actor: DomainActor | undefined,
  complaint: Pick<DomainComplaint, "signatures">,
  reason: string
): SignatureIssue[] {
  const issues: SignatureIssue[] = [];
  if (!isMasterAdmin(actor)) {
    issues.push({ field: "role", message: "Only a Master Admin can revoke a signature" });
  }
  if (!reason || reason.trim().length < 5) {
    issues.push({ field: "reason", message: "A revocation reason of at least 5 characters is mandatory" });
  }
  if (!complaint.signatures?.[role]) {
    issues.push({ field: "role", message: `There is no ${role} signature to revoke` });
  }
  return issues;
}

export function isFullySigned(complaint: Pick<DomainComplaint, "signatures">): boolean {
  return SIGNATURE_ROLES.every((role) => Boolean(complaint.signatures?.[role]));
}
