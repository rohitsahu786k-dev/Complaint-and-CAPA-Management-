import { Field } from "./Field";
import { Input } from "./Input";

export function DateRangeFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange
}: {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
}) {
  return (
    <>
      <Field label="Start Date">
        <Input type="date" value={startDate} onChange={(event) => onStartDateChange(event.target.value)} />
      </Field>
      <Field label="End Date">
        <Input type="date" value={endDate} onChange={(event) => onEndDateChange(event.target.value)} />
      </Field>
    </>
  );
}
