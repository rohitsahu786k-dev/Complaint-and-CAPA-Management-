import { forwardRef, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2, Inbox } from "lucide-react";
import { cn } from "@/lib/cn";

export function Field({
  label,
  error,
  hint,
  required,
  children
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      <span>
        {label}
        {required ? <span className="ml-1 text-brand-red">*</span> : null}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && !error ? <p className="mt-1 text-xs font-normal text-slate-500">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs font-semibold text-brand-red">{error}</p> : null}
    </label>
  );
}

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn("focus-ring h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900", className)}
    {...props}
  />
));
Select.displayName = "Select";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "focus-ring w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-sm font-semibold text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 bg-white p-10 text-center">
      <Inbox className="h-6 w-6 text-slate-400" />
      <p className="text-sm font-bold text-brand-charcoal">{title}</p>
      {description ? <p className="max-w-md text-sm text-slate-500">{description}</p> : null}
      {action}
    </div>
  );
}
