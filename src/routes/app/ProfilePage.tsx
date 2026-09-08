import { AlertTriangle, KeyRound } from "lucide-react";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/toast-context";
import { useChangePassword, useCurrentUser } from "@/hooks/useAuth";

export function ProfilePage() {
  const { data } = useCurrentUser();
  const location = useLocation();
  const changePassword = useChangePassword();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const passwordChangeRequired =
    Boolean(data?.user.forcePasswordChange) ||
    Boolean((location.state as { passwordChangeRequired?: boolean } | null)?.passwordChangeRequired);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      toast.success("Password updated", "Your account password was changed successfully.");
    } catch (error) {
      toast.error("Password change failed", error instanceof Error ? error.message : "Please check the entered values and try again.");
    }
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
              <dd className="break-all text-slate-900">{data?.user.email || "Not configured"}</dd>
            </div>
          </dl>
        </section>
        <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-brand-charcoal">Change password</h2>
          {passwordChangeRequired ? (
            <div className="mt-4 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Your account is using a temporary password. Change it before accessing the rest of the portal.</p>
            </div>
          ) : null}
          <label className="mt-4 block text-sm font-semibold text-slate-700">
            Current password
            <Input
              className="mt-1.5"
              type="password"
              autoComplete="current-password"
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
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              minLength={8}
            />
          </label>
          <p className="mt-2 text-xs text-slate-500">Use at least 8 characters with at least one letter and one number.</p>
          <Button className="mt-5" disabled={changePassword.isPending}>
            <KeyRound className="h-4 w-4" />
            {changePassword.isPending ? "Updating password" : "Update password"}
          </Button>
        </form>
      </div>
    </main>
  );
}
