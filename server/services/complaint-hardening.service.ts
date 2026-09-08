import { Types } from "mongoose";
import type { ApiUser } from "@shared/types/api";
import type { EightDInput } from "@shared/schemas/complaint";
import { canEditComplaint, hasPermission, isMasterAdmin } from "../domain/rbac";
import { shouldAutoReopenOnLongTerm } from "../domain/closure";
import { computeActionTargetDate } from "../domain/tat";
import { Attachment } from "../models/Attachment";
import { Capa } from "../models/Capa";
import { Complaint } from "../models/Complaint";
import { ComplaintNote } from "../models/ComplaintNote";
import { Department } from "../models/Department";
import { Employee } from "../models/Employee";
import { Notification } from "../models/Notification";
import { Priority } from "../models/masters";
import { User } from "../models/User";
import { deleteAttachment } from "./attachment.service";
import { writeAudit } from "./audit.service";
import { resolveTatConfig } from "./config.service";
import { resolveRecipients } from "./email-recipient.service";
import { sendTemplatedEmail } from "./email.service";
import { getComplaintDetail, loadComplaintContext, reopenComplaint } from "./complaint.service";
import { toDomainComplaint } from "./mappers";
import { notify } from "./notification.service";
import { businessRuleError, httpError } from "../utils/http";

type ActionRow = {
  action?: string;
  resp?: string;
  target?: string;
  targetAuto?: boolean;
  status?: string;
  remarks?: string;
  ctqImpact?: string;
  customerApproval?: string;
};

function withAutomaticTarget(rows: unknown, target: string): ActionRow[] | undefined {
  if (!Array.isArray(rows)) return undefined;
  return rows.map((row) => ({ ...(row as ActionRow), target, targetAuto: true }));
}

function snapshotFields(source: Record<string, unknown>, keys: string[]) {
  return keys.reduce<Record<string, unknown>>((snapshot, key) => {
    snapshot[key] = source[key];
    return snapshot;
  }, {});
}

async function hydrateTeamMembers(team: EightDInput["d1Team"]) {
  if (!team) return team;
  const employeeIds = team.map((member) => member.employee).filter(Boolean) as string[];
  const employees = await Employee.find({ _id: { $in: employeeIds } })
    .populate("department", "name")
    .lean();
  const byId = new Map(employees.map((employee) => [String(employee._id), employee]));

  return team.map((member) => {
    if (!member.employee) return member;
    const employee = byId.get(String(member.employee));
    if (!employee) return member;
    const department = employee.department as unknown as { name?: string } | null;
    return {
      ...member,
      name: employee.name,
      designation: employee.designation ?? "",
      email: employee.email ?? "",
      dept: department?.name ?? member.dept ?? ""
    };
  });
}

export async function getHardenedComplaintDetail(complaintId: string, user: ApiUser | undefined) {
  const detail = await getComplaintDetail(complaintId, user);
  const context = await loadComplaintContext(complaintId, user);
  const tatConfig = await resolveTatConfig(context.doc.company);
  const targetDates = {
    d3: computeActionTargetDate(context.domain, "d3", tatConfig),
    d5: computeActionTargetDate(context.domain, "d5", tatConfig),
    d6: computeActionTargetDate(context.domain, "d6", tatConfig)
  };

  const [owner, priority, responsibleDept, internalDept, againstDept] = await Promise.all([
    context.doc.owner ? User.findById(context.doc.owner).select("name username email").lean() : null,
    context.doc.priority ? Priority.findById(context.doc.priority).select("name color").lean() : null,
    context.doc.responsibleDept ? Department.findById(context.doc.responsibleDept).select("name").lean() : null,
    context.doc.internalDept ? Department.findById(context.doc.internalDept).select("name").lean() : null,
    context.doc.againstDept ? Department.findById(context.doc.againstDept).select("name").lean() : null
  ]);

  return {
    ...detail,
    targetDates,
    resolved: {
      owner: owner ? { _id: String(owner._id), name: owner.name, username: owner.username, email: owner.email ?? "" } : null,
      priority: priority ? { _id: String(priority._id), name: priority.name, color: priority.color } : null,
      responsibleDept: responsibleDept ? { _id: String(responsibleDept._id), name: responsibleDept.name } : null,
      internalDept: internalDept ? { _id: String(internalDept._id), name: internalDept.name } : null,
      againstDept: againstDept ? { _id: String(againstDept._id), name: againstDept.name } : null
    }
  };
}

