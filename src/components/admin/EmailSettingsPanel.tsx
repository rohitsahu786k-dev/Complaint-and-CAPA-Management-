import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Send, RefreshCw, ShieldCheck, Mail, Server } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api";

type SmtpStatus = {
  isConfigured: boolean;
  host: string | null;
  port: number;
  secure: boolean;
  fromName: string;
  fromEmail: string | null;
};

export function EmailSettingsPanel() {
  const queryClient = useQueryClient();
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testSubject, setTestSubject] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const statusQuery = useQuery({
    queryKey: ["email-settings"],
    queryFn: () => api<SmtpStatus>("/api/email/settings")
  });

  const verifyMutation = useMutation({
    mutationFn: () => api<{ success: boolean; message: string }>("/api/email/settings/verify", { method: "POST" }),
    onSuccess: (data) => {
      setFeedback({
        type: data.success ? "success" : "error",
        text: data.message
      });
      queryClient.invalidateQueries({ queryKey: ["email-settings"] });
    },
    onError: (err: Error) => {
      setFeedback({ type: "error", text: err.message || "Failed to verify SMTP connection" });
    }
  });

  const sendTestMutation = useMutation({
    mutationFn: () =>
      api<{ status: string; logId?: string }>("/api/email/settings/test", {
        method: "POST",
        body: JSON.stringify({
          to: testEmail,
          subject: testSubject || undefined,
          message: testMessage || undefined
        })
      }),
    onSuccess: () => {
      setFeedback({
        type: "success",
        text: `Live test email successfully dispatched to ${testEmail}`
      });
      setTestModalOpen(false);
      setTestEmail("");
      queryClient.invalidateQueries({ queryKey: ["email-logs"] });
    },
    onError: (err: Error) => {
      setFeedback({ type: "error", text: err.message || "Failed to send live test email" });
    }
  });

  const status = statusQuery.data;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-brand-charcoal">SMTP Infrastructure Status</h2>
            <p className="text-xs text-slate-500">
              Server-side SMTP configuration status. Credentials are securely isolated and never exposed to client bundles.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => verifyMutation.mutate()}
              disabled={verifyMutation.isPending}
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${verifyMutation.isPending ? "animate-spin" : ""}`} />
              Verify Connection
            </Button>
            <Button
              variant="primary"
              onClick={() => setTestModalOpen(true)}
              disabled={!status?.isConfigured}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Send Test Email
            </Button>
          </div>
        </div>

        {feedback && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-lg p-3 text-xs font-medium ${
              feedback.type === "success"
                ? "border border-green-200 bg-green-50 text-green-800"
                : "border border-red-200 bg-red-50 text-brand-red"
            }`}
          >
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
            ) : (
              <XCircle className="h-4 w-4 shrink-0 text-brand-red" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Service Status</span>
              {status?.isConfigured ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700">
                  <CheckCircle2 className="h-3 w-3" /> Configured
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                  <XCircle className="h-3 w-3" /> Missing Envs
                </span>
              )}
            </div>
            <p className="mt-2 text-base font-bold text-brand-charcoal">
              {status?.isConfigured ? "Ready for Automated Delivery" : "SMTP Credentials Not Found"}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Controlled via SMTP_HOST, SMTP_USER, SMTP_APP_PASSWORD
            </p>
          </div>

          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Mail Gateway Host</span>
              <Server className="h-4 w-4 text-slate-400" />
            </div>
            <p className="mt-2 text-base font-bold text-brand-charcoal">
              {status?.host || "Not specified"}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Port: {status?.port} &middot; TLS/SSL: {status?.secure ? "Enabled" : "StartTLS (587)"}
            </p>
          </div>

          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Authorized Sender Identity</span>
              <Mail className="h-4 w-4 text-slate-400" />
            </div>
            <p className="mt-2 truncate text-base font-bold text-brand-charcoal">
              {status?.fromName}
            </p>
            <p className="mt-1 truncate text-[11px] text-slate-400">
              &lt;{status?.fromEmail || "Not configured"}&gt;
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3 rounded-lg border border-slate-200/80 bg-slate-50 p-3.5 text-xs text-slate-600">
          <ShieldCheck className="h-5 w-5 shrink-0 text-brand-red" />
          <div>
            <strong className="text-slate-800">Security Architecture:</strong> SMTP application passwords are never persisted to MongoDB, logs, client JavaScript bundles, or API responses. They remain strictly in server process environment variables.
          </div>
        </div>
      </div>

      {/* Test Email Modal */}
      <Modal open={testModalOpen} onOpenChange={setTestModalOpen} title="Send Live SMTP Test Email">
        <div className="space-y-4 py-2">
          <p className="text-xs text-slate-500">
            Test actual end-to-end delivery through the configured transport. Delivery will be audited in Email Logs.
          </p>
          <Field label="Recipient Email Address" required>
            <Input
              type="email"
              placeholder="admin@yourcompany.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
          </Field>
          <Field label="Subject Line (Optional)">
            <Input
              placeholder="ONEPWS Portal - SMTP Live Verification"
              value={testSubject}
              onChange={(e) => setTestSubject(e.target.value)}
            />
          </Field>
          <Field label="Custom Message Note (Optional)">
            <Input
              placeholder="Custom test message payload..."
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setTestModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!testEmail.includes("@") || sendTestMutation.isPending}
              onClick={() => sendTestMutation.mutate()}
            >
              {sendTestMutation.isPending ? "Sending..." : "Dispatch Test Email"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
