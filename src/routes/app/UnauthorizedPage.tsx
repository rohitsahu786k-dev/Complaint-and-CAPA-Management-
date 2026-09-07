import { ShieldAlert } from "lucide-react";

export function UnauthorizedPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <ShieldAlert className="mx-auto h-10 w-10 text-brand-red" />
        <h1 className="mt-4 text-xl font-bold text-brand-charcoal">Unauthorized</h1>
        <p className="mt-2 text-sm text-slate-600">Your role does not have permission to access this area.</p>
      </div>
    </main>
  );
}
