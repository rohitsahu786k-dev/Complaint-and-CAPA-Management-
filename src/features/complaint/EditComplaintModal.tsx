import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Select, Textarea } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast-context";
import { errorText } from "@/lib/errors";
import {
  useApiMutation,
  useAssignableUsers,
  useConfiguration,
  useMasterBootstrap,
  type ComplaintDetail
} from "@/services/queries";

/** An ISO timestamp as the local "YYYY-MM-DDTHH:mm" a datetime-local input expects. */
function toLocalInput(iso: string | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

type Option = { value: string; label: string };

/** Keeps the saved value selectable even when it is no longer in the live list (inactive user, retired category). */
function withCurrent(options: Option[], current: string, currentLabel: string): Option[] {
  return current && !options.some((option) => option.value === current) ? [{ value: current, label: currentLabel }, ...options] : options;
}

/**
 * Master Admin correction of a complaint. Type, company and status stay fixed. Changing the owner
 * hands the complaint over: the new owner is notified and emailed.
 */
export function EditComplaintModal({ complaint, open, onClose }: { complaint: ComplaintDetail; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const configuration = useConfiguration(complaint.company);
  const master = useMasterBootstrap();
  const assignable = useAssignableUsers(complaint.company);
  const isInternal = complaint.type === "Internal";

  const [form, setForm] = useState(() => ({
    ownerKey: complaint.ownerEmployee ? `emp:${complaint.ownerEmployee}` : (complaint.owner ?? ""),
    priority: complaint.priority ?? "",
    category: complaint.category ?? "",
    subCategory: complaint.subCategory ?? "",
    receivedAt: toLocalInput(complaint.receivedAt),
    source: complaint.source ?? "",
    reportedBy: complaint.reportedBy ?? "",
    customer: complaint.customer ?? "",
    customerContact: complaint.customerContact ?? "",
    customerLocation: complaint.customerLocation ?? "",
    customerPO: complaint.customerPO ?? "",
    project: complaint.project ?? "",
    product: complaint.product ?? "",
    batch: complaint.batch ?? "",
    responsibleDept: complaint.responsibleDept ?? "",
    internalDept: complaint.internalDept ?? "",
    againstDept: complaint.againstDept ?? "",
    description: complaint.description ?? ""
  }));
  const [error, setError] = useState<string | null>(null);

  const save = useApiMutation<{ complaint: ComplaintDetail }, Record<string, unknown>>("PATCH", `/api/complaints/${complaint._id}`, [
    ["complaint", complaint._id],
    ["complaints"],
    ["analytics"],
    ["effectiveness"]
  ]);

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const ownerOptions = useMemo(() => {
    const users = (assignable.data?.users ?? []).map((user) => ({ value: user.id, label: `${user.name}${user.role ? ` — ${user.role}` : ""}` }));
    const employees = (assignable.data?.employees ?? []).map((employee) => ({
      value: `emp:${employee.id}`,
      label: `${employee.name}${employee.designation ? ` — ${employee.designation}` : ""}`
    }));
    const currentLabel = complaint.ownerEmployeeName ?? complaint.ownerName ?? "Current owner";
    return { users: withCurrent(users, complaint.ownerEmployee ? "" : (complaint.owner ?? ""), currentLabel), employees: withCurrent(employees, complaint.ownerEmployee ? `emp:${complaint.ownerEmployee}` : "", currentLabel) };
  }, [assignable.data, complaint.owner, complaint.ownerEmployee, complaint.ownerName, complaint.ownerEmployeeName]);

  const categories = withCurrent(
    (configuration.data?.categories ?? []).filter((entry) => entry.complaintType === complaint.type).map((entry) => ({ value: entry.name, label: entry.name })),
    complaint.category ?? "",
    complaint.category ?? ""
  );
  const departments = (master.data?.departments ?? []).map((department) => ({ value: department._id, label: department.name }));
  const deptOptions = (current: string | undefined, label: string | undefined) => withCurrent(departments, current ?? "", label ?? "Current department");

  async function submit() {
    if (!form.category) return setError("Category is required.");
    if (form.description.trim().length < 10) return setError("The description needs at least 10 characters.");
    if (!form.receivedAt) return setError("The received date is required.");
    setError(null);

    const isEmployee = form.ownerKey.startsWith("emp:");
    const payload: Record<string, unknown> = {
      owner: form.ownerKey && !isEmployee ? form.ownerKey : undefined,
      ownerEmployee: isEmployee ? form.ownerKey.slice(4) : undefined,
      priority: form.priority || undefined,
      category: form.category,
      subCategory: form.subCategory,
      receivedAt: new Date(form.receivedAt).toISOString(),
      source: form.source,
      reportedBy: form.reportedBy,
      customerContact: form.customerContact,
      customerLocation: form.customerLocation,
      customerPO: form.customerPO,
      project: form.project,
      product: form.product,
      batch: form.batch,
      description: form.description.trim(),
      ...(isInternal
        ? { internalDept: form.internalDept || undefined, againstDept: form.againstDept || undefined }
        : { customer: form.customer, responsibleDept: form.responsibleDept || undefined })
    };
    try {
      await save.mutateAsync(payload);
      toast.success("Complaint updated", `${complaint.number} was saved and the change is in the audit trail.`);
      onClose();
    } catch (saveError) {
      setError(errorText(saveError, "The complaint could not be saved."));
      toast.failure(saveError, "The complaint could not be saved");
    }
  }

  return (
    <Modal open={open} onOpenChange={(value) => !value && onClose()} title={`Edit complaint ${complaint.number}`} wide>
      <div className="space-y-4 text-sm">
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Master Admin edit. The type, company and status cannot be changed here. Every change is recorded in the audit trail, and a new owner is notified and emailed.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Complaint owner" hint="Handing the complaint to someone else notifies them by email.">
            <Select value={form.ownerKey} onChange={set("ownerKey")}>
              <optgroup label="Portal users">
                {ownerOptions.users.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
              {ownerOptions.employees.length > 0 && (
                <optgroup label="Employee Directory (no portal login)">
                  {ownerOptions.employees.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </Field>

          <Field label="Priority">
            <Select value={form.priority} onChange={set("priority")}>
              {withCurrent(
                (configuration.data?.priorities ?? []).map((priority) => ({ value: priority._id, label: priority.name })),
                complaint.priority ?? "",
                complaint.priorityName ?? "Current priority"
              ).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Category" required>
            <Select value={form.category} onChange={set("category")}>
              {categories.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sub category">
            <Input value={form.subCategory} onChange={set("subCategory")} />
          </Field>

          <Field label="Received on" required>
            <Input type="datetime-local" value={form.receivedAt} onChange={set("receivedAt")} />
          </Field>
          <Field label="Source">
            <Input value={form.source} onChange={set("source")} />
          </Field>

          {isInternal ? (
            <>
              <Field label="Raising department">
                <Select value={form.internalDept} onChange={set("internalDept")}>
                  {deptOptions(complaint.internalDept, complaint.internalDeptName).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Against department" hint="The complaint is answerable to this department.">
                <Select value={form.againstDept} onChange={set("againstDept")}>
                  {deptOptions(complaint.againstDept, complaint.againstDeptName).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          ) : (
            <>
              <Field label="Customer">
                <Input value={form.customer} onChange={set("customer")} />
              </Field>
              <Field label="Responsible department">
                <Select value={form.responsibleDept} onChange={set("responsibleDept")}>
                  {deptOptions(complaint.responsibleDept, complaint.responsibleDeptName).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Customer contact">
                <Input value={form.customerContact} onChange={set("customerContact")} />
              </Field>
              <Field label="Customer location">
                <Input value={form.customerLocation} onChange={set("customerLocation")} />
              </Field>
              <Field label="Customer PO">
                <Input value={form.customerPO} onChange={set("customerPO")} />
              </Field>
              <Field label="Project">
                <Input value={form.project} onChange={set("project")} />
              </Field>
            </>
          )}

          <Field label="Product">
            <Input value={form.product} onChange={set("product")} />
          </Field>
          <Field label="Batch or serial">
            <Input value={form.batch} onChange={set("batch")} />
          </Field>
          <Field label="Reported by">
            <Input value={form.reportedBy} onChange={set("reportedBy")} />
          </Field>
        </div>

        <Field label="Description" required>
          <Textarea rows={4} value={form.description} onChange={set("description")} />
        </Field>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="primary" disabled={save.isPending} onClick={submit}>
            {save.isPending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