export async function saveEightDHardened(complaintId: string, input: EightDInput, user: ApiUser | undefined) {
  const context = await loadComplaintContext(complaintId, user);
  if (context.doc.type !== "External") throw httpError(400, "The 8D report only applies to external complaints");
  if (!canEditComplaint(context.actor, context.domain)) throw httpError(403, "You do not have permission to edit this complaint");
  if (context.doc.closedAt && !isMasterAdmin(context.actor)) {
    throw httpError(409, "This complaint is closed. Reopen it before making further changes.");
  }

  const tatConfig = await resolveTatConfig(context.doc.company);
  const patch: Record<string, unknown> = { ...input };
  const d3Target = computeActionTargetDate(context.domain, "d3", tatConfig);
  const d5Target = computeActionTargetDate(context.domain, "d5", tatConfig);
  const d6Target = computeActionTargetDate(context.domain, "d6", tatConfig);

  if (input.d1Team) patch.d1Team = await hydrateTeamMembers(input.d1Team);
  if (input.d3Actions) patch.d3Actions = withAutomaticTarget(input.d3Actions, d3Target);
  if (input.d5Occurrence) patch.d5Occurrence = withAutomaticTarget(input.d5Occurrence, d5Target);
  if (input.d5Escape) patch.d5Escape = withAutomaticTarget(input.d5Escape, d5Target);
  if (input.d5Systemic) patch.d5Systemic = withAutomaticTarget(input.d5Systemic, d5Target);
  if (input.d6Verify) patch.d6Verify = withAutomaticTarget(input.d6Verify, d6Target);

  const keys = Object.keys(patch);
  const beforeObject = context.doc.toObject() as unknown as Record<string, unknown>;
  const before = snapshotFields(beforeObject, keys);
  context.doc.set(patch);
  await context.doc.save();
  const afterObject = context.doc.toObject() as unknown as Record<string, unknown>;

  await writeAudit({
    actor: user,
    action: "UPDATE",
    entity: "Complaint",
    entityId: complaintId,
    before,
    after: snapshotFields(afterObject, keys),
    metadata: { section: "8D", targetDates: { d3: d3Target, d5: d5Target, d6: d6Target } }
  });

  if (shouldAutoReopenOnLongTerm(toDomainComplaint(context.doc, context.domain.priorityMultiplier))) {
    await reopenComplaint(complaintId, "D7 long-term effectiveness marked Not Sustained", user, { system: true });
  }

  return Complaint.findById(complaintId);
}

