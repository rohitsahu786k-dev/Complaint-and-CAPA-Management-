import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <header className="border-b border-slate-200 bg-white px-3 py-4 sm:px-6 sm:py-5">
      {breadcrumb ? <div className="mb-2 text-xs font-semibold text-slate-500">{breadcrumb}</div> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-brand-charcoal sm:text-xl">{title}</h1>
          {description ? <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
