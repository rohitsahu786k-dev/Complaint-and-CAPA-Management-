import { Types } from "mongoose";
import type { ApiUser } from "@shared/types/api";
import type { CapaCreateInput } from "@shared/schemas/capa";
import { hasPermission, isMasterAdmin } from "../domain/rbac";
import { Attachment } from "../models/Attachment";
import { Capa } from "../models/Capa";
import { Department } from "../models/Department";
import { User } from "../models/User";
import { deleteAttachment } from "./attachment.service";
import { deleteCapa, updateCapa } from "./capa.service";
import { loadComplaintContext } from "./complaint.service";
import { resolveRecipients } from "./email-recipient.service";
import { sendTemplatedEmail } from "./email.service";
import { nextCapaNumber } from "./numbering.service";
import { notify } from "./notification.service";
import { writeAudit } from "./audit.service";
import { httpError } from "../utils/http";

async function userName(userId: string | Types.ObjectId | undefined | null) {
  if (!userId) return "Unassigned";
  const user = await User.findById(userId).select("name").lean();
  return user?.name ?? "Unassigned";
}

async function departmentName(departmentId: string | Types.ObjectId | undefined | null) {
  if (!departmentId) return "Not assigned";
  const department = await Department.findById(departmentId).select("name").lean();
  return department?.name ?? "Not assigned";
}

export async function createCapaHardened(complaintId: string, input: CapaCreateInput, user: ApiUser | undefined) {
  const context = await loadComplaintContext(complaintId, user);
  if (
    !hasPermission(context.actor, "complaint.assign") &&
    !hasPermission(context.actor, "capa.edit.own") &&
    !hasPermission(context.actor, "complaint.edit") &&
    !isMasterAdmin(context.actor)
  ) {
    throw httpError(403, "You do not have permission to add CAPAs");
  }
  if (context.doc.closedAt && !isMasterAdmin(context.actor)) throw httpError(409, "Reopen the complaint before creating a CAPA");

  const sequence = (await Capa.countDocuments({ complaint: context.doc._id })) + 1;
  const number = await nextCapaNumber(context.doc.company, context.doc.number, sequence);
  const department = input.department ?? context.doc.responsibleDept;
  const priority = input.priority ?? context.doc.priority;

  const capa = await Capa.create({
    number,
    complaint: context.doc._id,
    company: context.doc.company,
    sequence,
    type: input.type,
    action: input.action,
    owner: input.owner,
    department,
    priority,
    dueDate: input.dueDate,
    status: input.status,
    evidence: input.evidence
  });

  const [ownerLabel, departmentLabel] = await Promise.all([userName(capa.owner), departmentName(capa.department)]);
  await writeAudit({
    actor: user,
    action: "ASSIGN",
    entity: "Capa",
    entityId: String(capa._id),
    after: { number: capa.number, owner: String(capa.owner), ownerName: ownerLabel, department: departmentLabel, dueDate: capa.dueDate }
  });

  if (capa.owner) {
    await notify({
      recipients: [capa.owner],
      message: `CAPA ${capa.number} assigned to you (due ${new Date(capa.dueDate).toISOString().slice(0, 10)})`,
      category: "capa",
      entityType: "Capa",
      entityId: capa._id,
      link: `/complaints/${complaintId}`
    });
  }

  const recipients = await resolveRecipients({ capaId: capa._id, targetRoles: ["CAPA Owner", "Department Head"] });
  if (recipients.length > 0) {
    await sendTemplatedEmail({
      triggerEvent: "CAPA_ASSIGNED",
      recipients,
      relatedCapaId: capa._id,
      relatedComplaintId: context.doc._id,
      data: {
        capaNumber: capa.number,
        capaType: capa.type,
        capaTitle: capa.action,
        complaintNumber: context.doc.number,
        departmentName: departmentLabel,
        assignedTo: ownerLabel,
        targetDate: new Date(capa.dueDate).toLocaleDateString("en-IN"),
        actionUrl: `/complaints/${complaintId}`
      }
    });
  }

  return capa;
}

export async function updateCapaHardened(
  capaId: string,
  input: Partial<CapaCreateInput> & { completedAt?: Date; delayReason?: string },
  user: ApiUser | undefined
) {
  const before = await Capa.findById(capaId).select("owner status number complaint dueDate action").lean();
  if (!before) throw httpError(404, "CAPA not found");

  const capa = await updateCapa(capaId, input, user);
  const oldOwner = before.owner ? String(before.owner) : "";
  const newOwner = capa.owner ? String(capa.owner) : "";

  if (newOwner && newOwner !== oldOwner) {
    const [oldOwnerLabel, newOwnerLabel, deptLabel] = await Promise.all([
      userName(oldOwner),
      userName(newOwner),
      departmentName(capa.department)
    ]);
    await notify({
      recipients: [new Types.ObjectId(newOwner)],
      message: `CAPA ${capa.number} has been reassigned to you`,
      category: "capa",
      entityType: "Capa",
      entityId: capa._id,
      link: `/complaints/${String(capa.complaint)}`
    });
    const recipients = await resolveRecipients({ capaId: capa._id, targetRoles: ["CAPA Owner", "Department Head"] });
    if (recipients.length > 0) {
      await sendTemplatedEmail({
        triggerEvent: "CAPA_REASSIGNED",
        recipients,
        relatedCapaId: capa._id,
        relatedComplaintId: capa.complaint,
        data: {
          capaNumber: capa.number,
          capaTitle: capa.action,
          departmentName: deptLabel,
          previousOwner: oldOwnerLabel,
          assignedTo: newOwnerLabel,
          targetDate: new Date(capa.dueDate).toLocaleDateString("en-IN"),
          actionUrl: `/complaints/${String(capa.complaint)}`
        }
      });
    }
  }

  const completedNow = before.status !== capa.status && (capa.status === "Completed" || capa.status === "Closed");
  if (completedNow) {
    const recipients = await resolveRecipients({
      capaId: capa._id,
      targetRoles: ["CAPA Owner", "Department Head", "Quality Head"]
    });
    if (recipients.length > 0) {
      await sendTemplatedEmail({
        triggerEvent: "CAPA_COMPLETED",
        recipients,
        relatedCapaId: capa._id,
        relatedComplaintId: capa.complaint,
        dedupeKey: `capa-completed:${String(capa._id)}:${capa.status}`,
        data: {
          capaNumber: capa.number,
          capaTitle: capa.action,
          status: capa.status,
          completedAt: (capa.completedAt ?? new Date()).toLocaleDateString("en-IN"),
          actionUrl: `/complaints/${String(capa.complaint)}`
        }
      });
    }
  }

  return capa;
}

export async function deleteCapaCascade(capaId: string, user: ApiUser | undefined) {
  const capa = await Capa.findById(capaId).select("_id number complaint").lean();
  if (!capa) throw httpError(404, "CAPA not found");
  const attachments = await Attachment.find({ entityType: "Capa", entityId: capa._id }).select("_id").lean();

  for (const attachment of attachments) {
    await deleteAttachment(String(attachment._id), user, true);
  }

  const result = await deleteCapa(capaId, user);
  if (attachments.length > 0) {
    await writeAudit({
      actor: user,
      action: "DELETE_ATTACHMENT",
      entity: "Capa",
      entityId: capaId,
      metadata: { deletedAttachments: attachments.length }
    });
  }
  return { ...result, removedAttachments: attachments.length };
}
