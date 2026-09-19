import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { loginSchema, type LoginInput } from "@shared/schemas/auth";
import { AuthLayout } from "@/layouts/AuthLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useLogin } from "@/hooks/useAuth";

// Only the username is kept. The password stays with the browser's own password manager
// (see autoComplete below) - persisting a credential for a regulated CAPA system would
// leave a plaintext secret in reach of any script on the page.
const REMEMBERED_USERNAME_KEY = "onepws.rememberedUsername";

function readRememberedUsername() {
  // Private-mode and blocked-site-data browsers throw on access rather than return null.
  try {
    return window.localStorage.getItem(REMEMBERED_USERNAME_KEY) || "";
  } catch {
    return "";
  }
}

function writeRememberedUsername(username: string | null) {
  try {
    if (username) window.localStorage.setItem(REMEMBERED_USERNAME_KEY, username);
    else window.localStorage.removeItem(REMEMBERED_USERNAME_KEY);
  } catch {
    // A browser that refuses storage just means no pre-fill next time.
  }
}

export function LoginPage() {
  const [rememberedUsername] = useState(readRememberedUsername);
  const [remember, setRemember] = useState(() => Boolean(rememberedUsername));
  const navigate = useNavigate();
  const location = useLocation();
  const login = useLogin();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/";
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: rememberedUsername, password: "" }
  });

  // Unchecking forgets straight away rather than waiting for the next successful sign-in,
  // so someone stepping away from a shared machine is not left pre-filled.
  function forgetOrRemember(next: boolean) {
    setRemember(next);
    if (!next) writeRememberedUsername(null);
  }

  async function onSubmit(input: LoginInput) {
    // A rejected sign-in is already surfaced through login.error below; letting it
    // escape react-hook-form's handler only produced an unhandled promise rejection.
    try {
      const result = await login.mutateAsync(input);
      // Store the schema-normalised username so the pre-fill matches what the server accepted.
      writeRememberedUsername(remember ? input.username : null);
      if (result.user.forcePasswordChange) {
        navigate("/profile", { replace: true, state: { passwordChangeRequired: true } });
        return;
      }
      navigate(from, { replace: true });
    } catch {
      // Intentionally ignored: the mutation error drives the inline message.
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={form.handleSubmit(onSubmit)} className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-red">Secure Login</p>
          <h1 className="mt-2 text-2xl font-bold text-brand-charcoal">Welcome back</h1>
          <p className="mt-2 text-sm text-slate-500">Use your assigned account to access the portal.</p>
        </div>
        <div className="space-y-4">
          <label className="block text-sm font-semibold text-slate-700">
            Username
            <Input className="mt-1.5" autoComplete="username" {...form.register("username")} />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Password
            <PasswordInput className="mt-1.5" autoComplete="current-password" {...form.register("password")} />
          </label>
        </div>
        {form.formState.errors.username || form.formState.errors.password || login.error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {login.error instanceof Error
              ? login.error.message
              : form.formState.errors.username?.message || form.formState.errors.password?.message}
          </div>
        ) : null}
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={remember} onChange={(event) => forgetOrRemember(event.target.checked)} />
          Remember my username
        </label>
        <Button className="mt-6 w-full" disabled={login.isPending}>
          <LogIn className="h-4 w-4" />
          {login.isPending ? "Signing in..." : "Sign in"}
        </Button>
        <Link to="/forgot-password" className="mt-4 block text-center text-sm font-semibold text-brand-red hover:text-brand-redDark">
          Forgot password
        </Link>
      </form>
    </AuthLayout>
  );
}
