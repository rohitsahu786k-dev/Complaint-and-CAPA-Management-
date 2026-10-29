import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, CalendarCheck, Download, ExternalLink, FilterX, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/Cards";
import { DataTable, Pagination, type Column } from "@/components/ui/DataTable";
import { Field, Select, Textarea } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/toast-context";
import { fetchAllPages } from "@/lib/api";
import { downloadSheet } from "@/lib/excel";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import {
  useApiMutation,
  useEffectivenessChecks,
  useEffectivenessTracker,
  useMasterBootstrap,
  type EffectivenessRow,
  type EffectivenessStatus
} from "@/services/queries";

const STATUSES: EffectivenessStatus[] = ["Overdue", "Due Soon", "Upcoming"];
const STATUS_TONE = { Overdue: "red", "Due Soon": "amber", Upcoming: "green" } as const;

function dueText(row: EffectivenessRow) {
  if (row.daysLeft < 0) return `${-row.daysLeft} day${row.daysLeft === -1 ? "" : "s"} overdue`;
  if (row.daysLeft === 0) return "due today";
  return `in ${row.daysLeft} day${row.daysLeft === 1 ? "" : "s"}`;
}

const today = () => new Date().toISOString().slice(0, 10);

export function EffectivenessTrackerPage() {
  const toast = useToast();
  const master = useMasterBootstrap();
  const [params, setParams] = useSearchParams();
  const [target, setTarget] = useState<EffectivenessRow | null>(null);
  const [result, setResult] = useState<"Sustained" | "Not Sustained">("Sustained");
  const [checkedAt, setCheckedAt] = useState(today());
  const [remarks, setRemarks] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const query = useMemo(() => {
    const entries: Record<string, string | number> = {
      page: Number(params.get("page") ?? 1),
      pageSize: Number(params.get("pageSize") ?? 25)
    };
    ["status", "company", "search"].forEach((key) => {
      const value = params.get(key);
      if (value) entries[key] = value;
    });
    return entries;
  }, [params]);

  const { data, isLoading, error } = useEffectivenessTracker(query);
  const rows = data?.items ?? [];
  const summary = data?.summary;
  const companies = master.data?.companies ?? [];
  const history = useEffectivenessChecks(target?._id);

  const recordCheck = useApiMutation<
    { check: { cycle: number } },
    { id: string; result: "Sustained" | "Not Sustained"; remarks: string; checkedAt: string }
  >("POST", (input) => `/api/effectiveness/${input.id}/checks`, [["effectiveness"], ["complaints"], ["analytics"], ["notifications"]]);

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.set("page", "1");
    setParams(next);
  }

  function openRecord(row: EffectivenessRow) {
    setTarget(row);
    setResult("Sustained");
    setCheckedAt(today());
    setRemarks("");
    setFormError(null);
  }

  async function submitCheck() {
    if (!target) return;
    if (remarks.trim().length < 5) {
      setFormError("Remarks are required (at least 5 characters): what was verified on the shop floor or in the records.");
      return;
    }
    setFormError(null);
    try {
      await recordCheck.mutateAsync({ id: target._id, result, remarks: remarks.trim(), checkedAt: new Date(checkedAt).toISOString() });
      toast.success(
        result === "Sustained" ? "Effectiveness check recorded" : "Marked Not Sustained",
        result === "Sustained" ? `${target.number} is scheduled for its next check in 6 months.` : `${target.number} was reopened for corrective action.`
      );
      setTarget(null);
    } catch (submitError) {
      toast.failure(submitError, "The check could not be recorded");
    }
  }

  async function exportAll() {
    setExporting(true);
    try {
      const { page: _page, pageSize: _pageSize, ...filters } = query as Record<string, string>;
      const items = await fetchAllPages<EffectivenessRow>("/api/effectiveness", filters);
      if (items.length === 0) {
        toast.error("No closed complaints to export");
        return;
      }
      downloadSheet(
        "Effectiveness-Tracker",
        "Effectiveness Tracker",
        items.map((row) => ({
          "Complaint No": row.number,
          Type: row.type,
          Company: row.company?.name ?? "",
          "Customer / Product": row.customer || row.product || "",
          Category: row.category,
          Department: row.responsibleDept,
          Owner: row.owner,
          "Closed On": formatDate(row.closedAt, ""),
          "Checks Done": row.checksDone,
          "Last Check": row.lastCheck ? formatDate(row.lastCheck.checkedAt, "") : "",
          "Last Result": row.lastCheck?.result ?? "",
          "Last Remarks": row.lastCheck?.remarks ?? "",
          "Next Check Due": formatDate(row.nextDue, ""),
          Status: row.status
        }))
      );
      toast.success("Export ready", `${items.length} closed complaints exported.`);
    } catch (exportError) {
      toast.failure(exportError, "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const columns: Column<EffectivenessRow>[] = [
    {
      key: "number",
      header: "Complaint",
      primary: true,
      render: (row) => (
        <Link to={`/complaints/${row._id}`} className="inline-flex items-center gap-1 font-semibold text-brand-red hover:underline" onClick={(event) => event.stopPropagation()}>
          {row.number}
          <ExternalLink className="h-3 w-3" />
        </Link>
      )
    },
    { key: "type", header: "Type", render: (row) => <span className="text-xs text-slate-600">{row.type}</span> },
    {
      key: "customer",
      header: "Customer / Product",
      render: (row) => <span className="block max-w-[16rem] truncate text-xs font-medium text-slate-800">{row.customer || row.product || "—"}</span>
    },
    { key: "closedAt", header: "Closed On", render: (row) => <span className="text-xs text-slate-700">{formatDate(row.closedAt)}</span> },
    {
      key: "checks",
      header: "Checks Done",
      render: (row) => <span className="text-xs font-semibold text-slate-700">{row.checksDone}</span>
    },
    {
      key: "last",
      header: "Last Check",
      render: (row) =>
        row.lastCheck ? (
          <span className="flex flex-col gap-0.5">
            <span className="text-xs text-slate-700">{formatDate(row.lastCheck.checkedAt)}</span>
            <StatusBadge tone={row.lastCheck.result === "Sustained" ? "green" : "red"}>{row.lastCheck.result}</StatusBadge>
          </span>
        ) : (
          <span className="text-xs text-slate-400">Not yet checked</span>
        )
    },
    {
      key: "nextDue",
      header: "Next Check Due",
      render: (row) => (
        <span className="flex flex-col">
          <span className="text-xs font-semibold text-slate-800">{formatDate(row.nextDue)}</span>
          <span className={cn("text-[11px]", row.status === "Overdue" ? "font-semibold text-red-700" : "text-slate-500")}>{dueText(row)}</span>
        </span>
      )
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge tone={STATUS_TONE[row.status]}>{row.status}</StatusBadge>
    },
    {
      key: "action",
      header: "Action",
      align: "right",
      render: (row) =>
        data?.canRecord ? (
          <Button
            type="button"
            variant={row.status === "Overdue" ? "primary" : "secondary"}
            className="h-8 text-xs"
            onClick={(event) => {
              event.stopPropagation();
              openRecord(row);
            }}
          >
            <CalendarCheck className="mr-1.5 h-3.5 w-3.5" />
            Record check
          </Button>
        ) : (
          <span className="text-xs text-slate-400">View only</span>
        )
    }
  ];

  const tiles: { label: string; value: number | undefined; status: EffectivenessStatus | ""; tone: string }[] = [
    { label: "Overdue", value: summary?.overdue, status: "Overdue", tone: "border-red-200 bg-red-50 text-red-800" },
    { label: "Due in 30 days", value: summary?.dueSoon, status: "Due Soon", tone: "border-amber-200 bg-amber-50 text-amber-800" },
    { label: "Upcoming", value: summary?.upcoming, status: "Upcoming", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" },
    { label: "All closed complaints", value: summary?.total, status: "", tone: "border-slate-200 bg-white text-slate-800" }
  ];

  return (
    <main className="space-y-6 pb-12">
      <PageHeader
        title="Effectiveness Tracker"
        description="Closed complaints are re-checked 6 months after closure, then every 6 months, to confirm the closure actions are still being followed. Reminders are emailed automatically."
        actions={
          <Button type="button" variant="secondary" className="text-xs" onClick={exportAll} disabled={exporting || (summary?.total ?? 0) === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {exporting ? "Preparing..." : "Export Excel"}
          </Button>
        }
      />

      <div className="space-y-4 px-4 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((tile) => (
            <button
              key={tile.label}
              type="button"
              onClick={() => updateFilter("status", tile.status)}
              className={cn(
                "rounded-lg border p-4 text-left shadow-sm transition hover:shadow",
                tile.tone,
                (params.get("status") ?? "") === tile.status && "ring-2 ring-brand-red/40"
              )}
            >
              <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{tile.label}</p>
              <p className="mt-1 text-2xl font-bold">{tile.value ?? "—"}</p>
            </button>
          ))}
        </div>

        <SectionCard>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Search">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-8 text-xs"
                  placeholder="Complaint no., customer, product..."
                  value={params.get("search") ?? ""}
                  onChange={(event) => updateFilter("search", event.target.value)}
                />
              </div>
            </Field>
            <Field label="Status">
              <Select className="text-xs" value={params.get("status") ?? ""} onChange={(event) => updateFilter("status", event.target.value)}>
                <option value="">All statuses</option>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
            </Field>
            {companies.length > 1 && (
              <Field label="Company">
                <Select className="text-xs" value={params.get("company") ?? ""} onChange={(event) => updateFilter("company", event.target.value)}>
                  <option value="">All companies</option>
                  {companies.map((company) => (
                    <option key={company._id} value={company._id}>
                      {company.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-xs text-slate-500">
              Showing {rows.length} of {data?.total ?? 0} closed complaints, most overdue first
            </span>
            <Button type="button" variant="ghost" className="text-xs text-slate-600" onClick={() => setParams(new URLSearchParams({ page: "1", pageSize: "25" }))}>
              <FilterX className="mr-1.5 h-3.5 w-3.5" />
              Reset filters
            </Button>
          </div>
        </SectionCard>

        <SectionCard>
          <DataTable<EffectivenessRow>
            rows={rows}
            rowKey={(row) => row._id}
            columns={columns}
            isLoading={isLoading}
            error={error}
            rowClassName={(row) => (row.status === "Overdue" ? "bg-red-50/60" : undefined)}
            emptyTitle="No closed complaints to track"
            emptyDescription="Complaints appear here automatically once they are closed, and their first check falls due 6 months later. Adjust the filters if you expected to see some."
            caption="Effectiveness tracker"
          />
          {data && data.totalPages > 1 && (
            <div className="pt-4">
              <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPageChange={(page) => updateFilter("page", String(page))} />
            </div>
          )}
        </SectionCard>
      </div>

      <Modal open={Boolean(target)} onOpenChange={(open) => !open && setTarget(null)} title={`Effectiveness check: ${target?.number ?? ""}`}>
        <div className="space-y-4 text-sm">
          {target && (
            <p className="text-xs text-slate-600">
              {target.customer || target.product || target.category} · closed {formatDate(target.closedAt)} · check {target.checksDone + 1} due {formatDate(target.nextDue)} ({dueText(target)})
            </p>
          )}

          {(history.data?.checks ?? []).length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Previous checks</p>
              <ul className="space-y-1.5">
                {(history.data?.checks ?? []).map((check) => (
                  <li key={check._id} className="text-xs text-slate-700">
                    <span className="font-semibold">#{check.cycle}</span> · {formatDate(check.checkedAt)} · {check.result} · {check.checkedByName || "—"}
                    {check.remarks ? <span className="block text-slate-500">{check.remarks}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Field label="Result" required>
            <Select value={result} onChange={(event) => setResult(event.target.value as "Sustained" | "Not Sustained")}>
              <option value="Sustained">Sustained: closure actions are still being followed</option>
              <option value="Not Sustained">Not Sustained: the problem or old practice has returned</option>
            </Select>
          </Field>

          {result === "Not Sustained" && (
            <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Recording this will reopen the complaint and notify the owner so further corrective action can be taken.</p>
            </div>
          )}

          <Field label="Date checked" required>
            <Input type="date" value={checkedAt} max={today()} onChange={(event) => setCheckedAt(event.target.value)} />
          </Field>

          <Field label="What was verified" required hint="For example the records, area or process you inspected and what you found.">
            <Textarea rows={3} value={remarks} onChange={(event) => setRemarks(event.target.value)} />
          </Field>

          {formError && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800" role="alert">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="secondary" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" disabled={recordCheck.isPending} onClick={submitCheck}>
              {recordCheck.isPending ? "Saving..." : "Save check"}
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
