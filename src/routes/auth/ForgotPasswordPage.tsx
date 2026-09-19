import { Mail } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "@/layouts/AuthLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api";

export function ForgotPasswordPage() {
  const [value, setValue] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setDone(false);
    setError("");
    setSending(true);
    try {
      await api("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ emailOrUsername: value }) });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset email could not be sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
        <h1 className="text-2xl font-bold text-brand-charcoal">Reset access</h1>
        <p className="mt-2 text-sm text-slate-500">
          Enter your registered username or email to receive a secure reset link.
        </p>
        <label className="mt-5 block text-sm font-semibold text-slate-700">
          Username or email
          <Input className="mt-1.5" value={value} onChange={(event) => setValue(event.target.value)} required />
        </label>
        {done ? (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            Reset email sent. Please check your inbox.
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-brand-red">
            {error}
          </div>
        ) : null}
        <Button className="mt-6 w-full" disabled={sending}>
          <Mail className="h-4 w-4" />
          {sending ? "Sending reset link..." : "Send reset link"}
        </Button>
        <Link to="/login" className="mt-4 block text-center text-sm font-semibold text-slate-600 hover:text-brand-red">
          Back to login
        </Link>
      </form>
    </AuthLayout>
  );
}
