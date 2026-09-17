import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

export type EditField = {
  key: string;
  label: string;
  type?: "text" | "number" | "email" | "color" | "select";
  options?: { value: string; label: string }[];
  required?: boolean;
  /** Codes and numbering prefixes are stored uppercase. */
  uppercase?: boolean;
  step?: string;
};

export type EditTarget = {
  title: string;
  /** PATCH endpoint for the record being edited. */
  endpoint: string;
  fields: EditField[];
  values: Record<string, string | number>;
  /** Refetches whichever query owns this record once the edit lands. */
  refresh: () => void;
};

/**
 * One modal for every master record. The shapes differ only in their fields, so each
 * screen describes them rather than carrying a hand-written form of its own.
 */
export function MasterEditModal({
  target,
  saving,
  onClose,
  onSave
}: {
  target: EditTarget | null;
  saving: boolean;
  onClose: () => void;
  onSave: (target: EditTarget, body: Record<string, string | number>) => Promise<void>;
}) {
  const [form, setForm] = useState<Record<string, string | number>>({});
  const [error, setError] = useState("");

  // Reseed whenever a different record is opened, so the previous one's values never leak.
  useEffect(() => {
    setForm(target ? { ...target.values } : {});
    setError("");
  }, [target]);

  if (!target) return null;

  const missing = target.fields.filter((field) => field.required && String(form[field.key] ?? "").trim() === "");

  return (
    <Modal open onOpenChange={(open) => !open && onClose()} title={target.title}>
      <div className="grid gap-4 sm:grid-cols-2">
        {target.fields.map((field) => (
          <Field key={field.key} label={field.label} required={field.required}>
            {field.type === "select" ? (
              <Select
                value={String(form[field.key] ?? "")}
                onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
              >
                {(field.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                type={field.type ?? "text"}
                step={field.step}
                value={String(form[field.key] ?? "")}
                onChange={(event) => {
                  const raw = field.uppercase ? event.target.value.toUpperCase() : event.target.value;
                  setForm((current) => ({ ...current, [field.key]: field.type === "number" ? Number(raw) : raw }));
                }}
              />
            )}
          </Field>
        ))}
      </div>

      {error ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-brand-red">{error}</p> : null}

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={saving}
          onClick={async () => {
            if (missing.length > 0) {
              setError(`${missing.map((field) => field.label).join(", ")} cannot be blank.`);
              return;
            }
            setError("");
            await onSave(target, form);
          }}
        >
          Save changes
        </Button>
      </div>
    </Modal>
  );
}
