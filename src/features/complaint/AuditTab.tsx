import { useState } from "react";
import { ChevronDown, ChevronRight, History, User } from "lucide-react";
import { SectionCard } from "@/components/ui/Cards";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime, humaniseKey } from "@/lib/format";
import { useComplaintAudit, type AuditEntry, type ComplaintDetail } from "@/services/queries";
import { TabPanel } from "./shared";

export function KeyValueViewer({ data }: { data: unknown }) {
  if (data === null || data === undefined) {
    return <span className="text-xs text-slate-400 italic">None</span>;
  }

  if (typeof data !== "object") {
    return <span className="text-xs font-mono text-slate-800">{String(data)}</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-xs text-slate-400 italic">Empty list</span>;
    return (
      <div className="space-y-1 pl-2 border-l-2 border-slate-200">
        {data.map((item, index) => (
          <div key={index} className="text-xs">
            <span className="text-slate-400 font-mono mr-1.5">[{index + 1}]</span>
            <KeyValueViewer data={item} />
          </div>
        ))}
      </div>
    );
  }

  const entries = Object.entries(data as Record<string, unknown>).filter(
    ([key]) => key !== "__v" && key !== "_id"
  );

  if (entries.length === 0) {
    return <span className="text-xs text-slate-400 italic">Empty object</span>;
  }

  return (
    <div className="grid gap-1 rounded bg-slate-50 p-2 text-xs border border-slate-200/70">
      {entries.map(([key, val]) => (
        <div key={key} className="grid grid-cols-12 gap-2 py-0.5 border-b border-slate-100 last:border-b-0">
          <span className="col-span-4 font-semibold text-slate-600 truncate" title={key}>
            {humaniseKey(key)}:
          </span>
          <div className="col-span-8 overflow-x-auto">
            <KeyValueViewer data={val} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AuditTab({ complaint }: { complaint: ComplaintDetail }) {
  const auditQuery = useComplaintAudit(complaint._id, true);
  const entries = auditQuery.data?.entries ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <TabPanel>
      <SectionCard
        title="Immutable Audit Trail"
        description="Append-only record of all modifications, stage completions, evidence reviews, and signature activity."
      >
        {auditQuery.isLoading ? (
          <div className="py-8 text-center text-xs text-slate-500">Loading audit history...</div>
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500">No audit events recorded.</p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry: AuditEntry) => {
              const isExpanded = expandedId === entry._id;
              const hasDiff = Boolean(entry.before || entry.after || entry.metadata);

              return (
                <div
                  key={entry._id}
                  className="rounded-xl border border-slate-200 bg-white transition hover:border-slate-300"
                >
                  <div
                    className={`flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between ${
                      hasDiff ? "cursor-pointer hover:bg-slate-50/70" : ""
                    }`}
                    onClick={() => hasDiff && setExpandedId(isExpanded ? null : entry._id)}
                  >
                    <div className="flex items-center gap-3">
                      {hasDiff ? (
                        <button
                          type="button"
                          className="text-slate-400 hover:text-slate-600"
                          aria-label={isExpanded ? "Collapse audit details" : "Expand audit details"}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      ) : (
                        <div className="w-4" />
                      )}

                      <StatusBadge
                        tone={
                          entry.action.includes("DELETE") || entry.action.includes("REJECT")
                            ? "red"
                            : entry.action.includes("SIGN") || entry.action.includes("ACCEPT") || entry.action.includes("COMPLETE")
                              ? "green"
                              : "neutral"
                        }
                      >
                        {entry.action}
                      </StatusBadge>

                      <span className="font-bold text-slate-800 text-xs">{entry.entity}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <div className="flex items-center gap-1 text-slate-700">
                        <User className="h-3.5 w-3.5 text-slate-400" />
                        <span>{entry.actorName ?? "System"}</span>
                      </div>
                      <span>•</span>
                      <div className="flex items-center gap-1 text-slate-400">
                        <History className="h-3.5 w-3.5" />
                        <span>{formatDateTime(entry.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  {isExpanded && hasDiff && (
                    <div className="border-t border-slate-100 bg-slate-50/50 p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        {entry.before ? (
                          <div>
                            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                              Before Change
                            </p>
                            <KeyValueViewer data={entry.before} />
                          </div>
                        ) : null}

                        {entry.after ? (
                          <div>
                            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                              After Change
                            </p>
                            <KeyValueViewer data={entry.after} />
                          </div>
                        ) : null}

                        {entry.metadata && !entry.before && !entry.after ? (
                          <div className="md:col-span-2">
                            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                              Metadata & Context
                            </p>
                            <KeyValueViewer data={entry.metadata} />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </TabPanel>
  );
}
