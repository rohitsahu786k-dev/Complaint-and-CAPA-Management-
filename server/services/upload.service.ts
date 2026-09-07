import { v2 as cloudinary } from "cloudinary";
import { getEnv } from "../config/env";
import { httpError } from "../utils/http";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const SAFE_FOLDER_SUFFIX = /^[a-zA-Z0-9_-]{1,64}$/;

export async function uploadBuffer(input: { buffer: Buffer; mimeType: string; folderSuffix: string }) {
  const env = getEnv();
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw httpError(400, "Cloudinary is not configured");
  }
  if (input.buffer.byteLength > MAX_UPLOAD_BYTES) throw httpError(400, "File is larger than 10 MB");
  if (!SAFE_FOLDER_SUFFIX.test(input.folderSuffix)) throw httpError(400, "Invalid upload folder");

  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET
  });

  const folder = `${env.CLOUDINARY_UPLOAD_FOLDER || "onepws-complaint-capa"}/${input.folderSuffix}`;
  return new Promise<{ secureUrl: string; publicId: string; sizeBytes: number }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder, resource_type: "auto" }, (error, result) => {
      if (error || !result) reject(httpError(400, "Upload failed"));
      else resolve({ secureUrl: result.secure_url, publicId: result.public_id, sizeBytes: result.bytes ?? input.buffer.byteLength });
    });
    stream.end(input.buffer);
  });
}
