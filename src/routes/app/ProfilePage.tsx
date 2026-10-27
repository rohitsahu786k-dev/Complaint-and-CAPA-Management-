import { AlertTriangle, KeyRound } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/toast-context";
import { changePasswordSchema } from "@shared/schemas/auth";
import { useChangePassword, useCurrentUser } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";

export function ProfilePage() {
  const { data } = useCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();
  const changePassword = useChangePassword();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const passwordChangeRequired =
    Boolean(data?.user.forcePasswordChange) ||
    Boolean((location.state as { passwordChangeRequired?: boolean } | null)?.passwordChangeRequired);

  /** The first reason the change cannot go through, checked here so the user sees it before the round trip. */
  function validate(): string | null {
    if (!currentPassword) return "Enter your current (temporary) password.";
    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) return parsed.error.issues[0]?.message ?? "The new password is not valid.";
    if (newPassword === currentPassword) return "The new password must be different from the current password.";
    if (newPassword !== confirmPassword) return "The new password and its confirmation do not match.";
    return null;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const problem = validate();
    setFormError(problem);
    if (problem) return;
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      if (passwordChangeRequired) {
        // The temporary-password gate is now lifted, so take the user straight to the
        // dashboard rather than leaving them on the page that was blocking them.
        toast.success("Password updated", "The portal is unlocked. Welcome in.");
        navigate("/", { replace: true });
        return;
      }
      toast.success("Password updated", "Your account password was changed successfully.");
    } catch (error) {
      // Server reasons such as "Current password is incorrect" stay visible next to the form.
      const issue = error instanceof ApiError ? error.issues[0]?.message : undefined;
      setFormError(issue ?? (error instanceof Error ? error.message : "Please check the entered values and try again."));
      toast.failure(error, "Password change failed");
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
            {passwordChangeRequired ? "Current (temporary) password" : "Current password"}
            <PasswordInput
              className="mt-1.5"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          {passwordChangeRequired ? (
            <p className="mt-1.5 text-xs text-slate-500">
              Copy the temporary password from your email exactly. Your browser may have filled this box with an older saved password, so clear it if so.
            </p>
          ) : null}
          <label className="mt-4 block text-sm font-semibold text-slate-700">
            New password
            <PasswordInput
              className="mt-1.5"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              minLength={8}
            />
          </label>
          <p className="mt-2 text-xs text-slate-500">Use at least 8 characters with at least one letter and one number.</p>
          <label className="mt-4 block text-sm font-semibold text-slate-700">
            Confirm new password
            <PasswordInput
              className="mt-1.5"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </label>
          {formError ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
              {formError}
            </p>
          ) : null}
          <Button className="mt-5" disabled={changePassword.isPending}>
            <KeyRound className="h-4 w-4" />
            {changePassword.isPending ? "Updating password" : "Update password"}
          </Button>
        </form>
      </div>
    </main>
  );
}
