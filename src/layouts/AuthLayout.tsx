import type { ReactNode } from "react";
import logo from "@/assets/onepws-dark-logo-scaled.png";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen bg-slate-50">
      <section className="hidden w-[42%] min-w-[420px] flex-col justify-between bg-brand-charcoal p-10 text-white lg:flex">
        <img src={logo} alt="ONEPWS" className="h-auto w-56 brightness-0 invert" />
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-200">Quality Management</p>
          <h1 className="mt-4 max-w-md text-4xl font-bold leading-tight">Complaint and CAPA control with accountable workflow gates.</h1>
          <p className="mt-5 max-w-md text-sm leading-6 text-slate-300">
            Built for corporate quality teams, department owners, auditors, and management review.
          </p>
        </div>
        <p className="text-xs text-slate-400">ONEPWS Complaint & CAPA Management Portal</p>
      </section>
      <section className="flex min-h-screen flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center lg:hidden">
            <img src={logo} alt="ONEPWS" className="h-auto w-48" />
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
