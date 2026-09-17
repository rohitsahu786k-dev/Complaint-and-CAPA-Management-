import { businessRuleError } from "../utils/http";

export type ReferenceCheck = { label: string; count: Promise<number> };

/**
 * Master data that something still points at cannot be deleted. A complaint whose
 * company, department or priority row has vanished cannot be listed, reported on or
 * re-read during an audit, and a regulated register must never lose the context of a
 * record it has already closed. The caller is told to deactivate instead, which hides
 * the row from every picker while leaving the history readable.
 */
export async function assertDeletable(what: string, checks: ReferenceCheck[]) {
  const resolved = await Promise.all(checks.map(async (check) => ({ label: check.label, count: await check.count })));
  const blocking = resolved.filter((entry) => entry.count > 0);
  if (blocking.length === 0) return;

  const detail = blocking.map((entry) => `${entry.count} ${entry.label}`).join(", ");
  throw businessRuleError(
    `${what} is still used by ${detail}. Deactivate it instead - deleting it would leave those records without their ${what.toLowerCase()}.`,
    blocking.map((entry) => ({ field: entry.label, message: `${entry.count} ${entry.label} still reference this record` }))
  );
}
