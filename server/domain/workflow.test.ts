import { describe, expect, it } from "vitest";
import { shouldAutoReopenOnLongTerm, validateForClosure } from "./closure";
import { makeActor, makeCapa, makeComplaint, makeCompleteExternalComplaint } from "./fixtures";
import { buildSignatureRecord, isFullySigned, rolesInvalidatedBy, validateRevocation, validateSignature } from "./signature";
import { delayGaps, stageGaps, stageSequenceGaps } from "./workflow";
import { DEFAULT_DELAY_REASONS } from "@shared/constants/domain";

const reasons = [...DEFAULT_DELAY_REASONS];

describe("external workflow gates", () => {
  it("blocks acknowledgement until D0 and a D1 team exist", () => {
    const gaps = stageGaps(makeComplaint(), [], "ack");
    expect(gaps.map((gap) => gap.section)).toEqual(["D0", "D1"]);
  });

  it("blocks containment until D3 rows are complete", () => {
    const incomplete = makeComplaint({ d3Actions: [{ action: "Sort stock" }] });
    expect(stageGaps(incomplete, [], "cont")[0].field).toContain("missing responsibility");
    const complete = makeComplaint({ d3Actions: [{ action: "Sort stock", resp: "QA", target: "2026-05-04" }] });
    expect(stageGaps(complete, [], "cont")).toHaveLength(0);
  });

  it("requires D2, QC tools, three 5-Why chains and all three root causes before RCA", () => {
    const gaps = stageGaps(makeComplaint(), [], "rca");
    const fields = gaps.map((gap) => gap.field).join(" | ");
    expect(fields).toContain("What is the problem");
    expect(fields).toContain("QC tool");
    expect(fields).toContain("occurrence chain");
    expect(fields).toContain("Root cause (systemic)");
  });

  it("accepts RCA once every requirement is present", () => {
    expect(stageGaps(makeCompleteExternalComplaint(), [], "rca")).toHaveLength(0);
  });

  it("requires at least one complete CAPA before the CAPA stage", () => {
    expect(stageGaps(makeComplaint(), [], "capa")[0].field).toContain("At least one CAPA");
    const incomplete = makeCapa({ dueDate: undefined });
    expect(stageGaps(makeComplaint(), [incomplete], "capa")[0].field).toContain("missing owner");
    expect(stageGaps(makeComplaint(), [makeCapa()], "capa")).toHaveLength(0);
  });
});

describe("internal workflow gates", () => {
  it("uses the reduced single-chain investigation instead of the full 8D", () => {
    const internal = makeComplaint({ type: "Internal" });
    const gaps = stageGaps(internal, [], "rca");
    const fields = gaps.map((gap) => gap.field).join(" | ");
    expect(fields).toContain("Problem statement");
    expect(fields).toContain("5-Why chain");
    expect(fields).not.toContain("QC tool");
    expect(fields).not.toContain("escape");
  });

  it("does not demand a D1 team for an internal acknowledgement", () => {
    const internal = makeComplaint({ type: "Internal", d0: "Line stopped" });
    expect(stageGaps(internal, [], "ack")).toHaveLength(0);
  });

  it("passes once the internal investigation is filled in", () => {
    const internal = makeComplaint({
      type: "Internal",
      d2: { what: "Wrong panel issued" },
      fiveWhy: { singleChain: ["Wrong panel", "Wrong bin", "No label"] },
      d4Occurrence: "Bin labelling missing"
    });
    expect(stageGaps(internal, [], "rca")).toHaveLength(0);
  });
});

describe("stage sequencing and delay capture", () => {
  it("refuses to complete a stage twice", () => {
    const acked = makeComplaint({ acknowledgedAt: "2026-05-01T06:00:00.000Z" });
    expect(stageSequenceGaps(acked, "ack")[0].field).toBe("Stage already completed");
  });

  it("refuses to skip an earlier stage", () => {
    expect(stageSequenceGaps(makeComplaint(), "rca")).toHaveLength(2);
  });

  it("requires a configured reason and an explanation when a stage is late", () => {
    expect(delayGaps(false, undefined, reasons)).toHaveLength(0);
    expect(delayGaps(true, undefined, reasons)).toHaveLength(2);
    expect(delayGaps(true, { category: "Made up reason", explanation: "late" }, reasons)[0].hint).toContain("not an active delay reason");
    expect(delayGaps(true, { category: "Customer dependency", explanation: "Awaiting site access" }, reasons)).toHaveLength(0);
  });
});

