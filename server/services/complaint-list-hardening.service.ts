import { Types } from "mongoose";
import type { ApiUser } from "@shared/types/api";
import type { ComplaintListQuery } from "@shared/schemas/complaint";
import { buildTatPlan } from "../domain/tat";
import { canSeeCompany, hasPermission } from "../domain/rbac";
import { Complaint } from "../models/Complaint";
import { Priority } from "../models/masters";
import { requireActor } from "./complaint.service";
import { resolveTatConfig } from "./config.service";
import { toDomainComplaint } from "./mappers";
import { httpError } from "../utils/http";

function escapeRegex(term: string) {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function overallTatHealth(plan: ReturnType<typeof buildTatPlan>) {
  if (plan.some((entry) => entry.overdue && !entry.completedAt)) return "overdue";
  if (plan.some((entry) => entry.health === "due-soon" && !entry.completedAt)) return "due-soon";
  return "on-time";
}

export async function listComplaintsWithTatFilter(query: ComplaintListQuery, user: ApiUser | undefined) {
  const actor = await requireActor(user);
  if (!hasPermission(actor, "view.all") && !hasPermission(actor, "view.company")) {
    throw httpError(403, "You do not have permission to view complaints");
  }

  const filter: Record<string, unknown> = {};
  if (!hasPermission(actor, "view.all")) filter.company = { $in: actor.companyIds.map((id) => new Types.ObjectId(id)) };
  if (query.company) {
    if (!canSeeCompany(actor, query.company)) throw httpError(403, "You do not have access to this company");
    filter.company = new Types.ObjectId(query.company);
  }
  if (query.type) filter.type = query.type;
  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = new Types.ObjectId(query.priority);
  if (query.category) filter.category = query.category;
  if (query.responsibleDept) filter.responsibleDept = new Types.ObjectId(query.responsibleDept);
  if (query.owner) filter.owner = new Types.ObjectId(query.owner);
  if (typeof query.isRepeat === "boolean") filter.isRepeat = query.isRepeat;
  if (query.receivedFrom || query.receivedTo) {
    filter.receivedAt = {
      ...(query.receivedFrom ? { $gte: query.receivedFrom } : {}),
      ...(query.receivedTo ? { $lte: query.receivedTo } : {})
    };
  }
  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [{ number: regex }, { customer: regex }, { product: regex }, { project: regex }, { description: regex }];
  }

  const sortField = query.sort && /^[a-zA-Z]+$/.test(query.sort) ? query.sort : "receivedAt";
  const sort: Record<string, 1 | -1> = { [sortField]: query.order === "asc" ? 1 : -1 };

  if (!query.tat) {
    const [rows, total] = await Promise.all([
      Complaint.find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .populate("company", "name code")
        .populate("priority", "name color tatMultiplier")
        .populate("owner", "name username")
        .populate("responsibleDept", "name")
        .lean(),
      Complaint.countDocuments(filter)
    ]);
    return { rows, total };
  }

  // TAT health depends on company configuration and priority multipliers, so it is
  // evaluated by the same domain engine used by complaint detail and dashboards.
  // This path is only used when the explicit TAT filter is active.
  const candidates = await Complaint.find(filter).sort(sort).lean();
  const configCache = new Map<string, Awaited<ReturnType<typeof resolveTatConfig>>>();
  const priorityCache = new Map<string, number>();
  const matchingIds: Types.ObjectId[] = [];

  for (const candidate of candidates) {
    const companyId = String(candidate.company);
    let config = configCache.get(companyId);
    if (!config) {
      config = await resolveTatConfig(candidate.company);
      configCache.set(companyId, config);
    }

    const priorityId = candidate.priority ? String(candidate.priority) : "";
    let multiplier = priorityCache.get(priorityId);
    if (multiplier === undefined) {
      const priority = priorityId ? await Priority.findById(priorityId).select("tatMultiplier").lean() : null;
      multiplier = priority?.tatMultiplier ?? 1;
      priorityCache.set(priorityId, multiplier);
    }

    const domain = toDomainComplaint(candidate, multiplier);
    if (overallTatHealth(buildTatPlan(domain, config)) === query.tat) matchingIds.push(candidate._id);
  }

  const total = matchingIds.length;
  const pageIds = matchingIds.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
  if (pageIds.length === 0) return { rows: [], total };

  const populated = await Complaint.find({ _id: { $in: pageIds } })
    .populate("company", "name code")
    .populate("priority", "name color tatMultiplier")
    .populate("owner", "name username")
    .populate("responsibleDept", "name")
    .lean();
  const order = new Map(pageIds.map((id, index) => [String(id), index]));
  populated.sort((a, b) => (order.get(String(a._id)) ?? 0) - (order.get(String(b._id)) ?? 0));
  return { rows: populated, total };
}
