import { Router } from "express";
import { z } from "zod";
import { ALLOWED_UPLOAD_MIME_TYPES, ATTACHMENT_PURPOSES, type AttachmentPurpose } from "@shared/constants/domain";
import { objectIdSchema } from "@shared/schemas/common";
import { connectDB } from "../config/db";
import { requireUser } from "../middleware/auth";
import { canEditCapa, canEditComplaint, canSeeCompany, isMasterAdmin } from "../domain/rbac";
import { Attachment } from "../models/Attachment";
import { Capa } from "../models/Capa";
import { Company } from "../models/Company";
import { confirmUpload, createUploadSignature, deleteAttachment, listAttachments } from "../services/attachment.service";
import { loadComplaintContext, requireActor } from "../services/complaint.service";
import { toDomainCapa } from "../services/mappers";
import { asyncHandler } from "../utils/async-handler";
import { httpError, ok } from "../utils/http";

export const attachmentRouter = Router();
attachmentRouter.use(requireUser);

type EntityType = "Complaint" | "Capa" | "Company";

const purposeEntity: Record<AttachmentPurpose, EntityType> = {
  "complaint.attachment": "Complaint",
  "d6.document": "Complaint",
  "capa.evidence": "Capa",
  "capa.effectiveness": "Capa",
  "company.logo": "Company"
};

const targetSchema = z.object({
  entityType: z.enum(["Complaint", "Capa", "Company"]),
  entityId: objectIdSchema,
  purpose: z.enum(ATTACHMENT_PURPOSES)
});

async function authorizeTarget(entityType: EntityType, entityId: string, purpose: AttachmentPurpose, reqUser: Express.Request["user"], write: boolean) {
  if (purposeEntity[purpose] !== entityType) throw httpError(400, "The upload purpose does not match the selected entity type");

  if (entityType === "Complaint") {
    const context = await loadComplaintContext(entityId, reqUser);
    if (write && !canEditComplaint(context.actor, context.domain)) throw httpError(403, "You cannot attach files to this complaint");
    return { company: String(context.doc.company) };
  }

  if (entityType === "Capa") {
    const capa = await Capa.findById(entityId);
    if (!capa) throw httpError(404, "CAPA not found");
    const context = await loadComplaintContext(String(capa.complaint), reqUser);
    if (write && !canEditCapa(context.actor, toDomainCapa(capa), context.domain)) {
      throw httpError(403, "You cannot attach files to this CAPA");
    }
    return { company: String(capa.company) };
  }

  const actor = await requireActor(reqUser);
  const company = await Company.findById(entityId).select("_id").lean();
  if (!company) throw httpError(404, "Company not found");
  if (write && !isMasterAdmin(actor)) throw httpError(403, "Only a Master Admin can replace a company logo");
  if (!write && !isMasterAdmin(actor) && !canSeeCompany(actor, entityId)) throw httpError(403, "You do not have access to this company");
  return { company: entityId };
}

attachmentRouter.post(
  "/signature",
  asyncHandler(async (req, res) => {
    const input = targetSchema.parse(req.body);
    await connectDB();
    await authorizeTarget(input.entityType, input.entityId, input.purpose, req.user, true);
    return ok(res, createUploadSignature(input.purpose));
  })
);

attachmentRouter.post(
  "/confirm",
  asyncHandler(async (req, res) => {
    const input = targetSchema
      .extend({
        publicId: z.string().trim().min(1).max(300),
        originalFilename: z.string().trim().min(1).max(255),
        mimeType: z.enum(ALLOWED_UPLOAD_MIME_TYPES)
      })
      .parse(req.body);

    await connectDB();
    const target = await authorizeTarget(input.entityType, input.entityId, input.purpose, req.user, true);
    const attachment = await confirmUpload({ ...input, company: target.company }, req.user);
    return ok(res, { attachment }, 201);
  })
);

attachmentRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z
      .object({ entityType: z.enum(["Complaint", "Capa", "Company"]), entityId: objectIdSchema, purpose: z.enum(ATTACHMENT_PURPOSES).optional() })
      .parse(req.query);
    await connectDB();
    const fallbackPurpose: AttachmentPurpose =
      query.entityType === "Complaint" ? "complaint.attachment" : query.entityType === "Capa" ? "capa.evidence" : "company.logo";
    await authorizeTarget(query.entityType, query.entityId, query.purpose ?? fallbackPurpose, req.user, false);
    return ok(res, { attachments: await listAttachments(query.entityType, query.entityId) });
  })
);

attachmentRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await connectDB();
    const attachment = await Attachment.findById(req.params.id).lean();
    if (!attachment) throw httpError(404, "Attachment not found");

    const purpose = attachment.purpose as AttachmentPurpose;
    const target = await authorizeTarget(attachment.entityType as EntityType, String(attachment.entityId), purpose, req.user, true).catch(() => null);
    let allowed = Boolean(target);
    if (!allowed && String(attachment.uploadedBy) === req.user?.id) allowed = true;
    if (!allowed && isMasterAdmin(await requireActor(req.user))) allowed = true;

    return ok(res, await deleteAttachment(req.params.id, req.user, allowed));
  })
);
