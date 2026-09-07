import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BellOff,
  Check,
  CheckCheck,
  ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Spinner } from "@/components/ui/Field";
import { useToast } from "@/components/ui/toast-context";
import { formatDateTime } from "@/lib/format";
import {
  useApiMutation,
  useNotifications,
  type NotificationRecord
} from "@/services/queries";

export function NotificationsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [filterUnreadOnly, setFilterUnreadOnly] = useState(false);

  const { data, isLoading, error } = useNotifications({ pageSize: 50 });
  const notifications = data?.items ?? [];
  const unreadCount = data?.unread ?? 0;

  const markAllRead = useApiMutation<{ modifiedCount: number }>(
    "POST",
    "/api/notifications/read-all",
    [["notifications"]]
  );

  const markSingleRead = useApiMutation<{ notification: unknown }, { id: string }>(
    "POST",
    (input) => `/api/notifications/${input.id}/read`,
    [["notifications"]]
  );

  const filtered = filterUnreadOnly ? notifications.filter((n) => !n.read) : notifications;

  async function handleMarkAllAsRead() {
    try {
      await markAllRead.mutateAsync(undefined);
      toast.success("All notifications marked as read");
    } catch {
      toast.error("Failed to update notifications");
    }
  }

  async function handleNotificationClick(item: NotificationRecord) {
    if (!item.read) {
      await markSingleRead.mutateAsync({ id: item._id });
    }
    if (item.link) {
      navigate(item.link);
    }
  }

  function priorityTone(priority: string) {
    if (priority === "Urgent" || priority === "Critical") return "red";
    if (priority === "High") return "amber";
    return "neutral";
  }

  return (
    <main className="space-y-6 pb-12">
      <PageHeader
        title="Notification Center"
        description="Real-time alerts for workflow stage handoffs, SLA breach warnings, evidence review requests, and escalation notices."
        actions={
          unreadCount > 0 && (
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              onClick={handleMarkAllAsRead}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
              Mark All as Read ({unreadCount})
            </Button>
          )
        }
      />

      <div className="space-y-4 px-4 sm:px-6 max-w-4xl">
        {/* Filter bar */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex gap-2">
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                !filterUnreadOnly
                  ? "bg-brand-red text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              onClick={() => setFilterUnreadOnly(false)}
            >
              All Alerts ({notifications.length})
            </button>
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                filterUnreadOnly
                  ? "bg-brand-red text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              onClick={() => setFilterUnreadOnly(true)}
            >
              Unread ({unreadCount})
            </button>
          </div>
        </div>

        {isLoading && <Spinner label="Loading notifications..." />}

        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Unable to load notifications</p>
              <p className="mt-1 text-xs">{error.message}</p>
            </div>
          </div>
        )}

        {filtered.length === 0 && !isLoading && (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
            <BellOff className="mx-auto h-10 w-10 text-slate-300 mb-3" />
            <h3 className="text-sm font-bold text-slate-700">No notifications</h3>
            <p className="text-xs text-slate-400 mt-1">
              You are caught up on all quality workflow activities.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {filtered.map((item) => (
            <div
              key={item._id}
              className={`flex items-start justify-between gap-4 rounded-xl border p-4 transition-all ${
                item.read
                  ? "border-slate-200 bg-white"
                  : "border-red-200 bg-red-50/40 shadow-sm"
              }`}
            >
              <div
                className="flex-1 cursor-pointer"
                onClick={() => handleNotificationClick(item)}
              >
                <div className="flex items-center gap-2">
                  <StatusBadge tone={priorityTone(item.priority)}>
                    {item.priority || "Normal"}
                  </StatusBadge>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">
                    {item.category || "Workflow Alert"}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {formatDateTime(item.createdAt)}
                  </span>
                </div>

                <p className={`mt-2 text-xs leading-relaxed ${item.read ? "text-slate-700" : "font-semibold text-slate-900"}`}>
                  {item.message}
                </p>

                {item.link && (
                  <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-red hover:underline">
                    <span>Open Linked Record</span>
                    <ExternalLink className="h-3 w-3" />
                  </div>
                )}
              </div>

              {!item.read && (
                <button
                  type="button"
                  title="Mark as read"
                  className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700"
                  onClick={() => markSingleRead.mutateAsync({ id: item._id })}
                >
                  <Check className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
export default NotificationsPage;
