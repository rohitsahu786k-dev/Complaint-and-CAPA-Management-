import { Types } from "mongoose";
import type { ApiUser } from "@shared/types/api";
import { COMPLAINT_TYPES } from "@shared/constants/domain";
import { isMasterAdmin } from "../domain/rbac";
import { findRepeatMatches } from "../domain/repeat";
import { validateUpload } from "../domain/upload-rules";
import { Attachment } from "../models/Attachment";
import { Capa } from "../models/Capa";
import { Company } from "../models/Company";
import { Complaint } from "../models/Complaint";
import { Department } from "../models/Department";
import { Priority } from "../models/masters";
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

function parseDate(value: unknown): Date | null {
  const raw = text(value);
  if (!raw) return null;
  // Excel serial dates arrive as numbers when the sheet was not formatted as text.
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (serial > 20000 && serial < 60000) return new Date(Math.round((serial - 25569) * 86400000));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

type MasterIndex = {
  companies: Map<string, { id: Types.ObjectId; name: string }>;
  departments: Map<string, Types.ObjectId>;
  priorities: Map<string, Types.ObjectId>;
  users: Map<string, Types.ObjectId>;
};

async function loadMasters(): Promise<MasterIndex> {
  const [companies, departments, priorities, users] = await Promise.all([
    Company.find({ active: true }).select("name code").lean(),
    Department.find().select("name").lean(),
    Priority.find({ active: true }).select("name").lean(),
    User.find({ active: true }).select("username").lean()
  ]);
  return {
    companies: new Map(companies.map((entry) => [entry.code.toUpperCase(), { id: entry._id, name: entry.name }])),
    departments: new Map(departments.map((entry) => [entry.name.toLowerCase(), entry._id])),
    priorities: new Map(priorities.map((entry) => [entry.name.toLowerCase(), entry._id])),
    users: new Map(users.map((entry) => [entry.username.toLowerCase(), entry._id]))
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

  const companyCode = text(row["Company Code"]).toUpperCase();
  const company = masters.companies.get(companyCode);
  if (!company) push("Company Code", `No active company with code ${companyCode || "(blank)"}`);

  const receivedAt = parseDate(row["Received Date"]);
  if (!receivedAt) push("Received Date", "Could not be read as a date");

  const priorityName = text(row.Priority).toLowerCase();
  const priority = masters.priorities.get(priorityName);
  if (!priority) push("Priority", `Unknown priority ${text(row.Priority) || "(blank)"}`);

  const category = text(row.Category);
  if (!category) push("Category", "Category is required");

  const description = text(row.Description);
  if (description.length < 10) push("Description", "Description must be at least 10 characters");

  const customer = text(row.Customer);
  const responsibleDept = masters.departments.get(text(row["Responsible Department"]).toLowerCase());
  const internalDept = masters.departments.get(text(row["Raising Department"]).toLowerCase());
  const againstDept = masters.departments.get(text(row["Against Department"]).toLowerCase());

  if (type === "External") {
    if (!customer) push("Customer", "Customer is required for an external complaint");
    if (!responsibleDept) push("Responsible Department", "Unknown or missing department");
  } else {
    if (!internalDept) push("Raising Department", "Unknown or missing department");
    if (!againstDept) push("Against Department", "Unknown or missing department");
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

  valid.forEach((row) => {
    const matches = findRepeatMatches(
      {
        id: `row-${row.index}`,
        companyId: String(row.company),
        customer: row.customer,
        product: row.product,
        category: row.category,
        receivedAt: (row.receivedAt as Date).toISOString()
      },
      existing.map((entry) => ({
        id: String(entry._id),
        companyId: String(entry.company),
        customer: entry.customer ?? undefined,
        product: entry.product ?? undefined,
        category: entry.category ?? undefined,
        receivedAt: (entry.receivedAt as Date).toISOString()
      })),
      config.repeatWindowDays
    );
    if (matches.length > 0) {
      map.set(
        row.index,
        matches.map((match) => existing.find((entry) => String(entry._id) === match.complaintId)?.number ?? "")
      );
    }
  });

  return map;
}

export async function previewComplaintImport(rows: ImportRow[], user: ApiUser | undefined): Promise<ImportPreview> {
  const actor = await requireActor(user);
  if (!actor.permissions.includes("*") && !actor.permissions.includes("complaint.create")) {
    throw httpError(403, "You do not have permission to import complaints");
  }
  if (rows.length === 0) throw businessRuleError("The uploaded sheet has no data rows", [{ field: "file", message: "No rows were found" }]);
  if (rows.length > 2000) throw businessRuleError("Too many rows in one import", [{ field: "file", message: "Import at most 2000 rows at a time" }]);

  const masters = await loadMasters();
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

  const masters = await loadMasters();
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
