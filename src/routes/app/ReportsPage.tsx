import { useState } from "react";
import {
  Download,
  FileSpreadsheet,
  Table
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/Cards";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Field, Select, Spinner } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/toast-context";
import { api, ApiError } from "@/lib/api";
import { downloadSheet } from "@/lib/excel";
import {
  useMasterBootstrap,
  useReport,
  useReportCatalog,
  type ReportRow,
  type ReportSummary
} from "@/services/queries";

export function ReportsPage() {
  const toast = useToast();
  const master = useMasterBootstrap();

  // Filters
  const [company, setCompany] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string>("All");

  // Selected report for preview / export
  const [activeReport, setActiveReport] = useState<ReportSummary | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const catalogQuery = useReportCatalog();
  const reports = catalogQuery.data?.reports ?? [];

  const companies = master.data?.companies ?? [];

  const reportDataQuery = useReport(
    activeReport?.id,
    {
      company: company || undefined,
      from: from || undefined,
      to: to || undefined
    },
    Boolean(activeReport)
  );

  const groups = ["All", ...Array.from(new Set(reports.map((r) => r.group)))];
  const filteredReports =
    selectedGroup === "All" ? reports : reports.filter((r) => r.group === selectedGroup);

  async function handleExportReport(report: ReportSummary) {
    setIsExporting(true);
    try {
      const qParams = new URLSearchParams();
      if (company) qParams.set("company", company);
      if (from) qParams.set("from", from);
      if (to) qParams.set("to", to);

      const res = await api<{ id: string; rows: ReportRow[]; generatedAt: string }>(
        `/api/reports/${report.id}/export?${qParams.toString()}`,
        { method: "POST" }
      );

      if (!res.rows || res.rows.length === 0) {
        toast.error("Report contains no rows matching the selected filter criteria.");
        return;
      }

      downloadSheet(report.title.replace(/\s+/g, "_"), "Report", res.rows);
      toast.success(`Exported ${res.rows.length} rows to Excel`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to export report";
      toast.error(msg);
    } finally {
      setIsExporting(false);
    }
  }

  // Dynamic columns for active report preview table
  const previewRows = reportDataQuery.data?.rows ?? [];
  const previewColumns: Column<ReportRow>[] =
    previewRows.length > 0
      ? Object.keys(previewRows[0]).map((key, idx) => ({
          key,
          header: key,
          primary: idx === 0,
          render: (row) => <span className="text-xs text-slate-700">{String(row[key] ?? "")}</span>
        }))
      : [];

  return (
    <main className="space-y-6 pb-12">
      <PageHeader
        title="Reports & Controlled Exports"
        description="Run server-generated compliance reports, preview live data, and generate audited Excel spreadsheets."
      />

      <div className="space-y-6 px-4 sm:px-6">
        {/* Global Filter Bar */}
        <SectionCard>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {companies.length > 1 && (
              <Field label="Company Scope">
                <Select value={company} onChange={(e) => setCompany(e.target.value)}>
                  <option value="">All Permitted Companies</option>
                  {companies.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <Field label="Date Range From">
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>

            <Field label="Date Range To">
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>

            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                className="w-full text-xs"
                onClick={() => {
                  setCompany("");
                  setFrom("");
                  setTo("");
                }}
              >
                Clear Parameters
              </Button>
            </div>
          </div>
        </SectionCard>

        {/* Group Tabs */}
        <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                selectedGroup === g
                  ? "bg-brand-red text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              onClick={() => setSelectedGroup(g)}
            >
              {g}
            </button>
          ))}
        </div>

        {catalogQuery.isLoading && <Spinner label="Loading reports catalog..." />}

        {/* Reports Catalog Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredReports.map((report) => (
            <div
              key={report.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-slate-300 hover:shadow"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {report.group}
                  </span>
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                </div>
                <h3 className="mt-3 text-sm font-bold text-slate-900">{report.title}</h3>
                <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                  {report.description}
                </p>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-8 text-xs px-2.5"
                  onClick={() => setActiveReport(report)}
                >
                  <Table className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
                  Preview
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  className="h-8 text-xs px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={isExporting}
                  onClick={() => handleExportReport(report)}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Export XLSX
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Report Preview Modal */}
      <Modal
        open={Boolean(activeReport)}
        onOpenChange={(open) => !open && setActiveReport(null)}
        title={activeReport?.title ?? "Report Preview"}
      >
        <div className="space-y-4">
          {activeReport?.description && (
            <p className="text-xs text-slate-500 leading-relaxed">
              {activeReport.description}
            </p>
          )}

          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs text-slate-500">
              {reportDataQuery.data?.rows.length ?? 0} rows retrieved
            </span>
            <Button
              type="button"
              variant="primary"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
              disabled={isExporting || (reportDataQuery.data?.rows.length ?? 0) === 0}
              onClick={() => activeReport && handleExportReport(activeReport)}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download Excel
            </Button>
          </div>

          <div className="max-h-[60vh] overflow-auto">
            <DataTable<ReportRow>
              rows={previewRows}
              rowKey={(row) => Object.values(row).join("-")}
              columns={previewColumns}
              isLoading={reportDataQuery.isLoading}
              error={reportDataQuery.error}
              emptyTitle="No data available"
              emptyDescription="No rows match the specified filters."
            />
          </div>
        </div>
      </Modal>
    </main>
  );
}
export default ReportsPage;
