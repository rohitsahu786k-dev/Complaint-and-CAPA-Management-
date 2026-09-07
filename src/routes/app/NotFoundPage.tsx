import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-brand-charcoal">Page not found</h1>
        <p className="mt-2 text-sm text-slate-600">The requested route does not exist.</p>
        <Link
          to="/"
          className="mt-5 inline-flex h-10 items-center justify-center rounded-lg border border-brand-red bg-brand-red px-4 text-sm font-semibold text-white hover:bg-brand-redDark"
        >
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}
