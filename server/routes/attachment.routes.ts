import { Router } from "express";
import { z } from "zod";
import { ALLOWED_UPLOAD_MIME_TYPES, ATTACHMENT_PURPOSES } from "@shared/constants/domain";
import { objectIdSchema } from "@shared/schemas/common";
import { connectDB } from "../config/db";
import { requireUser } from "../middleware/auth";
import { canEditComplaint, isMasterAdmin } from "../domain/rbac";
import { Attachment } from "../models/Attachment";
import { confirmUpload, createUploadSignature, deleteAttachment, listAttachments } from "../services/attachment.service";
import { loadComplaintContext, requireActor } from "../services/complaint.service";
import { asyncHandler } from "../utils/async-handler";
import { httpError, ok } from "../utils/http";

export const attachmentRouter = Router();

attachmentRouter.use(requireUser);

attachmentRouter.post(
  "/signature",
  asyncHandler(async (req, res) => {
    const input = z.object({ purpose: z.enum(ATTACHMENT_PURPOSES) }).parse(req.body);
    return ok(res, createUploadSignature(input.purpose));
  })
);

attachmentRouter.post(
  "/confirm",
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        publicId: z.string().trim().min(1).max(300),
        originalFilename: z.string().trim().min(1).max(255),
        mimeType: z.enum(ALLOWED_UPLOAD_MIME_TYPES),
        entityType: z.enum(["Complaint", "Capa", "Company"]),
        entityId: objectIdSchema,
        purpose: z.enum(ATTACHMENT_PURPOSES),
        company: objectIdSchema.optional()
      })
      .parse(req.body);

    await connectDB();
    // Uploads always attach to something the caller may already edit.
    if (input.entityType === "Complaint") {
      const context = await loadComplaintContext(input.entityId, req.user);
      if (!canEditComplaint(context.actor, context.domain)) throw httpError(403, "You cannot attach files to this complaint");
    } else if (input.entityType === "Company" && !isMasterAdmin(await requireActor(req.user))) {
      throw httpError(403, "Only a Master Admin can replace a company logo");
    }

    const attachment = await confirmUpload(input, req.user);
    return ok(res, { attachment }, 201);
  })
);

attachmentRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z.object({ entityType: z.string().trim().min(1).max(40), entityId: objectIdSchema }).parse(req.query);
    await connectDB();
    if (query.entityType === "Complaint") await loadComplaintContext(query.entityId, req.user);
    return ok(res, { attachments: await listAttachments(query.entityType, query.entityId) });
  })
);

attachmentRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await connectDB();
    const attachment = await Attachment.findById(req.params.id).lean();
    if (!attachment) throw httpError(404, "Attachment not found");

    let allowed = isMasterAdmin(await requireActor(req.user));
    if (!allowed && attachment.entityType === "Complaint") {
      const context = await loadComplaintContext(String(attachment.entityId), req.user);
      allowed = canEditComplaint(context.actor, context.domain);
    }
    if (!allowed && String(attachment.uploadedBy) === req.user?.id) allowed = true;

    return ok(res, await deleteAttachment(req.params.id, req.user, allowed));
  })
);
