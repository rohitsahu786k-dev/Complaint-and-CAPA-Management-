import { describe, expect, it } from "vitest";
import {
  buildAttachmentMetadata,
  sanitizeFilename,
  validateUpload
} from "./upload-rules";
import { MAX_UPLOAD_BYTES } from "@shared/constants/domain";

describe("Upload Safety & Attachment Metadata Engine", () => {
  it("strips path traversal attacks, directory characters, and control characters from filenames", () => {
    expect(sanitizeFilename("../../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("..\\..\\windows\\system32\\cmd.exe")).toBe("cmd.exe");
    expect(sanitizeFilename("invoice\u0000_123.pdf")).toBe("invoice_123.pdf");
    expect(sanitizeFilename("   report:final?.pdf   ")).toBe("reportfinal.pdf");
    expect(sanitizeFilename(".hidden_file.pdf")).toBe("hidden_file.pdf");
  });

  it("rejects dangerous and executable extensions", () => {
    const dangerousNames = [
      "malware.exe",
      "script.bat",
      "exploit.sh",
      "hack.js",
      "payload.vbs",
      "macro.ps1",
      "vector.svg",
      "phishing.html"
    ];

    for (const name of dangerousNames) {
      const issues = validateUpload({
        originalname: name,
        mimetype: "application/octet-stream",
        size: 1024
      });
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((i) => i.message.includes("not allowed"))).toBe(true);
    }
  });

  it("validates approved mime types for documents and images", () => {
    const validFile = {
      originalname: "8d-evidence-checksheet.pdf",
      mimetype: "application/pdf",
      size: 512 * 1024 // 512 KB
    };

    const issues = validateUpload(validFile);
    expect(issues).toHaveLength(0);

    const validImage = {
      originalname: "defect-photo-flange.jpg",
      mimetype: "image/jpeg",
      size: 1.5 * 1024 * 1024
    };
    expect(validateUpload(validImage)).toHaveLength(0);
  });

  it("rejects oversized files exceeding 10 MB limit", () => {
    const oversizedFile = {
      originalname: "giant-video-scan.pdf",
      mimetype: "application/pdf",
      size: MAX_UPLOAD_BYTES + 1024 // > 10 MB
    };

    const issues = validateUpload(oversizedFile);
    expect(issues.some((i) => i.message.includes("Maximum upload size is 10 MB"))).toBe(true);
  });

  it("rejects zero-byte / empty files", () => {
    const emptyFile = {
      originalname: "empty.png",
      mimetype: "image/png",
      size: 0
    };

    const issues = validateUpload(emptyFile);
    expect(issues.some((i) => i.message.includes("empty"))).toBe(true);
  });

  it("extracts structured metadata without storing binary blobs in MongoDB", () => {
    const cloudinaryResponse = {
      public_id: "onepws/evidence/ev_892173",
      secure_url: "https://res.cloudinary.com/mcymctsr/image/upload/v1/ev_892173.pdf",
      resource_type: "raw",
      bytes: 245000,
      format: "pdf"
    };

    const file = {
      originalname: "torque-audit.pdf",
      mimetype: "application/pdf",
      size: 245000
    };

    const metadata = buildAttachmentMetadata(cloudinaryResponse, file);
    expect(metadata.publicId).toBe("onepws/evidence/ev_892173");
    expect(metadata.secureUrl).toBe("https://res.cloudinary.com/mcymctsr/image/upload/v1/ev_892173.pdf");
    expect(metadata.originalFilename).toBe("torque-audit.pdf");
    expect(metadata.bytes).toBe(245000);
    // Explicitly verify binary buffer is NOT part of metadata
    expect((metadata as Record<string, unknown>).buffer).toBeUndefined();
    expect((metadata as Record<string, unknown>).base64).toBeUndefined();
  });
});
