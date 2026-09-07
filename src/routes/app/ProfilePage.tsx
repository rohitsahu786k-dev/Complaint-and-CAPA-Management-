import { KeyRound } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { useCurrentUser } from "@/hooks/useAuth";
import { api } from "@/lib/api";

export function ProfilePage() {
  const { data } = useCurrentUser();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await api("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
    setCurrentPassword("");
    setNewPassword("");
    setMessage("Password changed successfully.");
  }

  return (
    <main>
      <PageHeader title="Profile" description="Account details and password controls." />
      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1fr_420px]">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-brand-charcoal">{data?.user.name}</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-slate-500">Username</dt>
              <dd className="text-slate-900">{data?.user.username}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">Role</dt>
              <dd className="text-slate-900">{data?.user.role?.name}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">Email</dt>
              <dd className="text-slate-900">{data?.user.email || "Not configured"}</dd>
            </div>
          </dl>
        </section>
        <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-brand-charcoal">Change password</h2>
          <label className="mt-4 block text-sm font-semibold text-slate-700">
            Current password
            <Input
              className="mt-1.5"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label className="mt-4 block text-sm font-semibold text-slate-700">
            New password
            <Input
              className="mt-1.5"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              minLength={8}
            />
          </label>
          {message ? <p className="mt-3 text-sm font-semibold text-green-700">{message}</p> : null}
          <Button className="mt-5">
            <KeyRound className="h-4 w-4" />
            Update password
          </Button>
        </form>
      </div>
    </main>
  );
}
