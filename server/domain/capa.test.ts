import { describe, expect, it } from "vitest";
import {
  capaStatusAfterEffectiveness,
  isAllowedCapaTransition,
  reviewStateAfterReupload,
  shouldReopenComplaint,
  validateCapaStatusChange,
  validateEffectivenessVerification,
  validateEvidenceReview
} from "./capa-rules";
import { makeCapa } from "./fixtures";
import { buildAttachmentMetadata, sanitizeFilename, validateUpload } from "./upload-rules";

describe("CAPA state transitions", () => {
  it("allows the forward path and rejects illegal jumps", () => {
    expect(isAllowedCapaTransition("Open", "In Progress")).toBe(true);
    expect(isAllowedCapaTransition("Completed", "Under Verification")).toBe(true);
    expect(isAllowedCapaTransition("Open", "Closed")).toBe(false);
    expect(isAllowedCapaTransition("Closed", "Open")).toBe(false);
  });

  it("refuses to close a CAPA without evidence", () => {
    const capa = makeCapa({ status: "Completed" });
    expect(validateCapaStatusChange(capa, "Closed")[0].field).toBe("evidence");
    expect(validateCapaStatusChange(capa, "Closed", "Photos and revised SOP")).toHaveLength(0);
  });
});

describe("evidence review", () => {
  it("requires remarks on rejection but not on acceptance", () => {
    expect(validateEvidenceReview("Rejected", "")[0].field).toBe("remarks");
    expect(validateEvidenceReview("Rejected", "   ")[0].field).toBe("remarks");
    expect(validateEvidenceReview("Rejected", "Attach the revised drawing")).toHaveLength(0);
    expect(validateEvidenceReview("Accepted", "")).toHaveLength(0);
  });

  it("returns a rejected CAPA to pending on re-upload and keeps the rejection remarks", () => {
    const reset = reviewStateAfterReupload({ status: "Rejected", remarks: "Wrong document" });
    expect(reset?.status).toBe("Pending");
    expect(reset?.remarks).toContain("Wrong document");
    expect(reviewStateAfterReupload({ status: "Accepted" })).toBeNull();
    expect(reviewStateAfterReupload(null)).toBeNull();
  });
});

describe("effectiveness verification", () => {
  it("only accepts a completed CAPA with a method and evidence", () => {
    const open = makeCapa({ status: "Open" });
    expect(validateEffectivenessVerification(open, "Effective", { method: "Audit", evidence: "Report 12" })[0].field).toBe("status");

    const completed = makeCapa({ status: "Completed" });
    const issues = validateEffectivenessVerification(completed, "Effective", {});
    expect(issues.map((issue) => issue.field)).toEqual(["effectivenessEvidence", "verificationMethod"]);
    expect(validateEffectivenessVerification(completed, "Effective", { method: "Audit", evidence: "Report 12" })).toHaveLength(0);
  });

  it("closes an effective CAPA and reopens the complaint for a failed one", () => {
    expect(capaStatusAfterEffectiveness("Effective")).toBe("Closed");
    expect(capaStatusAfterEffectiveness("Not Effective")).toBe("Rejected/Reopened");
    expect(shouldReopenComplaint("Not Effective")).toBe(true);
    expect(shouldReopenComplaint("Effective")).toBe(false);
  });
});

describe("upload validation", () => {
  it("strips traversal segments from a filename", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\temp\\report.pdf")).toBe("report.pdf");
    expect(sanitizeFilename("evidence 2026-05.pdf")).toBe("evidence 2026-05.pdf");
  });

  it("rejects executables, unsupported types, empty files and oversized files", () => {
    expect(validateUpload({ originalname: "payload.exe", mimetype: "application/pdf", size: 100 })[0].message).toContain("not allowed");
    expect(validateUpload({ originalname: "a.zip", mimetype: "application/zip", size: 100 })[0].message).toContain("Unsupported");
    expect(validateUpload({ originalname: "a.pdf", mimetype: "application/pdf", size: 0 })[0].message).toContain("empty");
    expect(validateUpload({ originalname: "a.pdf", mimetype: "application/pdf", size: 11 * 1024 * 1024 })[0].message).toContain("10 MB");
    expect(validateUpload({ originalname: "a.pdf", mimetype: "application/pdf", size: 2048 })).toHaveLength(0);
  });

  it("builds metadata from the Cloudinary response and never stores binary data", () => {
    const metadata = buildAttachmentMetadata(
      { public_id: "folder/abc", secure_url: "https://res.cloudinary.test/abc.pdf", resource_type: "raw", bytes: 2048 },
      { originalname: "../evidence.pdf", mimetype: "application/pdf", size: 2048 }
    );
    expect(metadata).toEqual({
      publicId: "folder/abc",
      secureUrl: "https://res.cloudinary.test/abc.pdf",
      resourceType: "raw",
      originalFilename: "evidence.pdf",
      mimeType: "application/pdf",
      bytes: 2048,
      width: undefined,
      height: undefined
    });
  });

  it("fails when Cloudinary did not return an asset reference", () => {
    expect(() => buildAttachmentMetadata({}, { originalname: "a.pdf", mimetype: "application/pdf", size: 1 })).toThrow();
  });
});
