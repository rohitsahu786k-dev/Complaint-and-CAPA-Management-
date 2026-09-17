import { Types } from "mongoose";
import type { ApiUser } from "@shared/types/api";
import { COMPLAINT_TYPES } from "@shared/constants/domain";
import { canSeeCompany, isMasterAdmin } from "../domain/rbac";
import { findRepeatMatches, type RepeatCandidate } from "../domain/repeat";
import type { DomainActor } from "../domain/types";
import { validateUpload } from "../domain/upload-rules";
import { Attachment } from "../models/Attachment";
import { Capa } from "../models/Capa";
import { Company } from "../models/Company";
import { Complaint } from "../models/Complaint";
import { Department } from "../models/Department";
import { Category, Priority } from "../models/masters";
import { User } from "../models/User";
import { requireActor } from "./complaint.service";
import { resolveTatConfig } from "./config.service";
import { notify } from "./notification.service";
import { nextCapaNumber, nextComplaintNumber } from "./numbering.service";
import { uploadBuffer } from "./upload.service";
import { writeAudit } from "./audit.service";
import { businessRuleError, httpError } from "../utils/http";

export const COMPLAINT_IMPORT_COLUMNS = [
  "Type",
  "Company Code",
  "Received Date",
  "Priority",
  "Category",
  "Sub Category",
  "Customer",
  "Customer Contact",
  "Customer Location",
  "Project",
  "Customer PO",
  "Product",
  "Batch",
  "Responsible Department",
  "Raising Department",
  "Against Department",
  "Owner Username",
  "Source",
  "Reported By",
  "Description"
] as const;

export type ImportRow = Record<string, string | number | undefined>;

export type RowIssue = { row: number; field: string; message: string };

export type ImportPreview = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  issues: RowIssue[];
  preview: {
    row: number;
    valid: boolean;
    duplicate: boolean;
    duplicateOf: string[];
    type: string;
    companyCode: string;
    customer: string;
    category: string;
    receivedAt: string;
    description: string;
  }[];
};

function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

/** Rejects 31/02 and friends, which the Date constructor silently rolls into the next month. */
function buildDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

/**
 * A received date reaches us in one of three shapes: an ISO string (what the browser
 * sends for a real Excel date cell), an Excel serial number, or a locale-formatted
 * string from a CSV or a text-formatted column. An ambiguous d/m/y is read day-first
 * because the portal enters and renders dates as dd MMM yyyy throughout - reading
 * 05/09/2026 as 9 May would silently backdate the complaint by four months.
 *
 * Exported so the ambiguous-format rules can be pinned down by tests.
 */
