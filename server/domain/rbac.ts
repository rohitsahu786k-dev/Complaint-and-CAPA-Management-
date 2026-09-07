import type { DomainActor, DomainCapa, DomainComplaint } from "./types";

export function hasPermission(actor: DomainActor | undefined, permission: string): boolean {
  if (!actor) return false;
  return actor.permissions.includes("*") || actor.permissions.includes(permission);
}

export function isMasterAdmin(actor: DomainActor | undefined): boolean {
  return Boolean(actor && (actor.roleName === "Master Admin" || actor.permissions.includes("*")));
}

export function isQualityHead(actor: DomainActor | undefined): boolean {
  return actor?.roleName === "Quality Head";
}

export function isManagement(actor: DomainActor | undefined): boolean {
  return actor?.roleName === "Management";
}

/** Company scoping. "*" in companyIds means every company, as in the legacy prototype. */
export function canSeeCompany(actor: DomainActor | undefined, companyId: string): boolean {
  if (!actor) return false;
  if (actor.companyIds.includes("*") || hasPermission(actor, "view.all")) return true;
  return actor.companyIds.includes(companyId);
}

export function canViewComplaint(actor: DomainActor | undefined, complaint: Pick<DomainComplaint, "companyId">): boolean {
  if (!actor) return false;
  if (!canSeeCompany(actor, complaint.companyId)) return false;
  return hasPermission(actor, "view.all") || hasPermission(actor, "view.company");
}

/**
 * Edit rights follow the legacy permission keys: a blanket complaint.edit, an
 * owner-scoped complaint.edit.own, and a department-scoped complaint.edit.dept.
 */
export function canEditComplaint(
  actor: DomainActor | undefined,
  complaint: Pick<DomainComplaint, "companyId" | "ownerId" | "responsibleDept">
): boolean {
  if (!actor) return false;
  if (isMasterAdmin(actor)) return true;
  if (!canSeeCompany(actor, complaint.companyId)) return false;
  if (hasPermission(actor, "complaint.edit")) return true;
  if (hasPermission(actor, "complaint.edit.own") && complaint.ownerId === actor.id) return true;
  if (hasPermission(actor, "complaint.edit.dept") && complaint.responsibleDept && complaint.responsibleDept === actor.department)
    return true;
  return false;
}

export function canEditCapa(
  actor: DomainActor | undefined,
  capa: Pick<DomainCapa, "companyId" | "ownerId" | "department">,
  complaint: Pick<DomainComplaint, "companyId" | "ownerId" | "responsibleDept">
): boolean {
  if (!actor) return false;
  if (isMasterAdmin(actor)) return true;
  if (!canSeeCompany(actor, capa.companyId)) return false;
  if (hasPermission(actor, "capa.edit.own") && capa.ownerId === actor.id) return true;
  if (hasPermission(actor, "capa.approve.dept") && capa.department && capa.department === actor.department) return true;
  if (hasPermission(actor, "capa.verify")) return true;
  if (hasPermission(actor, "complaint.assign") || hasPermission(actor, "complaint.edit")) return canEditComplaint(actor, complaint);
  return false;
}

export function canReviewCapaEvidence(actor: DomainActor | undefined, capa: Pick<DomainCapa, "companyId">): boolean {
  if (!actor) return false;
  if (isMasterAdmin(actor)) return true;
  return canSeeCompany(actor, capa.companyId) && hasPermission(actor, "capa.evidence.review");
}

export function canVerifyEffectiveness(actor: DomainActor | undefined, capa: Pick<DomainCapa, "companyId">): boolean {
  if (!actor) return false;
  if (isMasterAdmin(actor)) return true;
  return canSeeCompany(actor, capa.companyId) && hasPermission(actor, "capa.verify");
}

export function canCloseComplaint(actor: DomainActor | undefined, complaint: Pick<DomainComplaint, "companyId">): boolean {
  if (!actor) return false;
  if (isMasterAdmin(actor)) return true;
  return canSeeCompany(actor, complaint.companyId) && hasPermission(actor, "complaint.close");
}

export function canDeleteComplaint(actor: DomainActor | undefined): boolean {
  return isMasterAdmin(actor);
}
