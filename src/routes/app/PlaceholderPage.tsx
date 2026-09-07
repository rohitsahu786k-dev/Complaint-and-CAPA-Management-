import { Construction } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

export function PlaceholderPage({ title, area }: { title: string; area: string }) {
  return (
    <main>
      <PageHeader title={title} description={area} />
      <div className="p-4 sm:p-6">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <Construction className="h-8 w-8 text-brand-red" />
          <h2 className="mt-4 text-lg font-bold text-brand-charcoal">Production implementation queued by parity matrix</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Phase 1 establishes the secure MERN foundation. This feature area is intentionally tracked in docs/FEATURE_PARITY.md so later
            phases can implement it through API, authorization, MongoDB persistence, and tests.
          </p>
        </section>
      </div>
    </main>
  );
}
