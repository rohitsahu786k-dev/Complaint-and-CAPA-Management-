import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";

export function Modal({
  open,
  onOpenChange,
  title,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-lg bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center justify-between gap-4">
            <Dialog.Title className="text-lg font-bold text-brand-charcoal">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" className="h-8 w-8 px-0" aria-label="Close dialog">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
