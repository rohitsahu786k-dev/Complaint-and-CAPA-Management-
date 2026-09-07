import { CheckCircle, Clock, FileText } from "lucide-react";
import { SectionCard } from "@/components/ui/Cards";
import { formatDateTime } from "@/lib/format";
import type { ComplaintDetail } from "@/services/queries";
import { TabPanel } from "./shared";

export function TimelineTab({ complaint }: { complaint: ComplaintDetail }) {
  const log = complaint.workflowLog ?? [];

  return (
    <TabPanel>
      <SectionCard
        title="Workflow Progression Timeline"
        description="Chronological audit history of every stage transition, action date, and reviewer endorsement."
      >
        {log.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500">
            No workflow events recorded yet.
          </p>
        ) : (
          <div className="relative pl-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
            <div className="space-y-6">
              {log.map((entry, index) => (
                <div key={index} className="relative flex items-start gap-4">
                  <div className="absolute -left-6 mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-white ring-4 ring-slate-100">
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                  </div>

                  <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{entry.stage}</span>
                        {entry.byName && (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            By {entry.byName}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{formatDateTime(entry.at)}</span>
                      </div>
                    </div>

                    {entry.notes && (
                      <div className="mt-2.5 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-xs text-slate-700 whitespace-pre-wrap flex items-start gap-2">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400 mt-0.5" />
                        <span>{entry.notes}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>
    </TabPanel>
  );
}
