import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Percent,
  ShieldAlert,
  ShieldCheck
} from "lucide-react";
import { DonutChart, TrendChart } from "@/components/charts/Charts";
import { KpiCard, SectionCard } from "@/components/ui/Cards";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Field, Select, Spinner } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatNumber, formatPercent } from "@/lib/format";
import {
  useCapaAnalytics,
  useMasterBootstrap,
  usePermissions,
  type CapaAnalyticsResponse
} from "@/services/queries";

type PersonRow = CapaAnalyticsResponse["personWise"][number];

export function CapaDashboardPage() {
  const permissions = usePermissions();
  const [company, setCompany] = useState("");
  const master = useMasterBootstrap();
  const { data, isLoading, error } = useCapaAnalytics(company || undefined);

  const companies = master.data?.companies ?? [];
  const showCompanyFilter =
    companies.length > 1 &&
    (permissions.can("view.all") || (permissions.user?.companyIds.length ?? 0) > 1);

  const kpis = data?.kpis ?? {};

  const personColumns: Column<PersonRow>[] = [
    {
      key: "owner",
      header: "Action Owner",
      primary: true,
      render: (row) => <span className="font-semibold text-slate-800">{row.owner}</span>
    },
    {
      key: "assigned",
      header: "Total Assigned",
      render: (row) => formatNumber(row.assigned)
    },
    {
      key: "open",
      header: "Open",
      render: (row) => (
        <span className={row.open > 0 ? "font-semibold text-amber-700" : "text-slate-500"}>
          {formatNumber(row.open)}
        </span>
      )
    },
    {
      key: "closed",
      header: "Closed",
      render: (row) => formatNumber(row.closed)
    },
    {
      key: "overdue",
      header: "Overdue",
      render: (row) => (
        <span className={row.overdue > 0 ? "font-bold text-brand-red" : "text-slate-400"}>
          {formatNumber(row.overdue)}
        </span>
      )
    },
    {
      key: "effective",
      header: "Verified Effective",
      render: (row) => (
        <span className="font-medium text-emerald-700">{formatNumber(row.effective)}</span>
      )
    },
    {
      key: "closurePercent",
      header: "Closure Rate",
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full ${row.closurePercent >= 80 ? "bg-emerald-500" : row.closurePercent >= 50 ? "bg-amber-500" : "bg-red-500"}`}
              style={{ width: `${Math.min(100, Math.max(0, row.closurePercent))}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-slate-700">
            {formatPercent(row.closurePercent)}
          </span>
        </div>
      )
    }
  ];

  return (
    <main className="space-y-6 pb-12">
      <PageHeader
        title="CAPA Dashboard"
        description="Holistic performance metrics across corrective, preventive, and containment actions."
        actions={
          <Link
            to="/capa/tracker"
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-red px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-700"
          >
            <span>Open CAPA Tracker</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
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

        {isLoading && <Spinner label="Loading CAPA metrics..." />}

        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Unable to load CAPA analytics</p>
              <p className="mt-1 text-xs">{error.message}</p>
            </div>
          </div>
        )}

        {data && (
          <>
            {/* Top KPI Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <KpiCard
                label="Total Actions"
                value={formatNumber(kpis.total)}
                icon={ShieldCheck}
                hint="Total CAPA items registered across all permitted complaints."
              />
              <KpiCard
                label="Open Actions"
                value={formatNumber(kpis.open)}
                icon={Clock3}
                tone={kpis.open > 0 ? "amber" : "neutral"}
                hint="Actions currently in Draft, Assigned, or In Progress status."
              />
              <KpiCard
                label="Overdue Actions"
                value={formatNumber(kpis.overdue)}
                icon={AlertTriangle}
                tone={kpis.overdue > 0 ? "red" : "green"}
                hint="Actions where due date has lapsed without completion."
              />
              <KpiCard
                label="Pending Review"
                value={formatNumber(kpis.pendingReview)}
                icon={ShieldAlert}
                tone={kpis.pendingReview > 0 ? "amber" : "neutral"}
                hint="Evidence submitted awaiting Quality Head / Reviewer decision."
              />
              <KpiCard
                label="Verified Effective"
                value={formatNumber(kpis.effective)}
                icon={CheckCircle2}
                tone="green"
                hint="Actions verified as effective preventing recurrence."
              />
              <KpiCard
                label="Closure Rate"
                value={formatPercent(kpis.closureRate)}
                icon={Percent}
                tone={kpis.closureRate >= 80 ? "green" : "amber"}
                hint="Percentage of total CAPA actions completed and closed."
              />
            </div>

            {/* Distribution Donut Charts */}
            <div className="grid gap-6 lg:grid-cols-3">
              <SectionCard
                title="Status Distribution"
                description="Breakdown of CAPAs across lifecycle stages"
              >
                <DonutChart
                  data={data.statusDistribution}
                  label="No status records found"
                  height={240}
                />
              </SectionCard>

              <SectionCard
                title="Action Type Distribution"
                description="Corrective vs Preventive vs Containment"
              >
                <DonutChart
                  data={data.typeDistribution}
                  label="No type records found"
                  height={240}
                />
              </SectionCard>

              <SectionCard
                title="Effectiveness Verification"
                description="Outcomes of sustained solution audits"
              >
                <DonutChart
                  data={data.effectivenessDistribution}
                  label="No effectiveness data recorded"
                  height={240}
                />
              </SectionCard>
            </div>

            {/* Monthly Trend Chart */}
            <SectionCard
              title="CAPA Assignment & Closure Trend"
              description="Monthly volume of newly assigned vs verified closed actions"
            >
              <TrendChart
                data={data.trend}
                label="No trend history available"
                height={280}
                series={[
                  { key: "assigned", name: "Assigned", type: "bar", color: "#E31E25" },
                  { key: "closed", name: "Closed", type: "line", color: "#16A34A" }
                ]}
              />
            </SectionCard>

            {/* Person-wise CAPA Performance */}
            <SectionCard
              title="Person-wise CAPA Accountability"
              description="Ownership, workload distribution, and on-time closure performance by individual"
            >
              <DataTable<PersonRow>
                rows={data.personWise}
                rowKey={(row) => row.owner}
                columns={personColumns}
                emptyTitle="No person-wise records found"
                emptyDescription="CAPA actions have not been assigned to individuals yet."
              />
            </SectionCard>
          </>
        )}
      </div>
    </main>
  );
}
export default CapaDashboardPage;
