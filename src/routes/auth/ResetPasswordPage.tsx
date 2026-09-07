import { KeyRound } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthLayout } from "@/layouts/AuthLayout";
import { api } from "@/lib/api";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const token = searchParams.get("token") || "";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await api("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, newPassword: password }) });
    setDone(true);
  }

  return (
    <AuthLayout>
      <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
        <h1 className="text-2xl font-bold text-brand-charcoal">Create new password</h1>
        <p className="mt-2 text-sm text-slate-500">Reset links expire after 1 hour and are stored hashed on the server.</p>
        <label className="mt-5 block text-sm font-semibold text-slate-700">
          New password
          <Input
            className="mt-1.5"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />
        </label>
        {done ? (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            Password reset complete.
          </div>
        ) : null}
        <Button className="mt-6 w-full" disabled={!token}>
          <KeyRound className="h-4 w-4" />
          Reset password
        </Button>
        <Link to="/login" className="mt-4 block text-center text-sm font-semibold text-slate-600 hover:text-brand-red">
          Back to login
        </Link>
      </form>
    </AuthLayout>
  );
}
