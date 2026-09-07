import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ClipboardList, Clock3, Repeat2, ShieldCheck, Timer, TrendingUp } from "lucide-react";
import { CategoryBarChart, DonutChart, TrendChart } from "@/components/charts/Charts";
import { KpiCard, SectionCard } from "@/components/ui/Cards";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Field, Select, Spinner } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate, formatNumber, formatPercent, statusTone } from "@/lib/format";
import { useDashboard, useMasterBootstrap, usePermissions, type DashboardResponse } from "@/services/queries";

type RecentRow = DashboardResponse["recent"][number];

export function DashboardPage() {
  const permissions = usePermissions();
  const navigate = useNavigate();
  const [company, setCompany] = useState("");
  const master = useMasterBootstrap();
  const { data, isLoading, error } = useDashboard(company || undefined);

  const companies = master.data?.companies ?? [];
  const showCompanyFilter = companies.length > 1 && (permissions.can("view.all") || (permissions.user?.companyIds.length ?? 0) > 1);

  const columns: Column<RecentRow>[] = [
    { key: "number", header: "Complaint", primary: true, render: (row) => <span className="font-semibold text-brand-charcoal">{row.number}</span> },
    { key: "type", header: "Type", render: (row) => row.type },
    { key: "customer", header: "Customer / Source", render: (row) => row.customer || "—" },
    { key: "category", header: "Category", render: (row) => row.category || "—" },
    { key: "receivedAt", header: "Received", render: (row) => formatDate(row.receivedAt) },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge>
          {row.isRepeat ? <StatusBadge tone="red">Repeat</StatusBadge> : null}
        </span>
      )
    }
  ];

  const kpis = data?.kpis ?? {};

  return (
    <main className="pb-10">
      <PageHeader title="Dashboard" description="Live quality performance across every complaint and CAPA you are permitted to see." />

      <div className="space-y-4 p-3 sm:p-6">
        {showCompanyFilter ? (
          <SectionCard className="sm:max-w-sm">
            <Field label="Company scope">
              <Select value={company} onChange={(event) => setCompany(event.target.value)}>
                <option value="">All permitted companies</option>
                {companies.map((entry) => (
                  <option key={entry._id} value={entry._id}>
                    {entry.name}
                  </option>
                ))}
              </Select>
            </Field>
          </SectionCard>
        ) : null}

        {isLoading ? <Spinner label="Loading dashboard" /> : null}

        {error ? (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">The dashboard could not be loaded</p>
              <p className="mt-1 text-xs">{error.message}</p>
            </div>
          </div>
        ) : null}

        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label="Total complaints"
                value={formatNumber(kpis.total)}
                icon={ClipboardList}
                hint="Every complaint inside your company scope, external and internal."
                footnote={`${formatNumber(kpis.external)} external, ${formatNumber(kpis.internal)} internal`}
              />
              <KpiCard
                label="Open"
                value={formatNumber(kpis.open)}
                icon={Clock3}
                tone={kpis.open > 0 ? "amber" : "neutral"}
                hint="Complaints that have not reached the Closed status."
              />
              <KpiCard
                label="Overdue"
                value={formatNumber(kpis.overdue)}
                icon={AlertTriangle}
                tone={kpis.overdue > 0 ? "red" : "green"}
                hint="Open complaints that have breached at least one TAT target stage."
              />
              <KpiCard
                label="Closure rate"
                value={formatPercent(kpis.closurePercent)}
                icon={CheckCircle2}
                tone={kpis.closurePercent >= 80 ? "green" : "amber"}
                hint="Closed complaints divided by all complaints in scope."
                footnote={`${formatNumber(kpis.closed)} closed`}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label="TAT compliance"
                value={formatPercent(kpis.tatCompliancePercent)}
                icon={Timer}
                tone={kpis.tatCompliancePercent >= 90 ? "green" : kpis.tatCompliancePercent >= 70 ? "amber" : "red"}
                hint="Completed workflow stages finished on or before their target date, across all four stages."
              />
              <KpiCard
                label="Average closure time"
                value={`${kpis.averageClosureDays ?? 0} days`}
                icon={TrendingUp}
                hint="Mean elapsed days between the received date and the closed date for closed complaints."
              />
              <KpiCard
                label="Repeat complaints"
                value={formatPercent(kpis.repeatPercent)}
                icon={Repeat2}
                tone={kpis.repeatPercent > 10 ? "red" : "neutral"}
                hint="Share of complaints auto-flagged as repeats inside the configured detection window."
                footnote={`${formatNumber(kpis.repeat)} flagged`}
              />
              <KpiCard
                label="Effectiveness failures"
                value={formatNumber(kpis.effectivenessFailures)}
                icon={ShieldCheck}
                tone={kpis.effectivenessFailures > 0 ? "red" : "green"}
                hint="CAPA items verified as Not Effective, each of which reopened its complaint."
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="CAPA items" value={formatNumber(kpis.capaTotal)} hint="All corrective and preventive actions in scope." />
              <KpiCard
                label="CAPA closure rate"
                value={formatPercent(kpis.capaClosurePercent)}
                tone={kpis.capaClosurePercent >= 80 ? "green" : "amber"}
                hint="CAPA items marked Completed or Closed."
              />
              <KpiCard
                label="Overdue CAPA"
                value={formatNumber(kpis.capaOverdue)}
                tone={kpis.capaOverdue > 0 ? "red" : "green"}
                hint="Open CAPA items past their due date."
                footnote={formatPercent(kpis.capaOverduePercent)}
              />
              <KpiCard label="Closed complaints" value={formatNumber(kpis.closed)} hint="Complaints that passed every closure gate." />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <SectionCard title="Complaints received and closed" description="Rolling twelve months.">
                <TrendChart
                  data={data.trend}
                  series={[
                    { key: "received", name: "Received", type: "bar" },
                    { key: "closed", name: "Closed", type: "line", color: "#16A34A" }
                  ]}
                  label="No complaints have been registered yet."
                />
              </SectionCard>
              <SectionCard title="Status distribution" description="Where the open population currently sits.">
                <DonutChart data={data.statusDistribution} label="No complaints have been registered yet." />
              </SectionCard>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <SectionCard title="Priority mix" description="Priority also scales every TAT target.">
                <DonutChart data={data.priorityDistribution} label="No priorities have been assigned yet." />
              </SectionCard>
              <SectionCard title="Ageing of open complaints" description="Days since the complaint was received.">
                <CategoryBarChart data={data.aging} label="Nothing is open right now." />
              </SectionCard>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <SectionCard title="Root cause category" description="6M plus Management and Supplier classification from D4.">
                <CategoryBarChart data={data.rootCauseCategories} label="No root cause category has been classified yet." />
              </SectionCard>
              <SectionCard title="Top complaint categories" description="The ten most frequent categories in scope.">
                <CategoryBarChart data={data.categories} label="No categories recorded yet." />
              </SectionCard>
            </div>

            <SectionCard title="Recent complaints" description="The eight most recently received complaints you can access.">
              <DataTable
                columns={columns}
                rows={data.recent}
                rowKey={(row) => row.id}
                onRowClick={(row) => navigate(`/complaints/${row.id}`)}
                emptyTitle="No complaints registered yet"
                emptyDescription="Register the first complaint to populate this dashboard."
              />
            </SectionCard>
          </>
        ) : null}
      </div>
    </main>
  );
}
