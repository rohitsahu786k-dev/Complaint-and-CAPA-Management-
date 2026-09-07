import { useState } from "react";
import { CheckCircle2, FileSignature, ShieldAlert, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/Cards";
import { Field, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/toast-context";
import { ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import {
  useApiMutation,
  usePermissions,
  type ComplaintDetail,
  type SignatureSnapshot
} from "@/services/queries";

type SignatureRole = "prepared" | "reviewed" | "approved";

const ROLE_DEFINITIONS: { role: SignatureRole; title: string; hint: string }[] = [
  { role: "prepared", title: "Prepared By", hint: "Complaint Owner or Coordinator" },
  { role: "reviewed", title: "Reviewed By", hint: "Department Head, Quality Head, or Management" },
  { role: "approved", title: "Approved By", hint: "Quality Head or Master Admin" }
];

export function SignatureBlock({
  complaint,
  canEdit: _canEdit
}: {
  complaint: ComplaintDetail;
  canEdit: boolean;
}) {
  const toast = useToast();
  const permissions = usePermissions();
  const [signModalRole, setSignModalRole] = useState<SignatureRole | null>(null);
  const [signNotes, setSignNotes] = useState("");
  const [revokeModalRole, setRevokeModalRole] = useState<SignatureRole | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const invalidate = [["complaint", complaint._id], ["complaint-audit", complaint._id]];

  const signMutation = useApiMutation<{ complaint: ComplaintDetail }, { role: SignatureRole; notes: string }>(
    "POST",
    `/api/complaints/${complaint._id}/signatures`,
    invalidate
  );

  const revokeMutation = useApiMutation<{ complaint: ComplaintDetail }, { role: SignatureRole; reason: string }>(
    "DELETE",
    `/api/complaints/${complaint._id}/signatures`,
    invalidate
  );

  const signatures = complaint.signatures ?? {};

  async function handleSign() {
    if (!signModalRole) return;
    setErrorMessage(null);
    try {
      await signMutation.mutateAsync({ role: signModalRole, notes: signNotes.trim() });
      toast.success(`${ROLE_DEFINITIONS.find((item) => item.role === signModalRole)?.title} signed successfully`);
      setSignModalRole(null);
      setSignNotes("");
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to sign";
      setErrorMessage(message);
      toast.error(message);
    }
  }

  async function handleRevoke() {
    if (!revokeModalRole) return;
    if (revokeReason.trim().length < 5) {
      setErrorMessage("Revocation reason must be at least 5 characters");
      return;
    }
    setErrorMessage(null);
    try {
      await revokeMutation.mutateAsync({ role: revokeModalRole, reason: revokeReason.trim() });
      toast.success(`${ROLE_DEFINITIONS.find((item) => item.role === revokeModalRole)?.title} signature revoked`);
      setRevokeModalRole(null);
      setRevokeReason("");
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to revoke signature";
      setErrorMessage(message);
      toast.error(message);
    }
  }

  return (
    <SectionCard
      title="Digital Signatures"
      description="Formal verification and approval chain. Signatures capture an immutable identity snapshot."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {ROLE_DEFINITIONS.map(({ role, title, hint }, index) => {
          const snapshot: SignatureSnapshot | undefined = signatures[role];
          const isSigned = Boolean(snapshot?.at);
          const previousSigned = index === 0 || Boolean(signatures[ROLE_DEFINITIONS[index - 1].role]?.at);
          const isCurrentSigner = snapshot?.user === permissions.user?.id;

          return (
            <div
              key={role}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-4 transition"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">{title}</h4>
                    <p className="text-[11px] text-slate-500">{hint}</p>
                  </div>
                  {isSigned ? (
                    <StatusBadge tone="green">Signed</StatusBadge>
                  ) : (
                    <StatusBadge tone="amber">Pending</StatusBadge>
                  )}
                </div>

                {isSigned && snapshot ? (
                  <div className="space-y-1.5 text-xs text-slate-700">
                    <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>{snapshot.name ?? "Verified Signer"}</span>
                    </div>
                    {snapshot.designation ? (
                      <p className="text-slate-600 font-medium">{snapshot.designation}</p>
                    ) : null}
                    {snapshot.department ? (
                      <p className="text-slate-500">Dept: {snapshot.department}</p>
                    ) : null}
                    {snapshot.email ? (
                      <p className="text-slate-500 break-all">{snapshot.email}</p>
                    ) : null}
                    <p className="text-[11px] text-slate-400">
                      Signed: {formatDateTime(snapshot.at)}
                    </p>
                    {snapshot.notes ? (
                      <div className="mt-2 rounded bg-white p-2 text-slate-600 border border-slate-200/80 italic text-[11px]">
                        &ldquo;{snapshot.notes}&rdquo;
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="py-4 text-center">
                    <p className="text-xs text-slate-400">Awaiting digital signature</p>
                    {!previousSigned ? (
                      <p className="mt-1 text-[11px] text-amber-600">
                        Requires previous stage sign-off
                      </p>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200/80 pt-3">
                {!isSigned && (
                  <Button
                    type="button"
                    variant="primary"
                    className="w-full text-xs"
                    disabled={!previousSigned || signMutation.isPending}
                    onClick={() => {
                      setErrorMessage(null);
                      setSignModalRole(role);
                    }}
                  >
                    <FileSignature className="mr-1.5 h-3.5 w-3.5" />
                    Sign as {title}
                  </Button>
                )}

                {isSigned && permissions.isMasterAdmin && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-xs text-brand-red hover:bg-red-50 hover:text-red-700"
                    disabled={revokeMutation.isPending}
                    onClick={() => {
                      setErrorMessage(null);
                      setRevokeModalRole(role);
                    }}
                  >
                    <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                    Revoke Signature
                  </Button>
                )}

                {isSigned && !permissions.isMasterAdmin && isCurrentSigner && (
                  <span className="text-[11px] text-slate-400 w-full text-center">
                    Signed by you
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={Boolean(signModalRole)}
        onOpenChange={(open) => !open && setSignModalRole(null)}
        title={`Digital Signature — ${ROLE_DEFINITIONS.find((item) => item.role === signModalRole)?.title ?? ""}`}
      >
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">
            You are signing as <strong className="text-slate-900">{permissions.user?.name}</strong> (
            {permissions.roleName}). Your name, designation, department, email, and timestamp will be permanently attached.
          </p>
          {errorMessage ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          ) : null}
          <Field label="Optional Signer Notes / Endorsement">
            <Textarea
              rows={3}
              placeholder="Add any specific review remarks or verification context..."
              value={signNotes}
              onChange={(e) => setSignNotes(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setSignModalRole(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={signMutation.isPending}
              onClick={handleSign}
            >
              {signMutation.isPending ? "Applying Signature..." : "Confirm & Sign"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(revokeModalRole)}
        onOpenChange={(open) => !open && setRevokeModalRole(null)}
        title={`Revoke Signature — ${ROLE_DEFINITIONS.find((item) => item.role === revokeModalRole)?.title ?? ""}`}
      >
        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <span>
              Revoking this signature will also cascade and invalidate any subsequent signatures in the approval chain. A mandatory audit reason is required.
            </span>
          </div>
          {errorMessage ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {errorMessage}
            </div>
          ) : null}
          <Field label="Revocation Reason" required>
            <Textarea
              rows={3}
              placeholder="Reason for revoking signature (min 5 characters)..."
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setRevokeModalRole(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={revokeMutation.isPending || revokeReason.trim().length < 5}
              onClick={handleRevoke}
            >
              {revokeMutation.isPending ? "Revoking..." : "Confirm Revocation"}
            </Button>
          </div>
        </div>
      </Modal>
    </SectionCard>
  );
}
