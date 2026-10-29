import type { ComplaintTypeFilter as ComplaintTypeValue } from "@/services/queries";
import { Field, Select } from "./Field";

/** Dropdown that limits a dashboard to Internal complaints, External complaints, or both. */
export function ComplaintTypeFilter({ value, onChange }: { value: ComplaintTypeValue; onChange: (value: ComplaintTypeValue) => void }) {
  return (
    <Field label="Complaint type">
      <Select value={value} onChange={(event) => onChange(event.target.value as ComplaintTypeValue)}>
        <option value="">All complaints (Internal + External)</option>
        <option value="Internal">Internal complaints</option>
        <option value="External">External complaints</option>
      </Select>
    </Field>
  );
}
