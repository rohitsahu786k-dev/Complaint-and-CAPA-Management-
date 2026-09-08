import { Types } from "mongoose";
import { WORKFLOW_STAGE_STATUS, type WorkflowStage } from "@shared/constants/domain";
import type { ComplaintCreateInput, StageCompleteInput } from "@shared/schemas/complaint";
import type { ApiUser } from "@shared/types/api";
import { canEditComplaint, canSeeCompany, hasPermission, isMasterAdmin } from "../domain/rbac";
import { describeRepeatBasis, findRepeatMatches, repeatCutoff } from "../domain/repeat";
import { buildTatPlan, isStageOverdueNow } from "../domain/tat";
import { delayGaps, stageGaps, stageSequenceGaps, type Gap } from "../domain/workflow";
import { Capa } from "../models/Capa";
import { Complaint } from "../models/Complaint";
import { Department } from "../models/Department";
import { Priority } from "../models/masters";
import { User } from "../models/User";
import { activeDelayReasons, resolveTatConfig } from "./config.service";
import { loadComplaintContext, requireActor } from "./complaint.service";
import { resolveRecipients } from "./email-recipient.service";
import { sendTemplatedEmail } from "./email.service";
import { toDomainCapa, toDomainComplaint } from "./mappers";
import { nextComplaintNumber } from "./numbering.service";
import { notify, usersWithRole } from "./notification.service";
import { writeAudit } from "./audit.service";
import { businessRuleError, httpError, type FieldIssue } from "../utils/http";

function gapsToIssues(gaps: Gap[]): FieldIssue[] {
  return gaps.map((gap) => ({ field: gap.field, section: gap.section, message: gap.hint ? `${gap.field} — ${gap.hint}` : gap.field }));
}

function formatDue(value: Date | string | null | undefined) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

async function validateOwner(ownerId: string | undefined, companyId: string, fallbackUserId: string) {
  const effectiveOwnerId = ownerId || fallbackUserId;
  const owner = await User.findOne({ _id: effectiveOwnerId, active: true }).populate("role").lean();
  if (!owner) throw httpError(400, "The selected complaint owner is not an active user");
  const role = owner.role as unknown as { permissions?: string[] } | null;
  const globalAccess = Boolean(role?.permissions?.includes("*") || role?.permissions?.includes("view.all"));
  const companyIds = (owner.companyIds ?? []).map(String);
  if (!globalAccess && !companyIds.includes(companyId)) throw httpError(400, "The selected complaint owner does not have access to this company");
  return owner;
}

