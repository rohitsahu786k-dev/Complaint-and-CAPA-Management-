import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Calendar,
  Download,
  ExternalLink,
  Layers,
  Repeat2,
  Search,
  ShieldAlert,
  Users
} from "lucide-react";
import { CategoryBarChart, DonutChart } from "@/components/charts/Charts";
import { Button } from "@/components/ui/Button";
import { KpiCard, SectionCard } from "@/components/ui/Cards";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Field, Select, Spinner, Textarea } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/toast-context";
import { ApiError } from "@/lib/api";
import { downloadSheet } from "@/lib/excel";
import { formatDate, formatNumber, statusTone } from "@/lib/format";
import {
  useApiMutation,
  useMasterBootstrap,
  usePermissions,
  useRepeatAnalytics,
  type RepeatResponse
} from "@/services/queries";

type RepeatItem = RepeatResponse["items"][number];

export function RepeatAnalysisPage() {
  const toast = useToast();
  const permissions = usePermissions();
  const master = useMasterBootstrap();
  const [company, setCompany] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Review modal state
  const [reviewTarget, setReviewTarget] = useState<RepeatItem | null>(null);
  const [reviewAction, setReviewAction] = useState<"confirm" | "clear">("confirm");
  const [reviewRemarks, setReviewRemarks] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);

  const { data, isLoading, error } = useRepeatAnalytics(company || undefined);

  const companies = master.data?.companies ?? [];
  const showCompanyFilter =
    companies.length > 1 &&
    (permissions.can("view.all") || (permissions.user?.companyIds.length ?? 0) > 1);

  const items = data?.items ?? [];
  const filteredItems = useMemoFiltered(items, searchTerm);

  const repeatReviewMutation = useApiMutation<
    { complaint: unknown },
    { action: "confirm" | "clear"; remarks: string }
  >(
    "POST",
    () => `/api/complaints/${reviewTarget?.id}/repeat-review`,
    [["analytics", "repeat"], ["complaints"]]
  );

  function useMemoFiltered(list: RepeatItem[], search: string) {
    if (!search.trim()) return list;
    const lower = search.toLowerCase();
    return list.filter(
      (item) =>
        item.number.toLowerCase().includes(lower) ||
        item.customer.toLowerCase().includes(lower) ||
        item.product.toLowerCase().includes(lower) ||
        item.category.toLowerCase().includes(lower) ||
        item.basis.toLowerCase().includes(lower)
    );
  }

  function handleExport() {
    if (items.length === 0) {
      toast.error("No repeat complaints to export");
      return;
    }
    const rows = items.map((r) => ({
      "Repeat Complaint #": r.number,
      "Received Date": formatDate(r.receivedAt),
      Customer: r.customer,
      Product: r.product,
      Category: r.category,
      "Matching Basis": r.basis,
      "Shortest Recurrence (Days)": r.shortestIntervalDays ?? "—",
      "Linked Prior Complaints": r.originals.map((o) => `${o.number} (${o.intervalDays ?? "—"}d)`).join("; "),
      Status: r.status,
      "Responsible Dept": r.responsibleDept || "—",
      Owner: r.owner || "Unassigned"
    }));
    downloadSheet("Repeat-Defect-Analysis", "Repeat Complaints", rows);
    toast.success("Exported repeat defects to Excel");
  }

  async function handleReviewSubmit() {
    if (!reviewTarget) return;
    if (reviewRemarks.trim().length < 5) {
      setReviewError("Review remarks must be at least 5 characters.");
      return;
    }

    setReviewError(null);
    try {
      await repeatReviewMutation.mutateAsync({
        action: reviewAction,
        remarks: reviewRemarks.trim()
      });
      toast.success(
        reviewAction === "confirm"
          ? `Repeat defect status confirmed on ${reviewTarget.number}`
          : `Repeat flag cleared on ${reviewTarget.number}`
      );
      setReviewTarget(null);
      setReviewRemarks("");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to record repeat review";
      setReviewError(msg);
      toast.error(msg);
    }
  }

  const columns: Column<RepeatItem>[] = [
    {
      key: "number",
      header: "Complaint #",
      primary: true,
      render: (row) => (
        <div>
          <Link
            to={`/complaints/${row.id}`}
            className="font-mono font-bold text-xs text-brand-red hover:underline inline-flex items-center gap-1"
          >
            <span>{row.number}</span>
            <ExternalLink className="h-3 w-3" />
          </Link>
          <span className="block text-[11px] text-slate-400">{formatDate(row.receivedAt)}</span>
        </div>
      )
    },
    {
      key: "customer",
      header: "Customer & Product",
      render: (row) => (
        <div className="text-xs">
          <span className="font-semibold text-slate-800 block truncate">{row.customer || "Internal"}</span>
          <span className="text-[11px] text-slate-500 block truncate">{row.product || "—"}</span>
        </div>
      )
    },
    {
      key: "category",
      header: "Failure Category",
      render: (row) => (
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700 font-medium">
          {row.category}
        </span>
      )
    },
    {
      key: "basis",
      header: "Matching Basis",
      render: (row) => (
        <span className="text-xs text-red-900 bg-red-50 rounded px-2 py-0.5 font-medium border border-red-100">
          {row.basis || "Category & Customer Match"}
        </span>
      )
    },
    {
      key: "interval",
      header: "Shortest Recurrence",
      render: (row) => (
        <span className="text-xs font-bold text-slate-900">
          {row.shortestIntervalDays !== null ? `${row.shortestIntervalDays} days` : "—"}
        </span>
      )
    },
    {
      key: "originals",
      header: "Linked Prior Defects",
      render: (row) => (
        <div className="flex flex-wrap gap-1 max-w-xs">
          {row.originals.map((orig) => (
            <Link
              key={orig.id}
              to={`/complaints/${orig.id}`}
              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-mono text-slate-700 hover:bg-slate-100 hover:text-brand-red"
              title={`Status: ${orig.status}, ${orig.intervalDays ?? "?"} days prior`}
            >
              <span>{orig.number}</span>
              {orig.intervalDays !== null && (
                <span className="text-slate-400 text-[10px]">({orig.intervalDays}d)</span>
              )}
            </Link>
          ))}
        </div>
      )
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge>
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (row) => {
        const canReview = permissions.isMasterAdmin || permissions.can("complaint.assign");
        return (
          <div className="flex items-center justify-end gap-1">
            {canReview && (
              <Button
                type="button"
                variant="secondary"
                className="h-7 text-[11px] px-2"
                onClick={() => {
                  setReviewTarget(row);
                  setReviewAction("confirm");
                  setReviewRemarks("");
                  setReviewError(null);
                }}
              >
                Review Linkage
              </Button>
            )}
            <Link
              to={`/complaints/${row.id}`}
              className="inline-flex h-7 items-center rounded border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              View
            </Link>
          </div>
        );
      }
    }
  ];

  return (
    <main className="space-y-6 pb-12">
      <PageHeader
        title="Repeat Defect & Recurrence Analysis"
        description={`Statistical detection of recurring quality issues within the active ${data?.windowDays ?? 180}-day lookback window.`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              onClick={handleExport}
              disabled={items.length === 0}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export Repeat Excel
            </Button>
            <Link
              to="/complaints"
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Complaints List
            </Link>
          </div>
        }
      />

      <div className="space-y-6 px-4 sm:px-6">
        {showCompanyFilter && (
          <SectionCard className="sm:max-w-sm">
            <Field label="Company Scope">
              <Select value={company} onChange={(e) => setCompany(e.target.value)}>
                <option value="">All Permitted Companies</option>
                {companies.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
          </SectionCard>
        )}

        {isLoading && <Spinner label="Analyzing repeat complaints..." />}

        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Unable to load repeat defect analytics</p>
              <p className="mt-1 text-xs">{error.message}</p>
            </div>
          </div>
        )}

        {data && (
          <>
            {/* Top KPI Metrics */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Total Repeat Occurrences"
                value={formatNumber(data.total)}
                icon={Repeat2}
                tone={data.total > 0 ? "red" : "green"}
                hint="Total complaints flagged as repeated occurrences within lookback window."
              />
              <KpiCard
                label="Recurrence Lookback Window"
                value={`${data.windowDays} Days`}
                icon={Calendar}
                hint="Current ISO/IATF repeat detection threshold set in configuration."
              />
              <KpiCard
                label="Customers Impacted"
                value={formatNumber(data.byCustomer.length)}
                icon={Users}
                hint="Distinct customers experiencing multiple recurrence of same defect."
              />
              <KpiCard
                label="Recurrent Categories"
                value={formatNumber(data.byCategory.length)}
                icon={Layers}
                hint="Distinct failure categories with repeat occurrences."
              />
            </div>

            {/* Recurrence Distribution Charts */}
            <div className="grid gap-6 lg:grid-cols-3">
              <SectionCard
                title="Top Customers by Recurrence"
                description="Customers experiencing repeated complaints"
              >
                <CategoryBarChart
                  data={data.byCustomer}
                  label="No customer recurrence records"
                  height={260}
                />
              </SectionCard>

              <SectionCard
                title="Top Recurrent Categories"
                description="Categories exhibiting frequent repeat failure modes"
              >
                <CategoryBarChart
                  data={data.byCategory}
                  label="No category recurrence records"
                  height={260}
                />
              </SectionCard>

              <SectionCard
                title="Recurrence by Product Line"
                description="Product models impacted by repeat defects"
              >
                <DonutChart
                  data={data.byProduct}
                  label="No product recurrence records"
                  height={260}
                />
              </SectionCard>
            </div>

            {/* Repeat Register Table */}
            <SectionCard
              title="Repeat Defect Register & Linkages"
              description="Detailed list of all recurrent complaints with matching prior cases and interval durations"
              actions={
                <div className="relative w-64">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    className="pl-8 text-xs"
                    placeholder="Filter repeat table..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              }
            >
              <DataTable<RepeatItem>
                rows={filteredItems}
                rowKey={(row) => row.id}
                columns={columns}
                emptyTitle="No repeat defect records found"
                emptyDescription="No complaints match the recurrence criteria in the selected scope."
              />
            </SectionCard>
          </>
        )}
      </div>

      {/* Review Linkage Modal */}
      <Modal
        open={Boolean(reviewTarget)}
        onOpenChange={(open) => !open && setReviewTarget(null)}
        title={`Review Repeat Linkage: ${reviewTarget?.number ?? ""}`}
      >
        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1 text-slate-700">
            <p>
              Customer: <strong>{reviewTarget?.customer}</strong>
            </p>
            <p>
              Product: <strong>{reviewTarget?.product}</strong>
            </p>
            <p>
              Category: <strong>{reviewTarget?.category}</strong>
            </p>
            <p>
              Matching Basis: <span className="font-semibold text-brand-red">{reviewTarget?.basis}</span>
            </p>
          </div>

          {reviewError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <span>{reviewError}</span>
            </div>
          )}

          <Field label="Review Determination" required>
            <Select
              value={reviewAction}
              onChange={(e) => setReviewAction(e.target.value as "confirm" | "clear")}
            >
              <option value="confirm">Confirm Repeat Defect (Mandates CAPA & Root Cause Audit)</option>
              <option value="clear">Clear Repeat Flag (Different Root Cause / False Positive)</option>
            </Select>
          </Field>

          <Field label="Review Remarks & Rationale" required>
            <Textarea
              rows={3}
              placeholder="State technical justification for confirming or clearing the repeat defect flag (minimum 5 characters)..."
              value={reviewRemarks}
              onChange={(e) => setReviewRemarks(e.target.value)}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setReviewTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={repeatReviewMutation.isPending || reviewRemarks.trim().length < 5}
              onClick={handleReviewSubmit}
            >
              {repeatReviewMutation.isPending ? "Submitting Review..." : "Confirm Decision"}
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
export default RepeatAnalysisPage;
