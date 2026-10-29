import { Types } from "mongoose";
import type { ApiUser } from "@shared/types/api";
import { canSeeCompany, hasPermission, isMasterAdmin } from "../domain/rbac";
import { daysUntil, nextReviewDue, reviewStatus, type ReviewStatus } from "../domain/effectiveness-review";
import { Complaint } from "../models/Complaint";
import { EffectivenessCheck, type EffectivenessCheckDocument } from "../models/EffectivenessCheck";
import { httpError } from "../utils/http";
import { writeAudit } from "./audit.service";
import { loadComplaintContext, reopenComplaint, requireActor } from "./complaint.service";

/** A tracker never shows more than this many closed complaints; far above a plant's yearly volume. */
const TRACKER_LIMIT = 5000;

export type TrackerQuery = { page: number; pageSize: number; status?: ReviewStatus; search?: string; company?: string };

type CheckInfo = { cycle: number; result: string; remarks: string; checkedAt: Date; checkedByName: string };

function toCheckInfo(check: Pick<EffectivenessCheckDocument, "cycle" | "result" | "remarks" | "checkedAt" | "checkedByName">): CheckInfo {
  return {
    cycle: check.cycle,
    result: check.result,
    remarks: check.remarks ?? "",
    checkedAt: check.checkedAt,
    checkedByName: check.checkedByName ?? ""
  };
}

/** Roles that may sign off a periodic check: the people who verify CAPAs or approve and close complaints. */
function canRecordCheck(actor: Parameters<typeof hasPermission>[0]) {
  return isMasterAdmin(actor) || ["capa.verify", "8d.approve", "complaint.close", "complaint.assign"].some((permission) => hasPermission(actor, permission));
}

/**
 * Every closed complaint with the date its next periodic check falls due. The schedule is derived
 * from the closure date and the checks recorded so far, so complaints closed long ago appear
 * without any migration.
 */
export async function listEffectivenessTracker(query: TrackerQuery, user: ApiUser | undefined) {
  const actor = await requireActor(user);
  if (!hasPermission(actor, "view.all") && !hasPermission(actor, "view.company")) {
    throw httpError(403, "You do not have permission to view complaints");
  }

  const filter: Record<string, unknown> = { status: "Closed", closedAt: { $ne: null } };
  if (!hasPermission(actor, "view.all")) filter.company = { $in: actor.companyIds.map((id) => new Types.ObjectId(id)) };
  if (query.company) {
    if (!canSeeCompany(actor, query.company)) throw httpError(403, "You do not have access to this company");
    filter.company = new Types.ObjectId(query.company);
  }
  if (query.search) {
    const regex = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ number: regex }, { customer: regex }, { product: regex }];
  }

  const complaints = await Complaint.find(filter)
    .select("number type company customer product category responsibleDept owner ownerEmployee closedAt")
    .populate("company", "name code")
    .populate("responsibleDept", "name")
    .populate("owner", "name")
    .populate("ownerEmployee", "name")
    .limit(TRACKER_LIMIT)
    .lean();

  const checks = await EffectivenessCheck.find({ complaint: { $in: complaints.map((entry) => entry._id) } })
    .sort({ cycle: 1 })
    .lean();
  const checksByComplaint = new Map<string, typeof checks>();
  for (const check of checks) {
    const key = String(check.complaint);
    checksByComplaint.set(key, [...(checksByComplaint.get(key) ?? []), check]);
  }

  const now = new Date();
  const rows = complaints.map((complaint) => {
    const closedAt = new Date(complaint.closedAt as Date);
    // Only checks recorded for this closure count; a reopen and re-close starts the series again.
    const current = (checksByComplaint.get(String(complaint._id)) ?? []).filter((check) => check.closedAt.getTime() === closedAt.getTime());
    const last = current[current.length - 1];
    const nextDue = nextReviewDue(closedAt, current.length);
    const daysLeft = daysUntil(nextDue, now);
    return {
      _id: String(complaint._id),
      number: complaint.number,
      type: complaint.type,
      company: complaint.company as unknown as { _id: string; name: string; code: string } | null,
      customer: complaint.customer ?? "",
      product: complaint.product ?? "",
      category: complaint.category ?? "",
      responsibleDept: (complaint.responsibleDept as unknown as { name?: string } | null)?.name ?? "",
      owner:
        (complaint.ownerEmployee as unknown as { name?: string } | null)?.name ??
        (complaint.owner as unknown as { name?: string } | null)?.name ??
        "",
      closedAt,
      checksDone: current.length,
      lastCheck: last ? toCheckInfo(last) : null,
      nextDue,
      daysLeft,
      status: reviewStatus(daysLeft)
    };
  });

  const summary = {
    total: rows.length,
    overdue: rows.filter((row) => row.status === "Overdue").length,
    dueSoon: rows.filter((row) => row.status === "Due Soon").length,
    upcoming: rows.filter((row) => row.status === "Upcoming").length
  };

  const visible = (query.status ? rows.filter((row) => row.status === query.status) : rows).sort(
    (a, b) => a.nextDue.getTime() - b.nextDue.getTime()
  );
  const start = (query.page - 1) * query.pageSize;
  return {
    items: visible.slice(start, start + query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
    total: visible.length,
    totalPages: Math.max(1, Math.ceil(visible.length / query.pageSize)),
    summary,
    canRecord: canRecordCheck(actor)
  };
}

/** Every check recorded for the complaint's current closure, oldest first. */
export async function listEffectivenessChecks(complaintId: string, user: ApiUser | undefined) {
  const context = await loadComplaintContext(complaintId, user);
  if (!context.doc.closedAt) return [];
  const checks = await EffectivenessCheck.find({ complaint: context.doc._id, closedAt: context.doc.closedAt }).sort({ cycle: 1 }).lean();
  return checks.map((check) => ({
    _id: String(check._id),
    dueAt: check.dueAt,
    ...toCheckInfo(check)
  }));
}

export async function recordEffectivenessCheck(
  complaintId: string,
  input: { result: "Sustained" | "Not Sustained"; remarks: string; checkedAt?: Date },
  user: ApiUser | undefined
) {
  const context = await loadComplaintContext(complaintId, user);
  const { doc, actor } = context;
  if (!canRecordCheck(actor)) throw httpError(403, "You do not have permission to record effectiveness checks");
  if (doc.status !== "Closed" || !doc.closedAt) {
    throw httpError(409, "Only a closed complaint has periodic effectiveness checks");
  }

  const closedAt = doc.closedAt;
  const done = await EffectivenessCheck.countDocuments({ complaint: doc._id, closedAt });
  let check;
  try {
    check = await EffectivenessCheck.create({
      complaint: doc._id,
      closedAt,
      cycle: done + 1,
      dueAt: nextReviewDue(closedAt, done),
      result: input.result,
      remarks: input.remarks,
      checkedAt: input.checkedAt ?? new Date(),
      checkedBy: new Types.ObjectId(actor.id),
      checkedByName: actor.name
    });
  } catch (error) {
    // Two people recording the same cycle at once: the unique index lets only one through.
    if ((error as { code?: number }).code === 11000) throw httpError(409, "This check was just recorded by someone else. Refresh and try again.");
    throw error;
  }

  await writeAudit({
    actor: user,
    action: "UPDATE",
    entity: "EffectivenessCheck",
    entityId: String(check._id),
    after: { complaint: doc.number, cycle: check.cycle, result: check.result }
  });

  if (input.result === "Not Sustained") {
    await reopenComplaint(complaintId, `Effectiveness check ${check.cycle}: closure actions not sustained. ${input.remarks}`, user, { system: true });
  }
  return check;
}
