import { Types } from "mongoose";
import type { ApiUser } from "@shared/types/api";
import type { CapaCreateInput } from "@shared/schemas/capa";
import { Attachment } from "../models/Attachment";
import { Capa } from "../models/Capa";
import { deleteAttachment } from "./attachment.service";
import { deleteCapa, updateCapa } from "./capa.service";
import { resolveRecipients } from "./email-recipient.service";
import { sendTemplatedEmail } from "./email.service";
import { notify } from "./notification.service";
import { writeAudit } from "./audit.service";
import { httpError } from "../utils/http";

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
          previousOwner: oldOwner || "Unassigned",
          assignedTo: newOwner,
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
  await writeAudit({
    actor: user,
    action: "DELETE_ATTACHMENT",
    entity: "Capa",
    entityId: capaId,
    metadata: { deletedAttachments: attachments.length }
  });
  return { ...result, removedAttachments: attachments.length };
}