export function parseDate(value: unknown): Date | null {
  const raw = text(value);
  if (!raw) return null;

  // Excel serial dates arrive as numbers when the sheet was not formatted as text.
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (serial > 20000 && serial < 60000) return new Date(Math.round((serial - 25569) * 86400000));
    return null;
  }

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]|$)/.exec(raw);
  if (iso) return buildDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const parts = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(raw);
  if (parts) {
    let day = Number(parts[1]);
    let month = Number(parts[2]);
    // Only an impossible day forces the American reading of the same string.
    if (month > 12 && day <= 12) [day, month] = [month, day];
    let year = Number(parts[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    return buildDate(year, month, day);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Keeps a validation message readable on a portal carrying a lot of master data. */
function listOptions(values: string[], limit = 12): string {
  if (values.length === 0) return "none are set up yet - add one under Master Data";
  const shown = values.slice(0, limit).join(", ");
  return values.length > limit ? `${shown}, +${values.length - limit} more` : shown;
}

type MasterIndex = {
  companies: Map<string, { id: Types.ObjectId; name: string }>;
  departments: Map<string, Types.ObjectId>;
  priorities: Map<string, Types.ObjectId>;
  users: Map<string, Types.ObjectId>;
  /** The spellings a validation message offers back when a cell does not match. */
  companyCodes: string[];
  departmentNames: string[];
  priorityNames: string[];
  /** Code -> why that real company still cannot be imported into. */
  unavailableCompanies: Map<string, string>;
};

async function loadMasters(actor: DomainActor): Promise<MasterIndex> {
  const [companies, departments, priorities, users] = await Promise.all([
    // Inactive companies are loaded too, only so a rejection can say which of the two
    // reasons applies rather than claiming the company does not exist.
    Company.find().select("name code active").lean(),
    // Active-only, to match every other master lookup here. An inactive department
    // was previously still accepted, which let an import resurrect a retired one.
    Department.find({ active: true }).select("name").lean(),
    Priority.find({ active: true }).select("name").lean(),
    User.find({ active: true }).select("username").lean()
  ]);

  // An importer may only file complaints for companies they are assigned to. Without
  // this filter a company-scoped user could seed records into any operating company,
  // which the single-complaint create path has always refused.
  const visible = companies.filter((entry) => entry.active && canSeeCompany(actor, String(entry._id)));
  const visibleIds = new Set(visible.map((entry) => String(entry._id)));

  const unavailableCompanies = new Map<string, string>();
  companies.forEach((entry) => {
    if (visibleIds.has(String(entry._id))) return;
    unavailableCompanies.set(
      entry.code.toUpperCase(),
      entry.active
        ? "your account is not assigned to that company - ask a Master Admin for access"
        : "that company is marked inactive - reactivate it under Master Data"
    );
  });

  return {
    companies: new Map(visible.map((entry) => [entry.code.toUpperCase(), { id: entry._id, name: entry.name }])),
    departments: new Map(departments.map((entry) => [entry.name.toLowerCase(), entry._id])),
    priorities: new Map(priorities.map((entry) => [entry.name.toLowerCase(), entry._id])),
    users: new Map(users.map((entry) => [entry.username.toLowerCase(), entry._id])),
    companyCodes: visible.map((entry) => entry.code.toUpperCase()).sort(),
    departmentNames: departments.map((entry) => entry.name).sort(),
    priorityNames: priorities.map((entry) => entry.name).sort(),
    unavailableCompanies
  };
}

type NormalisedRow = {
  index: number;
  issues: RowIssue[];
  company?: Types.ObjectId;
  companyCode: string;
  type: string;
  receivedAt: Date | null;
  priority?: Types.ObjectId;
  category: string;
  subCategory: string;
  customer: string;
  customerContact: string;
  customerLocation: string;
  project: string;
  customerPO: string;
  product: string;
  batch: string;
  responsibleDept?: Types.ObjectId;
  internalDept?: Types.ObjectId;
  againstDept?: Types.ObjectId;
  owner?: Types.ObjectId;
  source: string;
  reportedBy: string;
  description: string;
};

function normalise(row: ImportRow, index: number, masters: MasterIndex): NormalisedRow {
  const issues: RowIssue[] = [];
  const push = (field: string, message: string) => issues.push({ row: index, field, message });

  const type = text(row.Type) || "External";
  if (!COMPLAINT_TYPES.includes(type as (typeof COMPLAINT_TYPES)[number])) push("Type", "Must be External or Internal");

  // Every "unknown master data" message names the accepted spellings. The template used
  // to ship a hardcoded sample code, so a portal whose company code differed rejected
  // every row with no way to discover the right value from the screen.
  const companyCode = text(row["Company Code"]).toUpperCase();
  const company = masters.companies.get(companyCode);
  if (!company) {
    const blocked = masters.unavailableCompanies.get(companyCode);
    push(
      "Company Code",
      blocked
        ? `Company ${companyCode} cannot be imported into because ${blocked}.`
        : companyCode
          ? `No company with code ${companyCode}. Use one of: ${listOptions(masters.companyCodes)}`
          : `Company Code is required. Use one of: ${listOptions(masters.companyCodes)}`
    );
  }

  const receivedAt = parseDate(row["Received Date"]);
  if (!receivedAt) {
    push(
      "Received Date",
      text(row["Received Date"])
        ? `Could not be read as a date: "${text(row["Received Date"])}". Use YYYY-MM-DD, or a real Excel date cell.`
        : "Received Date is required. Use YYYY-MM-DD, or a real Excel date cell."
    );
  }

  const priorityName = text(row.Priority).toLowerCase();
  const priority = masters.priorities.get(priorityName);
  if (!priority) {
    push(
      "Priority",
      text(row.Priority)
        ? `Unknown priority "${text(row.Priority)}". Use one of: ${listOptions(masters.priorityNames)}`
        : `Priority is required. Use one of: ${listOptions(masters.priorityNames)}`
    );
  }

  const category = text(row.Category);
  if (!category) push("Category", "Category is required");

  const description = text(row.Description);
  if (description.length < 10) {
    push("Description", `Description must be at least 10 characters (this row has ${description.length})`);
  }

  const customer = text(row.Customer);
  const responsibleDept = masters.departments.get(text(row["Responsible Department"]).toLowerCase());
  const internalDept = masters.departments.get(text(row["Raising Department"]).toLowerCase());
  const againstDept = masters.departments.get(text(row["Against Department"]).toLowerCase());

  const departmentIssue = (raw: string) =>
    raw
      ? `Unknown department "${raw}". Use one of: ${listOptions(masters.departmentNames)}`
      : `Department is required. Use one of: ${listOptions(masters.departmentNames)}`;

  if (type === "External") {
    if (!customer) push("Customer", "Customer is required for an external complaint");
    if (!responsibleDept) push("Responsible Department", departmentIssue(text(row["Responsible Department"])));
  } else {
    if (!internalDept) push("Raising Department", departmentIssue(text(row["Raising Department"])));
    if (!againstDept) push("Against Department", departmentIssue(text(row["Against Department"])));
  }

  const ownerUsername = text(row["Owner Username"]).toLowerCase();
  const owner = ownerUsername ? masters.users.get(ownerUsername) : undefined;
  if (ownerUsername && !owner) push("Owner Username", `No active user named ${ownerUsername}`);

  return {
    index,
    issues,
    company: company?.id,
    companyCode,
    type,
    receivedAt,
    priority,
    category,
    subCategory: text(row["Sub Category"]),
    customer,
    customerContact: text(row["Customer Contact"]),
    customerLocation: text(row["Customer Location"]),
    project: text(row.Project),
    customerPO: text(row["Customer PO"]),
    product: text(row.Product),
    batch: text(row.Batch),
    responsibleDept: type === "External" ? responsibleDept : againstDept,
    internalDept: type === "Internal" ? internalDept : undefined,
    againstDept: type === "Internal" ? againstDept : undefined,
    owner,
    source: text(row.Source),
    reportedBy: text(row["Reported By"]),
    description
  };
}

async function detectDuplicates(rows: NormalisedRow[]) {
  const map = new Map<number, string[]>();
  const valid = rows.filter((row) => row.issues.length === 0 && row.company && row.receivedAt);
  if (valid.length === 0) return map;

  const config = await resolveTatConfig(null);
  const companies = [...new Set(valid.map((row) => String(row.company)))];
  const cutoff = new Date(Date.now() - config.repeatWindowDays * 86400000);
  const existing = await Complaint.find({ company: { $in: companies }, receivedAt: { $gte: cutoff } })
    .select("number company customer product category receivedAt")
    .lean();

  const numberById = new Map(existing.map((entry) => [String(entry._id), entry.number]));
  const population: RepeatCandidate[] = existing.map((entry) => ({
    id: String(entry._id),
    companyId: String(entry.company),
    customer: entry.customer ?? undefined,
    product: entry.product ?? undefined,
    category: entry.category ?? undefined,
    receivedAt: (entry.receivedAt as Date).toISOString()
  }));

  valid.forEach((row) => {
    const candidate: RepeatCandidate = {
      id: `row-${row.index}`,
      companyId: String(row.company),
      customer: row.customer,
      product: row.product,
      category: row.category,
      receivedAt: (row.receivedAt as Date).toISOString()
    };
    const matches = findRepeatMatches(candidate, population, config.repeatWindowDays);
    if (matches.length > 0) {
      map.set(
        row.index,
        matches.map((match) => numberById.get(match.complaintId) ?? match.complaintId.replace(/^row-/, "row "))
      );
    }
    // Later rows are compared against this one too. The batch was previously only
    // checked against the database, so a sheet listing the same complaint twice
    // registered it twice however the duplicate strategy was set.
    population.push(candidate);
  });

  return map;
}

export type ImportReference = {
  columns: string[];
  companyCodes: { code: string; name: string }[];
  priorities: string[];
  departments: string[];
  categories: { name: string; complaintType: string }[];
  sample: Record<string, string>;
};

/**
 * The downloadable template used to carry a hardcoded "ONEPWS" company code, and the
 * screen never showed the real master data, so any portal whose company code differed
 * rejected every row with nothing to correct it against. Both the sample row and the
 * on-screen reference are now built from the master data this importer can actually use.
 */
export async function getImportReference(user: ApiUser | undefined): Promise<ImportReference> {
  const actor = await requireActor(user);
  const masters = await loadMasters(actor);
  const [companies, categories] = await Promise.all([
    Company.find({ active: true }).select("name code").sort({ code: 1 }).lean(),
    Category.find({ active: true, parent: null }).select("name complaintType").sort({ order: 1, name: 1 }).lean()
  ]);

  const visibleCompanies = companies
    .filter((entry) => canSeeCompany(actor, String(entry._id)))
    .map((entry) => ({ code: entry.code.toUpperCase(), name: entry.name }));
  const externalCategory = categories.find((entry) => entry.complaintType === "External");
  const samplePriority = masters.priorityNames.find((name) => name.toLowerCase() === "medium") ?? masters.priorityNames[0];

  return {
    columns: [...COMPLAINT_IMPORT_COLUMNS],
    companyCodes: visibleCompanies,
    priorities: masters.priorityNames,
    departments: masters.departmentNames,
    categories: categories.map((entry) => ({ name: entry.name, complaintType: String(entry.complaintType) })),
    sample: {
      Type: "External",
      "Company Code": visibleCompanies[0]?.code ?? "",
      // ISO keeps the sample unambiguous whichever locale the sheet is opened in.
      "Received Date": new Date().toISOString().slice(0, 10),
      Priority: samplePriority ?? "",
      Category: externalCategory?.name ?? "",
      Customer: "Example Customer Ltd",
      Product: "Workstation",
      "Responsible Department": masters.departmentNames[0] ?? "",
      "Owner Username": "",
      Description: "Describe the complaint in at least ten characters"
    }
  };
}

export async function previewComplaintImport(rows: ImportRow[], user: ApiUser | undefined): Promise<ImportPreview> {
  const actor = await requireActor(user);
  if (!actor.permissions.includes("*") && !actor.permissions.includes("complaint.create")) {
    throw httpError(403, "You do not have permission to import complaints");
  }
  if (rows.length === 0) throw businessRuleError("The uploaded sheet has no data rows", [{ field: "file", message: "No rows were found" }]);
  if (rows.length > 2000) throw businessRuleError("Too many rows in one import", [{ field: "file", message: "Import at most 2000 rows at a time" }]);

  const masters = await loadMasters(actor);
  const normalised = rows.map((row, index) => normalise(row, index + 2, masters));
  const duplicates = await detectDuplicates(normalised);
  const issues = normalised.flatMap((row) => row.issues);

  return {
    totalRows: normalised.length,
    validRows: normalised.filter((row) => row.issues.length === 0).length,
    invalidRows: normalised.filter((row) => row.issues.length > 0).length,
    duplicateRows: duplicates.size,
    issues,
    preview: normalised.map((row) => ({
      row: row.index,
      valid: row.issues.length === 0,
      duplicate: duplicates.has(row.index),
      duplicateOf: duplicates.get(row.index) ?? [],
      type: row.type,
      companyCode: row.companyCode,
      customer: row.customer,
      category: row.category,
      receivedAt: row.receivedAt ? row.receivedAt.toISOString().slice(0, 10) : "",
      description: row.description.slice(0, 120)
    }))
  };
}

export type ImportStrategy = "skip-duplicates" | "import-and-flag";

export async function commitComplaintImport(rows: ImportRow[], strategy: ImportStrategy, user: ApiUser | undefined) {
  const actor = await requireActor(user);
  if (!actor.permissions.includes("*") && !actor.permissions.includes("complaint.create")) {
    throw httpError(403, "You do not have permission to import complaints");
  }

  const masters = await loadMasters(actor);
  const normalised = rows.map((row, index) => normalise(row, index + 2, masters));
  const duplicates = await detectDuplicates(normalised);

  const created: string[] = [];
  const skipped: { row: number; reason: string }[] = [];

  for (const row of normalised) {
    if (row.issues.length > 0) {
      skipped.push({ row: row.index, reason: row.issues.map((issue) => `${issue.field}: ${issue.message}`).join("; ") });
      continue;
    }
    const isDuplicate = duplicates.has(row.index);
    if (isDuplicate && strategy === "skip-duplicates") {
      skipped.push({ row: row.index, reason: `Duplicate of ${duplicates.get(row.index)?.join(", ")}` });
      continue;
    }

    const number = await nextComplaintNumber(row.company as Types.ObjectId, row.receivedAt as Date);
    const complaint = await Complaint.create({
      number,
      company: row.company,
      type: row.type,
      status: "Open",
      receivedAt: row.receivedAt,
      source: row.source || "Import",
      reportedBy: row.reportedBy,
      priority: row.priority,
      customer: row.type === "External" ? row.customer : "",
      customerContact: row.customerContact,
      customerLocation: row.customerLocation,
      project: row.project,
      customerPO: row.customerPO,
      product: row.product,
      batch: row.batch,
      internalDept: row.internalDept,
      againstDept: row.againstDept,
      responsibleDept: row.responsibleDept,
      category: row.category,
      subCategory: row.subCategory,
      description: row.description,
      owner: row.owner ?? new Types.ObjectId(actor.id),
      createdBy: new Types.ObjectId(actor.id),
      isRepeat: isDuplicate,
      repeatBasis: isDuplicate ? "Flagged during Excel import" : "",
      workflowLog: [{ stage: "Registered", at: new Date(), by: new Types.ObjectId(actor.id), byName: actor.name, notes: "Imported from Excel" }]
    });
    created.push(complaint.number);
  }

  await writeAudit({
    actor: user,
    action: "IMPORT",
    entity: "Complaint",
    metadata: { created: created.length, skipped: skipped.length, strategy }
  });

  return { created: created.length, createdNumbers: created, skipped };
}

/* ------------------------------------------------------------------ legacy prototype migration */

export type LegacyDatabase = {
  companies?: { id: string; code?: string; name?: string; numberingPrefix?: string }[];
  departments?: { id: string; name?: string }[];
  users?: { id: string; username?: string; name?: string }[];
  priorities?: { id: string; name?: string }[];
  complaints?: Record<string, unknown>[];
  capas?: Record<string, unknown>[];
  attachments?: Record<string, { name?: string; type?: string; size?: number; dataUrl?: string }>;
};

export type MigrationReport = {
  dryRun: boolean;
  complaintsCreated: number;
  complaintsSkipped: number;
  capasCreated: number;
  attachmentsUploaded: number;
  attachmentsFailed: number;
  warnings: string[];
};

function assertLegacyShape(payload: unknown): LegacyDatabase {
  if (!payload || typeof payload !== "object") {
    throw businessRuleError("The backup file could not be read", [{ field: "file", message: "Expected a JSON object" }]);
  }
  const database = payload as LegacyDatabase;
  if (!Array.isArray(database.complaints)) {
    throw businessRuleError("This does not look like a prototype export", [
      { field: "complaints", message: "The file has no complaints array" }
    ]);
  }
  return database;
}

/**
 * Moves a legacy localStorage export into MongoDB. Existing complaint numbers are
 * never overwritten, and base64 attachments are pushed to Cloudinary so no binary
 * content is written to the database.
 */
export async function migrateLegacyDatabase(payload: unknown, options: { dryRun: boolean }, user: ApiUser | undefined): Promise<MigrationReport> {
  const actor = await requireActor(user);
  if (!isMasterAdmin(actor)) throw httpError(403, "Only a Master Admin can run a migration");

  const database = assertLegacyShape(payload);
  const warnings: string[] = [];
  const report: MigrationReport = {
    dryRun: options.dryRun,
    complaintsCreated: 0,
    complaintsSkipped: 0,
    capasCreated: 0,
    attachmentsUploaded: 0,
    attachmentsFailed: 0,
    warnings
  };

  const [companies, departments, priorities, users] = await Promise.all([
    Company.find().select("code name complaintNumberingPrefix").lean(),
    Department.find().select("name").lean(),
    Priority.find().select("name").lean(),
    User.find().select("username").lean()
  ]);

  const companyByLegacyId = new Map<string, Types.ObjectId>();
  (database.companies ?? []).forEach((legacy) => {
    const match = companies.find(
      (entry) => entry.code.toUpperCase() === (legacy.code ?? "").toUpperCase() || entry.complaintNumberingPrefix === legacy.numberingPrefix
    );
    if (match) companyByLegacyId.set(legacy.id, match._id);
    else warnings.push(`No company matches legacy company ${legacy.code ?? legacy.id}. Its complaints will be skipped.`);
  });

  const deptByName = new Map(departments.map((entry) => [entry.name.toLowerCase(), entry._id]));
  const priorityByLegacyId = new Map<string, Types.ObjectId>();
  (database.priorities ?? []).forEach((legacy) => {
    const match = priorities.find((entry) => entry.name.toLowerCase() === (legacy.name ?? "").toLowerCase());
    if (match) priorityByLegacyId.set(legacy.id, match._id);
  });
  const fallbackPriority = priorities.find((entry) => entry.name === "Medium") ?? priorities[0];

  const userByLegacyId = new Map<string, Types.ObjectId>();
  (database.users ?? []).forEach((legacy) => {
    const match = users.find((entry) => entry.username === (legacy.username ?? "").toLowerCase());
    if (match) userByLegacyId.set(legacy.id, match._id);
  });

  const existingNumbers = new Set((await Complaint.find().select("number").lean()).map((entry) => entry.number));
  const legacyToNewComplaint = new Map<string, { id: Types.ObjectId; number: string }>();

  for (const legacy of database.complaints ?? []) {
    const legacyId = String(legacy.id ?? "");
    const number = String(legacy.number ?? "");
    const company = companyByLegacyId.get(String(legacy.companyId ?? ""));
    if (!company) {
      report.complaintsSkipped += 1;
      continue;
    }
    if (number && existingNumbers.has(number)) {
      report.complaintsSkipped += 1;
      warnings.push(`Complaint ${number} already exists and was left untouched.`);
      continue;
    }
    if (options.dryRun) {
      report.complaintsCreated += 1;
      continue;
    }

    const receivedAt = new Date(String(legacy.receivedAt ?? Date.now()));
    const responsibleDept = deptByName.get(String(legacy.responsibleDept ?? "").toLowerCase());
    const created = await Complaint.create({
      number: number || (await nextComplaintNumber(company, receivedAt)),
      company,
      type: legacy.type === "Internal" ? "Internal" : "External",
      status: String(legacy.status ?? "Open"),
      receivedAt,
      source: String(legacy.source ?? "Legacy migration"),
      reportedBy: String(legacy.reportedBy ?? ""),
      priority: priorityByLegacyId.get(String(legacy.priorityId ?? "")) ?? fallbackPriority?._id,
      customer: String(legacy.customer ?? ""),
      customerContact: String(legacy.customerContact ?? ""),
      customerLocation: String(legacy.customerLocation ?? ""),
      project: String(legacy.project ?? ""),
      customerPO: String(legacy.customerPO ?? ""),
      product: String(legacy.product ?? ""),
      batch: String(legacy.batch ?? ""),
      responsibleDept,
      internalDept: deptByName.get(String(legacy.internalDept ?? "").toLowerCase()),
      againstDept: deptByName.get(String(legacy.againstDept ?? "").toLowerCase()),
      category: String(legacy.category ?? "Other"),
      subCategory: String(legacy.subCategory ?? ""),
      description: String(legacy.description ?? "Migrated from the prototype"),
      owner: userByLegacyId.get(String(legacy.ownerId ?? "")) ?? new Types.ObjectId(actor.id),
      createdBy: new Types.ObjectId(actor.id),
      acknowledgedAt: legacy.acknowledgedAt ? new Date(String(legacy.acknowledgedAt)) : null,
      containmentAt: legacy.containmentAt ? new Date(String(legacy.containmentAt)) : null,
      rcaAt: legacy.rcaAt ? new Date(String(legacy.rcaAt)) : null,
      capaAssignedAt: legacy.capaAssignedAt ? new Date(String(legacy.capaAssignedAt)) : null,
      closedAt: legacy.closedAt ? new Date(String(legacy.closedAt)) : null,
      closureRemarks: String(legacy.closureRemarks ?? ""),
      isRepeat: Boolean(legacy.isRepeat),
      d0: String(legacy.d0 ?? ""),
      d4Occurrence: String(legacy.d4_occ ?? ""),
      d4Escape: String(legacy.d4_esc ?? ""),
      d4Systemic: String(legacy.d4_sys ?? ""),
      d4QcTools: Array.isArray(legacy.d4_qcTools) ? legacy.d4_qcTools : [],
      d2: (legacy.d2 as Record<string, string>) ?? {},
      fiveWhy: (legacy.fivewhy as Record<string, string[]>) ?? {},
      fishbone: (legacy.fishbone as Record<string, string[]>) ?? {},
      workflowLog: [
        { stage: "Migrated", at: new Date(), by: new Types.ObjectId(actor.id), byName: actor.name, notes: "Imported from the prototype export" }
      ]
    });

    legacyToNewComplaint.set(legacyId, { id: created._id, number: created.number });
    existingNumbers.add(created.number);
    report.complaintsCreated += 1;

    // Legacy base64 attachments move to Cloudinary; only metadata is stored here.
    const attachmentIds = Array.isArray(legacy.attachmentIds) ? (legacy.attachmentIds as string[]) : [];
    for (const attachmentId of attachmentIds) {
      const legacyAttachment = database.attachments?.[attachmentId];
      if (!legacyAttachment?.dataUrl) continue;
      try {
        const base64 = legacyAttachment.dataUrl.split(",")[1] ?? "";
        const buffer = Buffer.from(base64, "base64");
        const issues = validateUpload({
          originalname: legacyAttachment.name ?? "legacy-file",
          mimetype: legacyAttachment.type ?? "application/pdf",
          size: buffer.byteLength
        });
        if (issues.length > 0) {
          report.attachmentsFailed += 1;
          warnings.push(`Attachment ${legacyAttachment.name ?? attachmentId} was rejected: ${issues[0].message}`);
          continue;
        }
        const uploaded = await uploadBuffer({
          buffer,
          mimeType: legacyAttachment.type ?? "application/octet-stream",
          folderSuffix: "legacy-migration"
        });
        await Attachment.create({
          publicId: uploaded.publicId,
          secureUrl: uploaded.secureUrl,
          resourceType: "auto",
          originalFilename: legacyAttachment.name ?? "legacy-file",
          mimeType: legacyAttachment.type ?? "application/octet-stream",
          bytes: uploaded.sizeBytes,
          entityType: "Complaint",
          entityId: created._id,
          purpose: "complaint.attachment",
          company,
          uploadedBy: new Types.ObjectId(actor.id)
        });
        report.attachmentsUploaded += 1;
      } catch {
        report.attachmentsFailed += 1;
        warnings.push(`Attachment ${legacyAttachment.name ?? attachmentId} could not be uploaded.`);
      }
    }
  }

  if (!options.dryRun) {
    for (const legacy of database.capas ?? []) {
      const parent = legacyToNewComplaint.get(String(legacy.complaintId ?? ""));
      if (!parent) continue;
      const sequence = (await Capa.countDocuments({ complaint: parent.id })) + 1;
      const complaint = await Complaint.findById(parent.id).select("company responsibleDept priority").lean();
      if (!complaint) continue;
      await Capa.create({
        number: String(legacy.number ?? (await nextCapaNumber(complaint.company, parent.number, sequence))),
        complaint: parent.id,
        company: complaint.company,
        sequence,
        type: String(legacy.type ?? "Corrective"),
        action: String(legacy.action ?? "Migrated action"),
        owner: userByLegacyId.get(String(legacy.ownerId ?? "")) ?? new Types.ObjectId(actor.id),
        department: complaint.responsibleDept,
        priority: complaint.priority,
        assignedAt: legacy.assignedAt ? new Date(String(legacy.assignedAt)) : new Date(),
        dueDate: legacy.dueDate ? new Date(String(legacy.dueDate)) : new Date(),
        completedAt: legacy.completedAt ? new Date(String(legacy.completedAt)) : null,
        status: String(legacy.status ?? "Open"),
        evidence: String(legacy.evidence ?? "")
      });
      report.capasCreated += 1;
    }
  } else {
    report.capasCreated = (database.capas ?? []).length;
  }

  await writeAudit({
    actor: user,
    action: "IMPORT",
    entity: "LegacyMigration",
    metadata: { ...report, warnings: warnings.slice(0, 20) }
  });

  if (!options.dryRun && report.complaintsCreated > 0) {
    await notify({
      recipients: [actor.id],
      message: `Legacy migration finished: ${report.complaintsCreated} complaints and ${report.capasCreated} CAPAs imported`,
      category: "system",
      priority: "high"
    });
  }

  return report;
}

/** Structured JSON backup for a Master Admin. Never includes password hashes or tokens. */
export async function exportBackup(user: ApiUser | undefined) {
  const actor = await requireActor(user);
  if (!isMasterAdmin(actor)) throw httpError(403, "Only a Master Admin can export a backup");

  const [companies, departments, complaints, capas, attachments] = await Promise.all([
    Company.find().lean(),
    Department.find().lean(),
    Complaint.find().lean(),
    Capa.find().lean(),
    Attachment.find().select("-__v").lean()
  ]);

  await writeAudit({ actor: user, action: "EXPORT", entity: "Backup", metadata: { complaints: complaints.length, capas: capas.length } });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    counts: { companies: companies.length, departments: departments.length, complaints: complaints.length, capas: capas.length },
    companies,
    departments,
    complaints,
    capas,
    attachments
  };
}
