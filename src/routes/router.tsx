import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/layouts/AppShell";
import { ProtectedRoute } from "./ProtectedRoute";
import { LoginPage } from "@/routes/auth/LoginPage";
import { ForgotPasswordPage } from "@/routes/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "@/routes/auth/ResetPasswordPage";
import { DashboardPage } from "@/routes/app/DashboardPage";
import { PlaceholderPage } from "@/routes/app/PlaceholderPage";
import { ProfilePage } from "@/routes/app/ProfilePage";
import { UnauthorizedPage } from "@/routes/app/UnauthorizedPage";
import { NotFoundPage } from "@/routes/app/NotFoundPage";

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
              <PlaceholderPage
                title="Complaints"
                area="Complaint registration, filters, detail workflow, 8D and internal complaint build-out."
              />
            )
          },
          {
            path: "capa-tracker",
            element: (
              <PlaceholderPage
                title="CAPA Tracker"
                area="Filterable CAPA ownership, due-date, evidence review, and effectiveness tracking."
              />
            )
          },
          { path: "reports", element: <PlaceholderPage title="Reports" area="Server-generated report previews and controlled exports." /> },
          {
            path: "notifications",
            element: <PlaceholderPage title="Notifications" area="Persistent notification center and escalation trail." />
          },
          {
            path: "settings",
            element: (
              <PlaceholderPage
                title="Master Data"
                area="Companies, departments, employees, roles, permissions, TAT and numbering configuration."
              />
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
