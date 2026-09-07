import { useId, useState, type ComponentType, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export function SectionCard({
  title,
  description,
  actions,
  children,
  className
}: {
  title?: ReactNode;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5", className)}>
      {title || actions ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="text-base font-bold text-brand-charcoal">{title}</h2> : null}
            {description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Small inline definition, shown on hover and on focus so it is reachable by keyboard. */
export function InfoHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-label="What this measures"
        className="rounded p-0.5 text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-red/30"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((value) => !value)}
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-6 z-30 w-56 -translate-x-1/2 rounded-md border border-slate-200 bg-white p-2 text-[11px] font-normal leading-4 text-slate-600 shadow-soft"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}

const KPI_TONES = {
  neutral: "text-brand-charcoal",
  red: "text-brand-red",
  amber: "text-amber-600",
  green: "text-green-700"
} as const;

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  footnote
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ComponentType<{ className?: string }>;
  tone?: keyof typeof KPI_TONES;
  footnote?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
          {hint ? <InfoHint text={hint} /> : null}
        </p>
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-slate-400" /> : null}
      </div>
      <p className={cn("mt-3 text-2xl font-extrabold tabular-nums", KPI_TONES[tone])}>{value}</p>
      {footnote ? <p className="mt-1 text-[11px] text-slate-500">{footnote}</p> : null}
    </div>
  );
}

export function DefinitionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{item.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-slate-800">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
