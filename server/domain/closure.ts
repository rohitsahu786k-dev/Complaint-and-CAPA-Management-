import type { DomainCapa, DomainComplaint } from "./types";
import type { Gap } from "./workflow";

function filled(values: (string | undefined)[] | undefined): string[] {
  return (values ?? []).filter((value): value is string => Boolean(value && value.trim()));
}

/**
 * Final legacy detailedValidateForClosure, enforced on the server.
 * Every unmet requirement is returned so the API can answer with field level errors
 * instead of a generic failure.
 */
export function validateForClosure(complaint: DomainComplaint, capas: DomainCapa[]): Gap[] {
  const gaps: Gap[] = [];
  const require = (condition: unknown, section: string, field: string, hint?: string) => {
    if (!condition) gaps.push({ section, field, hint });
  };

  require(complaint.acknowledgedAt, "Workflow", "Acknowledgement", "Complete it from the workflow tab");
  require(complaint.containmentAt, "Workflow", "Containment", "Complete it from the workflow tab");
  require(complaint.rcaAt, "Workflow", "RCA completion", "Complete it from the workflow tab");
  require(complaint.capaAssignedAt, "Workflow", "CAPA assignment", "Complete it from the workflow tab");

  if (complaint.type === "External") {
    require(complaint.d0, "D0", "Emergency response text", "8D tab");
    require((complaint.d1Team ?? []).length > 0, "D1", "At least one team member", "Pick from the employee master");
    require(complaint.d2?.what, "D2", "What is the problem", "8D tab");
    require((complaint.d4QcTools ?? []).length > 0, "D4", "At least one QC tool used", "8D tab");
    (["occurrence", "escape", "systemic"] as const).forEach((chain) => {
      require(filled(complaint.fiveWhy?.[chain]).length >= 3, "D4", `5-Why ${chain} chain (minimum 3 whys)`, "8D tab");
    });
    require(complaint.d4Occurrence, "D4", "Root cause (occurrence)", "8D tab");
    require(complaint.d4Escape, "D4", "Root cause (escape)", "8D tab");
    require(complaint.d4Systemic, "D4", "Root cause (systemic)", "8D tab");
    require((complaint.d5Occurrence ?? []).length + (complaint.d5Escape ?? []).length + (complaint.d5Systemic ?? []).length >
      0, "D5", "At least one corrective action", "8D tab");

    (complaint.d6DocsList ?? []).forEach((doc) => {
      if (doc.status === "Pending") {
        gaps.push({ section: "D6", field: doc.docType, hint: "Mark as attached with a revision, or NA with a justification" });
        return;
      }
      if (doc.status === "Attached") {
        if (!doc.attachment) gaps.push({ section: "D6", field: `${doc.docType} attachment`, hint: "Link an uploaded document" });
        if (!doc.revision) gaps.push({ section: "D6", field: `${doc.docType} revision` });
        if (!doc.revDate) gaps.push({ section: "D6", field: `${doc.docType} revision date` });
        if (!doc.approver) gaps.push({ section: "D6", field: `${doc.docType} approver` });
        return;
      }
      if (!doc.naJustification || doc.naJustification.trim().length < 10) {
        gaps.push({ section: "D6", field: `${doc.docType} NA justification`, hint: "Minimum 10 characters" });
      }
    });
  } else {
    require(complaint.d2?.what, "Investigation", "Problem statement", "Internal investigation tab");
    require(filled(complaint.fiveWhy?.singleChain).length >= 3, "Investigation", "5-Why chain (minimum 3 whys)");
    require(complaint.d4Occurrence, "Investigation", "Root cause");
  }

  require(capas.length > 0, "CAPA", "At least one CAPA item", "CAPA tab");

  // Approval signature is the final closure gate.
  require(complaint.signatures?.prepared, "Signatures", "Prepared By signature");
  require(complaint.signatures?.reviewed, "Signatures", "Reviewed By signature");
  require(complaint.signatures?.approved, "Signatures", "Approved By signature", "Quality Head for the company, or Master Admin");

  return gaps;
}

/** CAPAs that are still live when closure is attempted. The API surfaces them as a warning. */
export function openCapaWarnings(capas: DomainCapa[]): string[] {
  return capas.filter((capa) => capa.status !== "Closed" && capa.status !== "Completed").map((capa) => capa.number);
}

/** Legacy checkLTAutoReopen: a failed long term review reopens a closed complaint. */
export function shouldAutoReopenOnLongTerm(complaint: Pick<DomainComplaint, "status" | "d7LongTermResult">): boolean {
  return complaint.d7LongTermResult === "Not Sustained" && complaint.status === "Closed";
}
