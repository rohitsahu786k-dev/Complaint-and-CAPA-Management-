import { Suspense, lazy } from "react";
import { Navigate, createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/layouts/AppShell";
import { ProtectedRoute } from "./ProtectedRoute";
import { LoginPage } from "@/routes/auth/LoginPage";
import { ForgotPasswordPage } from "@/routes/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "@/routes/auth/ResetPasswordPage";
import { DashboardPage } from "@/routes/app/DashboardPage";
import { ProfilePage } from "@/routes/app/ProfilePage";
import { UnauthorizedPage } from "@/routes/app/UnauthorizedPage";
import { NotFoundPage } from "@/routes/app/NotFoundPage";
import { Spinner } from "@/components/ui/Field";

// Feature and application pages
const ComplaintsListPage = lazy(() =>
  import("@/routes/complaints/ComplaintsListPage").then((m) => ({ default: m.ComplaintsListPage }))
);
const NewComplaintPage = lazy(() =>
  import("@/routes/complaints/NewComplaintPage").then((m) => ({ default: m.NewComplaintPage }))
);
const ComplaintDetailPage = lazy(() =>
  import("@/features/complaint/ComplaintDetailPage").then((m) => ({ default: m.ComplaintDetailPage }))
);
const CapaDashboardPage = lazy(() =>
  import("@/routes/app/CapaDashboardPage").then((m) => ({ default: m.CapaDashboardPage }))
);
const CapaTrackerPage = lazy(() =>
  import("@/routes/app/CapaTrackerPage").then((m) => ({ default: m.CapaTrackerPage }))
);
const CapaMasterPage = lazy(() =>
  import("@/routes/app/CapaMasterPage").then((m) => ({ default: m.CapaMasterPage }))
);
const TatDashboardPage = lazy(() =>
  import("@/routes/app/TatDashboardPage").then((m) => ({ default: m.TatDashboardPage }))
);
const RepeatAnalysisPage = lazy(() =>
  import("@/routes/app/RepeatAnalysisPage").then((m) => ({ default: m.RepeatAnalysisPage }))
);
const AuditTrailPage = lazy(() =>
  import("@/routes/app/AuditTrailPage").then((m) => ({ default: m.AuditTrailPage }))
);
const ReportsPage = lazy(() =>
  import("@/routes/app/ReportsPage").then((m) => ({ default: m.ReportsPage }))
);
const ImportExportPage = lazy(() =>
  import("@/routes/app/ImportExportPage").then((m) => ({ default: m.ImportExportPage }))
);
const MasterDataPage = lazy(() =>
  import("@/routes/app/MasterDataPage").then((m) => ({ default: m.MasterDataPage }))
);
const NotificationsPage = lazy(() =>
  import("@/routes/app/NotificationsPage").then((m) => ({ default: m.NotificationsPage }))
);
const EmailAdminPage = lazy(() =>
  import("@/routes/admin/email/EmailAdminPage").then((m) => ({ default: m.EmailAdminPage }))
);

function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner label="Loading page..." />
    </div>
  );
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          {
            path: "complaints",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ComplaintsListPage />
              </Suspense>
            )
          },
          {
            path: "complaints/new",
            element: (
              <Suspense fallback={<PageLoader />}>
                <NewComplaintPage />
              </Suspense>
            )
          },
          {
            path: "complaints/:id",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ComplaintDetailPage />
              </Suspense>
            )
          },
          {
            path: "tat",
            element: (
              <Suspense fallback={<PageLoader />}>
                <TatDashboardPage />
              </Suspense>
            )
          },
          {
            path: "repeat",
            element: (
              <Suspense fallback={<PageLoader />}>
                <RepeatAnalysisPage />
              </Suspense>
            )
          },
          {
            path: "capa",
            element: (
              <Suspense fallback={<PageLoader />}>
                <CapaDashboardPage />
              </Suspense>
            )
          },
          {
            path: "capa/tracker",
            element: (
              <Suspense fallback={<PageLoader />}>
                <CapaTrackerPage />
              </Suspense>
            )
          },
          {
            path: "capa/master",
            element: (
              <Suspense fallback={<PageLoader />}>
                <CapaMasterPage />
              </Suspense>
            )
          },
          {
            path: "reports",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ReportsPage />
              </Suspense>
            )
          },
          {
            path: "audit",
            element: (
              <Suspense fallback={<PageLoader />}>
                <AuditTrailPage />
              </Suspense>
            )
          },
          {
            path: "import-export",
            element: (
              <Suspense fallback={<PageLoader />}>
                <ImportExportPage />
              </Suspense>
            )
          },
          {
            path: "master-data",
            element: (
              <Suspense fallback={<PageLoader />}>
                <MasterDataPage />
              </Suspense>
            )
          },
          {
            path: "email-admin",
            element: (
              <Suspense fallback={<PageLoader />}>
                <EmailAdminPage />
              </Suspense>
            )
          },
          {
            path: "settings",
            element: <Navigate to="/master-data" replace />
          },

          {
            path: "notifications",
            element: (
              <Suspense fallback={<PageLoader />}>
                <NotificationsPage />
              </Suspense>
            )
          },
          { path: "profile", element: <ProfilePage /> },
          { path: "unauthorized", element: <UnauthorizedPage /> }
        ]
      }
    ]
  },
  { path: "*", element: <NotFoundPage /> }
]);