export async function createComplaintHardened(input: ComplaintCreateInput, user: ApiUser | undefined) {
  const actor = await requireActor(user);
  if (!hasPermission(actor, "complaint.create")) throw httpError(403, "You do not have permission to register complaints");
  if (!canSeeCompany(actor, input.company)) throw httpError(403, "You cannot register complaints for this company");

  const [number, tatConfig, priority, owner] = await Promise.all([
    nextComplaintNumber(input.company, input.receivedAt),
    resolveTatConfig(input.company),
    Priority.findById(input.priority).select("name color tatMultiplier").lean(),
    validateOwner(input.owner, input.company, actor.id)
  ]);
  if (!priority) throw httpError(400, "The selected priority no longer exists");

  const responsibleDept = input.type === "External" ? input.responsibleDept : input.againstDept;
  const department = responsibleDept ? await Department.findById(responsibleDept).select("name").lean() : null;

  const doc = await Complaint.create({
    number,
    company: input.company,
    type: input.type,
    status: "Open",
    receivedAt: input.receivedAt,
    source: input.source,
    reportedBy: input.reportedBy,
    priority: input.priority,
    customer: input.type === "External" ? input.customer : "",
    customerContact: input.customerContact,
    customerLocation: input.customerLocation,
    project: input.project,
    customerPO: input.customerPO,
    product: input.product,
    batch: input.batch,
    internalDept: input.type === "Internal" ? input.internalDept : undefined,
    againstDept: input.type === "Internal" ? input.againstDept : undefined,
    responsibleDept,
    category: input.category,
    subCategory: input.subCategory,
    description: input.description,
    owner: owner._id,
    createdBy: actor.id,
    workflowLog: [{ stage: "Registered", at: new Date(), by: actor.id, byName: actor.name, notes: "Complaint registered" }]
  });

  const cutoff = repeatCutoff(tatConfig.repeatWindowDays);
  const population = await Complaint.find({
    _id: { $ne: doc._id },
    company: input.company,
    category: input.category,
    receivedAt: { $gte: cutoff }
  })
    .select("_id number company customer product category receivedAt")
    .lean();

  const matches = findRepeatMatches(
    {
      id: String(doc._id),
      companyId: String(input.company),
      customer: input.customer,
      product: input.product,
      category: input.category,
      receivedAt: input.receivedAt.toISOString()
    },
    population.map((entry) => ({
      id: String(entry._id),
      companyId: String(entry.company),
      customer: entry.customer ?? undefined,
      product: entry.product ?? undefined,
      category: entry.category ?? undefined,
      receivedAt: (entry.receivedAt as Date).toISOString()
    })),
    tatConfig.repeatWindowDays
  );

  if (matches.length > 0) {
    doc.isRepeat = true;
    doc.set(
      "repeatOf",
      matches.map((match) => {
        const source = population.find((entry) => String(entry._id) === match.complaintId);
        return { complaint: new Types.ObjectId(match.complaintId), number: source?.number ?? "", basis: match.basis };
      })
    );
    doc.repeatBasis = describeRepeatBasis(matches);
    await doc.save();
  }

  const domain = toDomainComplaint(doc, priority.tatMultiplier ?? 1);
  const tatPlan = buildTatPlan(domain, tatConfig);
  const ackDue = tatPlan.find((entry) => entry.stage === "ack")?.dueAt;

  await writeAudit({
    actor: user,
    action: "CREATE",
    entity: "Complaint",
    entityId: String(doc._id),
    after: {
      number: doc.number,
      type: doc.type,
      category: doc.category,
      isRepeat: doc.isRepeat,
      owner: String(owner._id),
      ownerName: owner.name,
      department: department?.name ?? ""
    }
  });

  const qualityHeads = await usersWithRole("Quality Head", input.company);
  await notify({
    recipients: [doc.owner, ...qualityHeads].filter(Boolean) as (string | Types.ObjectId)[],
    message: `New ${doc.type.toLowerCase()} complaint ${doc.number} registered`,
    category: "complaint",
    entityType: "Complaint",
    entityId: doc._id,
    link: `/complaints/${doc._id}`
  });

  const emailRecipients = await resolveRecipients({
    complaintId: doc._id,
    targetRoles: ["Complaint Owner", "Coordinator", "Department Head", "Quality Head"]
  });
  if (emailRecipients.length > 0) {
    await sendTemplatedEmail({
      triggerEvent: "COMPLAINT_CREATED",
      recipients: emailRecipients,
      relatedComplaintId: doc._id,
      data: {
        complaintNumber: doc.number,
        complaintTitle: doc.description,
        complaintType: doc.type,
        customerName: doc.customer || department?.name || "Internal complaint",
        partName: doc.product || "Not recorded",
        partNumber: doc.batch || doc.customerPO || "Not recorded",
        priority: priority.name,
        departmentName: department?.name || "Not assigned",
        ownerName: owner.name,
        ackDueDate: formatDue(ackDue),
        actionUrl: `/complaints/${doc._id}`
      }
    });
  }

  return doc;
}

