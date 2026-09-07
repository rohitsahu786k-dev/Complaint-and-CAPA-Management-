import { Router } from "express";
import { z } from "zod";
import { paginate } from "@shared/schemas/common";
import {
  closeComplaintSchema,
  complaintCreateSchema,
  complaintListQuerySchema,
  eightDSchema,
  internalInvestigationSchema,
  noteCreateSchema,
  overallEffectivenessSchema,
  reopenComplaintSchema,
  repeatReviewSchema,
  revokeSignatureSchema,
  signComplaintSchema,
  stageCompleteSchema
} from "@shared/schemas/complaint";
import { connectDB } from "../config/db";
import { requirePermission, requireUser } from "../middleware/auth";
import { canEditComplaint } from "../domain/rbac";
import { ComplaintNote } from "../models/ComplaintNote";
import { AuditLog } from "../models/AuditLog";
import {
  closeComplaint,
  completeStage,
  createComplaint,
  deleteComplaint,
  getComplaintDetail,
  listComplaints,
  loadComplaintContext,
  reopenComplaint,
  reviewRepeatLinkage,
  saveInvestigation,
  saveOverallEffectiveness,
  revokeSignature,
  signComplaint
} from "../services/complaint.service";
import { writeAudit } from "../services/audit.service";
import { asyncHandler } from "../utils/async-handler";
import { httpError, ok } from "../utils/http";

export const complaintRouter = Router();

complaintRouter.use(requireUser);

complaintRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = complaintListQuerySchema.parse(req.query);
    await connectDB();
    const { rows, total } = await listComplaints(query, req.user);
    return ok(res, paginate(rows, total, query));
  })
);

complaintRouter.post(
  "/",
  requirePermission("complaint.create"),
  asyncHandler(async (req, res) => {
    const input = complaintCreateSchema.parse(req.body);
    await connectDB();
    const complaint = await createComplaint(input, req.user);
    return ok(res, { complaint }, 201);
  })
);

complaintRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    await connectDB();
    return ok(res, await getComplaintDetail(req.params.id, req.user));
  })
);

complaintRouter.post(
  "/:id/stage",
  asyncHandler(async (req, res) => {
    const input = stageCompleteSchema.parse(req.body);
    await connectDB();
    const complaint = await completeStage(req.params.id, input, req.user);
    return ok(res, { complaint });
  })
);

complaintRouter.patch(
  "/:id/8d",
  asyncHandler(async (req, res) => {
    const input = eightDSchema.parse(req.body);
    await connectDB();
    const context = await loadComplaintContext(req.params.id, req.user);
    if (context.doc.type !== "External") throw httpError(400, "The 8D report only applies to external complaints");
    const complaint = await saveInvestigation(req.params.id, input as Record<string, unknown>, req.user);
    return ok(res, { complaint });
  })
);

complaintRouter.patch(
  "/:id/internal",
  asyncHandler(async (req, res) => {
    const input = internalInvestigationSchema.parse(req.body);
    await connectDB();
    const context = await loadComplaintContext(req.params.id, req.user);
    if (context.doc.type !== "Internal") throw httpError(400, "The internal investigation only applies to internal complaints");
    const complaint = await saveInvestigation(req.params.id, input as Record<string, unknown>, req.user);
    return ok(res, { complaint });
  })
);

complaintRouter.post(
  "/:id/signatures",
  asyncHandler(async (req, res) => {
    const input = signComplaintSchema.parse(req.body);
    await connectDB();
    const complaint = await signComplaint(req.params.id, input.role, input.notes, req.user);
    return ok(res, { complaint });
  })
);

complaintRouter.delete(
  "/:id/signatures",
  asyncHandler(async (req, res) => {
    const input = revokeSignatureSchema.parse(req.body);
    await connectDB();
    const complaint = await revokeSignature(req.params.id, input.role, input.reason, req.user);
    return ok(res, { complaint });
  })
);

complaintRouter.post(
  "/:id/close",
  requirePermission("complaint.close"),
  asyncHandler(async (req, res) => {
    const input = closeComplaintSchema.parse(req.body);
    await connectDB();
    const complaint = await closeComplaint(req.params.id, input, req.user);
    return ok(res, { complaint });
  })
);

complaintRouter.post(
  "/:id/reopen",
  asyncHandler(async (req, res) => {
    const input = reopenComplaintSchema.parse(req.body);
    await connectDB();
    const complaint = await reopenComplaint(req.params.id, input.reason, req.user);
    return ok(res, { complaint });
  })
);

complaintRouter.post(
  "/:id/repeat-review",
  asyncHandler(async (req, res) => {
    const input = repeatReviewSchema.parse(req.body);
    await connectDB();
    const complaint = await reviewRepeatLinkage(req.params.id, input, req.user);
    return ok(res, { complaint });
  })
);

complaintRouter.post(
  "/:id/effectiveness",
  asyncHandler(async (req, res) => {
    const input = overallEffectivenessSchema.parse(req.body);
    await connectDB();
    const complaint = await saveOverallEffectiveness(req.params.id, input, req.user);
    return ok(res, { complaint });
  })
);

complaintRouter.get(
  "/:id/notes",
  asyncHandler(async (req, res) => {
    await connectDB();
    await loadComplaintContext(req.params.id, req.user);
    const notes = await ComplaintNote.find({ complaint: req.params.id }).sort({ createdAt: -1 }).lean();
    return ok(res, { notes });
  })
);

complaintRouter.post(
  "/:id/notes",
  asyncHandler(async (req, res) => {
    const input = noteCreateSchema.parse(req.body);
    await connectDB();
    const context = await loadComplaintContext(req.params.id, req.user);
    const note = await ComplaintNote.create({
      complaint: context.doc._id,
      company: context.doc.company,
      kind: input.kind,
      referenceDate: input.referenceDate,
      content: input.content,
      createdBy: context.actor.id,
      createdByName: context.actor.name
    });
    await writeAudit({
      actor: req.user,
      action: "CREATE",
      entity: "ComplaintNote",
      entityId: String(note._id),
      after: { kind: note.kind }
    });
    return ok(res, { note }, 201);
  })
);

complaintRouter.delete(
  "/:id/notes/:noteId",
  asyncHandler(async (req, res) => {
    await connectDB();
    const context = await loadComplaintContext(req.params.id, req.user);
    const note = await ComplaintNote.findOne({ _id: req.params.noteId, complaint: context.doc._id });
    if (!note) throw httpError(404, "Note not found");
    const isAuthor = String(note.createdBy) === context.actor.id;
    if (!isAuthor && !canEditComplaint(context.actor, context.domain)) {
      throw httpError(403, "You can only delete your own notes");
    }
    await ComplaintNote.deleteOne({ _id: note._id });
    await writeAudit({ actor: req.user, action: "DELETE", entity: "ComplaintNote", entityId: String(note._id) });
    return ok(res, { deleted: true });
  })
);

complaintRouter.get(
  "/:id/audit",
  asyncHandler(async (req, res) => {
    await connectDB();
    await loadComplaintContext(req.params.id, req.user);
    const entries = await AuditLog.find({ entityId: req.params.id }).sort({ createdAt: -1 }).limit(200).lean();
    return ok(res, { entries });
  })
);

complaintRouter.delete(
  "/:id",
  requirePermission("complaint.delete"),
  asyncHandler(async (req, res) => {
    const input = z.object({ confirmation: z.string().trim().min(1) }).parse(req.body);
    await connectDB();
    return ok(res, await deleteComplaint(req.params.id, input.confirmation, req.user));
  })
);
