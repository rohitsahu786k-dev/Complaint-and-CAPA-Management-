import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_BYTES } from "@shared/constants/domain";

export type UploadIssue = { field: string; message: string };

const DANGEROUS_EXTENSIONS = [
  ".exe",
  ".dll",
  ".bat",
  ".cmd",
  ".com",
  ".msi",
  ".scr",
  ".js",
  ".mjs",
  ".vbs",
  ".ps1",
  ".sh",
  ".jar",
  ".php",
  ".html",
  ".htm",
  ".svg"
];

/** Strips path traversal and control characters, then trims to a safe length. */
export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"|?*]/g, "")
    .replace(/^\.+/, "")
    .trim();
  return (cleaned || "file").slice(0, 180);
}

export function validateUpload(file: { originalname: string; mimetype: string; size: number }): UploadIssue[] {
  const issues: UploadIssue[] = [];
  const name = sanitizeFilename(file.originalname);

  if (!name) issues.push({ field: "file", message: "A file name is required" });
  if (DANGEROUS_EXTENSIONS.some((extension) => name.toLowerCase().endsWith(extension))) {
    issues.push({ field: "file", message: "This file type is not allowed" });
  }
  if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.mimetype as (typeof ALLOWED_UPLOAD_MIME_TYPES)[number])) {
    issues.push({ field: "file", message: `Unsupported file type: ${file.mimetype}` });
  }
  if (!file.size || file.size <= 0) {
    issues.push({ field: "file", message: "The uploaded file is empty" });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    issues.push({ field: "file", message: `Maximum upload size is ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB` });
  }
  return issues;
}

export type CloudinaryUploadResult = {
  public_id?: string;
  secure_url?: string;
  resource_type?: string;
  bytes?: number;
  width?: number;
  height?: number;
  format?: string;
};

export type AttachmentMetadata = {
  publicId: string;
  secureUrl: string;
  resourceType: string;
  originalFilename: string;
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
};

/** Only metadata is persisted; the binary always stays in Cloudinary. */
export function buildAttachmentMetadata(
  result: CloudinaryUploadResult,
  file: { originalname: string; mimetype: string; size: number }
): AttachmentMetadata {
  if (!result.public_id || !result.secure_url) {
    throw new Error("Cloudinary did not return a usable asset reference");
  }
  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    resourceType: result.resource_type ?? "raw",
    originalFilename: sanitizeFilename(file.originalname),
    mimeType: file.mimetype,
    bytes: result.bytes ?? file.size,
    width: result.width,
    height: result.height
  };
}
