import { useState } from "react";
import { CheckCircle, Clock, AlertTriangle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/Cards";
import { Field, Select, Textarea } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/toast-context";
import { ApiError } from "@/lib/api";
import { formatDate, formatDateTime, tatLabel, tatTone } from "@/lib/format";
import {
  issuesFrom,
  useApiMutation,
  useConfiguration,
  type ApiIssue,
  type ComplaintDetail,
  type StageTat
} from "@/services/queries";
import { BlockedReasons } from "./shared";

const STAGES = ["Acknowledgement", "Containment", "RCA", "CAPA Assignment"] as const;
type WorkflowStage = (typeof STAGES)[number];

export function WorkflowPanel({
  complaint,
  tat,
  canEdit
}: {
  complaint: ComplaintDetail;
  tat: StageTat[];
  canEdit: boolean;
}) {
  const toast = useToast();
  const configuration = useConfiguration(complaint.company);
  const [activeStage, setActiveStage] = useState<WorkflowStage | null>(null);
  const [notes, setNotes] = useState("");
  const [containmentNotes, setContainmentNotes] = useState("");
  const [delayCategory, setDelayCategory] = useState("");
  const [delayExplanation, setDelayExplanation] = useState("");
  const [recoveryPlan, setRecoveryPlan] = useState("");
  const [issues, setIssues] = useState<ApiIssue[]>([]);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const delayReasons = configuration.data?.delayReasons ?? [];

  const stageMutation = useApiMutation<
    { complaint: ComplaintDetail },
    {
      stage: WorkflowStage;
      notes?: string;
      containmentNotes?: string;
      delay?: { category: string; explanation: string; recoveryPlan?: string };
    }
  >("POST", `/api/complaints/${complaint._id}/stage`, [
    ["complaint", complaint._id],
    ["complaints"],
    ["analytics"]
  ]);

  function getStageData(stageName: string): StageTat | undefined {
    return tat?.find((item) => item.stage.toLowerCase() === stageName.toLowerCase());
  }

  function openCompleteModal(stageName: WorkflowStage) {
    setActiveStage(stageName);
    setNotes("");
    setContainmentNotes(complaint.containmentNotes ?? "");
    setDelayCategory(delayReasons[0] ?? "");
    setDelayExplanation("");
    setRecoveryPlan("");
    setIssues([]);
    setGeneralError(null);
  }

  async function handleCompleteSubmit() {
    if (!activeStage) return;
    const stageInfo = getStageData(activeStage);
    const isOverdue = Boolean(stageInfo?.overdue);

    if (isOverdue) {
      if (!delayCategory) {
        setGeneralError("Please select a delay reason from master data.");
        return;
      }
      if (delayExplanation.trim().length < 5) {
        setGeneralError("Please provide a delay explanation (minimum 5 characters).");
        return;
      }
    }

    setIssues([]);
    setGeneralError(null);

    try {
      await stageMutation.mutateAsync({
        stage: activeStage,
        notes: notes.trim() || undefined,
        containmentNotes: activeStage === "Containment" ? containmentNotes.trim() || undefined : undefined,
        delay: isOverdue
          ? {
              category: delayCategory,
              explanation: delayExplanation.trim(),
              recoveryPlan: recoveryPlan.trim() || undefined
            }
          : undefined
      });

      toast.success(`${activeStage} marked as completed`);
      setActiveStage(null);
    } catch (error) {
      const fieldIssues = issuesFrom(error);
      if (fieldIssues.length > 0) {
        setIssues(fieldIssues);
      } else if (error instanceof ApiError) {
        setGeneralError(error.message);
      } else {
        setGeneralError("Failed to advance stage");
      }
      toast.error("Stage completion blocked by validation requirements");
    }
  }

  return (
    <SectionCard
      title="Workflow Stages & TAT Tracking"
      description="Four core sequential milestones with SLA target dates and traffic light compliance."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((stageName, index) => {
          const stageInfo = getStageData(stageName);
          const isCompleted = Boolean(stageInfo?.completedAt);
          const isOverdue = Boolean(stageInfo?.overdue && !isCompleted);
          const tone = isCompleted ? "green" : tatTone(stageInfo?.health);
          const label = isCompleted ? "Completed" : tatLabel(stageInfo?.health);

          return (
            <div
              key={stageName}
              className={`flex flex-col justify-between rounded-xl border p-4 transition ${
                isCompleted
                  ? "border-emerald-200 bg-emerald-50/40"
                  : isOverdue
                    ? "border-red-200 bg-red-50/40"
                    : "border-slate-200 bg-white"
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                    {index + 1}
                  </span>
                  <StatusBadge tone={tone}>{label}</StatusBadge>
                </div>

                <div>
                  <h4 className="font-bold text-slate-800 text-sm">{stageName}</h4>
                  <div className="mt-2 space-y-1 text-xs text-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Target SLA:</span>
                      <span className="font-medium text-slate-700">
                        {formatDate(stageInfo?.dueAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Completed:</span>
                      <span className="font-medium text-slate-700">
                        {stageInfo?.completedAt ? formatDateTime(stageInfo.completedAt) : "Pending"}
                      </span>
                    </div>
                  </div>
                </div>

                {stageInfo?.delayReason && (
                  <div className="mt-2 rounded bg-red-100/60 p-2 text-[11px] text-red-900">
                    <p className="font-semibold">Delay: {stageInfo.delayReason}</p>
                    {stageInfo.delayExplanation && (
                      <p className="mt-0.5 text-red-800">{stageInfo.delayExplanation}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100">
                {isCompleted ? (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
                    <CheckCircle className="h-4 w-4" />
                    <span>Done on {formatDate(stageInfo?.completedAt)}</span>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant={isOverdue ? "primary" : "secondary"}
                    className={`w-full text-xs ${isOverdue ? "bg-red-600 hover:bg-red-700 text-white" : ""}`}
                    disabled={!canEdit || stageMutation.isPending}
                    onClick={() => openCompleteModal(stageName)}
                  >
                    <Clock className="mr-1.5 h-3.5 w-3.5" />
                    Mark Complete
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={Boolean(activeStage)}
        onOpenChange={(open) => !open && setActiveStage(null)}
        title={`Complete Workflow Stage: ${activeStage ?? ""}`}
      >
        <div className="space-y-4 text-sm">
          {activeStage && getStageData(activeStage)?.overdue && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <div>
                <p className="font-bold">This stage is past its SLA target date.</p>
                <p className="mt-0.5">
                  A delay reason selected from active master data and an explanation of at least 5 characters are required by governance rules.
                </p>
              </div>
            </div>
          )}

          {generalError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <span>{generalError}</span>
            </div>
          )}

          {issues.length > 0 && (
            <BlockedReasons
              title="Stage completion is blocked by missing prerequisites:"
              issues={issues}
            />
          )}

          {activeStage && getStageData(activeStage)?.overdue && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <Field label="Delay Reason (from Master Data)" required>
                <Select
                  value={delayCategory}
                  onChange={(e) => setDelayCategory(e.target.value)}
                >
                  {delayReasons.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Delay Explanation" required>
                <Textarea
                  rows={2}
                  placeholder="Provide root context for the delay (minimum 5 characters)..."
                  value={delayExplanation}
                  onChange={(e) => setDelayExplanation(e.target.value)}
                />
              </Field>

              <Field label="Recovery Plan / Actions (Optional)">
                <Input
                  placeholder="Actions taken to recover SLA..."
                  value={recoveryPlan}
                  onChange={(e) => setRecoveryPlan(e.target.value)}
                />
              </Field>
            </div>
          )}

          {activeStage === "Containment" && (
            <Field label="Interim Containment Notes / Summary">
              <Textarea
                rows={2}
                placeholder="Immediate containment actions taken..."
                value={containmentNotes}
                onChange={(e) => setContainmentNotes(e.target.value)}
              />
            </Field>
          )}

          <Field label="Stage Completion Notes / Remarks (Optional)">
            <Textarea
              rows={2}
              placeholder="Add optional notes for this stage completion..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setActiveStage(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={stageMutation.isPending}
              onClick={handleCompleteSubmit}
            >
              {stageMutation.isPending ? "Validating & Completing..." : "Confirm Stage Completion"}
            </Button>
          </div>
        </div>
      </Modal>
    </SectionCard>
  );
}