describe("closure validation", () => {
  const signed = {
    prepared: buildSignatureRecord(makeActor({ id: "u1" }), {}, ""),
    reviewed: buildSignatureRecord(makeActor({ id: "u2" }), {}, ""),
    approved: buildSignatureRecord(makeActor({ id: "u3" }), {}, "")
  };

  it("lists every missing item for an empty external complaint", () => {
    const gaps = validateForClosure(makeComplaint(), []);
    expect(gaps.length).toBeGreaterThan(10);
    expect(gaps.some((gap) => gap.section === "Workflow")).toBe(true);
    expect(gaps.some((gap) => gap.section === "Signatures")).toBe(true);
  });

  it("still blocks closure when only the signatures are missing", () => {
    const gaps = validateForClosure(makeCompleteExternalComplaint(), [makeCapa()]);
    expect(gaps.every((gap) => gap.section === "Signatures")).toBe(true);
    expect(gaps).toHaveLength(3);
  });

  it("passes when the 8D, a CAPA and all three signatures are present", () => {
    const complaint = makeCompleteExternalComplaint({ signatures: signed });
    expect(validateForClosure(complaint, [makeCapa()])).toHaveLength(0);
  });

  it("requires a justification for a D6 document marked NA", () => {
    const complaint = makeCompleteExternalComplaint({
      signatures: signed,
      d6DocsList: [{ docType: "Drawing", status: "NA", naJustification: "no" }]
    });
    expect(validateForClosure(complaint, [makeCapa()])[0].field).toContain("NA justification");
  });

  it("requires revision details for a D6 document marked attached", () => {
    const complaint = makeCompleteExternalComplaint({
      signatures: signed,
      d6DocsList: [{ docType: "Drawing", status: "Attached", attachment: "att-1" }]
    });
    const fields = validateForClosure(complaint, [makeCapa()]).map((gap) => gap.field);
    expect(fields).toContain("Drawing revision");
    expect(fields).toContain("Drawing approver");
  });

  it("reopens a closed complaint when the long-term review is not sustained", () => {
    expect(shouldAutoReopenOnLongTerm({ status: "Closed", d7LongTermResult: "Not Sustained" })).toBe(true);
    expect(shouldAutoReopenOnLongTerm({ status: "Closed", d7LongTermResult: "Sustained" })).toBe(false);
    expect(shouldAutoReopenOnLongTerm({ status: "Open", d7LongTermResult: "Not Sustained" })).toBe(false);
  });
});

describe("digital signatures", () => {
  const complaint = { companyId: "company-1", signatures: {}, closedAt: null };
  const coordinator = makeActor({ id: "u1", roleName: "Complaint Coordinator" });
  const head = makeActor({ id: "u2", roleName: "Department Head" });
  const quality = makeActor({ id: "u3", roleName: "Quality Head" });

  it("enforces prepared then reviewed then approved", () => {
    expect(validateSignature("reviewed", head, complaint)[0].field).toBe("sequence");
    expect(validateSignature("approved", quality, complaint)[0].field).toBe("sequence");
    expect(validateSignature("prepared", coordinator, complaint)).toHaveLength(0);
  });

  it("blocks a role that is not allowed to sign at that stage", () => {
    expect(validateSignature("reviewed", coordinator, complaint)[0].field).toBe("role");
    expect(validateSignature("approved", head, complaint)[0].field).toBe("role");
  });

  it("prevents the same person reviewing or approving their own preparation", () => {
    const prepared = { ...complaint, signatures: { prepared: buildSignatureRecord(quality, {}, "") } };
    const issues = validateSignature("reviewed", quality, prepared);
    expect(issues.some((issue) => issue.field === "separationOfDuties")).toBe(true);
  });

  it("refuses to sign the same role twice", () => {
    const prepared = { ...complaint, signatures: { prepared: buildSignatureRecord(coordinator, {}, "") } };
    expect(validateSignature("prepared", coordinator, prepared)[0].message).toContain("already signed");
  });

  it("requires a Master Admin and a reason to revoke, and invalidates later stages", () => {
    const fullySigned = {
      signatures: {
        prepared: buildSignatureRecord(coordinator, {}, ""),
        reviewed: buildSignatureRecord(head, {}, ""),
        approved: buildSignatureRecord(quality, {}, "")
      }
    };
    const admin = makeActor({ roleName: "Master Admin", permissions: ["*"] });
    expect(validateRevocation("prepared", quality, fullySigned, "wrong person")[0].field).toBe("role");
    expect(validateRevocation("prepared", admin, fullySigned, "no")[0].field).toBe("reason");
    expect(validateRevocation("prepared", admin, fullySigned, "Signed by the wrong person")).toHaveLength(0);
    expect(rolesInvalidatedBy("prepared")).toEqual(["prepared", "reviewed", "approved"]);
    expect(rolesInvalidatedBy("approved")).toEqual(["approved"]);
    expect(isFullySigned(fullySigned)).toBe(true);
  });

  it("snapshots the signer identity at signing time", () => {
    const record = buildSignatureRecord(quality, { designation: "Head of Quality", department: "Quality" }, "  reviewed  ");
    expect(record).toMatchObject({ userId: "u3", designation: "Head of Quality", department: "Quality", notes: "reviewed" });
    expect(record.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
