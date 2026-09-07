import { AlertTriangle, CheckCircle2, Clock3, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";

const cards = [
  { label: "Open Complaints", value: "API", icon: FileText },
  { label: "Overdue TAT", value: "API", icon: Clock3 },
  { label: "CAPA Evidence", value: "API", icon: CheckCircle2 },
  { label: "Repeat Risk", value: "API", icon: AlertTriangle }
];

export function DashboardPage() {
  return (
    <main>
      <PageHeader title="Dashboard" description="Phase 1 secure shell and server-backed foundations are active." />
      <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
        {cards.map((card) => (
          <section key={card.label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-500">{card.label}</p>
              <card.icon className="h-5 w-5 text-brand-red" />
            </div>
            <p className="mt-4 text-3xl font-extrabold text-brand-charcoal">{card.value}</p>
            <p className="mt-2 text-xs text-slate-500">Reserved for Phase 2 complaint/CAPA APIs.</p>
          </section>
        ))}
      </div>
      <section className="mx-4 mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:mx-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold text-brand-charcoal">Phase 1 Status</h2>
          <StatusBadge tone="green">Auth architecture implemented</StatusBadge>
          <StatusBadge tone="amber">Complaint domain pending</StatusBadge>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          The legacy feature matrix is documented and this app now uses React routes, real API endpoints, server-side validation,
          authorization middleware, and Mongo models for foundational data.
        </p>
      </section>
    </main>
  );
}
