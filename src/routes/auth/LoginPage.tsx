import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { loginSchema, type LoginInput } from "@shared/schemas/auth";
import { AuthLayout } from "@/layouts/AuthLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useLogin } from "@/hooks/useAuth";

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const login = useLogin();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/";
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { username: "", password: "" } });

  async function onSubmit(input: LoginInput) {
    // A rejected sign-in is already surfaced through login.error below; letting it
    // escape react-hook-form's handler only produced an unhandled promise rejection.
    try {
      const result = await login.mutateAsync(input);
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
            <div className="relative mt-1.5">
              <Input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className="pr-11"
                {...form.register("password")}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>
        </div>
        {form.formState.errors.username || form.formState.errors.password || login.error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {login.error instanceof Error
              ? login.error.message
              : form.formState.errors.username?.message || form.formState.errors.password?.message}
          </div>
        ) : null}
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
