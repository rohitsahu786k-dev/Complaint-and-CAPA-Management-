import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Percent
} from "lucide-react";
import { CategoryBarChart, TrendChart } from "@/components/charts/Charts";
import { Button } from "@/components/ui/Button";
import { KpiCard, SectionCard } from "@/components/ui/Cards";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Field, Select, Spinner } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/toast-context";
import { downloadSheet } from "@/lib/excel";
import { formatNumber, formatPercent } from "@/lib/format";
import {
  useMasterBootstrap,
  usePermissions,
  useTatAnalytics,
  type TatResponse
} from "@/services/queries";

type DrilldownRow = TatResponse["drilldown"][number];

export function TatDashboardPage() {
  const toast = useToast();
  const permissions = usePermissions();
  const [company, setCompany] = useState("");
  const master = useMasterBootstrap();
  const { data, isLoading, error } = useTatAnalytics(company || undefined);

  const companies = master.data?.companies ?? [];
  const showCompanyFilter =
    companies.length > 1 &&
    (permissions.can("view.all") || (permissions.user?.companyIds.length ?? 0) > 1);

  const stages = data?.stages ?? [];
  const pareto = data?.pareto ?? [];
  const trend = data?.trend ?? [];
  const drilldown = data?.drilldown ?? [];

  // Summary KPIs across all stages
  const totalCompleted = stages.reduce((acc, s) => acc + s.completed, 0);
  const totalOnTime = stages.reduce((acc, s) => acc + s.onTime, 0);
  const totalOverdueOpen = stages.reduce((acc, s) => acc + s.overdueOpen, 0);
  const avgCompliance =
    stages.length > 0
      ? Math.round(stages.reduce((acc, s) => acc + s.compliancePercent, 0) / stages.length)
      : 100;

  function handleExportDrilldown() {
    if (drilldown.length === 0) {
      toast.error("No overdue or delayed items to export");
      return;
    }
    const rows = drilldown.map((row) => ({
      "Complaint Number": row.number,
      Stage: row.stageLabel || row.stage,
      Customer: row.customer || "—",
      Category: row.category || "—",
      "Delay Reason / Explanation": row.explanation || "No explanation provided"
    }));
    downloadSheet("TAT-Overdue-Drilldown", "Overdue Complaints", rows);
    toast.success("Overdue drilldown report exported");
  }

  const drilldownColumns: Column<DrilldownRow>[] = [
    {
      key: "number",
      header: "Complaint #",
      primary: true,
      render: (row) => (
        <Link
          to={`/complaints/${row.complaintId}`}
          className="font-mono font-bold text-xs text-brand-red hover:underline inline-flex items-center gap-1"
        >
          <span>{row.number}</span>
          <ExternalLink className="h-3 w-3" />
        </Link>
      )
    },
    {
      key: "stage",
      header: "Delayed Stage",
      render: (row) => (
        <span className="font-semibold text-slate-800 text-xs">{row.stageLabel || row.stage}</span>
      )
    },
    {
      key: "customer",
      header: "Customer",
      render: (row) => <span className="text-xs text-slate-700">{row.customer || "Internal"}</span>
    },
    {
      key: "category",
      header: "Category",
      render: (row) => <span className="text-xs text-slate-500">{row.category || "—"}</span>
    },
    {
      key: "explanation",
      header: "Delay Reason & Justification",
      render: (row) => (
        <div className="max-w-md">
          <p className="text-xs text-red-900 bg-red-50/70 rounded p-1.5 border border-red-100 italic">
            {row.explanation || "Stage is currently past SLA target date without justification."}
          </p>
        </div>
      )
    }
  ];

  return (
    <main className="space-y-6 pb-12">
      <PageHeader
        title="TAT & SLA Compliance Dashboard"
        description="Monitor turnaround time adherence across 4 critical investigation stages, track delay root causes, and resolve bottlenecks."
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              onClick={handleExportDrilldown}
              disabled={drilldown.length === 0}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export Delay Drilldown
            </Button>
            <Link
              to="/complaints"
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-red px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-700"
            >
              <span>View Complaints</span>
              <ArrowRight className="h-3.5 w-3.5" />
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

        {isLoading && <Spinner label="Aggregating TAT SLA statistics..." />}

        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Unable to load TAT compliance analytics</p>
              <p className="mt-1 text-xs">{error.message}</p>
            </div>
          </div>
        )}

        {data && (
          <>
            {/* Top KPI Metrics */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Overall SLA Compliance"
                value={formatPercent(avgCompliance)}
                icon={Percent}
                tone={avgCompliance >= 85 ? "green" : avgCompliance >= 70 ? "amber" : "red"}
                hint="Average on-time stage completion compliance percentage across all four milestones."
              />
              <KpiCard
                label="On-Time Stage Milestones"
                value={formatNumber(totalOnTime)}
                icon={CheckCircle2}
                tone="green"
                hint="Total workflow stage completions achieved within SLA target deadlines."
              />
              <KpiCard
                label="Currently Overdue Open"
                value={formatNumber(totalOverdueOpen)}
                icon={AlertTriangle}
                tone={totalOverdueOpen > 0 ? "red" : "green"}
                hint="Open complaint stages that have breached the SLA target window."
              />
              <KpiCard
                label="Total Stages Processed"
                value={formatNumber(totalCompleted)}
                icon={Clock}
                hint="Total completed stage transitions across permitted complaints."
              />
            </div>

            {/* 4 Sequential Stage Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {stages.map((stg, index) => {
                const targetDays = data.config[stg.stage] ?? (index === 0 ? 1 : index === 1 ? 2 : index === 2 ? 7 : 14);
                const compliance = stg.compliancePercent;
                const tone = compliance >= 85 ? "green" : compliance >= 70 ? "amber" : "red";

                return (
                  <div
                    key={stg.stage}
                    className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div>
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                          {index + 1}
                        </span>
                        <StatusBadge tone={tone}>{formatPercent(compliance)}</StatusBadge>
                      </div>

                      <h4 className="mt-3 text-sm font-bold text-slate-900">
                        {stg.label || stg.stage}
                      </h4>
                      <p className="text-[11px] text-slate-400">Target SLA: {targetDays} day(s)</p>

                      <div className="mt-4 space-y-2 text-xs">
                        <div className="flex items-center justify-between text-slate-600">
                          <span>Total Completed:</span>
                          <span className="font-bold text-slate-800">{formatNumber(stg.completed)}</span>
                        </div>
                        <div className="flex items-center justify-between text-emerald-700">
                          <span>On-Time:</span>
                          <span className="font-bold">{formatNumber(stg.onTime)}</span>
                        </div>
                        <div className="flex items-center justify-between text-red-700">
                          <span>Late Completed:</span>
                          <span className="font-bold">{formatNumber(stg.late)}</span>
                        </div>
                        <div className="flex items-center justify-between text-brand-red">
                          <span>Currently Overdue:</span>
                          <span className="font-bold">{formatNumber(stg.overdueOpen)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full ${compliance >= 85 ? "bg-emerald-500" : compliance >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                          style={{ width: `${Math.min(100, Math.max(0, compliance))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Charts: Delay Pareto & Trend */}
            <div className="grid gap-6 lg:grid-cols-2">
              <SectionCard
                title="Delay Reasons Distribution (Pareto)"
                description="Frequency of recorded delay root causes across overdue workflow stages"
              >
                <CategoryBarChart
                  data={pareto.map((p) => ({ name: p.name, value: p.value }))}
                  label="No stage delay records captured"
                  height={280}
                />
              </SectionCard>

              <SectionCard
                title="Monthly SLA Compliance Trend"
                description="Historical completion volume vs on-time percentage adherence"
              >
                <TrendChart
                  data={trend}
                  label="No trend records found"
                  height={280}
                  series={[
                    { key: "completed", name: "Completed", type: "bar", color: "#2B2A28" },
                    { key: "onTime", name: "On-Time", type: "bar", color: "#16A34A" },
                    { key: "compliancePercent", name: "Compliance %", type: "line", color: "#E31E25", axis: "right" }
                  ]}
                />
              </SectionCard>
            </div>

            {/* Drilldown Table */}
            <SectionCard
              title="Overdue & Delayed Complaints Drilldown"
              description="Real-time list of complaints currently overdue or flagged with SLA delay justification"
            >
              <DataTable<DrilldownRow>
                rows={drilldown}
                rowKey={(row) => `${row.complaintId}-${row.stage}`}
                columns={drilldownColumns}
                emptyTitle="No overdue complaints"
                emptyDescription="All current complaints are operating within their SLA target thresholds."
              />
            </SectionCard>
          </>
        )}
      </div>
    </main>
  );
}
export default TatDashboardPage;
