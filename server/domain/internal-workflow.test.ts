import { describe, expect, it } from "vitest";
import { makeActor, makeComplaint } from "./fixtures";
import { stageGaps } from "./workflow";
import { validateForClosure } from "./closure";
import { buildSignatureRecord } from "./signature";
import type { DomainCapa, DomainComplaint } from "./types";

describe("Internal Complaint Workflow Lifecycle", () => {
  it("verifies independent Internal complaint workflow without requiring external 8D fields", () => {
    // 1. New Internal complaint
    const internalComplaint: DomainComplaint = {
      ...makeComplaint({
        type: "Internal",
        customer: undefined,
        d0: "Internal machining cell halted; batch 14-X tagged for inspection.",
        responsibleDept: "Maintenance",
        acknowledgedAt: undefined,
        containmentAt: undefined,
        rcaAt: undefined,
        capaAssignedAt: undefined,
        closedAt: undefined
      })
    };

    // Stage 1: Acknowledgement - Does NOT require D1 team
    const ackGaps = stageGaps(internalComplaint, [], "ack");
    expect(ackGaps).toHaveLength(0);

    const cAck = {
      ...internalComplaint,
      acknowledgedAt: "2026-05-01T11:00:00.000Z"
    };

    // Stage 2: Containment
    const contGaps = stageGaps(cAck, [], "cont");
    expect(contGaps.length).toBeGreaterThan(0);

    const cCont = {
      ...cAck,
      d3Actions: [{ action: "Isolate spindle bearings and calibrate coolant flow", resp: "Maintenance Tech", target: "2026-05-03" }],
      containmentAt: "2026-05-02T16:00:00.000Z"
    };
    expect(stageGaps(cCont, [], "cont")).toHaveLength(0);

    // Stage 3: Internal RCA - Requires problem statement, single 5-Why chain, and root cause
    const rcaIncompleteGaps = stageGaps(cCont, [], "rca");
    const fields = rcaIncompleteGaps.map((g) => g.field).join(" | ");
    expect(fields).toContain("Problem statement");
    expect(fields).toContain("5-Why chain");
    // Ensure external QC tools and escape chain are NOT required
    expect(fields).not.toContain("QC tool");
    expect(fields).not.toContain("escape chain");

    const cRca = {
      ...cCont,
      d2: { what: "Spindle bearing vibration exceeded 4.5 mm/s causing tool chatter." },
      fiveWhy: {
        singleChain: [
          "Bearing housing had thermal expansion beyond normal range",
          "Coolant nozzle was partially clogged by swarf",
          "Swarf filter had not been replaced during scheduled PM",
          "Filter differential pressure gauge was non-functional",
          "Preventive maintenance checklist lacked differential pressure verification"
        ]
      },
      d4Occurrence: "Preventive maintenance protocol omitted gauge inspection frequency.",
      rootCauseCategory: "Method",
      rcaAt: "2026-05-05T14:00:00.000Z"
    };
    expect(stageGaps(cRca, [], "rca")).toHaveLength(0);

    // Stage 4: CAPA Assignment
    const capaItem: DomainCapa = {
      id: "capa-int-1",
      complaintId: cRca.id,
      companyId: cRca.companyId,
      number: "CMP-INT-001-CAPA-01",
      type: "Corrective",
      action: "Revise PM SOP-MNT-04 to mandate DP gauge log every 500 operating hours",
      ownerId: "usr-maint-lead",
      department: "Maintenance",
      dueDate: "2026-05-18",
      status: "Completed",
      evidence: "PM SOP-MNT-04 revision 2.0",
      evidenceReview: { status: "Accepted", remarks: "Approved" },
      effectiveness: "Effective"
    };

    expect(stageGaps(cRca, [capaItem], "capa")).toHaveLength(0);
    const cCapa = {
      ...cRca,
      capaAssignedAt: "2026-05-06T10:00:00.000Z"
    };

    // Stage 5: Closure Validation for Internal Complaint
    const prep = makeActor({ id: "usr-prep-int", name: "Internal Prep" });
    const rev = makeActor({ id: "usr-rev-int", name: "Internal Rev" });
    const app = makeActor({ id: "usr-app-int", name: "Internal App" });

    const cSigned = {
      ...cCapa,
      signatures: {
        prepared: buildSignatureRecord(prep, { designation: "Lead Engineer" }, "Prepared internally"),
        reviewed: buildSignatureRecord(rev, { designation: "Dept Head" }, "Reviewed internally"),
        approved: buildSignatureRecord(app, { designation: "Quality Head" }, "Approved internally")
      }
    };

    const closureResult = validateForClosure(cSigned, [capaItem]);
    expect(closureResult).toHaveLength(0);
  });
});
