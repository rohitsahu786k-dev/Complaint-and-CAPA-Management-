import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { SectionCard } from "@/components/ui/Cards";
import { Button } from "@/components/ui/Button";
import { Field, Select, Textarea } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/toast-context";
import { ApiError } from "@/lib/api";
import { useApiMutation, useConfiguration, type ComplaintDetail } from "@/services/queries";
import { BlockedReasons, TabPanel, WhyChainEditor } from "./shared";
import { SignatureBlock } from "./SignatureBlock";

type Draft = {
  problem: string;
  singleChain: string[];
  rootCause: string;
  rootCauseCategory: string;
  summary: string;
  findings: string;
  correctiveAction: string;
  evidence: string;
};

function toDraft(complaint: ComplaintDetail): Draft {
  return {
    problem: complaint.d2?.what ?? "",
    singleChain: complaint.fiveWhy?.singleChain ?? [],
    rootCause: complaint.d4Occurrence ?? "",
    rootCauseCategory: complaint.rootCauseCategory ?? "",
    summary: complaint.internalInvestigation?.summary ?? "",
    findings: complaint.internalInvestigation?.findings ?? "",
    correctiveAction: complaint.internalInvestigation?.correctiveAction ?? "",
    evidence: complaint.internalInvestigation?.evidence ?? ""
  };
}

/** Internal complaints use this reduced investigation, never the full external 8D. */
export function InternalTab({ complaint, canEdit }: { complaint: ComplaintDetail; canEdit: boolean }) {
  const toast = useToast();
  const configuration = useConfiguration(complaint.company);
  const [draft, setDraft] = useState<Draft>(() => toDraft(complaint));
  const [issues, setIssues] = useState<{ field: string; message: string; section?: string }[]>([]);

  useEffect(() => {
    setDraft(toDraft(complaint));
  }, [complaint]);

  const save = useApiMutation<{ complaint: ComplaintDetail }, Record<string, unknown>>("PATCH", `/api/complaints/${complaint._id}/internal`, [
    ["complaint", complaint._id]
  ]);

  const readOnly = !canEdit;
  const filled = draft.singleChain.filter((entry) => entry.trim()).length;

  async function onSave() {
    setIssues([]);
    try {
      await save.mutateAsync({
        d2: { what: draft.problem },
        fiveWhy: { singleChain: draft.singleChain },
        d4Occurrence: draft.rootCause,
        rootCauseCategory: draft.rootCauseCategory,
        internalInvestigation: {
          summary: draft.summary,
          findings: draft.findings,
          correctiveAction: draft.correctiveAction,
          evidence: draft.evidence
        }
      });
      toast.success("Investigation saved", "Every change is recorded in the audit trail.");
    } catch (error) {
      if (error instanceof ApiError) setIssues(error.issues);
      toast.error("The investigation could not be saved", error instanceof Error ? error.message : "Try again.");
    }
  }

  return (
    <TabPanel>
      {readOnly ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          You have read-only access to this investigation.
        </div>
      ) : null}

      <BlockedReasons title="The server rejected this save" issues={issues} />

      <SectionCard
        title="Internal investigation"
        description="A department-to-department complaint uses a single-chain 5-Why and a shared root cause classification."
      >
        <div className="space-y-4">
          <Field label="Problem statement" required hint="Required before the RCA stage can be completed and before closure.">
            <Textarea rows={3} value={draft.problem} disabled={readOnly} onChange={(event) => setDraft({ ...draft, problem: event.target.value })} />
          </Field>

          <div className="grid gap-3 lg:grid-cols-2">
            <Field label="Investigation summary">
              <Textarea rows={4} value={draft.summary} disabled={readOnly} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} />
            </Field>
            <Field label="Findings">
              <Textarea rows={4} value={draft.findings} disabled={readOnly} onChange={(event) => setDraft({ ...draft, findings: event.target.value })} />
            </Field>
          </div>

          <WhyChainEditor
            title="5-Why analysis"
            description="A single chain is enough for an internal complaint."
            entries={draft.singleChain}
            readOnly={readOnly}
            onChange={(entries) => setDraft({ ...draft, singleChain: entries })}
          />

          <div className="grid gap-3 lg:grid-cols-2">
            <Field label="Root cause" required>
              <Textarea rows={3} value={draft.rootCause} disabled={readOnly} onChange={(event) => setDraft({ ...draft, rootCause: event.target.value })} />
            </Field>
            <Field label="Root cause category" hint="Same 6M plus Management and Supplier list used by external complaints.">
              <Select
                value={draft.rootCauseCategory}
                disabled={readOnly}
                onChange={(event) => setDraft({ ...draft, rootCauseCategory: event.target.value })}
              >
                <option value="">Not classified</option>
                {(configuration.data?.rootCauseCategories ?? []).map((entry) => (
                  <option key={entry._id} value={entry.name}>
                    {entry.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Field label="Corrective action taken" hint="Formal CAPA items are managed in the CAPA tab.">
              <Textarea
                rows={3}
                value={draft.correctiveAction}
                disabled={readOnly}
                onChange={(event) => setDraft({ ...draft, correctiveAction: event.target.value })}
              />
            </Field>
            <Field label="Evidence reference">
              <Textarea rows={3} value={draft.evidence} disabled={readOnly} onChange={(event) => setDraft({ ...draft, evidence: event.target.value })} />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={draft.problem ? "green" : "amber"}>Problem statement {draft.problem ? "recorded" : "missing"}</StatusBadge>
            <StatusBadge tone={filled >= 3 ? "green" : "amber"}>5-Why chain {filled}/3</StatusBadge>
            <StatusBadge tone={draft.rootCause ? "green" : "amber"}>Root cause {draft.rootCause ? "recorded" : "missing"}</StatusBadge>
          </div>
        </div>
      </SectionCard>

      {!readOnly ? (
        <div className="flex justify-end">
          <Button onClick={onSave} disabled={save.isPending}>
            <Save className="h-4 w-4" />
            {save.isPending ? "Saving" : "Save investigation"}
          </Button>
        </div>
      ) : null}

      <SignatureBlock complaint={complaint} canEdit={canEdit} />
    </TabPanel>
  );
}

