import { describe, expect, it } from "vitest";
import {
  canCloseComplaint,
  canDeleteComplaint,
  canEditCapa,
  canEditComplaint,
  canReviewCapaEvidence,
  canSeeCompany,
  canVerifyEffectiveness,
  canViewComplaint,
  hasPermission,
  isManagement,
  isMasterAdmin,
  isQualityHead
} from "./rbac";
import type { DomainActor, DomainCapa, DomainComplaint } from "./types";
import { DEFAULT_ROLE_PERMISSIONS, type RoleName } from "@shared/constants/permissions";

function createActor(roleName: RoleName, overrides?: Partial<DomainActor>): DomainActor {
  return {
    id: `usr-${roleName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
    name: `${roleName} User`,
    email: `${roleName.toLowerCase().replace(/[^a-z0-9]/g, "")}@onepws.com`,
    roleName,
    permissions: DEFAULT_ROLE_PERMISSIONS[roleName] || [],
    companyIds: roleName === "Master Admin" || roleName === "Management" || roleName === "Auditor" ? ["*"] : ["comp-1"],
    department: "Quality",
    ...overrides
  };
}

describe("RBAC Matrix & Multi-Tenant Scoping for all 10 Standard Roles", () => {
  const comp1Complaint: Pick<DomainComplaint, "companyId" | "ownerId" | "responsibleDept"> = {
    companyId: "comp-1",
    ownerId: "usr-complaint-owner",
    responsibleDept: "Quality"
  };

  const comp2Complaint: Pick<DomainComplaint, "companyId" | "ownerId" | "responsibleDept"> = {
    companyId: "comp-2",
    ownerId: "usr-other-owner",
    responsibleDept: "Production"
  };

  const comp1Capa: Pick<DomainCapa, "companyId" | "ownerId" | "department"> = {
    companyId: "comp-1",
    ownerId: "usr-capa-owner",
    department: "Quality"
  };

  // 1. Master Admin
  it("Master Admin: Has wildcard access across all entities, companies, and delete rights", () => {
    const admin = createActor("Master Admin");
    expect(isMasterAdmin(admin)).toBe(true);
    expect(hasPermission(admin, "any.arbitrary.permission")).toBe(true);
    expect(canSeeCompany(admin, "comp-1")).toBe(true);
    expect(canSeeCompany(admin, "comp-2")).toBe(true);
    expect(canViewComplaint(admin, comp1Complaint)).toBe(true);
    expect(canViewComplaint(admin, comp2Complaint)).toBe(true);
    expect(canEditComplaint(admin, comp1Complaint)).toBe(true);
    expect(canEditComplaint(admin, comp2Complaint)).toBe(true);
    expect(canCloseComplaint(admin, comp1Complaint)).toBe(true);
    expect(canDeleteComplaint(admin)).toBe(true);
  });

  // 2. Management
  it("Management: Multi-company executive visibility, reports, but cannot delete or arbitrarily edit without assignment", () => {
    const mgmt = createActor("Management");
    expect(isManagement(mgmt)).toBe(true);
    expect(canSeeCompany(mgmt, "comp-1")).toBe(true);
    expect(canSeeCompany(mgmt, "comp-2")).toBe(true);
    expect(canViewComplaint(mgmt, comp1Complaint)).toBe(true);
    expect(canViewComplaint(mgmt, comp2Complaint)).toBe(true);
    expect(hasPermission(mgmt, "dash.all")).toBe(true);
    expect(hasPermission(mgmt, "report.all")).toBe(true);
    expect(hasPermission(mgmt, "export.all")).toBe(true);
    expect(canDeleteComplaint(mgmt)).toBe(false);
  });

  // 3. Complaint Coordinator
  it("Complaint Coordinator: Can create, assign, and edit within company, but cannot delete", () => {
    const coord = createActor("Complaint Coordinator");
    expect(canSeeCompany(coord, "comp-1")).toBe(true);
    expect(canSeeCompany(coord, "comp-2")).toBe(false); // Isolated
    expect(hasPermission(coord, "complaint.create")).toBe(true);
    expect(hasPermission(coord, "complaint.assign")).toBe(true);
    expect(canEditComplaint(coord, comp1Complaint)).toBe(true);
    expect(canEditComplaint(coord, comp2Complaint)).toBe(false);
    expect(canDeleteComplaint(coord)).toBe(false);
  });

  // 4. Complaint Owner
  it("Complaint Owner: Can edit only own assigned complaints within same company", () => {
    const owner = createActor("Complaint Owner", { id: "usr-complaint-owner" });
    const otherOwner = createActor("Complaint Owner", { id: "usr-different" });

    expect(canEditComplaint(owner, comp1Complaint)).toBe(true);
    expect(canEditComplaint(otherOwner, comp1Complaint)).toBe(false);
    expect(canEditComplaint(owner, comp2Complaint)).toBe(false); // Wrong company
    expect(canDeleteComplaint(owner)).toBe(false);
  });

  // 5. Department Head
  it("Department Head: Can edit complaints and approve CAPAs for their responsible department", () => {
    const hodQuality = createActor("Department Head", { department: "Quality" });
    const hodProduction = createActor("Department Head", { department: "Production" });

    expect(canEditComplaint(hodQuality, comp1Complaint)).toBe(true);
    expect(canEditComplaint(hodProduction, comp1Complaint)).toBe(false);
    expect(canEditCapa(hodQuality, comp1Capa, comp1Complaint)).toBe(true);
    expect(canEditCapa(hodProduction, comp1Capa, comp1Complaint)).toBe(false);
  });

  // 6. CAPA Owner
  it("CAPA Owner: Can edit own assigned CAPA item, cannot edit unassigned complaint", () => {
    const capaOwner = createActor("CAPA Owner", { id: "usr-capa-owner" });
    const otherUser = createActor("CAPA Owner", { id: "usr-other" });

    expect(canEditCapa(capaOwner, comp1Capa, comp1Complaint)).toBe(true);
    expect(canEditCapa(otherUser, comp1Capa, comp1Complaint)).toBe(false);
    expect(canEditComplaint(capaOwner, comp1Complaint)).toBe(false);
  });

  // 7. Quality Head
  it("Quality Head: Reviews evidence, verifies effectiveness, approves 8D, and closes complaints", () => {
    const qHead = createActor("Quality Head");
    expect(isQualityHead(qHead)).toBe(true);
    expect(canReviewCapaEvidence(qHead, comp1Capa)).toBe(true);
    expect(canVerifyEffectiveness(qHead, comp1Capa)).toBe(true);
    expect(canCloseComplaint(qHead, comp1Complaint)).toBe(true);
    expect(hasPermission(qHead, "8d.approve")).toBe(true);
    expect(canDeleteComplaint(qHead)).toBe(false);
  });

  // 8. Sales / Customer Service
  it("Sales / Customer Service: Can log and view company complaints, cannot edit workflow or delete", () => {
    const sales = createActor("Sales / Customer Service");
    expect(hasPermission(sales, "complaint.create")).toBe(true);
    expect(canViewComplaint(sales, comp1Complaint)).toBe(true);
    expect(canEditComplaint(sales, comp1Complaint)).toBe(false);
    expect(canCloseComplaint(sales, comp1Complaint)).toBe(false);
    expect(canDeleteComplaint(sales)).toBe(false);
  });

  // 9. Auditor
  it("Auditor: Cross-company read-only access to audit logs and reports without mutation rights", () => {
    const auditor = createActor("Auditor");
    expect(canSeeCompany(auditor, "comp-1")).toBe(true);
    expect(canSeeCompany(auditor, "comp-2")).toBe(true);
    expect(hasPermission(auditor, "audit.view")).toBe(true);
    expect(hasPermission(auditor, "report.all")).toBe(true);
    expect(canEditComplaint(auditor, comp1Complaint)).toBe(false);
    expect(canDeleteComplaint(auditor)).toBe(false);
  });

  // 10. Viewer
  it("Viewer: Read-only access within their assigned company only", () => {
    const viewer = createActor("Viewer", { companyIds: ["comp-1"] });
    expect(canViewComplaint(viewer, comp1Complaint)).toBe(true);
    expect(canViewComplaint(viewer, comp2Complaint)).toBe(false); // Isolated
    expect(canEditComplaint(viewer, comp1Complaint)).toBe(false);
    expect(canCloseComplaint(viewer, comp1Complaint)).toBe(false);
    expect(canDeleteComplaint(viewer)).toBe(false);
  });
});