export async function assignComplaintOwner(complaintId: string, ownerId: string, user: ApiUser | undefined) {
  const context = await loadComplaintContext(complaintId, user);
  if (!hasPermission(context.actor, "complaint.assign") && !isMasterAdmin(context.actor)) {
    throw httpError(403, "You do not have permission to assign complaint owners");
  }
  if (context.doc.closedAt && !isMasterAdmin(context.actor)) {
    throw httpError(409, "Reopen the complaint before changing its owner");
  }
  if (!Types.ObjectId.isValid(ownerId)) throw httpError(400, "Invalid owner id");

  const nextOwner = await User.findOne({ _id: ownerId, active: true }).populate("role").lean();
  if (!nextOwner) throw httpError(404, "The selected owner is not an active portal user");
  const ownerCompanies = (nextOwner.companyIds ?? []).map((id) => String(id));
  const role = nextOwner.role as unknown as { permissions?: string[] } | null;
  const canSeeAllCompanies = Boolean(role?.permissions?.includes("*") || role?.permissions?.includes("view.all"));
  const companyId = String(context.doc.company);
  if (!canSeeAllCompanies && !ownerCompanies.includes(companyId)) {
    throw businessRuleError("The selected owner is outside this complaint company", [
      { field: "owner", section: "Assignment", message: "Choose an active user assigned to this company" }
    ]);
  }

  const previousOwnerId = context.doc.owner ? String(context.doc.owner) : "";
  if (previousOwnerId === ownerId) return context.doc;
  const previousOwner = previousOwnerId ? await User.findById(previousOwnerId).select("name email").lean() : null;

  context.doc.owner = new Types.ObjectId(ownerId);
  context.doc.workflowLog.push({
    stage: previousOwnerId ? "Owner Reassigned" : "Owner Assigned",
    at: new Date(),
    by: new Types.ObjectId(context.actor.id),
    byName: context.actor.name,
    notes: `${previousOwner?.name ?? "Unassigned"} -> ${nextOwner.name}`
  });
  await context.doc.save();

  await writeAudit({
    actor: user,
    action: "ASSIGN",
    entity: "Complaint",
    entityId: complaintId,
    before: { owner: previousOwnerId, ownerName: previousOwner?.name ?? "" },
    after: { owner: ownerId, ownerName: nextOwner.name }
  });

  await notify({
    recipients: [new Types.ObjectId(ownerId)],
    message: `Complaint ${context.doc.number} has been assigned to you`,
    category: "complaint",
    entityType: "Complaint",
    entityId: context.doc._id,
    link: `/complaints/${complaintId}`
  });

  const recipients = await resolveRecipients({ complaintId: context.doc._id, targetRoles: ["Complaint Owner"] });
  if (recipients.length > 0) {
    await sendTemplatedEmail({
      triggerEvent: previousOwnerId ? "COMPLAINT_REASSIGNED" : "COMPLAINT_ASSIGNED",
      recipients,
      relatedComplaintId: context.doc._id,
      data: {
        complaintNumber: context.doc.number,
        assignedTo: nextOwner.name,
        previousOwner: previousOwner?.name ?? "Unassigned",
        assignedBy: context.actor.name,
        actionUrl: `/complaints/${complaintId}`
      }
    });
  }

  return context.doc;
}

export async function deleteComplaintCascade(complaintId: string, confirmation: string, user: ApiUser | undefined) {
  const context = await loadComplaintContext(complaintId, user);
  if (!isMasterAdmin(context.actor)) throw httpError(403, "Only a Master Admin can delete a complaint");
  if (confirmation !== context.doc.number) {
    throw businessRuleError("Deletion was not confirmed", [
      { field: "confirmation", message: "Type the exact complaint number to confirm deletion" }
    ]);
  }

  const capas = await Capa.find({ complaint: context.doc._id }).select("_id number").lean();
  const capaIds = capas.map((capa) => capa._id);
  const attachmentFilter = {
    $or: [
      { entityType: "Complaint", entityId: context.doc._id },
      ...(capaIds.length > 0 ? [{ entityType: "Capa", entityId: { $in: capaIds } }] : [])
    ]
  };
  const attachments = await Attachment.find(attachmentFilter).select("_id").lean();

  for (const attachment of attachments) {
    await deleteAttachment(String(attachment._id), user, true);
  }

  await Promise.all([
    Capa.deleteMany({ complaint: context.doc._id }),
    ComplaintNote.deleteMany({ complaint: context.doc._id }),
    Notification.deleteMany({ entityId: { $in: [context.doc._id, ...capaIds] } })
  ]);

  const snapshot = {
    number: context.doc.number,
    type: context.doc.type,
    company: String(context.doc.company),
    capaCount: capas.length,
    attachmentCount: attachments.length
  };
  await Complaint.deleteOne({ _id: context.doc._id });
  await writeAudit({ actor: user, action: "DELETE", entity: "Complaint", entityId: complaintId, before: snapshot });

  return { deleted: true, number: context.doc.number, removedCapas: capas.length, removedAttachments: attachments.length };
}
