import { v2 as cloudinary } from "cloudinary";
import { Types } from "mongoose";
import type { ApiUser } from "@shared/types/api";
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_BYTES, type AttachmentPurpose } from "@shared/constants/domain";
import { buildAttachmentMetadata, sanitizeFilename, validateUpload } from "../domain/upload-rules";
import { Attachment } from "../models/Attachment";
import { getEnv } from "../config/env";
import { businessRuleError, httpError } from "../utils/http";
import { writeAudit } from "./audit.service";

const SAFE_FOLDER = /^[a-zA-Z0-9_-]{1,64}$/;

function configuredCloudinary() {
  const env = getEnv();
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw httpError(503, "Cloudinary is not configured on this environment");
  }
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true
  });
  return { cloudinary, env };
}

function folderFor(purpose: AttachmentPurpose) {
  const suffix = purpose.replace(/[^a-zA-Z0-9_-]/g, "-");
  if (!SAFE_FOLDER.test(suffix)) throw httpError(400, "Invalid upload folder");
  const env = getEnv();
  return `${env.CLOUDINARY_UPLOAD_FOLDER || "onepws-complaint-capa"}/${suffix}`;
}

/**
 * Signed direct upload. The browser talks to Cloudinary with a short lived signature,
 * so the API secret never reaches the client and no file ever passes through the API.
 */
export function createUploadSignature(purpose: AttachmentPurpose) {
  const { cloudinary: client, env } = configuredCloudinary();
  const timestamp = Math.round(Date.now() / 1000);
  const folder = folderFor(purpose);
  const signature = client.utils.api_sign_request({ timestamp, folder }, env.CLOUDINARY_API_SECRET as string);
  return {
    timestamp,
    folder,
    signature,
    apiKey: env.CLOUDINARY_API_KEY as string,
    cloudName: env.CLOUDINARY_CLOUD_NAME as string,
    maxBytes: MAX_UPLOAD_BYTES,
    allowedMimeTypes: [...ALLOWED_UPLOAD_MIME_TYPES]
  };
}

export type ConfirmUploadInput = {
  publicId: string;
  originalFilename: string;
  mimeType: string;
  entityType: string;
  entityId: string;
  purpose: AttachmentPurpose;
  company?: string;
};

/**
 * The client only reports a public id. Size, type and URL are read back from Cloudinary
 * so a tampered client cannot register an oversized or unsupported asset.
 */
export async function confirmUpload(input: ConfirmUploadInput, user: ApiUser | undefined) {
  if (!user) throw httpError(401, "Unauthorized");
  const { cloudinary: client } = configuredCloudinary();
  const folder = folderFor(input.purpose);
  if (!input.publicId.startsWith(`${folder}/`)) {
    throw businessRuleError("This asset does not belong to the declared upload folder", [
      { field: "publicId", message: "Upload the file with the signature issued for this purpose" }
    ]);
  }

  let resource: { public_id?: string; secure_url?: string; resource_type?: string; bytes?: number; width?: number; height?: number };
  try {
    resource = await client.api.resource(input.publicId, { resource_type: "auto" });
  } catch {
    throw httpError(404, "The uploaded asset could not be verified with Cloudinary");
  }

  const issues = validateUpload({
    originalname: input.originalFilename,
    mimetype: input.mimeType,
    size: resource.bytes ?? 0
  });
  if (issues.length > 0) {
    await client.uploader.destroy(input.publicId, { resource_type: resource.resource_type ?? "raw" }).catch(() => undefined);
    throw businessRuleError("This file was rejected", issues);
  }

  const metadata = buildAttachmentMetadata(resource, {
    originalname: input.originalFilename,
    mimetype: input.mimeType,
    size: resource.bytes ?? 0
  });

  const attachment = await Attachment.create({
    ...metadata,
    entityType: input.entityType,
    entityId: new Types.ObjectId(input.entityId),
    purpose: input.purpose,
    company: input.company ? new Types.ObjectId(input.company) : undefined,
    uploadedBy: new Types.ObjectId(user.id),
    uploadedAt: new Date()
  });

  await writeAudit({
    actor: user,
    action: "UPLOAD",
    entity: "Attachment",
    entityId: String(attachment._id),
    after: { filename: metadata.originalFilename, bytes: metadata.bytes, purpose: input.purpose }
  });

  return attachment;
}

export async function listAttachments(entityType: string, entityId: string) {
  if (!Types.ObjectId.isValid(entityId)) throw httpError(400, "Invalid entity id");
  return Attachment.find({ entityType, entityId }).populate("uploadedBy", "name").sort({ createdAt: -1 }).lean();
}

/** Deleting the database record also removes the Cloudinary asset so nothing is orphaned. */
export async function deleteAttachment(attachmentId: string, user: ApiUser | undefined, allowed: boolean) {
  if (!user) throw httpError(401, "Unauthorized");
  if (!allowed) throw httpError(403, "You do not have permission to delete this file");
  if (!Types.ObjectId.isValid(attachmentId)) throw httpError(400, "Invalid attachment id");

  const attachment = await Attachment.findById(attachmentId);
  if (!attachment) throw httpError(404, "Attachment not found");

  const { cloudinary: client } = configuredCloudinary();
  await client.uploader.destroy(attachment.publicId, { resource_type: attachment.resourceType }).catch(() => undefined);
  await Attachment.deleteOne({ _id: attachment._id });

  await writeAudit({
    actor: user,
    action: "DELETE_ATTACHMENT",
    entity: "Attachment",
    entityId: attachmentId,
    before: { filename: attachment.originalFilename, publicId: attachment.publicId }
  });

  return { deleted: true, filename: sanitizeFilename(attachment.originalFilename) };
}