export async function completeStageHardened(complaintId: string, input: StageCompleteInput, user: ApiUser | undefined) {
  const context = await loadComplaintContext(complaintId, user);
  if (!canEditComplaint(context.actor, context.domain)) throw httpError(403, "You do not have permission to edit this complaint");
  if (context.doc.closedAt && !isMasterAdmin(context.actor)) throw httpError(409, "Reopen the complaint before changing its workflow");

  const stage: WorkflowStage = input.stage;
  const capaDocs = await Capa.find({ complaint: complaintId });
  const capas = capaDocs.map(toDomainCapa);
  const tatConfig = await resolveTatConfig(context.doc.company);
  const planBefore = buildTatPlan(context.domain, tatConfig);
  const sequenceIssues = stageSequenceGaps(context.domain, stage);
  const contentIssues = stageGaps(context.domain, capas, stage);
  const overdue = isStageOverdueNow(context.domain, stage, tatConfig);
  const reasons = await activeDelayReasons();
  const delayIssues = delayGaps(overdue, input.delay, reasons);
  const gaps = [...sequenceIssues, ...contentIssues, ...delayIssues];
  if (gaps.length > 0) throw businessRuleError(`This stage cannot be completed yet (${gaps.length} requirement(s) outstanding)`, gapsToIssues(gaps));

  const now = new Date();
  const fieldByStage: Record<WorkflowStage, "acknowledgedAt" | "containmentAt" | "rcaAt" | "capaAssignedAt"> = {
    ack: "acknowledgedAt",
    cont: "containmentAt",
    rca: "rcaAt",
    capa: "capaAssignedAt"
  };
  const delayFieldByStage: Record<WorkflowStage, "ackDelayReason" | "contDelayReason" | "rcaDelayReason" | "capaDelayReason"> = {
    ack: "ackDelayReason",
    cont: "contDelayReason",
    rca: "rcaDelayReason",
    capa: "capaDelayReason"
  };

  context.doc.set(fieldByStage[stage], now);
  if (stage === "cont" && input.containmentNotes) context.doc.containmentNotes = input.containmentNotes;
  if (overdue && input.delay) {
    context.doc.set(delayFieldByStage[stage], {
      category: input.delay.category,
      explanation: input.delay.explanation,
      recovery: input.delay.recovery,
      recordedAt: now,
      recordedBy: context.actor.id
    });
  }
  context.doc.status = WORKFLOW_STAGE_STATUS[stage];
  context.doc.workflowLog.push({
    stage: WORKFLOW_STAGE_STATUS[stage],
    at: now,
    by: new Types.ObjectId(context.actor.id),
    byName: context.actor.name,
    notes: input.notes || (overdue ? `Delay: ${input.delay?.category}` : "")
  });
  await context.doc.save();

  await writeAudit({
    actor: user,
    action: stage === "ack" ? "ACKNOWLEDGE" : "STAGE_COMPLETE",
    entity: "Complaint",
    entityId: complaintId,
    after: { stage, at: now.toISOString(), overdue, dueAt: planBefore.find((entry) => entry.stage === stage)?.dueAt }
  });

  if (context.doc.owner) {
    await notify({
      recipients: [context.doc.owner],
      message: `${context.doc.number} moved to ${WORKFLOW_STAGE_STATUS[stage]}`,
      category: "workflow",
      entityType: "Complaint",
      entityId: context.doc._id,
      link: `/complaints/${complaintId}`
    });
  }

  const triggerMap: Record<WorkflowStage, string> = {
    ack: "COMPLAINT_ACKNOWLEDGED",
    cont: "COMPLAINT_CONTAINMENT_COMPLETED",
    rca: "COMPLAINT_RCA_COMPLETED",
    capa: "COMPLAINT_CAPA_ASSIGNED"
  };
  const [owner, department] = await Promise.all([
    context.doc.owner ? User.findById(context.doc.owner).select("name").lean() : null,
    context.doc.responsibleDept ? Department.findById(context.doc.responsibleDept).select("name").lean() : null
  ]);
  const stageRecipients = await resolveRecipients({
    complaintId: context.doc._id,
    targetRoles: ["Complaint Owner", "Coordinator", "Department Head"]
  });
  if (stageRecipients.length > 0) {
    const dueByStage = Object.fromEntries(planBefore.map((entry) => [entry.stage, entry.dueAt]));
    await sendTemplatedEmail({
      triggerEvent: triggerMap[stage],
      recipients: stageRecipients,
      relatedComplaintId: context.doc._id,
      dedupeKey: `complaint-stage:${String(context.doc._id)}:${stage}`,
      data: {
        complaintNumber: context.doc.number,
        acknowledgedBy: context.actor.name,
        ownerName: owner?.name ?? context.actor.name,
        departmentName: department?.name ?? "Not assigned",
        stage: WORKFLOW_STAGE_STATUS[stage],
        containmentDueDate: formatDue(dueByStage.cont),
        rcaDueDate: formatDue(dueByStage.rca),
        capaDueDate: formatDue(dueByStage.capa),
        rootCauseCategory: context.doc.rootCauseCategory || "Not classified",
        rootCauseSummary: context.doc.d4Occurrence || "Not recorded",
        capaCount: String(capaDocs.length),
        assignedTo: owner?.name ?? "Unassigned",
        actionUrl: `/complaints/${complaintId}`
      }
    });
  }

  return context.doc;
}
