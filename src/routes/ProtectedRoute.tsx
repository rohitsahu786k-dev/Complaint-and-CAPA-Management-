import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useCurrentUser } from "@/hooks/useAuth";

export function ProtectedRoute() {
  const location = useLocation();
  const { data, isLoading } = useCurrentUser();

  if (isLoading)
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 text-sm font-semibold text-slate-600">
        Loading secure workspace...
      </div>
    );

  if (!data?.user) return <Navigate to="/login" replace state={{ from: location }} />;

  if (data.user.forcePasswordChange && location.pathname !== "/profile") {
    return <Navigate to="/profile" replace state={{ passwordChangeRequired: true }} />;
  }

  return <Outlet />;
}
