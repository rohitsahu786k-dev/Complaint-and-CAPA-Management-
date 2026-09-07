import type { ApiUser } from "@shared/types/api";
import type { CapaDocument } from "../models/Capa";
import type { ComplaintDocument } from "../models/Complaint";
import type { DomainActor, DomainCapa, DomainComplaint } from "../domain/types";

function id(value: unknown): string | undefined {
  if (!value) return undefined;
  return String(value);
}

function iso(value: unknown): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function delay(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as { category?: string; explanation?: string; recovery?: string; recordedAt?: Date };
  return {
    category: record.category ?? "",
    explanation: record.explanation ?? "",
    recovery: record.recovery,
    recordedAt: iso(record.recordedAt) ?? new Date().toISOString()
  };
}

function signature(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as {
    user?: unknown;
    name?: string;
    designation?: string;
    department?: string;
    email?: string;
    at?: Date;
    notes?: string;
  };
  return {
    userId: id(record.user) ?? "",
    name: record.name ?? "",
    designation: record.designation ?? "",
    department: record.department ?? "",
    email: record.email ?? "",
    at: iso(record.at) ?? "",
    notes: record.notes ?? ""
  };
}

function actionRows(rows: unknown): { action?: string; resp?: string; target?: string; status?: string }[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const record = row as { action?: string; resp?: string; target?: string; status?: string };
    return { action: record.action, resp: record.resp, target: record.target, status: record.status };
  });
}

/**
 * Converts a Mongoose complaint into the plain shape used by the pure domain rules,
 * so workflow, closure and TAT logic never depends on Mongoose.
 */
export function toDomainComplaint(doc: ComplaintDocument, priorityMultiplier: number): DomainComplaint {
  const fishbone = (doc.fishbone ?? {}) as Record<string, string[]>;
  return {
    id: String(doc._id),
    number: doc.number,
    companyId: id(doc.company) ?? "",
    type: doc.type,
    status: doc.status,
    receivedAt: iso(doc.receivedAt) ?? new Date().toISOString(),
    priorityMultiplier,
    ownerId: id(doc.owner),
    responsibleDept: id(doc.responsibleDept),
    customer: doc.customer ?? undefined,
    product: doc.product ?? undefined,
    category: doc.category ?? undefined,

    acknowledgedAt: iso(doc.acknowledgedAt),
    containmentAt: iso(doc.containmentAt),
    rcaAt: iso(doc.rcaAt),
    capaAssignedAt: iso(doc.capaAssignedAt),
    closedAt: iso(doc.closedAt),

    ackDelayReason: delay(doc.ackDelayReason),
    contDelayReason: delay(doc.contDelayReason),
    rcaDelayReason: delay(doc.rcaDelayReason),
    capaDelayReason: delay(doc.capaDelayReason),

    d0: doc.d0 ?? "",
    d1Team: (doc.d1Team ?? []).map((member) => ({
      name: member.name ?? undefined,
      dept: member.dept ?? undefined,
      designation: member.designation ?? undefined,
      role: member.role ?? undefined
    })),
    d2: {
      what: doc.d2?.what ?? "",
      where: doc.d2?.where ?? "",
      when: doc.d2?.when ?? "",
      who: doc.d2?.who ?? "",
      involved: doc.d2?.involved ?? "",
      howMany: doc.d2?.howMany ?? "",
      how: doc.d2?.how ?? ""
    },
    d3Actions: actionRows(doc.d3Actions),
    d4QcTools: doc.d4QcTools ?? [],
    d4Occurrence: doc.d4Occurrence ?? "",
    d4Escape: doc.d4Escape ?? "",
    d4Systemic: doc.d4Systemic ?? "",
    rootCauseCategory: doc.rootCauseCategory ?? undefined,
    fiveWhy: {
      occurrence: doc.fiveWhy?.occurrence ?? [],
      escape: doc.fiveWhy?.escape ?? [],
      systemic: doc.fiveWhy?.systemic ?? [],
      singleChain: doc.fiveWhy?.singleChain ?? []
    },
    fishbone,
    d5Occurrence: actionRows(doc.d5Occurrence),
    d5Escape: actionRows(doc.d5Escape),
    d5Systemic: actionRows(doc.d5Systemic),
    d6Verify: actionRows(doc.d6Verify),
    d6DocsList: (doc.d6DocsList ?? []).map((entry) => ({
      docType: entry.docType,
      status: entry.status,
      attachment: id(entry.attachment) ?? null,
      revision: entry.revision ?? "",
      revDate: entry.revDate ?? "",
      approver: entry.approver ?? "",
      naJustification: entry.naJustification ?? ""
    })),
    d7ShortTermDate: doc.d7ShortTermDate ?? "",
    d7RepeatObserved: Boolean(doc.d7RepeatObserved),
    d7LongTermDate: doc.d7LongTermDate ?? "",
    d7LongTermRepeatObserved: Boolean(doc.d7LongTermRepeatObserved),
    d7LongTermResult: doc.d7LongTermResult ?? "",
    d7NoRepeatConfirmed: Boolean(doc.d7NoRepeatConfirmed),

    signatures: {
      prepared: signature(doc.signatures?.prepared),
      reviewed: signature(doc.signatures?.reviewed),
      approved: signature(doc.signatures?.approved)
    }
  };
}

export function toDomainCapa(doc: CapaDocument): DomainCapa {
  const review = doc.evidenceReview as { status?: DomainCapa["evidenceReview"] extends null ? never : string; remarks?: string } | null;
  return {
    id: String(doc._id),
    number: doc.number,
    complaintId: id(doc.complaint) ?? "",
    companyId: id(doc.company) ?? "",
    type: doc.type,
    action: doc.action,
    ownerId: id(doc.owner),
    department: id(doc.department),
    dueDate: iso(doc.dueDate) ?? undefined,
    completedAt: iso(doc.completedAt),
    status: doc.status,
    evidence: doc.evidence ?? "",
    effectiveness: doc.effectiveness ?? null,
    evidenceReview: review?.status
      ? { status: review.status as NonNullable<DomainCapa["evidenceReview"]>["status"], remarks: review.remarks }
      : null
  };
}

export function toDomainActor(user: ApiUser | undefined, department?: string): DomainActor | undefined {
  if (!user) return undefined;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleName: user.role?.name,
    permissions: user.role?.permissions ?? [],
    companyIds: user.companyIds,
    department: department ?? user.department
  };
}
