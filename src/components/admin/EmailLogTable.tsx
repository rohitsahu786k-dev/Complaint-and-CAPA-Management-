import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RotateCw,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Info
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Field";
import { EMAIL_TRIGGER_EVENTS, EMAIL_TRIGGER_LABELS } from "@shared/constants/domain";
import { api } from "@/lib/api";

type EmailLogItem = {
  _id: string;
  templateKey?: string;
  triggerEvent: string;
  recipients: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  status: "sent" | "failed" | "skipped";
  errorMessage?: string;
  relatedComplaintId?: { _id: string; number: string; description: string };
  relatedCapaId?: { _id: string; number: string; action: string };
  sentBySystem: boolean;
  payload?: Record<string, unknown>;
  dedupeKey?: string;
  attemptCount: number;
  createdAt: string;
};

type LogsResponse = {
  items: EmailLogItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export function EmailLogTable() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [triggerFilter, setTriggerFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState<EmailLogItem | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryResult, setRetryResult] = useState<{ id: string; success: boolean; msg: string } | null>(null);

  const queryParams = new URLSearchParams({
    page: String(page),
    pageSize: "20",
    status: statusFilter
  });
  if (triggerFilter) queryParams.set("triggerEvent", triggerFilter);
  if (search) queryParams.set("search", search);

  const logsQuery = useQuery({
    queryKey: ["email-logs", page, statusFilter, triggerFilter, search],
    queryFn: () => api<LogsResponse>(`/api/email/logs?${queryParams.toString()}`)
  });

  const retryMutation = useMutation({
    mutationFn: (logId: string) =>
      api<{ status: string; message?: string }>("/api/email/logs/retry", {
        method: "POST",
        body: JSON.stringify({ logId })
      }),
    onMutate: (logId) => {
      setRetryingId(logId);
      setRetryResult(null);
    },
    onSuccess: (res, logId) => {
      setRetryingId(null);
      setRetryResult({
        id: logId,
        success: res.status === "sent",
        msg: res.status === "sent" ? "Email resent successfully." : `Status: ${res.status}`
      });
      queryClient.invalidateQueries({ queryKey: ["email-logs"] });
    },
    onError: (err: Error, logId) => {
      setRetryingId(null);
      setRetryResult({ id: logId, success: false, msg: err.message || "Retry failed" });
    }
  });

  const data = logsQuery.data;
  const items = data?.items || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-brand-charcoal">Delivery Audit Logs</h2>
          <p className="text-xs text-slate-500">
            Chronological audit of every dispatched, skipped, or failed email with idempotency tracking.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by recipient, subject, or template key..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-1.5 text-xs text-brand-charcoal placeholder:text-slate-400 focus:border-brand-red focus:outline-hidden"
          />
        </div>

        <div className="w-40">
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All Statuses</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="skipped">Skipped</option>
          </Select>
        </div>

        <div className="w-56">
          <Select
            value={triggerFilter}
            onChange={(e) => {
              setTriggerFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Triggers</option>
            {EMAIL_TRIGGER_EVENTS.map((evt) => (
              <option key={evt} value={evt}>
                {EMAIL_TRIGGER_LABELS[evt]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {retryResult && (
        <div
          className={`flex items-center gap-2 rounded-lg p-3 text-xs font-semibold ${
            retryResult.success
              ? "border border-green-200 bg-green-50 text-green-800"
              : "border border-red-200 bg-red-50 text-brand-red"
          }`}
        >
          {retryResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" /> : <AlertCircle className="h-4 w-4 shrink-0 text-brand-red" />}
          <span>{retryResult.msg}</span>
        </div>
      )}

      {/* Logs Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/80 font-bold text-slate-600">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Trigger / Template</th>
                <th className="px-4 py-3">Recipient(s)</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    {logsQuery.isLoading ? "Loading delivery logs..." : "No email logs found matching criteria."}
                  </td>
                </tr>
              ) : (
                items.map((log) => {
                  const dateFormatted = new Date(log.createdAt).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  });

                  return (
                    <tr key={log._id} className="transition hover:bg-slate-50/50">
                      <td className="px-4 py-3 align-top whitespace-nowrap text-slate-500">
                        {dateFormatted}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-semibold text-brand-charcoal">
                          {EMAIL_TRIGGER_LABELS[log.triggerEvent as keyof typeof EMAIL_TRIGGER_LABELS] || log.triggerEvent}
                        </div>
                        {log.templateKey && (
                          <div className="font-mono text-[10px] text-slate-400">{log.templateKey}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top max-w-xs truncate text-slate-700 font-medium">
                        {log.recipients?.join(", ") || "None"}
                      </td>
                      <td className="px-4 py-3 align-top max-w-sm truncate text-slate-600">
                        {log.subject || <span className="italic text-slate-400">No subject</span>}
                      </td>
                      <td className="px-4 py-3 align-top text-center whitespace-nowrap">
                        {log.status === "sent" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-700">
                            <CheckCircle2 className="h-3 w-3" /> Sent
                          </span>
                        )}
                        {log.status === "failed" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-brand-red">
                            <XCircle className="h-3 w-3" /> Failed
                          </span>
                        )}
                        {log.status === "skipped" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            <AlertCircle className="h-3 w-3" /> Skipped
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            onClick={() => setSelectedLog(log)}
                            className="h-8 px-2 text-xs"
                            title="View log payload details"
                          >
                            <Info className="h-3.5 w-3.5 text-slate-500" />
                          </Button>
                          {log.status === "failed" && (
                            <Button
                              variant="secondary"
                              disabled={retryingId === log._id}
                              onClick={() => retryMutation.mutate(log._id)}
                              className="h-8 px-2 text-xs text-brand-red border-red-200 hover:bg-red-50"
                            >
                              <RotateCw
                                className={`mr-1 h-3 w-3 ${retryingId === log._id ? "animate-spin" : ""}`}
                              />
                              Retry
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/50 px-4 py-2.5 text-xs text-slate-500">
            <div>
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} total items)
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="secondary"
                disabled={pagination.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-8 px-2"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="secondary"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-8 px-2"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Details Modal */}
      <Modal
        open={Boolean(selectedLog)}
        onOpenChange={(open) => !open && setSelectedLog(null)}
        title="Email Delivery Log Details"
      >
        {selectedLog && (
          <div className="space-y-3 py-2 text-xs">
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div>
                <span className="font-semibold text-slate-500">Status:</span>{" "}
                <span className="font-bold uppercase text-brand-charcoal">{selectedLog.status}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500">Attempt Count:</span>{" "}
                <span className="font-bold text-brand-charcoal">{selectedLog.attemptCount}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500">Event:</span>{" "}
                <span className="font-mono text-[11px] text-slate-700">{selectedLog.triggerEvent}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500">Template Key:</span>{" "}
                <span className="font-mono text-[11px] text-slate-700">{selectedLog.templateKey || "N/A"}</span>
              </div>
              {selectedLog.dedupeKey && (
                <div className="col-span-2">
                  <span className="font-semibold text-slate-500">Dedupe Key:</span>{" "}
                  <span className="font-mono text-[10px] text-slate-700">{selectedLog.dedupeKey}</span>
                </div>
              )}
            </div>

            {selectedLog.errorMessage && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-brand-red">
                <div className="font-bold">Error Message:</div>
                <div className="mt-1 font-mono text-[11px]">{selectedLog.errorMessage}</div>
              </div>
            )}

            <div>
              <div className="font-semibold text-slate-600 mb-1">To Recipients:</div>
              <div className="rounded bg-slate-100 p-2 font-mono text-[11px] text-slate-800">
                {selectedLog.recipients.join(", ")}
              </div>
            </div>

            {selectedLog.cc && selectedLog.cc.length > 0 && (
              <div>
                <div className="font-semibold text-slate-600 mb-1">CC Recipients:</div>
                <div className="rounded bg-slate-100 p-2 font-mono text-[11px] text-slate-800">
                  {selectedLog.cc.join(", ")}
                </div>
              </div>
            )}

            {selectedLog.payload && (
              <div>
                <div className="font-semibold text-slate-600 mb-1">Safe Retry Context:</div>
                <pre className="max-h-40 overflow-y-auto rounded bg-slate-900 p-3 font-mono text-[11px] text-emerald-400">
                  {JSON.stringify(selectedLog.payload, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <Button variant="secondary" onClick={() => setSelectedLog(null)}>
                Close
              </Button>
              {selectedLog.status === "failed" && (
                <Button
                  variant="primary"
                  disabled={retryingId === selectedLog._id}
                  onClick={() => {
                    retryMutation.mutate(selectedLog._id);
                    setSelectedLog(null);
                  }}
                >
                  Retry Sending
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
