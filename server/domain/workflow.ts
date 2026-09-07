import type { WorkflowStage } from "@shared/constants/domain";
import type { DomainCapa, DomainComplaint } from "./types";

export type Gap = { section: string; field: string; hint?: string };

function filled(values: (string | undefined)[] | undefined): string[] {
  return (values ?? []).filter((value): value is string => Boolean(value && value.trim()));
}

function actionRowsIncomplete(rows: { action?: string; resp?: string; target?: string }[] | undefined): number {
  return (rows ?? []).filter((row) => !row.action || !row.resp || !row.target).length;
}

/**
 * Requirements that must be met before a workflow stage can be marked complete.
 * Ported from the final legacy workflowStageGaps override, which is stricter than
 * the original implementation earlier in the file.
 */
export function stageGaps(complaint: DomainComplaint, capas: DomainCapa[], stage: WorkflowStage): Gap[] {
  const gaps: Gap[] = [];
  const external = complaint.type === "External";

  if (stage === "ack") {
    if (!complaint.d0 || !complaint.d0.trim()) gaps.push({ section: "D0", field: "Emergency response text", hint: "8D tab" });
    if (external && (complaint.d1Team ?? []).length === 0) {
      gaps.push({ section: "D1", field: "At least one cross-functional team member", hint: "8D tab" });
    }
  }

  if (stage === "cont") {
    const rows = complaint.d3Actions ?? [];
    if (rows.length === 0) {
      gaps.push({ section: "D3", field: "At least one interim containment action", hint: "8D tab" });
    } else {
      const incomplete = actionRowsIncomplete(rows);
      if (incomplete > 0) {
        gaps.push({ section: "D3", field: `${incomplete} action row(s) missing responsibility, target or action` });
      }
    }
  }

  if (stage === "rca") {
    if (external) {
      if (!complaint.d2?.what) gaps.push({ section: "D2", field: "What is the problem", hint: "8D tab" });
      if ((complaint.d4QcTools ?? []).length === 0) gaps.push({ section: "D4", field: "At least one QC tool used", hint: "8D tab" });
      (["occurrence", "escape", "systemic"] as const).forEach((chain) => {
        if (filled(complaint.fiveWhy?.[chain]).length < 3) {
          gaps.push({ section: "D4", field: `5-Why ${chain} chain needs at least 3 whys`, hint: "8D tab" });
        }
      });
      if (!complaint.d4Occurrence) gaps.push({ section: "D4", field: "Root cause (occurrence)" });
      if (!complaint.d4Escape) gaps.push({ section: "D4", field: "Root cause (escape)" });
      if (!complaint.d4Systemic) gaps.push({ section: "D4", field: "Root cause (systemic)" });
    } else {
      if (!complaint.d2?.what) gaps.push({ section: "Investigation", field: "Problem statement", hint: "Internal investigation tab" });
      if (filled(complaint.fiveWhy?.singleChain).length < 3) {
        gaps.push({ section: "Investigation", field: "5-Why chain needs at least 3 whys" });
      }
      if (!complaint.d4Occurrence) gaps.push({ section: "Investigation", field: "Root cause" });
    }
  }

  if (stage === "capa") {
    if (capas.length === 0) {
      gaps.push({ section: "CAPA", field: "At least one CAPA item", hint: "CAPA tab" });
    } else {
      const incomplete = capas.filter((capa) => !capa.ownerId || !capa.dueDate || !capa.action).length;
      if (incomplete > 0) gaps.push({ section: "CAPA", field: `${incomplete} CAPA(s) missing owner, due date or action` });
    }
  }

  return gaps;
}

const STAGE_ORDER: WorkflowStage[] = ["ack", "cont", "rca", "capa"];

const STAGE_COMPLETION_FIELD: Record<WorkflowStage, keyof DomainComplaint> = {
  ack: "acknowledgedAt",
  cont: "containmentAt",
  rca: "rcaAt",
  capa: "capaAssignedAt"
};

export function isStageComplete(complaint: DomainComplaint, stage: WorkflowStage): boolean {
  return Boolean(complaint[STAGE_COMPLETION_FIELD[stage]]);
}

/** Stages run in order and each one may only be completed once. */
export function stageSequenceGaps(complaint: DomainComplaint, stage: WorkflowStage): Gap[] {
  const gaps: Gap[] = [];
  if (isStageComplete(complaint, stage)) {
    gaps.push({ section: "Workflow", field: "Stage already completed", hint: "A workflow stage can only be marked once" });
    return gaps;
  }
  const index = STAGE_ORDER.indexOf(stage);
  for (let i = 0; i < index; i += 1) {
    if (!isStageComplete(complaint, STAGE_ORDER[i])) {
      gaps.push({ section: "Workflow", field: `${STAGE_ORDER[i]} stage must be completed first` });
    }
  }
  return gaps;
}

export type DelayInput = { category?: string; explanation?: string; recovery?: string };

/** When a stage is completed past its due date the delay reason and explanation are mandatory. */
export function delayGaps(overdue: boolean, delay: DelayInput | undefined, allowedReasons: readonly string[]): Gap[] {
  if (!overdue) return [];
  const gaps: Gap[] = [];
  if (!delay?.category) {
    gaps.push({ section: "Delay", field: "delayReason.category", hint: "Select a configured delay reason" });
  } else if (allowedReasons.length > 0 && !allowedReasons.includes(delay.category)) {
    gaps.push({ section: "Delay", field: "delayReason.category", hint: "Value is not an active delay reason in master data" });
  }
  if (!delay?.explanation || !delay.explanation.trim()) {
    gaps.push({ section: "Delay", field: "delayReason.explanation", hint: "Explain why the stage missed its target" });
  }
  return gaps;
}
