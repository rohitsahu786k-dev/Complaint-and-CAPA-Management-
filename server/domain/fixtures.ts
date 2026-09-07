import { D6_DOCUMENT_TYPES, DEFAULT_TAT_CONFIG } from "@shared/constants/domain";
import type { DomainActor, DomainCapa, DomainComplaint, TatConfig } from "./types";

export const tatConfig: TatConfig = { ...DEFAULT_TAT_CONFIG };

export function makeActor(overrides: Partial<DomainActor> = {}): DomainActor {
  return {
    id: "actor-1",
    name: "Test Actor",
    email: "actor@example.test",
    roleName: "Complaint Coordinator",
    permissions: ["view.company", "complaint.create", "complaint.edit"],
    companyIds: ["company-1"],
    department: "dept-1",
    ...overrides
  };
}

export function makeComplaint(overrides: Partial<DomainComplaint> = {}): DomainComplaint {
  return {
    id: "complaint-1",
    number: "ONEPWS-COMP-26-27-00001",
    companyId: "company-1",
    type: "External",
    status: "Open",
    receivedAt: "2026-05-01T00:00:00.000Z",
    priorityMultiplier: 1,
    ownerId: "owner-1",
    responsibleDept: "dept-1",
    customer: "Acme Ltd",
    product: "Workstation",
    category: "Product quality issue",
    acknowledgedAt: null,
    containmentAt: null,
    rcaAt: null,
    capaAssignedAt: null,
    closedAt: null,
    d0: "",
    d1Team: [],
    d2: {},
    d3Actions: [],
    d4QcTools: [],
    d4Occurrence: "",
    d4Escape: "",
    d4Systemic: "",
    fiveWhy: { occurrence: [], escape: [], systemic: [], singleChain: [] },
    fishbone: {},
    d5Occurrence: [],
    d5Escape: [],
    d5Systemic: [],
    d6Verify: [],
    d6DocsList: D6_DOCUMENT_TYPES.map((docType) => ({ docType, status: "Pending" as const })),
    signatures: { prepared: null, reviewed: null, approved: null },
    ...overrides
  };
}

/** A complaint with every external 8D requirement satisfied except the signatures. */
export function makeCompleteExternalComplaint(overrides: Partial<DomainComplaint> = {}): DomainComplaint {
  return makeComplaint({
    acknowledgedAt: "2026-05-01T06:00:00.000Z",
    containmentAt: "2026-05-02T06:00:00.000Z",
    rcaAt: "2026-05-04T06:00:00.000Z",
    capaAssignedAt: "2026-05-06T06:00:00.000Z",
    d0: "Stock quarantined at the customer site",
    d1Team: [{ name: "Anita Rao", dept: "Quality", designation: "Manager", role: "Team lead" }],
    d2: { what: "Panel finish peeling", where: "Site A", when: "2026-04-28", who: "Install crew", howMany: "12", how: "Visual" },
    d4QcTools: ["5-Why", "Fishbone / Ishikawa"],
    d4Occurrence: "Cure time was shortened",
    d4Escape: "Final inspection did not cover the finish",
    d4Systemic: "Work instruction had no cure time gate",
    fiveWhy: {
      occurrence: ["Peeling", "Weak adhesion", "Short cure"],
      escape: ["Not detected", "No check", "No criteria"],
      systemic: ["No gate", "Instruction gap", "No review"],
      singleChain: []
    },
    d5Occurrence: [{ action: "Restore cure time", resp: "Production", target: "2026-05-15", status: "Open" }],
    d6DocsList: D6_DOCUMENT_TYPES.map((docType) => ({
      docType,
      status: "NA" as const,
      naJustification: "Not applicable to this finish defect"
    })),
    ...overrides
  });
}

export function makeCapa(overrides: Partial<DomainCapa> = {}): DomainCapa {
  return {
    id: "capa-1",
    number: "ONEPWS-COMP-26-27-00001-CAPA-01",
    complaintId: "complaint-1",
    companyId: "company-1",
    type: "Corrective",
    action: "Update the work instruction with a cure time gate",
    ownerId: "owner-1",
    department: "dept-1",
    dueDate: "2026-05-20T00:00:00.000Z",
    completedAt: null,
    status: "Open",
    evidence: "",
    effectiveness: null,
    evidenceReview: null,
    ...overrides
  };
}
