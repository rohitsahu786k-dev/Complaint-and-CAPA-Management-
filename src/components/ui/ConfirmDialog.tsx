import { useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";
import { Input } from "./Input";
import { Modal } from "./Modal";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  /** When set, the user must type this exact value before confirming. */
  confirmationPhrase?: string;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
  confirmationPhrase,
  onConfirm
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const blocked = Boolean(confirmationPhrase) && typed !== confirmationPhrase;

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
      setTyped("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title}>
      <div className="flex gap-3">
        {destructive ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-brand-red" /> : null}
        <div className="text-sm leading-6 text-slate-600">{description}</div>
      </div>
      {confirmationPhrase ? (
        <label className="mt-4 block text-sm font-semibold text-slate-700">
          Type <span className="font-mono text-brand-red">{confirmationPhrase}</span> to continue
          <Input className="mt-1.5" value={typed} onChange={(event) => setTyped(event.target.value)} />
        </label>
      ) : null}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
          Cancel
        </Button>
        <Button variant={destructive ? "danger" : "primary"} onClick={confirm} disabled={busy || blocked}>
          {busy ? "Working" : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
