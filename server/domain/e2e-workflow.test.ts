import { describe, expect, it } from "vitest";
import { makeActor, makeComplaint, makeCompleteExternalComplaint } from "./fixtures";
import { stageGaps, stageSequenceGaps } from "./workflow";
import {
  isAllowedCapaTransition,
  reviewStateAfterReupload,
  validateCapaStatusChange,
  validateEvidenceReview
} from "./capa-rules";
import { shouldAutoReopenOnLongTerm, validateForClosure } from "./closure";
import { buildSignatureRecord, isFullySigned, validateSignature } from "./signature";
import type { DomainCapa } from "./types";

describe("Complete External Complaint & 8D Workflow Lifecycle", () => {
  it("walks through External complaint D0 through D8, signatures, and closure without skipping steps", () => {
    // 1. Initial Draft Complaint
    const c0 = makeComplaint({
      type: "External",
      acknowledgedAt: undefined,
      containmentAt: undefined,
      rcaAt: undefined,
      capaAssignedAt: undefined,
      closedAt: undefined
    });

    // Stage 1: Acknowledgement gate
    // Requires D0 and D1 team
    expect(stageGaps(c0, [], "ack").length).toBeGreaterThan(0);
    const c1 = {
      ...c0,
      d0: "Immediate customer containment initiated; stock quarantined.",
      d1Team: [{ name: "Amit Verma", role: "Champion", email: "averma@onepws.com" }],
      acknowledgedAt: "2026-05-02T10:00:00.000Z"
    };
    expect(stageGaps(c1, [], "ack")).toHaveLength(0);

    // Sequence check: cannot jump to RCA before containment
    expect(stageSequenceGaps(c1, "rca")[0].field).toContain("cont stage must be completed first");

    // Stage 2: Containment (D3)
    const c2 = {
      ...c1,
      d3Actions: [{ action: "100% sorting of warehouse inventory", resp: "Quality QA", target: "2026-05-04" }],
      containmentAt: "2026-05-03T14:00:00.000Z"
    };
    expect(stageGaps(c2, [], "cont")).toHaveLength(0);

    // Stage 3: RCA (D2, QC tools, 5-Why, 6M+2 root cause)
    const full8d = makeCompleteExternalComplaint();
    const c3 = {
      ...c2,
      ...full8d,
      rcaAt: "2026-05-07T16:00:00.000Z"
    };
    expect(stageGaps(c3, [], "rca")).toHaveLength(0);

    // Stage 4: CAPA Assignment
    const capa1: DomainCapa = {
      id: "capa-101",
      complaintId: c3.id,
      companyId: c3.companyId,
      number: "CMP-2026-00001-CAPA-01",
      type: "Corrective",
      action: "Modify stamping die radius and replace guide pins",
      ownerId: "usr-capa-owner",
      department: "Production",
      dueDate: "2026-05-20",
      status: "Open"
    };

    expect(stageGaps(c3, [capa1], "capa")).toHaveLength(0);
    const c4 = {
      ...c3,
      capaAssignedAt: "2026-05-08T09:00:00.000Z"
    };

    // 5. CAPA Evidence State Machine: Upload -> Reject -> Re-upload -> Accept
    // Initial transition: Open -> In Progress
    expect(isAllowedCapaTransition("Open", "In Progress")).toBe(true);
    let capaState: DomainCapa = { ...capa1, status: "In Progress" };

    // Disallow illegal transition: Open -> Closed directly
    expect(isAllowedCapaTransition("Open", "Closed")).toBe(false);

    // Evidence review rejection requires mandatory remarks
    const rejectWithoutRemarks = validateEvidenceReview("Rejected", "");
    expect(rejectWithoutRemarks.length).toBeGreaterThan(0);

    const rejectWithRemarks = validateEvidenceReview("Rejected", "Torque check sheet missing operator signoff");
    expect(rejectWithRemarks).toHaveLength(0);

    // State after rejection and re-upload returns to Pending review with preserved remarks history
    const reuploadState = reviewStateAfterReupload({
      status: "Rejected",
      remarks: "Torque check sheet missing operator signoff"
    });
    expect(reuploadState?.status).toBe("Pending");
    expect(reuploadState?.remarks).toContain("Torque check sheet missing operator signoff");

    // Acceptance of evidence
    const acceptReview = validateEvidenceReview("Accepted", "Verified by Quality Head");
    expect(acceptReview).toHaveLength(0);

    // Completing CAPA: requires evidence before Close
    const closeWithoutEvidence = validateCapaStatusChange(capaState, "Closed");
    expect(closeWithoutEvidence.length).toBeGreaterThan(0);

    capaState = {
      ...capaState,
      status: "Completed",
      evidence: "Torque audit signed check sheet attached",
      evidenceReview: { status: "Accepted", remarks: "Verified" }
    };

    // 6. Effectiveness verification
    capaState = {
      ...capaState,
      status: "Closed",
      effectiveness: "Effective"
    };

    // 7. Electronic Signatures (Prepared -> Reviewed -> Approved)
    const preparer = makeActor({ id: "usr-preparer", name: "Priya Preparer", roleName: "Department Head" });
    const reviewer = makeActor({ id: "usr-reviewer", name: "Rajesh Reviewer", roleName: "Department Head" });
    const approver = makeActor({ id: "usr-approver", name: "Deepak Approver", roleName: "Quality Head" });

    // Validate prepare
    const prepIssues = validateSignature("prepared", preparer, c4);
    expect(prepIssues).toHaveLength(0);
    const prepSig = buildSignatureRecord(preparer, { designation: "QA Engineer" }, "Prepared D1-D8");

    // Self-review prevention: Preparer cannot sign reviewed
    const selfReviewIssues = validateSignature("reviewed", preparer, {
      ...c4,
      signatures: { prepared: prepSig }
    });
    expect(selfReviewIssues.length).toBeGreaterThan(0);
    expect(selfReviewIssues[0].field).toBe("separationOfDuties");

    const revIssues = validateSignature("reviewed", reviewer, {
      ...c4,
      signatures: { prepared: prepSig }
    });
    expect(revIssues).toHaveLength(0);
    const revSig = buildSignatureRecord(reviewer, { designation: "Plant HOD" }, "Reviewed report");

    const appIssues = validateSignature("approved", approver, {
      ...c4,
      signatures: { prepared: prepSig, reviewed: revSig }
    });
    expect(appIssues).toHaveLength(0);
    const appSig = buildSignatureRecord(approver, { designation: "Quality Head" }, "Approved final 8D");

    const signedComplaint = {
      ...c4,
      signatures: {
        prepared: prepSig,
        reviewed: revSig,
        approved: appSig
      }
    };
    expect(isFullySigned(signedComplaint)).toBe(true);

    // 8. Closure Validation
    const closureGaps = validateForClosure(signedComplaint, [capaState]);
    expect(closureGaps).toHaveLength(0);
  });

  it("automatically reopens closed complaint when effectiveness verification is Not Effective", () => {
    const closedComplaint = makeCompleteExternalComplaint({
      status: "Closed",
      closedAt: "2026-05-30T15:00:00.000Z",
      d7LongTermResult: "Not Sustained"
    });

    const shouldReopen = shouldAutoReopenOnLongTerm(closedComplaint);
    expect(shouldReopen).toBe(true);
  });
});
