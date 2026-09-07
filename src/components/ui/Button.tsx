import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variants: Record<ButtonVariant, string> = {
  primary: "border-brand-red bg-brand-red text-white hover:bg-brand-redDark",
  secondary: "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
  ghost: "border-transparent bg-transparent text-slate-700 hover:bg-slate-100",
  danger: "border-red-600 bg-red-600 text-white hover:bg-red-700"
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = "primary", ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
      variants[variant],
      className
    )}
    {...props}
  />
));

Button.displayName = "Button";
