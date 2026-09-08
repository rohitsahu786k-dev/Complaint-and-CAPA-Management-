// server/app.ts
import { randomUUID } from "node:crypto";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

// server/config/env.ts
import "dotenv/config";
import { z } from "zod";
var envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  COOKIE_SECRET: z.string().min(16),
  APP_BASE_URL: z.string().url().optional().or(z.literal("")),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_UPLOAD_FOLDER: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.string().default("false").transform((value) => value === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_APP_PASSWORD: z.string().optional(),
  SMTP_FROM_EMAIL: z.string().optional(),
  SMTP_FROM_NAME: z.string().default("ONEPWS Complaint & CAPA Portal"),
  CRON_SECRET: z.string().optional()
});
var cachedEnv = null;
function getEnv() {
  if (cachedEnv) return cachedEnv;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Server environment is not configured correctly: ${keys}`);
  }
  if (parsed.data.NODE_ENV === "production") {
    const missing = [];
    if (!parsed.data.APP_BASE_URL) missing.push("APP_BASE_URL");
    if (!parsed.data.CRON_SECRET || parsed.data.CRON_SECRET.length < 24) missing.push("CRON_SECRET");
    if (missing.length) throw new Error(`Production environment is missing required configuration: ${missing.join(", ")}`);
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}
function isProduction() {
  return getEnv().NODE_ENV === "production";
}

// server/config/db.ts
import mongoose from "mongoose";
var globalForMongoose = globalThis;
var cache = globalForMongoose.mongooseCache || { conn: null, promise: null };
globalForMongoose.mongooseCache = cache;
async function connectDB() {
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    cache.promise = mongoose.connect(getEnv().MONGODB_URI, {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 1e4
    });
  }
  try {
    cache.conn = await cache.promise;
  } catch (error) {
    cache.promise = null;
    throw error;
  }
  return cache.conn;
}

// server/models/User.ts
import mongoose2, { Schema } from "mongoose";
var UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    email: { type: String, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: Schema.Types.ObjectId, ref: "Role", required: true, index: true },
    companyIds: [{ type: Schema.Types.ObjectId, ref: "Company", index: true }],
    department: { type: Schema.Types.ObjectId, ref: "Department", index: true },
    employee: { type: Schema.Types.ObjectId, ref: "Employee", index: true },
    active: { type: Boolean, default: true, index: true },
    forcePasswordChange: { type: Boolean, default: false },
    failedLoginCount: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, select: false },
    lastLoginAt: Date,
    passwordChangedAt: Date,
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false }
  },
  { timestamps: true }
);
var User = mongoose2.models.User || mongoose2.model("User", UserSchema);

// server/services/auth.service.ts
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// server/utils/http.ts
import { ZodError } from "zod";
function ok(res, data, status = 200) {
  return res.status(status).json({ data });
}
function httpError(status, message, issues) {
  return Object.assign(new Error(message), { status, issues });
}
function businessRuleError(message, issues) {
  return httpError(422, message, issues);
}
function fail(res, error) {
  if (error instanceof ZodError) {
    const issues = error.issues.map((issue) => ({
      field: issue.path.join(".") || "body",
      message: issue.message
    }));
    return res.status(400).json({ message: "Validation failed", issues });
  }
  const err = error;
  const status = err?.status ?? 500;
  return res.status(status).json({
    message: status === 500 ? "Unexpected server error" : err?.message || "Request failed",
    ...err?.issues ? { issues: err.issues } : {}
  });
}

// server/utils/crypto.ts
import crypto from "node:crypto";
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}
function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// server/services/auth.service.ts
var RESET_TOKEN_TTL_MS = 60 * 60 * 1e3;
var SESSION_TTL_SECONDS = 8 * 60 * 60;
async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}
async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}
function signSession(userId) {
  return jwt.sign({ sub: userId, typ: "session" }, getEnv().JWT_SECRET, {
    expiresIn: SESSION_TTL_SECONDS
  });
}
function verifySession(token) {
  return jwt.verify(token, getEnv().JWT_SECRET);
}
function sessionMaxAgeMs() {
  return SESSION_TTL_SECONDS * 1e3;
}
function sanitizeUser(user) {
  const role = user.role;
  const companyIds = Array.isArray(user.companyIds) ? user.companyIds.map((id2) => String(id2)) : [];
  return {
    id: String(user._id),
    name: String(user.name),
    username: String(user.username),
    email: typeof user.email === "string" ? user.email : void 0,
    role: role && role.name ? {
      id: String(role._id),
      name: role.name,
      permissions: role.permissions || []
    } : void 0,
    companyIds,
    department: user.department ? String(user.department) : void 0,
    employee: user.employee ? String(user.employee) : void 0,
    active: Boolean(user.active),
    forcePasswordChange: Boolean(user.forcePasswordChange)
  };
}
async function authenticate(username, password) {
  const user = await User.findOne({ username: username.toLowerCase(), active: true }).select("+passwordHash +failedLoginCount +lockedUntil").populate("role");
  const generic = httpError(401, "Invalid username or password");
  if (!user) throw generic;
  if (user.lockedUntil && user.lockedUntil > /* @__PURE__ */ new Date()) throw generic;
  const ok2 = await verifyPassword(password, user.passwordHash);
  if (!ok2) {
    user.failedLoginCount = (user.failedLoginCount || 0) + 1;
    if (user.failedLoginCount >= 5) user.lockedUntil = new Date(Date.now() + 15 * 60 * 1e3);
    await user.save();
    throw generic;
  }
  user.failedLoginCount = 0;
  user.lockedUntil = void 0;
  user.lastLoginAt = /* @__PURE__ */ new Date();
  await user.save();
  return user;
}
async function createPasswordResetToken(emailOrUsername) {
  const query = emailOrUsername.includes("@") ? { email: emailOrUsername.toLowerCase(), active: true } : { username: emailOrUsername.toLowerCase(), active: true };
  const user = await User.findOne(query).select("+passwordResetTokenHash +passwordResetExpires");
  if (!user) return null;
  const token = randomToken();
  user.passwordResetTokenHash = sha256(token);
  user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await user.save();
  return { user, token };
}
async function resetPasswordWithToken(token, newPassword) {
  const user = await User.findOne({
    passwordResetTokenHash: sha256(token),
    passwordResetExpires: { $gt: /* @__PURE__ */ new Date() },
    active: true
  }).select("+passwordResetTokenHash +passwordResetExpires +passwordHash");
  if (!user) throw httpError(400, "This reset link is invalid or has expired");
  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = /* @__PURE__ */ new Date();
  user.passwordResetTokenHash = void 0;
  user.passwordResetExpires = void 0;
  user.forcePasswordChange = false;
  await user.save();
  return user;
}

// server/middleware/auth.ts
var SESSION_COOKIE = "onepws_session";
async function optionalUser(req, _res, next) {
  try {
    const token = req.signedCookies?.[SESSION_COOKIE];
    if (!token) return next();
    await connectDB();
    const payload = verifySession(token);
    const user = await User.findById(payload.sub).populate("role");
    if (user?.active) req.user = sanitizeUser(user);
    return next();
  } catch {
    return next();
  }
}
function requireUser(req, _res, next) {
  if (!req.user) return next(httpError(401, "Unauthorized"));
  return next();
}
function requirePermission(permission) {
  return (req, _res, next) => {
    if (!req.user) return next(httpError(401, "Unauthorized"));
    const permissions = req.user.role?.permissions || [];
    if (permissions.includes("*") || permissions.includes(permission)) return next();
    return next(httpError(403, "Forbidden"));
  };
}

// server/middleware/error.ts
function errorHandler(error, _req, res, _next) {
  return fail(res, error);
}

// server/routes/analytics.routes.ts
import { Router } from "express";
import { z as z3 } from "zod";

// shared/schemas/common.ts
import { z as z2 } from "zod";
var objectIdSchema = z2.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
var listQuerySchema = z2.object({
  page: z2.coerce.number().int().min(1).default(1),
  pageSize: z2.coerce.number().int().min(1).max(100).default(25),
  sort: z2.string().trim().max(60).optional(),
  order: z2.enum(["asc", "desc"]).default("desc"),
  search: z2.string().trim().max(160).optional()
});
function paginate(items, total, query) {
  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize))
  };
}

// server/services/analytics.service.ts
import { Types as Types5 } from "mongoose";

// shared/constants/domain.ts
var COMPLAINT_TYPES = ["External", "Internal"];
var COMPLAINT_STATUSES = [
  "Open",
  "Acknowledged",
  "Contained",
  "RCA Done",
  "CAPA Assigned",
  "Under Verification",
  "Closed",
  "Reopened"
];
var WORKFLOW_STAGES = ["ack", "cont", "rca", "capa"];
var WORKFLOW_STAGE_LABELS = {
  ack: "Acknowledgement",
  cont: "Containment",
  rca: "RCA Completion",
  capa: "CAPA Assignment"
};
var WORKFLOW_STAGE_STATUS = {
  ack: "Acknowledged",
  cont: "Contained",
  rca: "RCA Done",
  capa: "CAPA Assigned"
};
var CAPA_TYPES = ["Corrective", "Preventive", "Systemic", "Containment"];
var CAPA_STATUSES = ["Open", "In Progress", "Completed", "Under Verification", "Closed", "Rejected/Reopened"];
var CAPA_EFFECTIVENESS = ["Effective", "Not Effective"];
var EVIDENCE_REVIEW_STATUSES = ["Pending", "Accepted", "Rejected"];
var SIGNATURE_ROLES = ["prepared", "reviewed", "approved"];
var FISHBONE_CATEGORIES = ["Man", "Machine", "Method", "Material", "Measurement", "Environment"];
var D6_DOCUMENT_TYPES = [
  "Drawing",
  "Process Spec",
  "FMEA",
  "Control Plan",
  "Work Instruction",
  "Config Matrix",
  "Inspection Plan",
  "Lessons Learnt DB"
];
var D6_DOCUMENT_STATUSES = ["Pending", "Attached", "NA"];
var QC_TOOLS = [
  "5-Why",
  "Fishbone / Ishikawa",
  "Pareto",
  "Control Chart",
  "Histogram",
  "Scatter Diagram",
  "Check Sheet",
  "Flow Chart",
  "FMEA",
  "Is / Is-Not Analysis"
];
var D7_LT_RESULTS = ["Sustained", "Not Sustained"];
var NOTE_KINDS = ["Note", "MOM", "Customer Communication", "Internal Discussion", "Site Visit"];
var DEFAULT_DELAY_REASONS = [
  "Customer dependency",
  "Supplier dependency",
  "Internal resource constraint",
  "Technical investigation required",
  "Material availability",
  "Management decision pending",
  "Data / information pending",
  "Repeated failure requiring extended investigation",
  "Other"
];
var DEFAULT_TAT_CONFIG = {
  ackHours: 24,
  containmentDays: 3,
  rcaDays: 7,
  capaDays: 15,
  d3ContainmentDays: 3,
  d5CorrectiveActionDays: 15,
  d6VerificationDays: 30,
  d7ShortTermDays: 60,
  d7LongTermDays: 90,
  repeatWindowDays: 60,
  dueSoonHours: 24
};
var DEFAULT_ESCALATION_LEVELS = [
  { level: 1, name: "Owner", triggerHoursOverdue: 0 },
  { level: 2, name: "Department Head", triggerHoursOverdue: 24 },
  { level: 3, name: "Quality Head", triggerHoursOverdue: 72 },
  { level: 4, name: "Management", triggerHoursOverdue: 168 }
];
var DEFAULT_REMINDER_PERCENTAGES = [50, 75, 90];
var AUDIT_ACTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "ASSIGN",
  "ACKNOWLEDGE",
  "STAGE_COMPLETE",
  "UPLOAD",
  "DELETE_ATTACHMENT",
  "SIGN",
  "UNSIGN",
  "CLOSE",
  "REOPEN",
  "CAPA_EFFECTIVENESS",
  "EVIDENCE_ACCEPT",
  "EVIDENCE_REJECT",
  "MASTER_DATA_CHANGE",
  "LOGIN",
  "LOGOUT",
  "PASSWORD_RESET_REQUESTED",
  "PASSWORD_RESET_COMPLETED",
  "PASSWORD_CHANGED",
  "IMPORT",
  "EXPORT"
];
var NOTIFICATION_CATEGORIES = ["complaint", "capa", "workflow", "evidence", "effectiveness", "system"];
var ATTACHMENT_PURPOSES = ["complaint.attachment", "capa.evidence", "capa.effectiveness", "d6.document", "company.logo"];
var ALLOWED_UPLOAD_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "text/plain",
  "video/mp4",
  "video/quicktime"
];
var MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
var EMAIL_TRIGGER_EVENTS = [
  // Auth
  "USER_CREATED",
  "PASSWORD_RESET_REQUESTED",
  "PASSWORD_CHANGED",
  // Complaint
  "COMPLAINT_CREATED",
  "COMPLAINT_ASSIGNED",
  "COMPLAINT_REASSIGNED",
  "COMPLAINT_ACKNOWLEDGED",
  "COMPLAINT_CONTAINMENT_COMPLETED",
  "COMPLAINT_RCA_COMPLETED",
  "COMPLAINT_CAPA_ASSIGNED",
  "COMPLAINT_STATUS_CHANGED",
  "COMPLAINT_CLOSED",
  "COMPLAINT_REOPENED",
  "COMPLAINT_REPORT_SHARED",
  // TAT
  "TAT_REMINDER",
  "TAT_DUE_SOON",
  "TAT_OVERDUE",
  "TAT_ESCALATION",
  // CAPA
  "CAPA_ASSIGNED",
  "CAPA_REASSIGNED",
  "CAPA_DUE_REMINDER",
  "CAPA_OVERDUE",
  "CAPA_COMPLETED",
  "CAPA_EVIDENCE_UPLOADED",
  "CAPA_EVIDENCE_ACCEPTED",
  "CAPA_EVIDENCE_REJECTED",
  "CAPA_EFFECTIVENESS_VERIFIED",
  "CAPA_NOT_EFFECTIVE",
  // Signature
  "COMPLAINT_PREPARED",
  "COMPLAINT_REVIEWED",
  "COMPLAINT_APPROVED",
  "SIGNATURE_REVOKED",
  // Summary
  "DAILY_SUMMARY",
  "WEEKLY_SUMMARY"
];

// server/domain/rbac.ts
function hasPermission(actor, permission) {
  if (!actor) return false;
  return actor.permissions.includes("*") || actor.permissions.includes(permission);
}
function isMasterAdmin(actor) {
  return Boolean(actor && (actor.roleName === "Master Admin" || actor.permissions.includes("*")));
}
function isQualityHead(actor) {
  return actor?.roleName === "Quality Head";
}
function canSeeCompany(actor, companyId) {
  if (!actor) return false;
  if (actor.companyIds.includes("*") || hasPermission(actor, "view.all")) return true;
  return actor.companyIds.includes(companyId);
}
function canViewComplaint(actor, complaint) {
  if (!actor) return false;
  if (!canSeeCompany(actor, complaint.companyId)) return false;
  return hasPermission(actor, "view.all") || hasPermission(actor, "view.company");
}
function canEditComplaint(actor, complaint) {
  if (!actor) return false;
  if (isMasterAdmin(actor)) return true;
  if (!canSeeCompany(actor, complaint.companyId)) return false;
  if (hasPermission(actor, "complaint.edit")) return true;
  if (hasPermission(actor, "complaint.edit.own") && complaint.ownerId === actor.id) return true;
  if (hasPermission(actor, "complaint.edit.dept") && complaint.responsibleDept && complaint.responsibleDept === actor.department)
    return true;
  return false;
}
function canEditCapa(actor, capa, complaint) {
  if (!actor) return false;
  if (isMasterAdmin(actor)) return true;
  if (!canSeeCompany(actor, capa.companyId)) return false;
  if (hasPermission(actor, "capa.edit.own") && capa.ownerId === actor.id) return true;
  if (hasPermission(actor, "capa.approve.dept") && capa.department && capa.department === actor.department) return true;
  if (hasPermission(actor, "capa.verify")) return true;
  if (hasPermission(actor, "complaint.assign") || hasPermission(actor, "complaint.edit")) return canEditComplaint(actor, complaint);
  return false;
}
function canReviewCapaEvidence(actor, capa) {
  if (!actor) return false;
  if (isMasterAdmin(actor)) return true;
  return canSeeCompany(actor, capa.companyId) && hasPermission(actor, "capa.evidence.review");
}
function canVerifyEffectiveness(actor, capa) {
  if (!actor) return false;
  if (isMasterAdmin(actor)) return true;
  return canSeeCompany(actor, capa.companyId) && hasPermission(actor, "capa.verify");
}
function canCloseComplaint(actor, complaint) {
  if (!actor) return false;
  if (isMasterAdmin(actor)) return true;
  return canSeeCompany(actor, complaint.companyId) && hasPermission(actor, "complaint.close");
}

// server/domain/tat.ts
var HOUR_MS = 36e5;
var DAY_MS = 864e5;
function addHours(base, hours) {
  return new Date(new Date(base).getTime() + hours * HOUR_MS);
}
function addDays(base, days) {
  return new Date(new Date(base).getTime() + days * DAY_MS);
}
function computeStageDueDates(complaint, config) {
  const multiplier = complaint.priorityMultiplier > 0 ? complaint.priorityMultiplier : 1;
  const base = complaint.receivedAt;
  return {
    ack: addHours(base, config.ackHours * multiplier),
    cont: addDays(base, config.containmentDays * multiplier),
    rca: addDays(base, config.rcaDays * multiplier),
    capa: addDays(base, config.capaDays * multiplier)
  };
}
function stageHealth(dueAt, completedAt, now, dueSoonHours) {
  const due = new Date(dueAt);
  if (completedAt) return new Date(completedAt) <= due ? "on-time" : "overdue";
  if (now > due) return "overdue";
  const hoursRemaining = (due.getTime() - now.getTime()) / HOUR_MS;
  return hoursRemaining <= dueSoonHours ? "due-soon" : "on-time";
}
var COMPLETION_FIELD = {
  ack: "acknowledgedAt",
  cont: "containmentAt",
  rca: "rcaAt",
  capa: "capaAssignedAt"
};
var DELAY_FIELD = {
  ack: "ackDelayReason",
  cont: "contDelayReason",
  rca: "rcaDelayReason",
  capa: "capaDelayReason"
};
function buildTatPlan(complaint, config, now = /* @__PURE__ */ new Date()) {
  const due = computeStageDueDates(complaint, config);
  return WORKFLOW_STAGES.map((stage) => {
    const completedAt = complaint[COMPLETION_FIELD[stage]] ?? null;
    const delay2 = complaint[DELAY_FIELD[stage]];
    const health = stageHealth(due[stage], completedAt, now, config.dueSoonHours);
    return {
      stage,
      dueAt: due[stage].toISOString(),
      completedAt,
      health,
      overdue: health === "overdue",
      delayReason: delay2?.category ?? null,
      delayExplanation: delay2?.explanation ?? null
    };
  });
}
function isStageOverdueNow(complaint, stage, config, now = /* @__PURE__ */ new Date()) {
  return now > computeStageDueDates(complaint, config)[stage];
}

// server/models/Capa.ts
import mongoose3, { Schema as Schema2 } from "mongoose";
var EvidenceFileSchema = new Schema2(
  {
    attachment: { type: Schema2.Types.ObjectId, ref: "Attachment", required: true },
    description: { type: String, trim: true, default: "" },
    uploadedBy: { type: Schema2.Types.ObjectId, ref: "User" },
    uploadedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);
var EvidenceReviewSchema = new Schema2(
  {
    status: { type: String, enum: EVIDENCE_REVIEW_STATUSES, default: "Pending" },
    by: { type: Schema2.Types.ObjectId, ref: "User" },
    byName: { type: String, trim: true },
    at: { type: Date, default: null },
    remarks: { type: String, trim: true, default: "" }
  },
  { _id: false }
);
var EvidenceReviewHistorySchema = new Schema2(
  {
    status: { type: String, enum: EVIDENCE_REVIEW_STATUSES, required: true },
    by: { type: Schema2.Types.ObjectId, ref: "User" },
    byName: { type: String, trim: true },
    at: { type: Date, default: Date.now },
    remarks: { type: String, trim: true, default: "" }
  },
  { _id: false }
);
var CapaSchema = new Schema2(
  {
    number: { type: String, required: true, unique: true, trim: true, index: true },
    complaint: { type: Schema2.Types.ObjectId, ref: "Complaint", required: true, index: true },
    company: { type: Schema2.Types.ObjectId, ref: "Company", required: true, index: true },
    sequence: { type: Number, required: true },
    type: { type: String, enum: CAPA_TYPES, default: "Corrective" },
    action: { type: String, required: true, trim: true },
    owner: { type: Schema2.Types.ObjectId, ref: "User", index: true },
    department: { type: Schema2.Types.ObjectId, ref: "Department", index: true },
    priority: { type: Schema2.Types.ObjectId, ref: "Priority" },
    assignedAt: { type: Date, default: Date.now },
    dueDate: { type: Date, required: true, index: true },
    completedAt: { type: Date, default: null },
    status: { type: String, enum: CAPA_STATUSES, default: "Open", index: true },
    evidence: { type: String, trim: true, default: "" },
    evidenceFiles: { type: [EvidenceFileSchema], default: [] },
    evidenceReview: { type: EvidenceReviewSchema, default: () => ({ status: "Pending" }) },
    evidenceReviewHistory: { type: [EvidenceReviewHistorySchema], default: [] },
    delayReason: { type: String, trim: true, default: "" },
    effectiveness: { type: String, enum: [...CAPA_EFFECTIVENESS, null], default: null, index: true },
    effectivenessVerifiedAt: { type: Date, default: null },
    effectivenessVerifiedBy: { type: Schema2.Types.ObjectId, ref: "User" },
    effectivenessEvidence: { type: String, trim: true, default: "" },
    effectivenessEvidenceFiles: { type: [EvidenceFileSchema], default: [] },
    verificationMethod: { type: String, trim: true, default: "" },
    effectivenessRemarks: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);
CapaSchema.index({ company: 1, status: 1, dueDate: 1 });
CapaSchema.index({ owner: 1, status: 1 });
CapaSchema.index({ complaint: 1, sequence: 1 });
var Capa = mongoose3.models.Capa || mongoose3.model("Capa", CapaSchema);

// server/models/Complaint.ts
import mongoose4, { Schema as Schema3 } from "mongoose";
var DelayReasonSchema = new Schema3(
  {
    category: { type: String, required: true, trim: true },
    explanation: { type: String, required: true, trim: true },
    recovery: { type: String, trim: true },
    recordedAt: { type: Date, default: Date.now },
    recordedBy: { type: Schema3.Types.ObjectId, ref: "User" }
  },
  { _id: false }
);
var TeamMemberSchema = new Schema3(
  {
    employee: { type: Schema3.Types.ObjectId, ref: "Employee" },
    name: { type: String, trim: true },
    dept: { type: String, trim: true },
    designation: { type: String, trim: true },
    email: { type: String, trim: true },
    role: { type: String, trim: true }
  },
  { _id: false }
);
var ActionRowSchema = new Schema3(
  {
    action: { type: String, trim: true },
    resp: { type: String, trim: true },
    respEmployee: { type: Schema3.Types.ObjectId, ref: "Employee" },
    target: { type: String, trim: true },
    targetAuto: { type: Boolean, default: false },
    status: { type: String, trim: true, default: "Open" },
    remarks: { type: String, trim: true },
    ctqImpact: { type: String, trim: true },
    customerApproval: { type: String, trim: true }
  },
  { _id: false }
);
var D6DocumentSchema = new Schema3(
  {
    docType: { type: String, enum: D6_DOCUMENT_TYPES, required: true },
    status: { type: String, enum: D6_DOCUMENT_STATUSES, default: "Pending" },
    attachment: { type: Schema3.Types.ObjectId, ref: "Attachment", default: null },
    revision: { type: String, trim: true },
    revDate: { type: String, trim: true },
    approver: { type: String, trim: true },
    naJustification: { type: String, trim: true }
  },
  { _id: false }
);
var SignatureSchema = new Schema3(
  {
    user: { type: Schema3.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    designation: { type: String, trim: true },
    department: { type: String, trim: true },
    email: { type: String, trim: true },
    at: { type: Date, required: true },
    notes: { type: String, trim: true }
  },
  { _id: false }
);
var WorkflowLogSchema = new Schema3(
  {
    stage: { type: String, required: true, trim: true },
    at: { type: Date, default: Date.now },
    by: { type: Schema3.Types.ObjectId, ref: "User" },
    byName: { type: String, trim: true },
    notes: { type: String, trim: true }
  },
  { _id: false }
);
var RepeatLinkSchema = new Schema3(
  {
    complaint: { type: Schema3.Types.ObjectId, ref: "Complaint", required: true },
    number: { type: String, trim: true },
    basis: [{ type: String, trim: true }]
  },
  { _id: false }
);
var fishboneDefaults = () => FISHBONE_CATEGORIES.reduce((acc, category) => {
  acc[category] = [];
  return acc;
}, {});
var d6DefaultList = () => D6_DOCUMENT_TYPES.map((docType) => ({ docType, status: "Pending" }));
var ComplaintSchema = new Schema3(
  {
    number: { type: String, required: true, unique: true, trim: true, index: true },
    company: { type: Schema3.Types.ObjectId, ref: "Company", required: true, index: true },
    type: { type: String, enum: COMPLAINT_TYPES, required: true, index: true },
    status: { type: String, enum: COMPLAINT_STATUSES, default: "Open", index: true },
    receivedAt: { type: Date, required: true, index: true },
    source: { type: String, trim: true },
    reportedBy: { type: String, trim: true },
    priority: { type: Schema3.Types.ObjectId, ref: "Priority", required: true, index: true },
    customer: { type: String, trim: true, index: true },
    customerContact: { type: String, trim: true },
    customerLocation: { type: String, trim: true },
    project: { type: String, trim: true },
    customerPO: { type: String, trim: true },
    product: { type: String, trim: true, index: true },
    batch: { type: String, trim: true },
    internalDept: { type: Schema3.Types.ObjectId, ref: "Department" },
    againstDept: { type: Schema3.Types.ObjectId, ref: "Department" },
    responsibleDept: { type: Schema3.Types.ObjectId, ref: "Department", index: true },
    category: { type: String, trim: true, index: true },
    subCategory: { type: String, trim: true },
    description: { type: String, required: true, trim: true },
    owner: { type: Schema3.Types.ObjectId, ref: "User", index: true },
    createdBy: { type: Schema3.Types.ObjectId, ref: "User" },
    acknowledgedAt: { type: Date, default: null },
    ackDelayReason: { type: DelayReasonSchema, default: null },
    containmentAt: { type: Date, default: null },
    containmentNotes: { type: String, trim: true, default: "" },
    contDelayReason: { type: DelayReasonSchema, default: null },
    rcaAt: { type: Date, default: null },
    rcaDelayReason: { type: DelayReasonSchema, default: null },
    capaAssignedAt: { type: Date, default: null },
    capaDelayReason: { type: DelayReasonSchema, default: null },
    closedAt: { type: Date, default: null, index: true },
    closedBy: { type: Schema3.Types.ObjectId, ref: "User" },
    closureRemarks: { type: String, trim: true, default: "" },
    reopenedAt: { type: Date, default: null },
    reopenReason: { type: String, trim: true },
    isRepeat: { type: Boolean, default: false, index: true },
    repeatOf: { type: [RepeatLinkSchema], default: [] },
    repeatBasis: { type: String, trim: true, default: "" },
    repeatReviewedBy: { type: Schema3.Types.ObjectId, ref: "User" },
    repeatReviewedAt: { type: Date, default: null },
    repeatReviewRemarks: { type: String, trim: true },
    d0: { type: String, trim: true, default: "" },
    d1Team: { type: [TeamMemberSchema], default: [] },
    d2: {
      what: { type: String, trim: true, default: "" },
      where: { type: String, trim: true, default: "" },
      when: { type: String, trim: true, default: "" },
      who: { type: String, trim: true, default: "" },
      involved: { type: String, trim: true, default: "" },
      howMany: { type: String, trim: true, default: "" },
      how: { type: String, trim: true, default: "" }
    },
    d3Actions: { type: [ActionRowSchema], default: [] },
    d4QcTools: { type: [String], default: [] },
    d4Occurrence: { type: String, trim: true, default: "" },
    d4Escape: { type: String, trim: true, default: "" },
    d4Systemic: { type: String, trim: true, default: "" },
    rootCauseCategory: { type: String, trim: true, index: true },
    fiveWhy: {
      occurrence: { type: [String], default: [] },
      escape: { type: [String], default: [] },
      systemic: { type: [String], default: [] },
      singleChain: { type: [String], default: [] }
    },
    fishbone: { type: Schema3.Types.Mixed, default: fishboneDefaults },
    d5Occurrence: { type: [ActionRowSchema], default: [] },
    d5Escape: { type: [ActionRowSchema], default: [] },
    d5Systemic: { type: [ActionRowSchema], default: [] },
    d5Safety: { type: String, trim: true, default: "" },
    d6Verify: { type: [ActionRowSchema], default: [] },
    d6DocsList: { type: [D6DocumentSchema], default: d6DefaultList },
    d6Horizontal: { type: String, trim: true, default: "" },
    d7ShortTermDate: { type: String, trim: true, default: "" },
    d7RepeatObserved: { type: Boolean, default: false },
    d7Regulatory: { type: String, trim: true, default: "" },
    d7Actions: { type: [ActionRowSchema], default: [] },
    d7NoRepeatConfirmed: { type: Boolean, default: false },
    d7LongTermDate: { type: String, trim: true, default: "" },
    d7LongTermRepeatObserved: { type: Boolean, default: false },
    d7LongTermResult: { type: String, enum: [...D7_LT_RESULTS, ""], default: "" },
    d7LongTermNotes: { type: String, trim: true, default: "" },
    d8Recognition: { type: String, trim: true, default: "" },
    d8ReviewedBy: { type: String, trim: true, default: "" },
    d8ClosedDate: { type: String, trim: true, default: "" },
    /** Internal complaints use a reduced investigation instead of the full 8D. */
    internalInvestigation: {
      summary: { type: String, trim: true, default: "" },
      findings: { type: String, trim: true, default: "" },
      correctiveAction: { type: String, trim: true, default: "" },
      evidence: { type: String, trim: true, default: "" }
    },
    overallEffectiveness: {
      result: { type: String, trim: true, default: "" },
      at: { type: Date, default: null },
      by: { type: Schema3.Types.ObjectId, ref: "User" },
      comments: { type: String, trim: true, default: "" }
    },
    signatures: {
      prepared: { type: SignatureSchema, default: null },
      reviewed: { type: SignatureSchema, default: null },
      approved: { type: SignatureSchema, default: null }
    },
    workflowLog: { type: [WorkflowLogSchema], default: [] }
  },
  { timestamps: true }
);
ComplaintSchema.index({ company: 1, status: 1, receivedAt: -1 });
ComplaintSchema.index({ company: 1, category: 1, customer: 1, receivedAt: -1 });
ComplaintSchema.index({ company: 1, product: 1, receivedAt: -1 });
ComplaintSchema.index({ owner: 1, status: 1 });
ComplaintSchema.index({ responsibleDept: 1, status: 1 });
ComplaintSchema.index({ number: "text", description: "text", customer: "text", product: "text", project: "text" });
var Complaint = mongoose4.models.Complaint || mongoose4.model("Complaint", ComplaintSchema);

// server/models/masters.ts
import mongoose5, { Schema as Schema4 } from "mongoose";
var CategorySchema = new Schema4(
  {
    name: { type: String, required: true, trim: true },
    complaintType: { type: String, enum: COMPLAINT_TYPES, required: true, index: true },
    parent: { type: Schema4.Types.ObjectId, ref: "Category", default: null, index: true },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);
CategorySchema.index({ complaintType: 1, parent: 1, name: 1 }, { unique: true });
var Category = mongoose5.models.Category || mongoose5.model("Category", CategorySchema);
var PrioritySchema = new Schema4(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },
    color: { type: String, required: true, trim: true },
    /** Scales every TAT window: below 1 tightens the target, above 1 relaxes it. */
    tatMultiplier: { type: Number, required: true, default: 1, min: 0.1, max: 10 },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);
var Priority = mongoose5.models.Priority || mongoose5.model("Priority", PrioritySchema);
var DelayReasonSchema2 = new Schema4(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);
var DelayReason = mongoose5.models.DelayReason || mongoose5.model("DelayReason", DelayReasonSchema2);
var RootCauseCategorySchema = new Schema4(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);
var RootCauseCategory = mongoose5.models.RootCauseCategory || mongoose5.model("RootCauseCategory", RootCauseCategorySchema);

// server/models/configuration.ts
import mongoose6, { Schema as Schema5 } from "mongoose";
var TATConfigurationSchema = new Schema5(
  {
    company: { type: Schema5.Types.ObjectId, ref: "Company", default: null, unique: true, index: true },
    ackHours: { type: Number, default: DEFAULT_TAT_CONFIG.ackHours, min: 1 },
    containmentDays: { type: Number, default: DEFAULT_TAT_CONFIG.containmentDays, min: 1 },
    rcaDays: { type: Number, default: DEFAULT_TAT_CONFIG.rcaDays, min: 1 },
    capaDays: { type: Number, default: DEFAULT_TAT_CONFIG.capaDays, min: 1 },
    d3ContainmentDays: { type: Number, default: DEFAULT_TAT_CONFIG.d3ContainmentDays, min: 1 },
    d5CorrectiveActionDays: { type: Number, default: DEFAULT_TAT_CONFIG.d5CorrectiveActionDays, min: 1 },
    d6VerificationDays: { type: Number, default: DEFAULT_TAT_CONFIG.d6VerificationDays, min: 1 },
    d7ShortTermDays: { type: Number, default: DEFAULT_TAT_CONFIG.d7ShortTermDays, min: 1 },
    d7LongTermDays: { type: Number, default: DEFAULT_TAT_CONFIG.d7LongTermDays, min: 1 },
    repeatWindowDays: { type: Number, default: DEFAULT_TAT_CONFIG.repeatWindowDays, min: 1 },
    dueSoonHours: { type: Number, default: DEFAULT_TAT_CONFIG.dueSoonHours, min: 1 }
  },
  { timestamps: true }
);
var TATConfiguration = mongoose6.models.TATConfiguration || mongoose6.model("TATConfiguration", TATConfigurationSchema);
var EscalationLevelSchema = new Schema5(
  {
    level: { type: Number, required: true, min: 1 },
    name: { type: String, required: true, trim: true },
    triggerHoursOverdue: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);
var EscalationConfigurationSchema = new Schema5(
  {
    company: { type: Schema5.Types.ObjectId, ref: "Company", default: null, unique: true, index: true },
    levels: { type: [EscalationLevelSchema], default: [] },
    reminderPercentages: { type: [Number], default: [...DEFAULT_REMINDER_PERCENTAGES] },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);
var EscalationConfiguration = mongoose6.models.EscalationConfiguration || mongoose6.model("EscalationConfiguration", EscalationConfigurationSchema);
var NumberingConfigurationSchema = new Schema5(
  {
    company: { type: Schema5.Types.ObjectId, ref: "Company", required: true, unique: true, index: true },
    prefix: { type: String, required: true, trim: true },
    sequencePadding: { type: Number, default: 5, min: 3, max: 10 },
    capaSequencePadding: { type: Number, default: 2, min: 2, max: 6 },
    resetOnFinancialYear: { type: Boolean, default: true },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);
var NumberingConfiguration = mongoose6.models.NumberingConfiguration || mongoose6.model("NumberingConfiguration", NumberingConfigurationSchema);

// server/models/Company.ts
import mongoose7, { Schema as Schema6 } from "mongoose";
var CompanyLogoSchema = new Schema6(
  {
    secureUrl: { type: String, trim: true },
    publicId: { type: String, trim: true }
  },
  { _id: false }
);
var CompanySchema = new Schema6(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    logo: CompanyLogoSchema,
    documentNumber: { type: String, trim: true },
    revision: { type: String, trim: true },
    effectiveDate: Date,
    complaintNumberingPrefix: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);
var Company = mongoose7.models.Company || mongoose7.model("Company", CompanySchema);

// server/services/config.service.ts
async function resolveTatConfig(companyId) {
  const [specific, global] = await Promise.all([
    companyId ? TATConfiguration.findOne({ company: companyId }).lean() : null,
    TATConfiguration.findOne({ company: null }).lean()
  ]);
  const source = specific ?? global;
  if (!source) return { ...DEFAULT_TAT_CONFIG };
  return {
    ackHours: source.ackHours ?? DEFAULT_TAT_CONFIG.ackHours,
    containmentDays: source.containmentDays ?? DEFAULT_TAT_CONFIG.containmentDays,
    rcaDays: source.rcaDays ?? DEFAULT_TAT_CONFIG.rcaDays,
    capaDays: source.capaDays ?? DEFAULT_TAT_CONFIG.capaDays,
    d3ContainmentDays: source.d3ContainmentDays ?? DEFAULT_TAT_CONFIG.d3ContainmentDays,
    d5CorrectiveActionDays: source.d5CorrectiveActionDays ?? DEFAULT_TAT_CONFIG.d5CorrectiveActionDays,
    d6VerificationDays: source.d6VerificationDays ?? DEFAULT_TAT_CONFIG.d6VerificationDays,
    d7ShortTermDays: source.d7ShortTermDays ?? DEFAULT_TAT_CONFIG.d7ShortTermDays,
    d7LongTermDays: source.d7LongTermDays ?? DEFAULT_TAT_CONFIG.d7LongTermDays,
    repeatWindowDays: source.repeatWindowDays ?? DEFAULT_TAT_CONFIG.repeatWindowDays,
    dueSoonHours: source.dueSoonHours ?? DEFAULT_TAT_CONFIG.dueSoonHours
  };
}
async function resolveEscalation(companyId) {
  const [specific, global] = await Promise.all([
    companyId ? EscalationConfiguration.findOne({ company: companyId }).lean() : null,
    EscalationConfiguration.findOne({ company: null }).lean()
  ]);
  const source = specific ?? global;
  const levels = source?.levels?.length ? source.levels.map((entry) => ({ ...entry })) : DEFAULT_ESCALATION_LEVELS.map((entry) => ({ ...entry }));
  const reminderPercentages = source?.reminderPercentages?.length ? [...source.reminderPercentages] : [...DEFAULT_REMINDER_PERCENTAGES];
  return { levels, reminderPercentages };
}
async function activeDelayReasons() {
  const rows = await DelayReason.find({ active: true }).sort({ order: 1, name: 1 }).lean();
  return rows.length ? rows.map((row) => row.name) : [...DEFAULT_DELAY_REASONS];
}
async function resolveNumbering(companyId) {
  const [config, company] = await Promise.all([
    NumberingConfiguration.findOne({ company: companyId, active: true }).lean(),
    Company.findById(companyId).lean()
  ]);
  if (!company) throw httpError(404, "Company not found");
  return {
    prefix: config?.prefix || company.complaintNumberingPrefix,
    sequencePadding: config?.sequencePadding ?? 5,
    capaSequencePadding: config?.capaSequencePadding ?? 2,
    resetOnFinancialYear: config?.resetOnFinancialYear ?? true
  };
}

// server/services/complaint.service.ts
import { Types as Types4 } from "mongoose";

// server/domain/closure.ts
function filled(values) {
  return (values ?? []).filter((value) => Boolean(value && value.trim()));
}
function validateForClosure(complaint, capas) {
  const gaps = [];
  const require2 = (condition, section, field, hint) => {
    if (!condition) gaps.push({ section, field, hint });
  };
  require2(complaint.acknowledgedAt, "Workflow", "Acknowledgement", "Complete it from the workflow tab");
  require2(complaint.containmentAt, "Workflow", "Containment", "Complete it from the workflow tab");
  require2(complaint.rcaAt, "Workflow", "RCA completion", "Complete it from the workflow tab");
  require2(complaint.capaAssignedAt, "Workflow", "CAPA assignment", "Complete it from the workflow tab");
  if (complaint.type === "External") {
    require2(complaint.d0, "D0", "Emergency response text", "8D tab");
    require2((complaint.d1Team ?? []).length > 0, "D1", "At least one team member", "Pick from the employee master");
    require2(complaint.d2?.what, "D2", "What is the problem", "8D tab");
    require2((complaint.d4QcTools ?? []).length > 0, "D4", "At least one QC tool used", "8D tab");
    ["occurrence", "escape", "systemic"].forEach((chain) => {
      require2(filled(complaint.fiveWhy?.[chain]).length >= 3, "D4", `5-Why ${chain} chain (minimum 3 whys)`, "8D tab");
    });
    require2(complaint.d4Occurrence, "D4", "Root cause (occurrence)", "8D tab");
    require2(complaint.d4Escape, "D4", "Root cause (escape)", "8D tab");
    require2(complaint.d4Systemic, "D4", "Root cause (systemic)", "8D tab");
    require2((complaint.d5Occurrence ?? []).length + (complaint.d5Escape ?? []).length + (complaint.d5Systemic ?? []).length > 0, "D5", "At least one corrective action", "8D tab");
    (complaint.d6DocsList ?? []).forEach((doc) => {
      if (doc.status === "Pending") {
        gaps.push({ section: "D6", field: doc.docType, hint: "Mark as attached with a revision, or NA with a justification" });
        return;
      }
      if (doc.status === "Attached") {
        if (!doc.attachment) gaps.push({ section: "D6", field: `${doc.docType} attachment`, hint: "Link an uploaded document" });
        if (!doc.revision) gaps.push({ section: "D6", field: `${doc.docType} revision` });
        if (!doc.revDate) gaps.push({ section: "D6", field: `${doc.docType} revision date` });
        if (!doc.approver) gaps.push({ section: "D6", field: `${doc.docType} approver` });
        return;
      }
      if (!doc.naJustification || doc.naJustification.trim().length < 10) {
        gaps.push({ section: "D6", field: `${doc.docType} NA justification`, hint: "Minimum 10 characters" });
      }
    });
  } else {
    require2(complaint.d2?.what, "Investigation", "Problem statement", "Internal investigation tab");
    require2(filled(complaint.fiveWhy?.singleChain).length >= 3, "Investigation", "5-Why chain (minimum 3 whys)");
    require2(complaint.d4Occurrence, "Investigation", "Root cause");
  }
  require2(capas.length > 0, "CAPA", "At least one CAPA item", "CAPA tab");
  require2(complaint.signatures?.prepared, "Signatures", "Prepared By signature");
  require2(complaint.signatures?.reviewed, "Signatures", "Reviewed By signature");
  require2(complaint.signatures?.approved, "Signatures", "Approved By signature", "Quality Head for the company, or Master Admin");
  return gaps;
}
function openCapaWarnings(capas) {
  return capas.filter((capa) => capa.status !== "Closed" && capa.status !== "Completed").map((capa) => capa.number);
}
function shouldAutoReopenOnLongTerm(complaint) {
  return complaint.d7LongTermResult === "Not Sustained" && complaint.status === "Closed";
}

// server/domain/repeat.ts
function matchesRepeatRule(candidate, existing, cutoff) {
  if (existing.id === candidate.id) return null;
  if (existing.companyId !== candidate.companyId) return null;
  if (!existing.category || existing.category !== candidate.category) return null;
  if (new Date(existing.receivedAt) < cutoff) return null;
  const basis = [];
  if (candidate.customer && existing.customer === candidate.customer) basis.push("customer");
  if (candidate.product && existing.product === candidate.product) basis.push("product");
  if (basis.length === 0) return null;
  return { complaintId: existing.id, basis };
}
function repeatCutoff(windowDays, now = /* @__PURE__ */ new Date()) {
  return new Date(now.getTime() - windowDays * 864e5);
}
function findRepeatMatches(candidate, population, windowDays, now = /* @__PURE__ */ new Date()) {
  const cutoff = repeatCutoff(windowDays, now);
  return population.map((existing) => matchesRepeatRule(candidate, existing, cutoff)).filter((match) => match !== null);
}
function describeRepeatBasis(matches) {
  const basis = new Set(matches.flatMap((match) => match.basis));
  if (basis.size === 0) return "";
  const parts = [...basis].map((entry) => entry === "customer" ? "same customer" : "same product");
  return `Same company and category with ${parts.join(" and ")} inside the repeat window`;
}

// server/domain/signature.ts
var PREPARE_ROLES = ["Complaint Coordinator", "Complaint Owner", "Department Head", "CAPA Owner", "Quality Head", "Management"];
var REVIEW_ROLES = ["Department Head", "Quality Head", "Management"];
function canSignAs(role, actor, complaint) {
  if (!actor) return false;
  if (isMasterAdmin(actor)) return true;
  if (!canSeeCompany(actor, complaint.companyId)) return false;
  if (role === "prepared") return PREPARE_ROLES.includes(actor.roleName ?? "");
  if (role === "reviewed") return REVIEW_ROLES.includes(actor.roleName ?? "");
  return isQualityHead(actor);
}
function validateSignature(role, actor, complaint, options = {}) {
  const issues = [];
  const signatures = complaint.signatures ?? {};
  if (!canSignAs(role, actor, complaint)) {
    issues.push({ field: "role", message: `You are not authorized to sign as ${role}` });
    return issues;
  }
  if (signatures[role]) {
    issues.push({ field: "role", message: `This complaint is already signed as ${role}` });
    return issues;
  }
  if (role === "reviewed" && !signatures.prepared) {
    issues.push({ field: "sequence", message: "Prepared By signature is required first" });
  }
  if (role === "approved" && !signatures.reviewed) {
    issues.push({ field: "sequence", message: "Reviewed By signature is required first" });
  }
  const allowSelf = options.allowSelfSign === true && isMasterAdmin(actor);
  if (!allowSelf) {
    if (role === "reviewed" && signatures.prepared?.userId === actor.id) {
      issues.push({ field: "separationOfDuties", message: "You prepared this report, so it must be reviewed by someone else" });
    }
    if (role === "approved" && (signatures.prepared?.userId === actor.id || signatures.reviewed?.userId === actor.id)) {
      issues.push({ field: "separationOfDuties", message: "You signed at an earlier stage, so it must be approved by someone else" });
    }
  }
  return issues;
}
function buildSignatureRecord(actor, profile, notes, at = /* @__PURE__ */ new Date()) {
  return {
    userId: actor.id,
    name: actor.name,
    designation: profile.designation || actor.roleName || "User",
    department: profile.department || actor.department || "",
    email: actor.email ?? "",
    at: at.toISOString(),
    notes: notes.trim()
  };
}
function rolesInvalidatedBy(role) {
  const index = SIGNATURE_ROLES.indexOf(role);
  return SIGNATURE_ROLES.slice(index);
}
function validateRevocation(role, actor, complaint, reason) {
  const issues = [];
  if (!isMasterAdmin(actor)) {
    issues.push({ field: "role", message: "Only a Master Admin can revoke a signature" });
  }
  if (!reason || reason.trim().length < 5) {
    issues.push({ field: "reason", message: "A revocation reason of at least 5 characters is mandatory" });
  }
  if (!complaint.signatures?.[role]) {
    issues.push({ field: "role", message: `There is no ${role} signature to revoke` });
  }
  return issues;
}

// server/domain/workflow.ts
function filled2(values) {
  return (values ?? []).filter((value) => Boolean(value && value.trim()));
}
function actionRowsIncomplete(rows) {
  return (rows ?? []).filter((row) => !row.action || !row.resp || !row.target).length;
}
function stageGaps(complaint, capas, stage) {
  const gaps = [];
  const external = complaint.type === "External";
  if (stage === "ack") {
    if (!complaint.d0 || !complaint.d0.trim()) gaps.push({ section: "D0", field: "Emergency response text", hint: "8D tab" });
    if (external && (complaint.d1Team ?? []).length === 0) {
      gaps.push({ section: "D1", field: "At least one cross-functional team member", hint: "8D tab" });
    }
  }
  if (stage === "cont") {
    const rows = complaint.d3Actions ?? [];
    if (rows.length === 0) {
      gaps.push({ section: "D3", field: "At least one interim containment action", hint: "8D tab" });
    } else {
      const incomplete = actionRowsIncomplete(rows);
      if (incomplete > 0) {
        gaps.push({ section: "D3", field: `${incomplete} action row(s) missing responsibility, target or action` });
      }
    }
  }
  if (stage === "rca") {
    if (external) {
      if (!complaint.d2?.what) gaps.push({ section: "D2", field: "What is the problem", hint: "8D tab" });
      if ((complaint.d4QcTools ?? []).length === 0) gaps.push({ section: "D4", field: "At least one QC tool used", hint: "8D tab" });
      ["occurrence", "escape", "systemic"].forEach((chain) => {
        if (filled2(complaint.fiveWhy?.[chain]).length < 3) {
          gaps.push({ section: "D4", field: `5-Why ${chain} chain needs at least 3 whys`, hint: "8D tab" });
        }
      });
      if (!complaint.d4Occurrence) gaps.push({ section: "D4", field: "Root cause (occurrence)" });
      if (!complaint.d4Escape) gaps.push({ section: "D4", field: "Root cause (escape)" });
      if (!complaint.d4Systemic) gaps.push({ section: "D4", field: "Root cause (systemic)" });
    } else {
      if (!complaint.d2?.what) gaps.push({ section: "Investigation", field: "Problem statement", hint: "Internal investigation tab" });
      if (filled2(complaint.fiveWhy?.singleChain).length < 3) {
        gaps.push({ section: "Investigation", field: "5-Why chain needs at least 3 whys" });
      }
      if (!complaint.d4Occurrence) gaps.push({ section: "Investigation", field: "Root cause" });
    }
  }
  if (stage === "capa") {
    if (capas.length === 0) {
      gaps.push({ section: "CAPA", field: "At least one CAPA item", hint: "CAPA tab" });
    } else {
      const incomplete = capas.filter((capa) => !capa.ownerId || !capa.dueDate || !capa.action).length;
      if (incomplete > 0) gaps.push({ section: "CAPA", field: `${incomplete} CAPA(s) missing owner, due date or action` });
    }
  }
  return gaps;
}
var STAGE_ORDER = ["ack", "cont", "rca", "capa"];
var STAGE_COMPLETION_FIELD = {
  ack: "acknowledgedAt",
  cont: "containmentAt",
  rca: "rcaAt",
  capa: "capaAssignedAt"
};
function isStageComplete(complaint, stage) {
  return Boolean(complaint[STAGE_COMPLETION_FIELD[stage]]);
}
function stageSequenceGaps(complaint, stage) {
  const gaps = [];
  if (isStageComplete(complaint, stage)) {
    gaps.push({ section: "Workflow", field: "Stage already completed", hint: "A workflow stage can only be marked once" });
    return gaps;
  }
  const index = STAGE_ORDER.indexOf(stage);
  for (let i = 0; i < index; i += 1) {
    if (!isStageComplete(complaint, STAGE_ORDER[i])) {
      gaps.push({ section: "Workflow", field: `${STAGE_ORDER[i]} stage must be completed first` });
    }
  }
  return gaps;
}
function delayGaps(overdue, delay2, allowedReasons) {
  if (!overdue) return [];
  const gaps = [];
  if (!delay2?.category) {
    gaps.push({ section: "Delay", field: "delayReason.category", hint: "Select a configured delay reason" });
  } else if (allowedReasons.length > 0 && !allowedReasons.includes(delay2.category)) {
    gaps.push({ section: "Delay", field: "delayReason.category", hint: "Value is not an active delay reason in master data" });
  }
  if (!delay2?.explanation || !delay2.explanation.trim()) {
    gaps.push({ section: "Delay", field: "delayReason.explanation", hint: "Explain why the stage missed its target" });
  }
  return gaps;
}

// server/models/Employee.ts
import mongoose8, { Schema as Schema7 } from "mongoose";
var EmployeeSchema = new Schema7(
  {
    employeeCode: { type: String, required: true, uppercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true, index: true },
    designation: { type: String, trim: true },
    department: { type: Schema7.Types.ObjectId, ref: "Department", required: true, index: true },
    company: { type: Schema7.Types.ObjectId, ref: "Company", required: true, index: true },
    managerName: { type: String, trim: true },
    managerEmail: { type: String, lowercase: true, trim: true },
    hodName: { type: String, trim: true },
    hodEmail: { type: String, lowercase: true, trim: true },
    linkedUser: { type: Schema7.Types.ObjectId, ref: "User", index: true },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);
EmployeeSchema.index({ employeeCode: 1, company: 1 }, { unique: true });
var Employee = mongoose8.models.Employee || mongoose8.model("Employee", EmployeeSchema);

// server/services/mappers.ts
function id(value) {
  if (!value) return void 0;
  return String(value);
}
function iso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}
function delay(value) {
  if (!value || typeof value !== "object") return null;
  const record = value;
  return {
    category: record.category ?? "",
    explanation: record.explanation ?? "",
    recovery: record.recovery,
    recordedAt: iso(record.recordedAt) ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}
function signature(value) {
  if (!value || typeof value !== "object") return null;
  const record = value;
  return {
    userId: id(record.user) ?? "",
    name: record.name ?? "",
    designation: record.designation ?? "",
    department: record.department ?? "",
    email: record.email ?? "",
    at: iso(record.at) ?? "",
    notes: record.notes ?? ""
  };
}
function actionRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const record = row;
    return { action: record.action, resp: record.resp, target: record.target, status: record.status };
  });
}
function toDomainComplaint(doc, priorityMultiplier2) {
  const fishbone = doc.fishbone ?? {};
  return {
    id: String(doc._id),
    number: doc.number,
    companyId: id(doc.company) ?? "",
    type: doc.type,
    status: doc.status,
    receivedAt: iso(doc.receivedAt) ?? (/* @__PURE__ */ new Date()).toISOString(),
    priorityMultiplier: priorityMultiplier2,
    ownerId: id(doc.owner),
    responsibleDept: id(doc.responsibleDept),
    customer: doc.customer ?? void 0,
    product: doc.product ?? void 0,
    category: doc.category ?? void 0,
    acknowledgedAt: iso(doc.acknowledgedAt),
    containmentAt: iso(doc.containmentAt),
    rcaAt: iso(doc.rcaAt),
    capaAssignedAt: iso(doc.capaAssignedAt),
    closedAt: iso(doc.closedAt),
    ackDelayReason: delay(doc.ackDelayReason),
    contDelayReason: delay(doc.contDelayReason),
    rcaDelayReason: delay(doc.rcaDelayReason),
    capaDelayReason: delay(doc.capaDelayReason),
    d0: doc.d0 ?? "",
    d1Team: (doc.d1Team ?? []).map((member) => ({
      name: member.name ?? void 0,
      dept: member.dept ?? void 0,
      designation: member.designation ?? void 0,
      role: member.role ?? void 0
    })),
    d2: {
      what: doc.d2?.what ?? "",
      where: doc.d2?.where ?? "",
      when: doc.d2?.when ?? "",
      who: doc.d2?.who ?? "",
      involved: doc.d2?.involved ?? "",
      howMany: doc.d2?.howMany ?? "",
      how: doc.d2?.how ?? ""
    },
    d3Actions: actionRows(doc.d3Actions),
    d4QcTools: doc.d4QcTools ?? [],
    d4Occurrence: doc.d4Occurrence ?? "",
    d4Escape: doc.d4Escape ?? "",
    d4Systemic: doc.d4Systemic ?? "",
    rootCauseCategory: doc.rootCauseCategory ?? void 0,
    fiveWhy: {
      occurrence: doc.fiveWhy?.occurrence ?? [],
      escape: doc.fiveWhy?.escape ?? [],
      systemic: doc.fiveWhy?.systemic ?? [],
      singleChain: doc.fiveWhy?.singleChain ?? []
    },
    fishbone,
    d5Occurrence: actionRows(doc.d5Occurrence),
    d5Escape: actionRows(doc.d5Escape),
    d5Systemic: actionRows(doc.d5Systemic),
    d6Verify: actionRows(doc.d6Verify),
    d6DocsList: (doc.d6DocsList ?? []).map((entry) => ({
      docType: entry.docType,
      status: entry.status,
      attachment: id(entry.attachment) ?? null,
      revision: entry.revision ?? "",
      revDate: entry.revDate ?? "",
      approver: entry.approver ?? "",
      naJustification: entry.naJustification ?? ""
    })),
    d7ShortTermDate: doc.d7ShortTermDate ?? "",
    d7RepeatObserved: Boolean(doc.d7RepeatObserved),
    d7LongTermDate: doc.d7LongTermDate ?? "",
    d7LongTermRepeatObserved: Boolean(doc.d7LongTermRepeatObserved),
    d7LongTermResult: doc.d7LongTermResult ?? "",
    d7NoRepeatConfirmed: Boolean(doc.d7NoRepeatConfirmed),
    signatures: {
      prepared: signature(doc.signatures?.prepared),
      reviewed: signature(doc.signatures?.reviewed),
      approved: signature(doc.signatures?.approved)
    }
  };
}
function toDomainCapa(doc) {
  const review = doc.evidenceReview;
  return {
    id: String(doc._id),
    number: doc.number,
    complaintId: id(doc.complaint) ?? "",
    companyId: id(doc.company) ?? "",
    type: doc.type,
    action: doc.action,
    ownerId: id(doc.owner),
    department: id(doc.department),
    dueDate: iso(doc.dueDate) ?? void 0,
    completedAt: iso(doc.completedAt),
    status: doc.status,
    evidence: doc.evidence ?? "",
    effectiveness: doc.effectiveness ?? null,
    evidenceReview: review?.status ? { status: review.status, remarks: review.remarks } : null
  };
}
function toDomainActor(user, department) {
  if (!user) return void 0;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleName: user.role?.name,
    permissions: user.role?.permissions ?? [],
    companyIds: user.companyIds,
    department: department ?? user.department
  };
}

// server/models/Notification.ts
import mongoose9, { Schema as Schema8 } from "mongoose";
var NotificationSchema = new Schema8(
  {
    recipient: { type: Schema8.Types.ObjectId, ref: "User", required: true, index: true },
    message: { type: String, required: true, trim: true },
    category: { type: String, enum: NOTIFICATION_CATEGORIES, default: "system", index: true },
    priority: { type: String, enum: ["normal", "high"], default: "normal" },
    entityType: { type: String, trim: true },
    entityId: { type: Schema8.Types.ObjectId },
    link: { type: String, trim: true },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null }
  },
  { timestamps: true }
);
NotificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
var Notification = mongoose9.models.Notification || mongoose9.model("Notification", NotificationSchema);

// server/models/Role.ts
import mongoose10, { Schema as Schema9 } from "mongoose";
var RoleSchema = new Schema9(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },
    permissions: [{ type: String, required: true }],
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);
var Role = mongoose10.models.Role || mongoose10.model("Role", RoleSchema);

// server/services/notification.service.ts
async function notify(input) {
  const unique = [...new Set(input.recipients.filter(Boolean).map(String))];
  if (unique.length === 0) return [];
  return Notification.insertMany(
    unique.map((recipient) => ({
      recipient,
      message: input.message,
      category: input.category ?? "system",
      priority: input.priority ?? "normal",
      entityType: input.entityType,
      entityId: input.entityId,
      link: input.link
    }))
  );
}
async function usersWithRole(roleName, companyId) {
  const role = await Role.findOne({ name: roleName }).lean();
  if (!role) return [];
  const users = await User.find({ role: role._id, active: true }).select("_id companyIds").lean();
  return users.filter((user) => (user.companyIds ?? []).some((id2) => String(id2) === String(companyId)) || (user.companyIds ?? []).length === 0).map((user) => String(user._id));
}
async function listNotifications(userId, options) {
  const filter = { recipient: userId };
  if (options.unreadOnly) filter.read = false;
  const [items, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(options.skip).limit(options.limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipient: userId, read: false })
  ]);
  return { items, total, unread };
}
async function markRead(userId, notificationId) {
  return Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId },
    { read: true, readAt: /* @__PURE__ */ new Date() },
    { new: true }
  ).lean();
}
async function markAllRead(userId) {
  const result = await Notification.updateMany({ recipient: userId, read: false }, { read: true, readAt: /* @__PURE__ */ new Date() });
  return result.modifiedCount;
}

// server/lib/app-url.ts
function getAppUrl() {
  const configured = getEnv().APP_BASE_URL;
  if (configured && configured.trim().length > 0) {
    return configured.replace(/\/+$/, "");
  }
  return "http://localhost:5173";
}

// server/lib/email-layout.ts
var BRAND_RED = "#E31E25";
var TEXT_DARK = "#1E293B";
var TEXT_MUTED = "#64748B";
var BORDER_COLOR = "#E2E8F0";
var BG_LIGHT = "#F8FAFC";
var DEFAULT_EMAIL_LOGO_URL = "https://res.cloudinary.com/mcymctsr/image/upload/v1783505369/onepws-6s-auditpro/branding/onepws-logo-email.png";
function wrapEmailLayout(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{companyName}} - Quality Portal</title>
<style>
  body { margin:0; padding:0; background-color:${BG_LIGHT}; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; -webkit-font-smoothing:antialiased; }
  table { border-collapse:collapse; }
  @media only screen and (max-width: 620px) {
    .email-container { width:100% !important; border-radius:0 !important; }
    .email-padding { padding:20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${BG_LIGHT};font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG_LIGHT};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" class="email-container" width="620" cellpadding="0" cellspacing="0" style="width:620px;max-width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid ${BORDER_COLOR};box-shadow:0 1px 4px rgba(0,0,0,0.05);">
          <!-- Brand Header -->
          <tr>
            <td style="padding:22px 28px;background-color:#ffffff;border-bottom:3px solid ${BRAND_RED};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <img src="{{logoUrl}}" alt="{{companyName}}" width="130" style="display:block;max-width:130px;height:auto;border:0;">
                  </td>
                  <td align="right" style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${TEXT_MUTED};">
                    Complaint &amp; CAPA Portal
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td class="email-padding" style="padding:28px;color:${TEXT_DARK};font-size:14px;line-height:1.6;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:18px 28px;text-align:left;border-top:1px solid ${BORDER_COLOR};">
              <p style="margin:0;font-size:12px;color:${TEXT_MUTED};font-weight:600;">{{companyName}} &middot; Quality &amp; Continuous Improvement</p>
              <p style="margin:4px 0 0;font-size:11px;color:#94a3b8;">This is an automated notification from the ONEPWS Complaint &amp; CAPA Management Portal. Please do not reply directly to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
function emailButton(url, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;">
  <tr>
    <td align="center" style="border-radius:6px;background-color:${BRAND_RED};">
      <a href="${url}" target="_blank" style="display:inline-block;padding:11px 24px;font-size:13px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:6px;letter-spacing:0.02em;">${label}</a>
    </td>
  </tr>
</table>`;
}
function infoTable(rows) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;border-top:1px solid ${BORDER_COLOR};border-bottom:1px solid ${BORDER_COLOR};">
    ${rows}
  </table>`;
}
function infoRow(label, valueToken) {
  return `<tr>
    <td style="padding:7px 0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:${TEXT_MUTED};width:34%;vertical-align:top;">${label}</td>
    <td style="padding:7px 0 7px 12px;font-size:13px;font-weight:500;color:${TEXT_DARK};vertical-align:top;">${valueToken}</td>
  </tr>`;
}
function highlightBox(content, borderColor = BRAND_RED, bgColor = "#f8fafc") {
  return `<div style="margin:14px 0;padding:12px 16px;background-color:${bgColor};border-left:3px solid ${borderColor};border-radius:4px;color:#334155;font-size:13px;line-height:1.5;">${content}</div>`;
}

// server/lib/email-template-renderer.ts
var SCRIPT_TAG_REGEX = /<script[\s\S]*?>[\s\S]*?<\/script>/gi;
var INLINE_EVENT_REGEX = /\son\w+\s*=\s*(["']).*?\1/gi;
var JAVASCRIPT_HREF_REGEX = /href\s*=\s*(["'])javascript:[\s\S]*?\1/gi;
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function sanitizeHtml(html) {
  return html.replace(SCRIPT_TAG_REGEX, "").replace(INLINE_EVENT_REGEX, "").replace(JAVASCRIPT_HREF_REGEX, 'href="#"');
}
function renderTemplate(templateString, data) {
  if (!templateString) return { rendered: "", missingVariables: [] };
  const missing = /* @__PURE__ */ new Set();
  const replaced = templateString.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const val = data[key];
    if (val === void 0 || val === null || val === "") {
      missing.add(key);
      return "";
    }
    return escapeHtml(String(val));
  });
  return {
    rendered: sanitizeHtml(replaced),
    missingVariables: Array.from(missing)
  };
}
function variablesInTemplate(...parts) {
  const vars = /* @__PURE__ */ new Set();
  for (const part of parts) {
    if (!part) continue;
    const matches = part.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g);
    for (const match of matches) {
      if (match[1]) vars.add(match[1]);
    }
  }
  return Array.from(vars);
}
function getSampleVariables(triggerEvent) {
  const now = /* @__PURE__ */ new Date();
  const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const common = {
    companyName: "ONEPWS Private Limited",
    appUrl: "http://localhost:5173",
    recipientName: "Priya Sharma",
    recipientEmail: "priya.sharma@onepws.com",
    today: dateStr
  };
  const complaintVars = {
    ...common,
    complaintNumber: "CMP-2026-00128",
    complaintTitle: "Dimensional variation on assembly batch 42B",
    complaintType: "External",
    customerName: "Global Auto Industries",
    partName: "Front Lower Control Arm Bracket",
    partNumber: "BKT-42-FL",
    priority: "High",
    stage: "Containment",
    status: "Open",
    ownerName: "Amit Verma",
    coordinatorName: "Rajesh Patel",
    departmentName: "Production",
    dueDate: dateStr,
    targetDate: dateStr,
    overdueHours: "36",
    escalationLevel: "Level 2 (Department Head)",
    remarks: "Initial review confirmed supplier component tolerance deviation.",
    reportUrl: "http://localhost:5173/complaints/CMP-2026-00128",
    actionUrl: "http://localhost:5173/complaints/CMP-2026-00128"
  };
  const capaVars = {
    ...complaintVars,
    capaNumber: "CAPA-2026-00045",
    capaTitle: "Tool recalibration and operator retraining for fixture #3",
    capaType: "Corrective",
    capaStatus: "In Progress",
    assignedTo: "Karan Singh",
    rejectionReason: "Supporting evidence lacks torque audit check sheet verification.",
    effectivenessResult: "Effective",
    verificationNotes: "30-day trial batch showed zero defects across 5,000 components."
  };
  const authVars = {
    ...common,
    userName: "Amit Verma",
    username: "averma",
    resetUrl: "http://localhost:5173/reset-password?token=sample_token_abc123",
    expiresInHours: "1"
  };
  const summaryVars = {
    ...common,
    totalOpen: "14",
    dueSoonCount: "3",
    overdueCount: "2",
    openCapasCount: "8",
    capaOverdueCount: "1",
    repeatCount: "1",
    period: "Last 7 Days"
  };
  if (triggerEvent?.startsWith("PASSWORD_") || triggerEvent === "USER_CREATED") {
    return authVars;
  }
  if (triggerEvent?.startsWith("CAPA_")) {
    return capaVars;
  }
  if (triggerEvent?.endsWith("_SUMMARY")) {
    return summaryVars;
  }
  return complaintVars;
}

// server/lib/mailer.ts
import nodemailer from "nodemailer";
function isSmtpConfigured() {
  const env = getEnv();
  return Boolean(
    env.SMTP_HOST && env.SMTP_USER && env.SMTP_APP_PASSWORD && env.SMTP_HOST.trim().length > 0 && env.SMTP_USER.trim().length > 0 && env.SMTP_APP_PASSWORD.trim().length > 0
  );
}
function createTransporter() {
  const env = getEnv();
  if (!isSmtpConfigured()) {
    throw new Error("SMTP service is not configured on this server");
  }
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT || 587,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_APP_PASSWORD
    }
  });
}
function fromAddress() {
  const env = getEnv();
  const email = env.SMTP_FROM_EMAIL || env.SMTP_USER || "noreply@onepws.com";
  const name2 = env.SMTP_FROM_NAME || "ONEPWS Complaint & CAPA Portal";
  return `"${name2}" <${email}>`;
}
async function verifySmtpConnection() {
  if (!isSmtpConfigured()) {
    return { success: false, message: "SMTP environment variables are not configured" };
  }
  try {
    const transporter = createTransporter();
    await transporter.verify();
    return { success: true, message: "SMTP connection successfully verified" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "SMTP connection failed"
    };
  }
}
function getSmtpStatus() {
  const env = getEnv();
  return {
    isConfigured: isSmtpConfigured(),
    host: env.SMTP_HOST || null,
    port: env.SMTP_PORT || 587,
    secure: env.SMTP_SECURE,
    fromName: env.SMTP_FROM_NAME || "ONEPWS Complaint & CAPA Portal",
    fromEmail: env.SMTP_FROM_EMAIL || env.SMTP_USER || null
  };
}

// server/services/email-template.service.ts
import { Types } from "mongoose";

// server/models/EmailTemplate.ts
import mongoose11, { Schema as Schema10 } from "mongoose";
var EmailTemplateSchema = new Schema10(
  {
    templateKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true
    },
    templateName: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    htmlBody: { type: String, required: true },
    textBody: { type: String, required: true },
    supportedVariables: [{ type: String }],
    isActive: { type: Boolean, default: true, index: true },
    triggerEvent: { type: String, required: true, index: true },
    allowedRolesToReceive: [{ type: String }],
    ccRules: [{ type: String }],
    bccRules: [{ type: String }],
    createdBy: { type: Schema10.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema10.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);
var EmailTemplate = mongoose11.models.EmailTemplate || mongoose11.model("EmailTemplate", EmailTemplateSchema);

// server/lib/email-template-defaults.ts
var heading = (text2) => `<h2 style="margin:0 0 14px;font-size:18px;font-weight:700;color:#1e293b;">${text2}</h2>`;
var greeting = () => `<p style="margin:0 0 12px;">Hello {{recipientName}},</p>`;
var closing = () => `<p style="margin:24px 0 0;font-size:13px;color:#64748b;">Regards,<br><strong>{{companyName}}</strong> &mdash; Quality &amp; Continuous Improvement</p>`;
var DEFAULT_EMAIL_TEMPLATES = [
  // ==================== AUTH ====================
  {
    templateKey: "auth-user-created",
    templateName: "User Created Notification",
    triggerEvent: "USER_CREATED",
    subject: "Welcome to ONEPWS Complaint & CAPA Portal",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Your Account Has Been Created")}<p style="margin:0 0 12px;">A user account has been registered for you on the ONEPWS Complaint &amp; CAPA Management Portal.</p>` + infoTable(
        infoRow("Username", "{{username}}") + infoRow("Assigned Role", "{{roleName}}") + infoRow("Company Scope", "{{companyName}}")
      ) + `<p style="margin:12px 0;">Please contact your Quality Administrator or click below to sign in:</p>` + emailButton("{{appUrl}}/login", "Sign In to Portal") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nYour user account has been registered on the ONEPWS Complaint & CAPA Management Portal.\n\nUsername: {{username}}\nAssigned Role: {{roleName}}\nCompany: {{companyName}}\n\nSign in at: {{appUrl}}/login\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "username", "roleName", "companyName", "appUrl"]
  },
  {
    templateKey: "auth-password-reset",
    templateName: "Password Reset Requested",
    triggerEvent: "PASSWORD_RESET_REQUESTED",
    subject: "Password Reset Request - ONEPWS Quality Portal",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Password Reset Request")}<p style="margin:0 0 12px;">A password reset request was received for your account. Use the secure button below to set a new password. This link is valid for <strong>{{expiresInHours}} hour(s)</strong>.</p>` + emailButton("{{resetUrl}}", "Reset Password") + `<p style="margin:12px 0 0;font-size:12px;color:#64748b;">If you did not request a password reset, you can safely ignore this email. Your current password remains unchanged.</p>` + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nA password reset request was received for your account. Use the secure link below to reset your password. It expires in {{expiresInHours}} hour(s):\n\n{{resetUrl}}\n\nIf you did not request this, please ignore this email.\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "resetUrl", "expiresInHours", "companyName", "appUrl"]
  },
  {
    templateKey: "auth-password-changed",
    templateName: "Password Changed Confirmation",
    triggerEvent: "PASSWORD_CHANGED",
    subject: "Security Alert: Password Changed - ONEPWS Quality Portal",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Your Password Has Been Changed")}<p style="margin:0 0 12px;">This is a confirmation that the password for your portal account (<strong>{{username}}</strong>) was successfully updated.</p><p style="margin:12px 0;padding:10px 14px;background-color:#fef2f2;border-left:3px solid #E31E25;border-radius:4px;color:#991B1B;font-size:13px;">If you did not perform this change, please notify your System Administrator immediately.</p>` + emailButton("{{appUrl}}/login", "Sign In") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nThis is a confirmation that the password for your portal account ({{username}}) was successfully updated.\n\nIf you did not perform this change, notify your Administrator immediately.\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "username", "companyName", "appUrl"]
  },
  // ==================== COMPLAINT LIFECYCLE ====================
  {
    templateKey: "complaint-created",
    templateName: "Complaint Created",
    triggerEvent: "COMPLAINT_CREATED",
    subject: "Complaint {{complaintNumber}} Registered: {{complaintTitle}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("New Complaint Registered")}<p style="margin:0 0 12px;">A new complaint has been registered and logged in the system.</p>` + infoTable(
        infoRow("Complaint No.", "{{complaintNumber}}") + infoRow("Type", "{{complaintType}}") + infoRow("Customer / Source", "{{customerName}}") + infoRow("Part / Assembly", "{{partName}} ({{partNumber}})") + infoRow("Priority", "{{priority}}") + infoRow("Responsible Dept.", "{{departmentName}}") + infoRow("Coordinator", "{{coordinatorName}}") + infoRow("Target Ack. Date", "{{ackDueDate}}")
      ) + highlightBox("<strong>Issue Description:</strong><br>{{complaintTitle}}") + emailButton("{{actionUrl}}", "View Complaint in Portal") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nA new complaint has been registered:\n\nComplaint No: {{complaintNumber}}\nType: {{complaintType}}\nSource: {{customerName}}\nPart: {{partName}} ({{partNumber}})\nPriority: {{priority}}\nResponsible Dept: {{departmentName}}\nCoordinator: {{coordinatorName}}\n\nDescription: {{complaintTitle}}\n\nView: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "complaintTitle", "complaintType", "customerName", "partName", "partNumber", "priority", "departmentName", "coordinatorName", "ackDueDate", "actionUrl", "companyName"]
  },
  {
    templateKey: "complaint-assigned",
    templateName: "Complaint Assigned",
    triggerEvent: "COMPLAINT_ASSIGNED",
    subject: "Assignment: Complaint {{complaintNumber}} Assigned to You",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Complaint Assigned for Action")}<p style="margin:0 0 12px;">Complaint <strong>{{complaintNumber}}</strong> has been assigned to you as owner. Please review and acknowledge promptly within the SLA window.</p>` + infoTable(
        infoRow("Complaint No.", "{{complaintNumber}}") + infoRow("Priority", "{{priority}}") + infoRow("Customer", "{{customerName}}") + infoRow("Part", "{{partName}}") + infoRow("Target Ack.", "{{ackDueDate}}")
      ) + emailButton("{{actionUrl}}", "Open Complaint") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nComplaint {{complaintNumber}} has been assigned to you as owner.\n\nPriority: {{priority}}\nCustomer: {{customerName}}\nPart: {{partName}}\nTarget Ack: {{ackDueDate}}\n\nOpen: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "priority", "customerName", "partName", "ackDueDate", "actionUrl", "companyName"]
  },
  {
    templateKey: "complaint-reassigned",
    templateName: "Complaint Reassigned",
    triggerEvent: "COMPLAINT_REASSIGNED",
    subject: "Reassigned: Complaint {{complaintNumber}} Handover",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Complaint Ownership Reassigned")}<p style="margin:0 0 12px;">Complaint <strong>{{complaintNumber}}</strong> has been reassigned to <strong>{{ownerName}}</strong>.</p>` + infoTable(
        infoRow("Complaint No.", "{{complaintNumber}}") + infoRow("Current Owner", "{{ownerName}}") + infoRow("Department", "{{departmentName}}") + infoRow("Current Stage", "{{stage}}")
      ) + emailButton("{{actionUrl}}", "Review Complaint") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nComplaint {{complaintNumber}} has been reassigned to {{ownerName}}.\n\nDepartment: {{departmentName}}\nCurrent Stage: {{stage}}\n\nReview: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "ownerName", "departmentName", "stage", "actionUrl", "companyName"]
  },
  {
    templateKey: "complaint-acknowledged",
    templateName: "Complaint Acknowledged",
    triggerEvent: "COMPLAINT_ACKNOWLEDGED",
    subject: "Acknowledged: Complaint {{complaintNumber}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Complaint Formally Acknowledged")}<p style="margin:0 0 12px;">Complaint <strong>{{complaintNumber}}</strong> has been formally acknowledged. Containment planning is now required.</p>` + infoTable(
        infoRow("Complaint No.", "{{complaintNumber}}") + infoRow("Acknowledged By", "{{acknowledgedBy}}") + infoRow("Target Containment", "{{containmentDueDate}}")
      ) + emailButton("{{actionUrl}}", "View Complaint") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nComplaint {{complaintNumber}} has been acknowledged by {{acknowledgedBy}}. Target Containment: {{containmentDueDate}}.\n\nView: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "acknowledgedBy", "containmentDueDate", "actionUrl", "companyName"]
  },
  {
    templateKey: "complaint-containment-completed",
    templateName: "Containment Completed",
    triggerEvent: "COMPLAINT_CONTAINMENT_COMPLETED",
    subject: "Containment Completed: Complaint {{complaintNumber}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Containment Actions Completed")}<p style="margin:0 0 12px;">Interim containment actions for complaint <strong>{{complaintNumber}}</strong> have been documented and closed.</p>` + infoTable(
        infoRow("Complaint No.", "{{complaintNumber}}") + infoRow("Completed By", "{{ownerName}}") + infoRow("Next Milestone", "Root Cause Analysis (RCA)") + infoRow("Target RCA Date", "{{rcaDueDate}}")
      ) + emailButton("{{actionUrl}}", "Review Containment") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nContainment actions for complaint {{complaintNumber}} have been completed by {{ownerName}}. Target RCA Date: {{rcaDueDate}}.\n\nReview: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "ownerName", "rcaDueDate", "actionUrl", "companyName"]
  },
  {
    templateKey: "complaint-rca-completed",
    templateName: "RCA Completed",
    triggerEvent: "COMPLAINT_RCA_COMPLETED",
    subject: "RCA Completed: Complaint {{complaintNumber}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Root Cause Analysis Completed")}<p style="margin:0 0 12px;">Root cause investigation (5-Why / Fishbone) for complaint <strong>{{complaintNumber}}</strong> has been concluded.</p>` + infoTable(
        infoRow("Complaint No.", "{{complaintNumber}}") + infoRow("Category", "{{rootCauseCategory}}") + infoRow("Next Step", "CAPA Assignment") + infoRow("Target CAPA Date", "{{capaDueDate}}")
      ) + highlightBox("<strong>Root Cause Summary:</strong><br>{{rootCauseSummary}}") + emailButton("{{actionUrl}}", "Review RCA Findings") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nRCA for complaint {{complaintNumber}} is complete. Root Cause Category: {{rootCauseCategory}}.\n\nSummary: {{rootCauseSummary}}\n\nReview: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "rootCauseCategory", "rootCauseSummary", "capaDueDate", "actionUrl", "companyName"]
  },
  {
    templateKey: "complaint-capa-assigned",
    templateName: "CAPA Assigned from Complaint",
    triggerEvent: "COMPLAINT_CAPA_ASSIGNED",
    subject: "CAPA Assigned: Complaint {{complaintNumber}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Corrective & Preventive Action Assigned")}<p style="margin:0 0 12px;">Corrective actions have been assigned following RCA completion for complaint <strong>{{complaintNumber}}</strong>.</p>` + infoTable(
        infoRow("Complaint No.", "{{complaintNumber}}") + infoRow("CAPA Count", "{{capaCount}}") + infoRow("Lead Assignee", "{{assignedTo}}")
      ) + emailButton("{{actionUrl}}", "View CAPAs") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nCAPA assigned for complaint {{complaintNumber}}. Count: {{capaCount}}, Assignee: {{assignedTo}}.\n\nView: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "capaCount", "assignedTo", "actionUrl", "companyName"]
  },
  {
    templateKey: "complaint-status-changed",
    templateName: "Complaint Status Changed",
    triggerEvent: "COMPLAINT_STATUS_CHANGED",
    subject: "Status Update: Complaint {{complaintNumber}} &rarr; {{status}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Complaint Status Updated")}<p style="margin:0 0 12px;">Complaint <strong>{{complaintNumber}}</strong> transitioned to status <strong>{{status}}</strong>.</p>` + infoTable(
        infoRow("Complaint No.", "{{complaintNumber}}") + infoRow("New Status", "{{status}}") + infoRow("Updated By", "{{updatedBy}}")
      ) + emailButton("{{actionUrl}}", "Open Complaint") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nComplaint {{complaintNumber}} status changed to {{status}} by {{updatedBy}}.\n\nOpen: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "status", "updatedBy", "actionUrl", "companyName"]
  },
  {
    templateKey: "complaint-closed",
    templateName: "Complaint Closed",
    triggerEvent: "COMPLAINT_CLOSED",
    subject: "Closed: Complaint {{complaintNumber}} Resolution Verified",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Complaint Successfully Closed")}<p style="margin:0 0 12px;">Complaint <strong>{{complaintNumber}}</strong> has satisfied all closure criteria, signatures, and effectiveness verifications, and is now <span style="color:#15803D;font-weight:700;">CLOSED</span>.</p>` + infoTable(
        infoRow("Complaint No.", "{{complaintNumber}}") + infoRow("Customer", "{{customerName}}") + infoRow("Part", "{{partName}}") + infoRow("Closed By", "{{closedBy}}")
      ) + emailButton("{{actionUrl}}", "View Final Report") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nComplaint {{complaintNumber}} has been formally closed by {{closedBy}}.\n\nCustomer: {{customerName}}\nPart: {{partName}}\n\nView: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "customerName", "partName", "closedBy", "actionUrl", "companyName"]
  },
  {
    templateKey: "complaint-reopened",
    templateName: "Complaint Reopened",
    triggerEvent: "COMPLAINT_REOPENED",
    subject: "Attention: Complaint {{complaintNumber}} Reopened",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Complaint Has Been Reopened")}<p style="margin:0 0 12px;">Complaint <strong>{{complaintNumber}}</strong> has been <span style="color:#B91C1C;font-weight:700;">REOPENED</span> due to recurrence or effectiveness review failure.</p>` + infoTable(
        infoRow("Complaint No.", "{{complaintNumber}}") + infoRow("Reopened By", "{{reopenedBy}}") + infoRow("Responsible Dept.", "{{departmentName}}")
      ) + highlightBox("<strong>Reopening Reason:</strong><br>{{reopenReason}}", "#B91C1C", "#FEF2F2") + emailButton("{{actionUrl}}", "Investigate Reopened Complaint") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nComplaint {{complaintNumber}} has been REOPENED by {{reopenedBy}}.\n\nDepartment: {{departmentName}}\nReason: {{reopenReason}}\n\nInvestigate: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "reopenedBy", "departmentName", "reopenReason", "actionUrl", "companyName"]
  },
  {
    templateKey: "complaint-report-shared",
    templateName: "Complaint Report Shared",
    triggerEvent: "COMPLAINT_REPORT_SHARED",
    subject: "Quality 8D Report Shared: {{complaintNumber}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Complaint 8D Report Shared With You")}<p style="margin:0 0 12px;"><strong>{{sharedBy}}</strong> has shared the formal Quality 8D Report for complaint <strong>{{complaintNumber}}</strong> with you.</p>` + infoTable(
        infoRow("Complaint No.", "{{complaintNumber}}") + infoRow("Customer / Product", "{{customerName}} / {{partName}}") + infoRow("Status", "{{status}}")
      ) + highlightBox("<strong>Sender Note:</strong><br>{{notes}}") + emailButton("{{reportUrl}}", "Access 8D Report") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\n{{sharedBy}} shared the 8D Report for complaint {{complaintNumber}}.\n\nCustomer: {{customerName}}\nPart: {{partName}}\nStatus: {{status}}\nNote: {{notes}}\n\nAccess: {{reportUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "sharedBy", "complaintNumber", "customerName", "partName", "status", "notes", "reportUrl", "companyName"]
  },
  // ==================== TAT NOTIFICATIONS ====================
  {
    templateKey: "tat-reminder",
    templateName: "TAT SLA Milestone Reminder",
    triggerEvent: "TAT_REMINDER",
    subject: "Reminder ({{thresholdPct}}% SLA): Complaint {{complaintNumber}} Stage {{stage}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("SLA Milestone Reminder")}<p style="margin:0 0 12px;">Complaint <strong>{{complaintNumber}}</strong> has reached <strong>{{thresholdPct}}%</strong> of its allowed turnaround time for stage <strong>{{stage}}</strong>.</p>` + infoTable(
        infoRow("Complaint No.", "{{complaintNumber}}") + infoRow("Current Stage", "{{stage}}") + infoRow("Due Date", "{{dueDate}}") + infoRow("Owner", "{{ownerName}}") + infoRow("Priority", "{{priority}}")
      ) + emailButton("{{actionUrl}}", "Complete Stage Action") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nComplaint {{complaintNumber}} has reached {{thresholdPct}}% of allowed TAT for stage {{stage}}.\n\nDue Date: {{dueDate}}\nOwner: {{ownerName}}\nPriority: {{priority}}\n\nComplete Action: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "thresholdPct", "stage", "dueDate", "ownerName", "priority", "actionUrl", "companyName"]
  },
  {
    templateKey: "tat-due-soon",
    templateName: "TAT Stage Due Soon",
    triggerEvent: "TAT_DUE_SOON",
    subject: "Urgent: Complaint {{complaintNumber}} Due Within {{hoursLeft}} Hours",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Stage Action Due Shortly")}<p style="margin:0 0 12px;">Stage <strong>{{stage}}</strong> for complaint <strong>{{complaintNumber}}</strong> is due within <strong>{{hoursLeft}} hour(s)</strong>.</p>` + infoTable(
        infoRow("Complaint No.", "{{complaintNumber}}") + infoRow("Stage", "{{stage}}") + infoRow("Target Due Date", "{{dueDate}}") + infoRow("Priority", "{{priority}}")
      ) + emailButton("{{actionUrl}}", "Take Immediate Action") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nComplaint {{complaintNumber}} stage {{stage}} is due within {{hoursLeft}} hours.\n\nDue: {{dueDate}}\nPriority: {{priority}}\n\nAction: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "stage", "hoursLeft", "dueDate", "priority", "actionUrl", "companyName"]
  },
  {
    templateKey: "tat-overdue",
    templateName: "TAT Stage Overdue",
    triggerEvent: "TAT_OVERDUE",
    subject: "OVERDUE Notice: Complaint {{complaintNumber}} Stage {{stage}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Turnaround Time SLA Exceeded")}<p style="margin:0 0 12px;">Complaint <strong>{{complaintNumber}}</strong> is currently <span style="color:#B91C1C;font-weight:700;">OVERDUE</span> for milestone <strong>{{stage}}</strong>.</p>` + infoTable(
        infoRow("Complaint No.", "{{complaintNumber}}") + infoRow("Overdue Stage", "{{stage}}") + infoRow("Original Due Date", "{{dueDate}}") + infoRow("Overdue Duration", "{{overdueHours}} hours") + infoRow("Responsible Dept.", "{{departmentName}}") + infoRow("Owner", "{{ownerName}}")
      ) + emailButton("{{actionUrl}}", "Resolve Overdue Stage") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nOVERDUE NOTICE: Complaint {{complaintNumber}} is overdue for stage {{stage}}.\n\nDue Date: {{dueDate}}\nOverdue Duration: {{overdueHours}} hours\nDept: {{departmentName}}\nOwner: {{ownerName}}\n\nResolve: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "stage", "dueDate", "overdueHours", "departmentName", "ownerName", "actionUrl", "companyName"]
  },
  {
    templateKey: "tat-escalation",
    templateName: "TAT Overdue Escalation",
    triggerEvent: "TAT_ESCALATION",
    subject: "ESCALATION ({{escalationLevel}}): Complaint {{complaintNumber}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("SLA Breach Escalation Notice")}<p style="margin:0 0 12px;">This complaint has breached defined SLA thresholds and has been escalated to <strong>{{escalationLevel}}</strong>.</p>` + infoTable(
        infoRow("Complaint No.", "{{complaintNumber}}") + infoRow("Escalation Tier", "{{escalationLevel}}") + infoRow("Pending Stage", "{{stage}}") + infoRow("Overdue Duration", "{{overdueHours}} hours") + infoRow("Responsible Dept.", "{{departmentName}}") + infoRow("Complaint Owner", "{{ownerName}}") + infoRow("Priority", "{{priority}}")
      ) + emailButton("{{actionUrl}}", "Intervene on Complaint") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nESCALATION: Complaint {{complaintNumber}} has been escalated to {{escalationLevel}}.\n\nStage: {{stage}}\nOverdue: {{overdueHours}} hours\nDept: {{departmentName}}\nOwner: {{ownerName}}\nPriority: {{priority}}\n\nIntervene: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "escalationLevel", "stage", "overdueHours", "departmentName", "ownerName", "priority", "actionUrl", "companyName"]
  },
  // ==================== CAPA LIFECYCLE ====================
  {
    templateKey: "capa-assigned",
    templateName: "CAPA Assigned",
    triggerEvent: "CAPA_ASSIGNED",
    subject: "Action Assigned: CAPA {{capaNumber}} ({{capaType}})",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("New CAPA Action Item Assigned")}<p style="margin:0 0 12px;">You have been assigned as the action owner for <strong>CAPA {{capaNumber}}</strong>.</p>` + infoTable(
        infoRow("CAPA No.", "{{capaNumber}}") + infoRow("Type", "{{capaType}}") + infoRow("Target Date", "{{targetDate}}") + infoRow("Linked Complaint", "{{complaintNumber}}") + infoRow("Department", "{{departmentName}}")
      ) + highlightBox("<strong>Action Required:</strong><br>{{capaTitle}}") + emailButton("{{actionUrl}}", "Review CAPA Task") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nYou have been assigned CAPA {{capaNumber}} ({{capaType}}).\n\nTarget Date: {{targetDate}}\nLinked Complaint: {{complaintNumber}}\nDepartment: {{departmentName}}\n\nAction: {{capaTitle}}\n\nReview: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "capaNumber", "capaType", "targetDate", "complaintNumber", "departmentName", "capaTitle", "actionUrl", "companyName"]
  },
  {
    templateKey: "capa-reassigned",
    templateName: "CAPA Reassigned",
    triggerEvent: "CAPA_REASSIGNED",
    subject: "Reassigned: CAPA {{capaNumber}} Handover",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("CAPA Action Item Reassigned")}<p style="margin:0 0 12px;">CAPA <strong>{{capaNumber}}</strong> ownership has been reassigned to <strong>{{assignedTo}}</strong>.</p>` + infoTable(
        infoRow("CAPA No.", "{{capaNumber}}") + infoRow("New Assignee", "{{assignedTo}}") + infoRow("Target Date", "{{targetDate}}")
      ) + emailButton("{{actionUrl}}", "Open CAPA") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nCAPA {{capaNumber}} reassigned to {{assignedTo}}. Target Date: {{targetDate}}.\n\nOpen: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "capaNumber", "assignedTo", "targetDate", "actionUrl", "companyName"]
  },
  {
    templateKey: "capa-due-reminder",
    templateName: "CAPA Target Date Reminder",
    triggerEvent: "CAPA_DUE_REMINDER",
    subject: "Target Date Reminder: CAPA {{capaNumber}} Due {{targetDate}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("CAPA Due Date Reminder")}<p style="margin:0 0 12px;">This is a reminder that <strong>CAPA {{capaNumber}}</strong> is approaching its target completion date.</p>` + infoTable(
        infoRow("CAPA No.", "{{capaNumber}}") + infoRow("Action Plan", "{{capaTitle}}") + infoRow("Target Completion", "{{targetDate}}") + infoRow("Assignee", "{{assignedTo}}")
      ) + emailButton("{{actionUrl}}", "Submit Implementation Progress") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nReminder: CAPA {{capaNumber}} is approaching its target completion date ({{targetDate}}).\n\nAction: {{capaTitle}}\nAssignee: {{assignedTo}}\n\nSubmit: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "capaNumber", "capaTitle", "targetDate", "assignedTo", "actionUrl", "companyName"]
  },
  {
    templateKey: "capa-overdue",
    templateName: "CAPA Action Overdue",
    triggerEvent: "CAPA_OVERDUE",
    subject: "OVERDUE: CAPA {{capaNumber}} Completion Past Target Date",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("CAPA Implementation Overdue")}<p style="margin:0 0 12px;">CAPA <strong>{{capaNumber}}</strong> is <span style="color:#B91C1C;font-weight:700;">OVERDUE</span>. Target completion date was <strong>{{targetDate}}</strong>.</p>` + infoTable(
        infoRow("CAPA No.", "{{capaNumber}}") + infoRow("Owner", "{{assignedTo}}") + infoRow("Target Date", "{{targetDate}}") + infoRow("Linked Complaint", "{{complaintNumber}}")
      ) + emailButton("{{actionUrl}}", "Expedite CAPA Closure") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nOVERDUE: CAPA {{capaNumber}} is past its target date ({{targetDate}}).\n\nOwner: {{assignedTo}}\nLinked Complaint: {{complaintNumber}}\n\nExpedite: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "capaNumber", "assignedTo", "targetDate", "complaintNumber", "actionUrl", "companyName"]
  },
  {
    templateKey: "capa-completed",
    templateName: "CAPA Completed",
    triggerEvent: "CAPA_COMPLETED",
    subject: "Action Completed: CAPA {{capaNumber}} Implemented",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("CAPA Implementation Marked Complete")}<p style="margin:0 0 12px;">Corrective action implementation for <strong>CAPA {{capaNumber}}</strong> has been submitted. Objective evidence review is now pending.</p>` + infoTable(
        infoRow("CAPA No.", "{{capaNumber}}") + infoRow("Implemented By", "{{assignedTo}}") + infoRow("Linked Complaint", "{{complaintNumber}}")
      ) + emailButton("{{actionUrl}}", "Review Evidence") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nCAPA {{capaNumber}} implementation completed by {{assignedTo}}. Evidence review pending.\n\nReview: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "capaNumber", "assignedTo", "complaintNumber", "actionUrl", "companyName"]
  },
  {
    templateKey: "capa-evidence-uploaded",
    templateName: "CAPA Evidence Uploaded",
    triggerEvent: "CAPA_EVIDENCE_UPLOADED",
    subject: "Evidence Uploaded: CAPA {{capaNumber}} Ready for Review",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("CAPA Evidence Ready for Quality Review")}<p style="margin:0 0 12px;">Implementation evidence documents have been uploaded for <strong>CAPA {{capaNumber}}</strong>.</p>` + infoTable(
        infoRow("CAPA No.", "{{capaNumber}}") + infoRow("Submitted By", "{{assignedTo}}") + infoRow("Evidence File(s)", "{{evidenceFileName}}")
      ) + emailButton("{{actionUrl}}", "Review & Verify Evidence") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nEvidence uploaded for CAPA {{capaNumber}} by {{assignedTo}}.\n\nFile: {{evidenceFileName}}\n\nReview: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "capaNumber", "assignedTo", "evidenceFileName", "actionUrl", "companyName"]
  },
  {
    templateKey: "capa-evidence-accepted",
    templateName: "CAPA Evidence Accepted",
    triggerEvent: "CAPA_EVIDENCE_ACCEPTED",
    subject: "Evidence Accepted: CAPA {{capaNumber}} Verified",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("CAPA Evidence Approved")}<p style="margin:0 0 12px;">Submitted implementation evidence for <strong>CAPA {{capaNumber}}</strong> has been reviewed and <span style="color:#15803D;font-weight:700;">ACCEPTED</span>.</p>` + infoTable(
        infoRow("CAPA No.", "{{capaNumber}}") + infoRow("Reviewed By", "{{reviewedBy}}") + infoRow("Status", "Approved / Verification Phase")
      ) + emailButton("{{actionUrl}}", "View CAPA") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nEvidence for CAPA {{capaNumber}} accepted by {{reviewedBy}}.\n\nView: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "capaNumber", "reviewedBy", "actionUrl", "companyName"]
  },
  {
    templateKey: "capa-evidence-rejected",
    templateName: "CAPA Evidence Rejected",
    triggerEvent: "CAPA_EVIDENCE_REJECTED",
    subject: "Evidence Rejected: Action Required on CAPA {{capaNumber}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("CAPA Evidence Rejected &mdash; Revision Required")}<p style="margin:0 0 12px;">The evidence submitted for <strong>CAPA {{capaNumber}}</strong> was <span style="color:#B91C1C;font-weight:700;">REJECTED</span>. Please revise and upload compliant proof.</p>` + infoTable(
        infoRow("CAPA No.", "{{capaNumber}}") + infoRow("Reviewed By", "{{reviewedBy}}")
      ) + highlightBox("<strong>Rejection Remarks:</strong><br>{{rejectionRemarks}}", "#B91C1C", "#FEF2F2") + emailButton("{{actionUrl}}", "Resubmit CAPA Evidence") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nEvidence for CAPA {{capaNumber}} was REJECTED by {{reviewedBy}}.\n\nRemarks: {{rejectionRemarks}}\n\nResubmit: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "capaNumber", "reviewedBy", "rejectionRemarks", "actionUrl", "companyName"]
  },
  {
    templateKey: "capa-effectiveness-verified",
    templateName: "CAPA Effectiveness Verified",
    triggerEvent: "CAPA_EFFECTIVENESS_VERIFIED",
    subject: "Effectiveness Verified: CAPA {{capaNumber}} Sustained",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("CAPA Effectiveness Verified &amp; Confirmed")}<p style="margin:0 0 12px;">Post-implementation audit confirmed that corrective actions under <strong>CAPA {{capaNumber}}</strong> are <strong>EFFECTIVE</strong> and sustained.</p>` + infoTable(
        infoRow("CAPA No.", "{{capaNumber}}") + infoRow("Result", "Effective") + infoRow("Verified By", "{{verifiedBy}}")
      ) + emailButton("{{actionUrl}}", "View Verification Record") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nCAPA {{capaNumber}} effectiveness verified by {{verifiedBy}}. Result: Effective.\n\nView: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "capaNumber", "verifiedBy", "actionUrl", "companyName"]
  },
  {
    templateKey: "capa-not-effective",
    templateName: "CAPA Not Effective / Complaint Reopened",
    triggerEvent: "CAPA_NOT_EFFECTIVE",
    subject: "Alert: CAPA {{capaNumber}} Not Effective - Complaint Reopened",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Action Ineffective &mdash; Complaint Reopened")}<p style="margin:0 0 12px;">Post-implementation verification determined that corrective action <strong>CAPA {{capaNumber}}</strong> was <span style="color:#B91C1C;font-weight:700;">NOT EFFECTIVE</span>. Linked complaint <strong>{{complaintNumber}}</strong> has been automatically reopened.</p>` + infoTable(
        infoRow("CAPA No.", "{{capaNumber}}") + infoRow("Linked Complaint", "{{complaintNumber}}") + infoRow("Reviewed By", "{{verifiedBy}}")
      ) + highlightBox("<strong>Verification Finding:</strong><br>{{verificationRemarks}}", "#B91C1C", "#FEF2F2") + emailButton("{{actionUrl}}", "Initiate Re-Investigation") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nALERT: CAPA {{capaNumber}} was NOT EFFECTIVE. Complaint {{complaintNumber}} has been reopened.\n\nReviewed By: {{verifiedBy}}\nFindings: {{verificationRemarks}}\n\nAction: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "capaNumber", "complaintNumber", "verifiedBy", "verificationRemarks", "actionUrl", "companyName"]
  },
  // ==================== SIGNATURES ====================
  {
    templateKey: "signature-prepared",
    templateName: "8D Report Prepared",
    triggerEvent: "COMPLAINT_PREPARED",
    subject: "8D Prepared: Complaint {{complaintNumber}} Ready for Review",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("8D Report Signed as Prepared")}<p style="margin:0 0 12px;">The 8D investigation report for complaint <strong>{{complaintNumber}}</strong> has been signed by the preparation team and is awaiting formal Department Review.</p>` + infoTable(
        infoRow("Complaint No.", "{{complaintNumber}}") + infoRow("Prepared By", "{{signerName}}") + infoRow("Role", "Prepared By")
      ) + emailButton("{{actionUrl}}", "Perform Review Sign-Off") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nComplaint {{complaintNumber}} 8D report prepared by {{signerName}}. Ready for review.\n\nReview: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "signerName", "actionUrl", "companyName"]
  },
  {
    templateKey: "signature-reviewed",
    templateName: "8D Report Reviewed",
    triggerEvent: "COMPLAINT_REVIEWED",
    subject: "8D Reviewed: Complaint {{complaintNumber}} Ready for Approval",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("8D Report Reviewed &amp; Endorsed")}<p style="margin:0 0 12px;">Complaint <strong>{{complaintNumber}}</strong> has been formally reviewed and is ready for Final Approval by Quality Leadership.</p>` + infoTable(
        infoRow("Complaint No.", "{{complaintNumber}}") + infoRow("Reviewed By", "{{signerName}}")
      ) + emailButton("{{actionUrl}}", "Approve 8D Report") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nComplaint {{complaintNumber}} 8D reviewed by {{signerName}}. Ready for final approval.\n\nApprove: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "signerName", "actionUrl", "companyName"]
  },
  {
    templateKey: "signature-approved",
    templateName: "8D Report Approved",
    triggerEvent: "COMPLAINT_APPROVED",
    subject: "8D Approved: Complaint {{complaintNumber}} Fully Authorized",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("8D Report Formally Approved")}<p style="margin:0 0 12px;">Final approval has been granted for complaint <strong>{{complaintNumber}}</strong> by Quality Leadership.</p>` + infoTable(
        infoRow("Complaint No.", "{{complaintNumber}}") + infoRow("Approved By", "{{signerName}}")
      ) + emailButton("{{actionUrl}}", "View Approved 8D Report") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nComplaint {{complaintNumber}} 8D report approved by {{signerName}}.\n\nView: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "signerName", "actionUrl", "companyName"]
  },
  {
    templateKey: "signature-revoked",
    templateName: "8D Signature Revoked",
    triggerEvent: "SIGNATURE_REVOKED",
    subject: "Signature Revoked: Complaint {{complaintNumber}} 8D",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("8D Sign-Off Revoked")}<p style="margin:0 0 12px;">A signature on complaint <strong>{{complaintNumber}}</strong> was <span style="color:#B91C1C;font-weight:700;">REVOKED</span> due to downstream document edits or explicit revocation.</p>` + infoTable(
        infoRow("Complaint No.", "{{complaintNumber}}") + infoRow("Revoked By", "{{revokedBy}}") + infoRow("Revoked Role", "{{signatureRole}}")
      ) + highlightBox("<strong>Reason:</strong><br>{{revocationReason}}", "#B91C1C", "#FEF2F2") + emailButton("{{actionUrl}}", "Review Impacted 8D") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nSignature on complaint {{complaintNumber}} was REVOKED by {{revokedBy}} (Role: {{signatureRole}}).\n\nReason: {{revocationReason}}\n\nReview: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "revokedBy", "signatureRole", "revocationReason", "actionUrl", "companyName"]
  },
  // ==================== SUMMARIES ====================
  {
    templateKey: "summary-daily",
    templateName: "Daily Management Digest",
    triggerEvent: "DAILY_SUMMARY",
    subject: "Daily Quality Digest: {{totalOpen}} Open Complaints, {{overdueCount}} Overdue",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Daily Complaint &amp; CAPA Summary")}<p style="margin:0 0 12px;">Here is your daily operational summary for <strong>{{today}}</strong> across active quality workflows.</p>` + infoTable(
        infoRow("Open Complaints", "{{totalOpen}}") + infoRow("Due Soon (&lt;24h)", "{{dueSoonCount}}") + infoRow("Overdue Complaints", "{{overdueCount}}") + infoRow("Open CAPA Items", "{{openCapasCount}}") + infoRow("Overdue CAPAs", "{{capaOverdueCount}}")
      ) + emailButton("{{appUrl}}/tat", "Open TAT Dashboard") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nDaily Quality Summary for {{today}}:\n\nOpen Complaints: {{totalOpen}}\nDue Soon: {{dueSoonCount}}\nOverdue Complaints: {{overdueCount}}\nOpen CAPAs: {{openCapasCount}}\nOverdue CAPAs: {{capaOverdueCount}}\n\nDashboard: {{appUrl}}/tat\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "today", "totalOpen", "dueSoonCount", "overdueCount", "openCapasCount", "capaOverdueCount", "appUrl", "companyName"]
  },
  {
    templateKey: "summary-weekly",
    templateName: "Weekly Quality Digest",
    triggerEvent: "WEEKLY_SUMMARY",
    subject: "Weekly Quality Performance Report: {{period}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Weekly Quality Performance Overview")}<p style="margin:0 0 12px;">Here is the executive weekly summary of quality non-conformities, corrective action velocity, and repeat issues for <strong>{{period}}</strong>.</p>` + infoTable(
        infoRow("Reporting Period", "{{period}}") + infoRow("Active Complaints", "{{totalOpen}}") + infoRow("SLA Breaches", "{{overdueCount}}") + infoRow("Repeat Non-Conformities", "{{repeatCount}}") + infoRow("Open CAPAs", "{{openCapasCount}}")
      ) + emailButton("{{appUrl}}/reports", "Review Full Reports") + closing()
    ),
    textBody: "Hello {{recipientName}},\n\nWeekly Quality Performance Report ({{period}}):\n\nActive Complaints: {{totalOpen}}\nSLA Breaches: {{overdueCount}}\nRepeat Non-Conformities: {{repeatCount}}\nOpen CAPAs: {{openCapasCount}}\n\nReports: {{appUrl}}/reports\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "period", "totalOpen", "overdueCount", "repeatCount", "openCapasCount", "appUrl", "companyName"]
  }
];

// server/services/email-template.service.ts
async function seedDefaultTemplates() {
  await connectDB();
  let seededCount = 0;
  for (const defaultTmpl of DEFAULT_EMAIL_TEMPLATES) {
    const existing = await EmailTemplate.findOne({ templateKey: defaultTmpl.templateKey });
    if (!existing) {
      const vars = defaultTmpl.supportedVariables && defaultTmpl.supportedVariables.length > 0 ? defaultTmpl.supportedVariables : variablesInTemplate(defaultTmpl.subject, defaultTmpl.htmlBody, defaultTmpl.textBody);
      await EmailTemplate.create({
        ...defaultTmpl,
        supportedVariables: vars,
        isActive: true
      });
      seededCount++;
    }
  }
  return seededCount;
}
async function listEmailTemplates(filter) {
  await connectDB();
  await seedDefaultTemplates();
  const query = {};
  if (filter?.triggerEvent) {
    query.triggerEvent = filter.triggerEvent;
  }
  if (filter?.activeOnly) {
    query.isActive = true;
  }
  if (filter?.search && filter.search.trim().length > 0) {
    const s = filter.search.trim();
    query.$or = [
      { templateName: { $regex: s, $options: "i" } },
      { templateKey: { $regex: s, $options: "i" } },
      { subject: { $regex: s, $options: "i" } }
    ];
  }
  return EmailTemplate.find(query).sort({ triggerEvent: 1, templateName: 1 }).populate("updatedBy", "name username").lean();
}
async function getEmailTemplateById(id2) {
  if (!Types.ObjectId.isValid(id2)) throw httpError(400, "Invalid template ID");
  await connectDB();
  const template = await EmailTemplate.findById(id2).populate("updatedBy", "name username").lean();
  if (!template) throw httpError(404, "Email template not found");
  return template;
}
async function getActiveTemplateByTrigger(triggerEvent) {
  await connectDB();
  const doc = await EmailTemplate.findOne({ triggerEvent, isActive: true }).lean();
  if (doc) return doc;
  const fallback = DEFAULT_EMAIL_TEMPLATES.find((t) => t.triggerEvent === triggerEvent);
  return fallback || null;
}
async function createEmailTemplate(input, userId) {
  await connectDB();
  const key = input.templateKey.toLowerCase().trim();
  const existing = await EmailTemplate.findOne({ templateKey: key });
  if (existing) {
    throw httpError(400, `Template key '${key}' is already in use`);
  }
  const vars = input.supportedVariables.length > 0 ? input.supportedVariables : variablesInTemplate(input.subject, input.htmlBody, input.textBody);
  return EmailTemplate.create({
    ...input,
    templateKey: key,
    supportedVariables: vars,
    createdBy: userId,
    updatedBy: userId
  });
}
async function updateEmailTemplate(id2, input, userId) {
  if (!Types.ObjectId.isValid(id2)) throw httpError(400, "Invalid template ID");
  await connectDB();
  const existing = await EmailTemplate.findById(id2);
  if (!existing) throw httpError(404, "Email template not found");
  if (input.subject !== void 0) existing.subject = input.subject;
  if (input.htmlBody !== void 0) existing.htmlBody = input.htmlBody;
  if (input.textBody !== void 0) existing.textBody = input.textBody;
  if (input.templateName !== void 0) existing.templateName = input.templateName;
  if (input.triggerEvent !== void 0) existing.triggerEvent = input.triggerEvent;
  if (input.isActive !== void 0) existing.isActive = input.isActive;
  if (input.allowedRolesToReceive !== void 0) existing.allowedRolesToReceive = input.allowedRolesToReceive;
  if (input.ccRules !== void 0) existing.ccRules = input.ccRules;
  if (input.bccRules !== void 0) existing.bccRules = input.bccRules;
  existing.supportedVariables = variablesInTemplate(existing.subject, existing.htmlBody, existing.textBody);
  if (userId) existing.updatedBy = new Types.ObjectId(userId);
  await existing.save();
  return existing.toObject();
}
async function previewEmailTemplate(templateIdOrTrigger, overrides) {
  await connectDB();
  let html = overrides?.htmlBody;
  let text2 = overrides?.textBody;
  let subject = overrides?.subject;
  let triggerEvent = "COMPLAINT_CREATED";
  if (!html || !subject) {
    if (Types.ObjectId.isValid(templateIdOrTrigger)) {
      const doc = await EmailTemplate.findById(templateIdOrTrigger).lean();
      if (doc) {
        html = html || doc.htmlBody;
        text2 = text2 || doc.textBody;
        subject = subject || doc.subject;
        triggerEvent = doc.triggerEvent;
      }
    } else {
      const doc = await EmailTemplate.findOne({ triggerEvent: templateIdOrTrigger, isActive: true }).lean();
      if (doc) {
        html = html || doc.htmlBody;
        text2 = text2 || doc.textBody;
        subject = subject || doc.subject;
        triggerEvent = doc.triggerEvent;
      } else {
        const fallback = DEFAULT_EMAIL_TEMPLATES.find((t) => t.triggerEvent === templateIdOrTrigger);
        if (fallback) {
          html = html || fallback.htmlBody;
          text2 = text2 || fallback.textBody;
          subject = subject || fallback.subject;
          triggerEvent = fallback.triggerEvent;
        }
      }
    }
  }
  const sample = {
    ...getSampleVariables(triggerEvent),
    ...overrides?.sampleData || {}
  };
  const renderedSubject = renderTemplate(subject || "", sample);
  const renderedHtml = renderTemplate(html || "", sample);
  const renderedText = renderTemplate(text2 || "", sample);
  return {
    subject: renderedSubject.rendered,
    html: renderedHtml.rendered,
    text: renderedText.rendered,
    missingVariables: [
      .../* @__PURE__ */ new Set([
        ...renderedSubject.missingVariables,
        ...renderedHtml.missingVariables,
        ...renderedText.missingVariables
      ])
    ],
    sampleDataUsed: sample
  };
}

// server/services/email-log.service.ts
import { Types as Types2 } from "mongoose";

// server/models/EmailLog.ts
import mongoose12, { Schema as Schema11 } from "mongoose";
var EmailLogSchema = new Schema11(
  {
    templateKey: { type: String, index: true },
    triggerEvent: { type: String, required: true, index: true },
    recipients: [{ type: String, index: true }],
    cc: [{ type: String }],
    bcc: [{ type: String }],
    subject: { type: String, default: "" },
    status: {
      type: String,
      enum: ["sent", "failed", "skipped"],
      required: true,
      index: true
    },
    errorMessage: { type: String },
    relatedComplaintId: { type: Schema11.Types.ObjectId, ref: "Complaint", index: true },
    relatedCapaId: { type: Schema11.Types.ObjectId, ref: "Capa", index: true },
    sentBySystem: { type: Boolean, default: true },
    payload: { type: Schema11.Types.Mixed },
    // Safe context for retry, NEVER credentials
    dedupeKey: { type: String, sparse: true, index: true },
    attemptCount: { type: Number, default: 1 }
  },
  { timestamps: true }
);
EmailLogSchema.index({ createdAt: -1 });
var EmailLog = mongoose12.models.EmailLog || mongoose12.model("EmailLog", EmailLogSchema);

// server/services/email-log.service.ts
function sanitizePayload(rawPayload) {
  if (!rawPayload) return void 0;
  const safe = {};
  for (const [key, value] of Object.entries(rawPayload)) {
    if (/(password|secret|token|auth|cookie)/i.test(key)) {
      continue;
    }
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      safe[key] = sanitizePayload(value);
    } else {
      safe[key] = value;
    }
  }
  return safe;
}
async function writeEmailLog(input) {
  await connectDB();
  return EmailLog.create({
    templateKey: input.templateKey,
    triggerEvent: input.triggerEvent,
    recipients: input.recipients,
    cc: input.cc || [],
    bcc: input.bcc || [],
    subject: input.subject || "",
    status: input.status,
    errorMessage: input.errorMessage,
    relatedComplaintId: input.relatedComplaintId,
    relatedCapaId: input.relatedCapaId,
    sentBySystem: input.sentBySystem !== void 0 ? input.sentBySystem : true,
    payload: sanitizePayload(input.payload),
    dedupeKey: input.dedupeKey,
    attemptCount: input.attemptCount || 1
  });
}
async function hasDedupeKeyBeenSent(dedupeKey) {
  if (!dedupeKey) return false;
  await connectDB();
  const existing = await EmailLog.findOne({ dedupeKey, status: "sent" }).select("_id").lean();
  return Boolean(existing);
}
async function queryEmailLogs(query) {
  await connectDB();
  const filter = {};
  if (query.status && query.status !== "all") {
    filter.status = query.status;
  }
  if (query.triggerEvent && query.triggerEvent.trim().length > 0) {
    filter.triggerEvent = query.triggerEvent.trim();
  }
  if (query.templateKey && query.templateKey.trim().length > 0) {
    filter.templateKey = query.templateKey.trim().toLowerCase();
  }
  if (query.recipient && query.recipient.trim().length > 0) {
    filter.recipients = { $in: [new RegExp(query.recipient.trim(), "i")] };
  }
  if (query.search && query.search.trim().length > 0) {
    const s = query.search.trim();
    filter.$or = [
      { subject: { $regex: s, $options: "i" } },
      { recipients: { $regex: s, $options: "i" } },
      { triggerEvent: { $regex: s, $options: "i" } },
      { templateKey: { $regex: s, $options: "i" } }
    ];
  }
  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) {
      filter.createdAt.$gte = new Date(query.startDate);
    }
    if (query.endDate) {
      filter.createdAt.$lte = new Date(query.endDate);
    }
  }
  const page = Math.max(1, query.page || 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
  const skip = (page - 1) * pageSize;
  const [total, items] = await Promise.all([
    EmailLog.countDocuments(filter),
    EmailLog.find(filter).populate("relatedComplaintId", "complaintNumber title").populate("relatedCapaId", "capaNumber title").sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean()
  ]);
  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    }
  };
}
async function getEmailLogById(id2) {
  if (!Types2.ObjectId.isValid(id2)) throw httpError(400, "Invalid log ID");
  await connectDB();
  const log = await EmailLog.findById(id2).populate("relatedComplaintId", "complaintNumber title status priority").populate("relatedCapaId", "capaNumber title status").lean();
  if (!log) throw httpError(404, "Email log record not found");
  return log;
}

// server/services/email.service.ts
function normalizePortalLinks(data, appUrl) {
  const normalized = { ...data };
  for (const [key, value] of Object.entries(normalized)) {
    if (!/(url|link)$/i.test(key) || typeof value !== "string" || !value.startsWith("/")) continue;
    normalized[key] = new URL(value, appUrl).toString();
  }
  return normalized;
}
async function sendTemplatedEmail(input) {
  if (input.dedupeKey) {
    const alreadySent = await hasDedupeKeyBeenSent(input.dedupeKey);
    if (alreadySent) {
      const skippedLog = await writeEmailLog({
        triggerEvent: input.triggerEvent,
        recipients: input.recipients,
        cc: input.cc,
        bcc: input.bcc,
        status: "skipped",
        errorMessage: `Duplicate event suppressed (dedupeKey: ${input.dedupeKey})`,
        relatedComplaintId: input.relatedComplaintId,
        relatedCapaId: input.relatedCapaId,
        dedupeKey: input.dedupeKey,
        sentBySystem: input.sentBySystem !== void 0 ? input.sentBySystem : true
      });
      return { status: "skipped", logId: String(skippedLog._id), message: "Duplicate event suppressed" };
    }
  }
  const template = await getActiveTemplateByTrigger(input.triggerEvent);
  if (!template) {
    const skippedLog = await writeEmailLog({
      triggerEvent: input.triggerEvent,
      recipients: input.recipients,
      status: "skipped",
      errorMessage: `No active template found for trigger: ${input.triggerEvent}`,
      relatedComplaintId: input.relatedComplaintId,
      relatedCapaId: input.relatedCapaId,
      dedupeKey: input.dedupeKey,
      sentBySystem: input.sentBySystem !== void 0 ? input.sentBySystem : true
    });
    return { status: "skipped", logId: String(skippedLog._id), message: "No active template" };
  }
  const cleanRecipients = (input.recipients || []).filter(Boolean);
  if (cleanRecipients.length === 0) {
    const skippedLog = await writeEmailLog({
      templateKey: template.templateKey,
      triggerEvent: input.triggerEvent,
      recipients: [],
      status: "skipped",
      errorMessage: "No valid recipient email addresses resolved",
      relatedComplaintId: input.relatedComplaintId,
      relatedCapaId: input.relatedCapaId,
      dedupeKey: input.dedupeKey,
      sentBySystem: input.sentBySystem !== void 0 ? input.sentBySystem : true
    });
    return { status: "skipped", logId: String(skippedLog._id), message: "No recipients" };
  }
  const appUrl = getAppUrl();
  const today = (/* @__PURE__ */ new Date()).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const normalizedInputData = normalizePortalLinks(input.data, appUrl);
  const mergedData = {
    companyName: "ONEPWS Private Limited",
    appUrl,
    logoUrl: DEFAULT_EMAIL_LOGO_URL,
    today,
    recipientName: cleanRecipients[0],
    ...normalizedInputData
  };
  const renderedSubject = renderTemplate(template.subject, mergedData).rendered;
  const renderedHtml = renderTemplate(template.htmlBody, mergedData).rendered;
  const renderedText = renderTemplate(template.textBody, mergedData).rendered;
  if (!isSmtpConfigured()) {
    const skippedLog = await writeEmailLog({
      templateKey: template.templateKey,
      triggerEvent: input.triggerEvent,
      recipients: cleanRecipients,
      cc: input.cc,
      bcc: input.bcc,
      subject: renderedSubject,
      status: "skipped",
      errorMessage: "SMTP is not configured on server; delivery skipped",
      relatedComplaintId: input.relatedComplaintId,
      relatedCapaId: input.relatedCapaId,
      dedupeKey: input.dedupeKey,
      sentBySystem: input.sentBySystem !== void 0 ? input.sentBySystem : true,
      payload: { data: mergedData }
    });
    return { status: "skipped", logId: String(skippedLog._id), message: "SMTP not configured" };
  }
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: fromAddress(),
      to: cleanRecipients,
      cc: input.cc && input.cc.length > 0 ? input.cc : void 0,
      bcc: input.bcc && input.bcc.length > 0 ? input.bcc : void 0,
      subject: renderedSubject,
      html: renderedHtml,
      text: renderedText
    });
    const sentLog = await writeEmailLog({
      templateKey: template.templateKey,
      triggerEvent: input.triggerEvent,
      recipients: cleanRecipients,
      cc: input.cc,
      bcc: input.bcc,
      subject: renderedSubject,
      status: "sent",
      relatedComplaintId: input.relatedComplaintId,
      relatedCapaId: input.relatedCapaId,
      dedupeKey: input.dedupeKey,
      sentBySystem: input.sentBySystem !== void 0 ? input.sentBySystem : true
    });
    return { status: "sent", logId: String(sentLog._id) };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "SMTP transport error";
    const failedLog = await writeEmailLog({
      templateKey: template.templateKey,
      triggerEvent: input.triggerEvent,
      recipients: cleanRecipients,
      cc: input.cc,
      bcc: input.bcc,
      subject: renderedSubject,
      status: "failed",
      errorMessage: errorMsg,
      relatedComplaintId: input.relatedComplaintId,
      relatedCapaId: input.relatedCapaId,
      dedupeKey: input.dedupeKey,
      sentBySystem: input.sentBySystem !== void 0 ? input.sentBySystem : true,
      payload: {
        triggerEvent: input.triggerEvent,
        recipients: cleanRecipients,
        cc: input.cc,
        bcc: input.bcc,
        data: mergedData,
        relatedComplaintId: input.relatedComplaintId,
        relatedCapaId: input.relatedCapaId
      }
    });
    return { status: "failed", logId: String(failedLog._id), message: errorMsg };
  }
}
async function retryEmail(logId) {
  const log = await getEmailLogById(logId);
  if (!log) throw httpError(404, "Log record not found");
  if (log.status === "sent") return { status: "sent", logId: String(log._id), message: "Email was already sent successfully" };
  const payload = log.payload || {};
  const data = payload.data || {};
  const result = await sendTemplatedEmail({
    triggerEvent: log.triggerEvent,
    recipients: log.recipients,
    cc: log.cc,
    bcc: log.bcc,
    data,
    relatedComplaintId: log.relatedComplaintId?._id ? String(log.relatedComplaintId._id) : void 0,
    relatedCapaId: log.relatedCapaId?._id ? String(log.relatedCapaId._id) : void 0,
    sentBySystem: false
  });
  await EmailLog.findByIdAndUpdate(logId, { $inc: { attemptCount: 1 } });
  return result;
}
async function sendRawTestEmail(input) {
  if (!isSmtpConfigured()) throw httpError(400, "SMTP credentials are not configured on this server");
  const subject = input.subject || "ONEPWS Portal - SMTP Test Email";
  const appUrl = getAppUrl();
  const testMessage = input.message || "This is a verification test email from the ONEPWS Complaint & CAPA Management Portal.";
  const safeMessage = escapeHtml(testMessage);
  const safeAppUrl = escapeHtml(appUrl);
  const html = `
    <div style="font-family: 'DM Sans', Arial, sans-serif; padding: 24px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #E31E25; margin-top: 0;">SMTP Test Verification</h2>
      <p style="color: #1E293B; font-size: 14px;">${safeMessage}</p>
      <p style="color: #64748B; font-size: 12px; margin-top: 24px;">Sent from: <a href="${safeAppUrl}" style="color: #E31E25;">${safeAppUrl}</a></p>
    </div>
  `;
  try {
    const transporter = createTransporter();
    await transporter.sendMail({ from: fromAddress(), to: input.to, subject, html, text: `${subject}

${testMessage}

Portal: ${appUrl}` });
    const log = await writeEmailLog({ triggerEvent: "TEST_SMTP", recipients: [input.to], subject, status: "sent", sentBySystem: false });
    return { status: "sent", logId: String(log._id) };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to send test email";
    await writeEmailLog({ triggerEvent: "TEST_SMTP", recipients: [input.to], subject, status: "failed", errorMessage: msg, sentBySystem: false });
    throw httpError(500, `SMTP Test failed: ${msg}`);
  }
}

// server/services/email-recipient.service.ts
import { Types as Types3 } from "mongoose";
var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function normalizeEmail(email) {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  return EMAIL_REGEX.test(trimmed) ? trimmed : null;
}
async function resolveRecipients(options) {
  await connectDB();
  const recipientSet = /* @__PURE__ */ new Set();
  if (options.explicitEmails) {
    for (const raw of options.explicitEmails) {
      const email = normalizeEmail(raw);
      if (email) recipientSet.add(email);
    }
  }
  let complaintDoc = null;
  if (options.complaintId && Types3.ObjectId.isValid(options.complaintId)) {
    complaintDoc = await Complaint.findById(options.complaintId).lean();
  }
  let capaDoc = null;
  if (options.capaId && Types3.ObjectId.isValid(options.capaId)) {
    capaDoc = await Capa.findById(options.capaId).lean();
  }
  const effectiveCompanyId = options.companyId || complaintDoc?.company || capaDoc?.company;
  const effectiveDepartmentId = options.departmentId || complaintDoc?.responsibleDept || capaDoc?.department;
  const effectiveOwnerId = options.ownerId || complaintDoc?.owner || capaDoc?.owner;
  const effectiveCoordinatorId = options.coordinatorId || complaintDoc?.coordinator;
  const roles = options.targetRoles || [];
  if (roles.includes("Complaint Owner") && effectiveOwnerId) {
    const ownerUser = await User.findOne({ _id: effectiveOwnerId, active: true }).lean();
    const email = normalizeEmail(ownerUser?.email);
    if (email) recipientSet.add(email);
  }
  if (roles.includes("Coordinator") && effectiveCoordinatorId) {
    const coordUser = await User.findOne({ _id: effectiveCoordinatorId, active: true }).lean();
    const email = normalizeEmail(coordUser?.email);
    if (email) recipientSet.add(email);
  }
  if (roles.includes("CAPA Owner") && capaDoc?.owner) {
    const capaOwner = await User.findOne({ _id: capaDoc.owner, active: true }).lean();
    const email = normalizeEmail(capaOwner?.email);
    if (email) recipientSet.add(email);
  }
  if ((roles.includes("Department Head") || roles.includes("Manager")) && effectiveDepartmentId) {
    const query = {
      department: effectiveDepartmentId,
      active: true
    };
    if (effectiveCompanyId) {
      query.company = effectiveCompanyId;
    }
    const employees = await Employee.find(query).lean();
    for (const emp of employees) {
      const hod = normalizeEmail(emp.hodEmail);
      if (hod && roles.includes("Department Head")) recipientSet.add(hod);
      const mgr = normalizeEmail(emp.managerEmail);
      if (mgr && (roles.includes("Manager") || roles.includes("Department Head"))) recipientSet.add(mgr);
    }
  }
  if (roles.includes("Quality Head")) {
    const qualityRoles = await Role.find({
      $or: [
        { name: /quality/i },
        { permissions: "complaint.approve" },
        { permissions: "capa.review_evidence" }
      ],
      active: true
    }).select("_id").lean();
    const roleIds = qualityRoles.map((r) => r._id);
    if (roleIds.length > 0) {
      const userQuery = {
        role: { $in: roleIds },
        active: true
      };
      if (effectiveCompanyId) {
        userQuery.$or = [{ companyIds: effectiveCompanyId }, { companyIds: { $size: 0 } }];
      }
      const qualityUsers = await User.find(userQuery).select("email").lean();
      for (const u of qualityUsers) {
        const email = normalizeEmail(u.email);
        if (email) recipientSet.add(email);
      }
    }
  }
  if (roles.includes("Management")) {
    const mgmtRoles = await Role.find({
      name: { $in: ["Management", "Director", "Managing Director", "Plant Head"] },
      active: true
    }).select("_id").lean();
    const roleIds = mgmtRoles.map((r) => r._id);
    if (roleIds.length > 0) {
      const userQuery = {
        role: { $in: roleIds },
        active: true
      };
      if (effectiveCompanyId) {
        userQuery.$or = [{ companyIds: effectiveCompanyId }, { companyIds: { $size: 0 } }];
      }
      const mgmtUsers = await User.find(userQuery).select("email").lean();
      for (const u of mgmtUsers) {
        const email = normalizeEmail(u.email);
        if (email) recipientSet.add(email);
      }
    }
  }
  if (roles.includes("Master Admin")) {
    const adminRole = await Role.findOne({ name: "Master Admin" }).select("_id").lean();
    if (adminRole) {
      const admins = await User.find({ role: adminRole._id, active: true }).select("email").lean();
      for (const admin of admins) {
        const email = normalizeEmail(admin.email);
        if (email) recipientSet.add(email);
      }
    }
  }
  if (options.excludeEmails) {
    for (const raw of options.excludeEmails) {
      const email = normalizeEmail(raw);
      if (email) recipientSet.delete(email);
    }
  }
  return Array.from(recipientSet);
}

// server/domain/numbering.ts
function financialYearLabel(reference = /* @__PURE__ */ new Date()) {
  const date2 = reference instanceof Date ? reference : new Date(reference);
  const year = date2.getFullYear();
  const month = date2.getMonth();
  const startYear = month >= 3 ? year : year - 1;
  return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
}
function counterKey(prefix, reference = /* @__PURE__ */ new Date()) {
  return `${prefix}-${financialYearLabel(reference)}`;
}
function formatComplaintNumber(prefix, reference, sequence, padding = 5) {
  return `${counterKey(prefix, reference)}-${String(sequence).padStart(padding, "0")}`;
}
function formatCapaNumber(complaintNumber, index, padding = 2) {
  return `${complaintNumber}-CAPA-${String(index).padStart(padding, "0")}`;
}

// server/models/Counter.ts
import mongoose13, { Schema as Schema12 } from "mongoose";
var CounterSchema = new Schema12(
  {
    key: { type: String, required: true, unique: true, trim: true, index: true },
    company: { type: Schema12.Types.ObjectId, ref: "Company", index: true },
    financialYear: { type: String, trim: true },
    sequence: { type: Number, required: true, default: 0 }
  },
  { timestamps: true }
);
var Counter = mongoose13.models.Counter || mongoose13.model("Counter", CounterSchema);

// server/services/numbering.service.ts
var mongoCounterStore = {
  async increment(key, companyId, financialYear) {
    const counter = await Counter.findOneAndUpdate(
      { key },
      { $inc: { sequence: 1 }, $setOnInsert: { company: companyId, financialYear } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return counter?.sequence ?? 1;
  }
};
async function nextComplaintNumber(companyId, receivedAt, store = mongoCounterStore) {
  const config = await resolveNumbering(companyId);
  const reference = config.resetOnFinancialYear ? receivedAt : /* @__PURE__ */ new Date(0);
  const key = counterKey(config.prefix, reference);
  const sequence = await store.increment(key, String(companyId), financialYearLabel(reference));
  return formatComplaintNumber(config.prefix, reference, sequence, config.sequencePadding);
}
async function nextCapaNumber(companyId, complaintNumber, sequence) {
  const config = await resolveNumbering(companyId);
  return formatCapaNumber(complaintNumber, sequence, config.capaSequencePadding);
}

// server/models/AuditLog.ts
import mongoose14, { Schema as Schema13 } from "mongoose";
var AuditLogSchema = new Schema13(
  {
    actor: { type: Schema13.Types.ObjectId, ref: "User", index: true },
    actorName: { type: String, trim: true },
    action: { type: String, required: true, trim: true, index: true },
    entity: { type: String, required: true, trim: true, index: true },
    entityId: { type: String, trim: true, index: true },
    before: Schema13.Types.Mixed,
    after: Schema13.Types.Mixed,
    metadata: Schema13.Types.Mixed
  },
  { timestamps: true }
);
var AuditLog = mongoose14.models.AuditLog || mongoose14.model("AuditLog", AuditLogSchema);

// server/services/audit.service.ts
async function writeAudit(input) {
  return AuditLog.create({
    actor: input.actor?.id,
    actorName: input.actor?.name || "System",
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    before: input.before,
    after: input.after,
    metadata: input.metadata
  });
}

// server/services/complaint.service.ts
function gapsToIssues(gaps) {
  return gaps.map((gap) => ({ field: gap.field, section: gap.section, message: gap.hint ? `${gap.field} \u2014 ${gap.hint}` : gap.field }));
}
async function priorityMultiplier(priorityId) {
  if (!priorityId) return 1;
  const priority = await Priority.findById(priorityId).lean();
  return priority?.tatMultiplier ?? 1;
}
async function requireActor(user) {
  if (!user) throw httpError(401, "Unauthorized");
  const employee = user.employee ? await Employee.findById(user.employee).lean() : null;
  const actor = toDomainActor(user, employee?.department ? String(employee.department) : void 0);
  if (!actor) throw httpError(401, "Unauthorized");
  return actor;
}
async function loadComplaintContext(complaintId, user) {
  if (!Types4.ObjectId.isValid(complaintId)) throw httpError(400, "Invalid complaint id");
  const actor = await requireActor(user);
  const doc = await Complaint.findById(complaintId);
  if (!doc) throw httpError(404, "Complaint not found");
  const domain = toDomainComplaint(doc, await priorityMultiplier(doc.priority));
  if (!canViewComplaint(actor, domain)) throw httpError(403, "You do not have access to this complaint");
  return { doc, domain, actor };
}
function assertEditable(context) {
  if (!canEditComplaint(context.actor, context.domain)) {
    throw httpError(403, "You do not have permission to edit this complaint");
  }
  if (context.doc.closedAt && !isMasterAdmin(context.actor)) {
    throw httpError(409, "This complaint is closed. Reopen it before making further changes.");
  }
}
async function loadDomainCapas(complaintId) {
  const capas = await Capa.find({ complaint: complaintId });
  return capas.map(toDomainCapa);
}
function pushWorkflowLog(doc, stage, actor, notes) {
  doc.workflowLog.push({ stage, at: /* @__PURE__ */ new Date(), by: new Types4.ObjectId(actor.id), byName: actor.name, notes });
}
async function createComplaint(input, user) {
  const actor = await requireActor(user);
  if (!hasPermission(actor, "complaint.create")) throw httpError(403, "You do not have permission to register complaints");
  if (!canSeeCompany(actor, input.company)) throw httpError(403, "You cannot register complaints for this company");
  const number = await nextComplaintNumber(input.company, input.receivedAt);
  const tatConfig = await resolveTatConfig(input.company);
  const responsibleDept = input.type === "External" ? input.responsibleDept : input.againstDept;
  const doc = await Complaint.create({
    number,
    company: input.company,
    type: input.type,
    status: "Open",
    receivedAt: input.receivedAt,
    source: input.source,
    reportedBy: input.reportedBy,
    priority: input.priority,
    customer: input.type === "External" ? input.customer : "",
    customerContact: input.customerContact,
    customerLocation: input.customerLocation,
    project: input.project,
    customerPO: input.customerPO,
    product: input.product,
    batch: input.batch,
    internalDept: input.type === "Internal" ? input.internalDept : void 0,
    againstDept: input.type === "Internal" ? input.againstDept : void 0,
    responsibleDept,
    category: input.category,
    subCategory: input.subCategory,
    description: input.description,
    owner: input.owner ?? actor.id,
    createdBy: actor.id,
    workflowLog: [{ stage: "Registered", at: /* @__PURE__ */ new Date(), by: actor.id, byName: actor.name, notes: "Complaint registered" }]
  });
  const cutoff = repeatCutoff(tatConfig.repeatWindowDays);
  const population = await Complaint.find({
    _id: { $ne: doc._id },
    company: input.company,
    category: input.category,
    receivedAt: { $gte: cutoff }
  }).select("_id number company customer product category receivedAt").lean();
  const matches = findRepeatMatches(
    {
      id: String(doc._id),
      companyId: String(input.company),
      customer: input.customer,
      product: input.product,
      category: input.category,
      receivedAt: input.receivedAt.toISOString()
    },
    population.map((entry) => ({
      id: String(entry._id),
      companyId: String(entry.company),
      customer: entry.customer ?? void 0,
      product: entry.product ?? void 0,
      category: entry.category ?? void 0,
      receivedAt: entry.receivedAt.toISOString()
    })),
    tatConfig.repeatWindowDays
  );
  if (matches.length > 0) {
    doc.isRepeat = true;
    doc.set(
      "repeatOf",
      matches.map((match) => {
        const source = population.find((entry) => String(entry._id) === match.complaintId);
        return { complaint: new Types4.ObjectId(match.complaintId), number: source?.number ?? "", basis: match.basis };
      })
    );
    doc.repeatBasis = describeRepeatBasis(matches);
    await doc.save();
  }
  await writeAudit({
    actor: user,
    action: "CREATE",
    entity: "Complaint",
    entityId: String(doc._id),
    after: { number: doc.number, type: doc.type, category: doc.category, isRepeat: doc.isRepeat }
  });
  const qualityHeads = await usersWithRole("Quality Head", input.company);
  await notify({
    recipients: [doc.owner, ...qualityHeads].filter(Boolean),
    message: `New ${doc.type.toLowerCase()} complaint ${doc.number} registered`,
    category: "complaint",
    entityType: "Complaint",
    entityId: doc._id,
    link: `/complaints/${doc._id}`
  });
  const emailRecipients = await resolveRecipients({
    complaintId: doc._id,
    targetRoles: ["Complaint Owner", "Coordinator", "Department Head", "Quality Head"]
  });
  if (emailRecipients.length > 0) {
    await sendTemplatedEmail({
      triggerEvent: "COMPLAINT_CREATED",
      recipients: emailRecipients,
      relatedComplaintId: doc._id,
      data: {
        complaintNumber: doc.number,
        complaintTitle: doc.description || doc.number,
        complaintType: doc.type,
        customerName: doc.customer || "Internal Issue",
        partName: doc.product || "Component",
        partNumber: "N/A",
        priority: String(doc.priority || "Standard"),
        ackDueDate: "Within 24h",
        actionUrl: `/complaints/${doc._id}`
      }
    });
  }
  return doc;
}
async function listComplaints(query, user) {
  const actor = await requireActor(user);
  if (!hasPermission(actor, "view.all") && !hasPermission(actor, "view.company")) {
    throw httpError(403, "You do not have permission to view complaints");
  }
  const filter = {};
  if (!hasPermission(actor, "view.all")) filter.company = { $in: actor.companyIds.map((id2) => new Types4.ObjectId(id2)) };
  if (query.company) {
    if (!canSeeCompany(actor, query.company)) throw httpError(403, "You do not have access to this company");
    filter.company = new Types4.ObjectId(query.company);
  }
  if (query.type) filter.type = query.type;
  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = new Types4.ObjectId(query.priority);
  if (query.category) filter.category = query.category;
  if (query.responsibleDept) filter.responsibleDept = new Types4.ObjectId(query.responsibleDept);
  if (query.owner) filter.owner = new Types4.ObjectId(query.owner);
  if (typeof query.isRepeat === "boolean") filter.isRepeat = query.isRepeat;
  if (query.receivedFrom || query.receivedTo) {
    filter.receivedAt = {
      ...query.receivedFrom ? { $gte: query.receivedFrom } : {},
      ...query.receivedTo ? { $lte: query.receivedTo } : {}
    };
  }
  if (query.search) {
    const term = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(term, "i");
    filter.$or = [{ number: regex }, { customer: regex }, { product: regex }, { project: regex }, { description: regex }];
  }
  const sortField = query.sort && /^[a-zA-Z]+$/.test(query.sort) ? query.sort : "receivedAt";
  const sort = { [sortField]: query.order === "asc" ? 1 : -1 };
  const [rows, total] = await Promise.all([
    Complaint.find(filter).sort(sort).skip((query.page - 1) * query.pageSize).limit(query.pageSize).populate("company", "name code").populate("priority", "name color tatMultiplier").populate("owner", "name username").populate("responsibleDept", "name").lean(),
    Complaint.countDocuments(filter)
  ]);
  return { rows, total };
}
async function getComplaintDetail(complaintId, user) {
  const context = await loadComplaintContext(complaintId, user);
  const tatConfig = await resolveTatConfig(context.doc.company);
  const capas = await Capa.find({ complaint: context.doc._id }).populate("owner", "name").sort({ sequence: 1 }).lean();
  return {
    complaint: context.doc.toObject(),
    capas,
    tat: buildTatPlan(context.domain, tatConfig),
    tatConfig,
    permissions: {
      canEdit: canEditComplaint(context.actor, context.domain),
      canClose: canCloseComplaint(context.actor, context.domain),
      canDelete: isMasterAdmin(context.actor)
    }
  };
}
async function completeStage(complaintId, input, user) {
  const context = await loadComplaintContext(complaintId, user);
  assertEditable(context);
  const stage = input.stage;
  const capas = await loadDomainCapas(complaintId);
  const tatConfig = await resolveTatConfig(context.doc.company);
  const sequenceIssues = stageSequenceGaps(context.domain, stage);
  const contentIssues = stageGaps(context.domain, capas, stage);
  const overdue = isStageOverdueNow(context.domain, stage, tatConfig);
  const reasons = await activeDelayReasons();
  const delayIssues = delayGaps(overdue, input.delay, reasons);
  const gaps = [...sequenceIssues, ...contentIssues, ...delayIssues];
  if (gaps.length > 0) {
    throw businessRuleError(`This stage cannot be completed yet (${gaps.length} requirement(s) outstanding)`, gapsToIssues(gaps));
  }
  const now = /* @__PURE__ */ new Date();
  const fieldByStage = {
    ack: "acknowledgedAt",
    cont: "containmentAt",
    rca: "rcaAt",
    capa: "capaAssignedAt"
  };
  const delayFieldByStage = {
    ack: "ackDelayReason",
    cont: "contDelayReason",
    rca: "rcaDelayReason",
    capa: "capaDelayReason"
  };
  context.doc.set(fieldByStage[stage], now);
  if (stage === "cont" && input.containmentNotes) context.doc.containmentNotes = input.containmentNotes;
  if (overdue && input.delay) {
    context.doc.set(delayFieldByStage[stage], {
      category: input.delay.category,
      explanation: input.delay.explanation,
      recovery: input.delay.recovery,
      recordedAt: now,
      recordedBy: context.actor.id
    });
  }
  context.doc.status = WORKFLOW_STAGE_STATUS[stage];
  pushWorkflowLog(
    context.doc,
    WORKFLOW_STAGE_STATUS[stage],
    context.actor,
    input.notes || (overdue ? `Delay: ${input.delay?.category}` : "")
  );
  await context.doc.save();
  await writeAudit({
    actor: user,
    action: stage === "ack" ? "ACKNOWLEDGE" : "STAGE_COMPLETE",
    entity: "Complaint",
    entityId: complaintId,
    after: { stage, at: now.toISOString(), overdue }
  });
  if (context.doc.owner) {
    await notify({
      recipients: [context.doc.owner],
      message: `${context.doc.number} moved to ${WORKFLOW_STAGE_STATUS[stage]}`,
      category: "workflow",
      entityType: "Complaint",
      entityId: context.doc._id,
      link: `/complaints/${complaintId}`
    });
  }
  const stageTriggerMap = {
    ack: "COMPLAINT_ACKNOWLEDGED",
    cont: "COMPLAINT_CONTAINMENT_COMPLETED",
    rca: "COMPLAINT_RCA_COMPLETED",
    capa: "COMPLAINT_CAPA_ASSIGNED"
  };
  const trigger = stageTriggerMap[stage];
  if (trigger) {
    const stageRecipients = await resolveRecipients({
      complaintId: context.doc._id,
      targetRoles: ["Complaint Owner", "Coordinator", "Department Head"]
    });
    if (stageRecipients.length > 0) {
      await sendTemplatedEmail({
        triggerEvent: trigger,
        recipients: stageRecipients,
        relatedComplaintId: context.doc._id,
        data: {
          complaintNumber: context.doc.number,
          acknowledgedBy: context.actor.name,
          ownerName: context.actor.name,
          stage: WORKFLOW_STAGE_STATUS[stage],
          containmentDueDate: "Scheduled",
          rcaDueDate: "Scheduled",
          capaDueDate: "Scheduled",
          rootCauseCategory: context.doc.rootCauseCategory || "Investigated",
          rootCauseSummary: context.doc.d4Occurrence || "Root cause identified.",
          capaCount: "1",
          assignedTo: context.actor.name,
          actionUrl: `/complaints/${complaintId}`
        }
      });
    }
  }
  return context.doc;
}
async function saveInvestigation(complaintId, patch, user) {
  const context = await loadComplaintContext(complaintId, user);
  assertEditable(context);
  const before = context.doc.toObject();
  context.doc.set(patch);
  await context.doc.save();
  await writeAudit({
    actor: user,
    action: "UPDATE",
    entity: "Complaint",
    entityId: complaintId,
    before: { keys: Object.keys(patch) },
    after: { keys: Object.keys(patch) },
    metadata: { type: before.type }
  });
  if (shouldAutoReopenOnLongTerm(toDomainComplaint(context.doc, 1))) {
    await reopenComplaint(complaintId, "D7 long-term effectiveness marked Not Sustained", user, { system: true });
  }
  return Complaint.findById(complaintId);
}
async function signComplaint(complaintId, role, notes, user) {
  const context = await loadComplaintContext(complaintId, user);
  const issues = validateSignature(role, context.actor, context.domain);
  if (issues.length > 0) throw businessRuleError("This signature cannot be applied", issues);
  const employee = user?.employee ? await Employee.findById(user.employee).lean() : null;
  const record = buildSignatureRecord(
    context.actor,
    { designation: employee?.designation ?? void 0, department: context.actor.department },
    notes
  );
  context.doc.set(`signatures.${role}`, {
    user: new Types4.ObjectId(record.userId),
    name: record.name,
    designation: record.designation,
    department: record.department,
    email: record.email,
    at: new Date(record.at),
    notes: record.notes
  });
  pushWorkflowLog(context.doc, `Signed (${role})`, context.actor, record.notes || `${role} signature applied`);
  await context.doc.save();
  await writeAudit({ actor: user, action: "SIGN", entity: "Complaint", entityId: complaintId, after: { role, by: context.actor.name } });
  const signatureTriggerMap = {
    prepared: "COMPLAINT_PREPARED",
    reviewed: "COMPLAINT_REVIEWED",
    approved: "COMPLAINT_APPROVED"
  };
  const sigTrigger = signatureTriggerMap[role];
  if (sigTrigger) {
    const sigRecipients = await resolveRecipients({
      complaintId: context.doc._id,
      targetRoles: ["Complaint Owner", "Coordinator", "Quality Head", "Department Head"]
    });
    if (sigRecipients.length > 0) {
      await sendTemplatedEmail({
        triggerEvent: sigTrigger,
        recipients: sigRecipients,
        relatedComplaintId: context.doc._id,
        data: {
          complaintNumber: context.doc.number,
          signerName: context.actor.name,
          actionUrl: `/complaints/${complaintId}`
        }
      });
    }
  }
  return context.doc;
}
async function revokeSignature(complaintId, role, reason, user) {
  const context = await loadComplaintContext(complaintId, user);
  const issues = validateRevocation(role, context.actor, context.domain, reason);
  if (issues.length > 0) throw businessRuleError("This signature cannot be revoked", issues);
  rolesInvalidatedBy(role).forEach((invalidated) => context.doc.set(`signatures.${invalidated}`, null));
  pushWorkflowLog(context.doc, `Signature revoked (${role})`, context.actor, reason);
  await context.doc.save();
  await writeAudit({
    actor: user,
    action: "UNSIGN",
    entity: "Complaint",
    entityId: complaintId,
    after: { role, reason, invalidated: rolesInvalidatedBy(role) }
  });
  const revokeRecipients = await resolveRecipients({
    complaintId: context.doc._id,
    targetRoles: ["Complaint Owner", "Coordinator", "Quality Head"]
  });
  if (revokeRecipients.length > 0) {
    await sendTemplatedEmail({
      triggerEvent: "SIGNATURE_REVOKED",
      recipients: revokeRecipients,
      relatedComplaintId: context.doc._id,
      data: {
        complaintNumber: context.doc.number,
        revokedBy: context.actor.name,
        signatureRole: role.toUpperCase(),
        revocationReason: reason,
        actionUrl: `/complaints/${complaintId}`
      }
    });
  }
  return context.doc;
}
async function closeComplaint(complaintId, input, user) {
  const context = await loadComplaintContext(complaintId, user);
  if (!canCloseComplaint(context.actor, context.domain)) throw httpError(403, "You do not have permission to close complaints");
  if (context.doc.closedAt) throw httpError(409, "This complaint is already closed");
  const capas = await loadDomainCapas(complaintId);
  const gaps = validateForClosure(context.domain, capas);
  if (gaps.length > 0) {
    throw businessRuleError(`This complaint cannot be closed yet (${gaps.length} mandatory item(s) missing)`, gapsToIssues(gaps));
  }
  const openCapas = openCapaWarnings(capas);
  if (openCapas.length > 0 && !input.force) {
    throw businessRuleError("Some CAPAs are still open", [
      { field: "capas", section: "CAPA", message: `Still open: ${openCapas.join(", ")}. Resend with force to close anyway.` }
    ]);
  }
  const now = /* @__PURE__ */ new Date();
  context.doc.closedAt = now;
  context.doc.closedBy = new Types4.ObjectId(context.actor.id);
  context.doc.closureRemarks = input.closureRemarks;
  context.doc.d7NoRepeatConfirmed = input.noRepeatConfirmed;
  context.doc.status = "Closed";
  pushWorkflowLog(context.doc, "Closed", context.actor, input.closureRemarks);
  await context.doc.save();
  await writeAudit({
    actor: user,
    action: "CLOSE",
    entity: "Complaint",
    entityId: complaintId,
    after: { closedAt: now.toISOString(), remarks: input.closureRemarks, forcedOverOpenCapas: openCapas }
  });
  await notify({
    recipients: [context.doc.owner].filter(Boolean),
    message: `Complaint ${context.doc.number} was closed by ${context.actor.name}`,
    category: "complaint",
    entityType: "Complaint",
    entityId: context.doc._id,
    link: `/complaints/${complaintId}`
  });
  const closeRecipients = await resolveRecipients({
    complaintId: context.doc._id,
    targetRoles: ["Complaint Owner", "Coordinator", "Quality Head", "Department Head"]
  });
  if (closeRecipients.length > 0) {
    await sendTemplatedEmail({
      triggerEvent: "COMPLAINT_CLOSED",
      recipients: closeRecipients,
      relatedComplaintId: context.doc._id,
      data: {
        complaintNumber: context.doc.number,
        customerName: context.doc.customer || "Internal",
        partName: context.doc.product || "Component",
        closedBy: context.actor.name,
        actionUrl: `/complaints/${complaintId}`
      }
    });
  }
  return context.doc;
}
async function reopenComplaint(complaintId, reason, user, options = {}) {
  const context = await loadComplaintContext(complaintId, user);
  if (!options.system && !canCloseComplaint(context.actor, context.domain) && !hasPermission(context.actor, "8d.approve")) {
    throw httpError(403, "You do not have permission to reopen complaints");
  }
  context.doc.status = "Reopened";
  context.doc.closedAt = null;
  context.doc.reopenedAt = /* @__PURE__ */ new Date();
  context.doc.reopenReason = reason;
  pushWorkflowLog(context.doc, "Reopened", context.actor, reason);
  await context.doc.save();
  await writeAudit({ actor: user, action: "REOPEN", entity: "Complaint", entityId: complaintId, after: { reason } });
  await notify({
    recipients: [context.doc.owner].filter(Boolean),
    message: `Complaint ${context.doc.number} was reopened: ${reason}`,
    category: "complaint",
    priority: "high",
    entityType: "Complaint",
    entityId: context.doc._id,
    link: `/complaints/${complaintId}`
  });
  const reopenRecipients = await resolveRecipients({
    complaintId: context.doc._id,
    targetRoles: ["Complaint Owner", "Coordinator", "Quality Head", "Department Head"]
  });
  if (reopenRecipients.length > 0) {
    await sendTemplatedEmail({
      triggerEvent: "COMPLAINT_REOPENED",
      recipients: reopenRecipients,
      relatedComplaintId: context.doc._id,
      data: {
        complaintNumber: context.doc.number,
        reopenedBy: context.actor.name,
        departmentName: "Quality & Operations",
        reopenReason: reason,
        actionUrl: `/complaints/${complaintId}`
      }
    });
  }
  return context.doc;
}
async function reviewRepeatLinkage(complaintId, input, user) {
  const context = await loadComplaintContext(complaintId, user);
  if (!canEditComplaint(context.actor, context.domain) && !hasPermission(context.actor, "complaint.assign")) {
    throw httpError(403, "You do not have permission to review repeat linkage");
  }
  const before = { isRepeat: context.doc.isRepeat };
  context.doc.isRepeat = input.isRepeat;
  context.doc.repeatReviewedBy = new Types4.ObjectId(context.actor.id);
  context.doc.repeatReviewedAt = /* @__PURE__ */ new Date();
  context.doc.repeatReviewRemarks = input.remarks;
  await context.doc.save();
  await writeAudit({
    actor: user,
    action: "UPDATE",
    entity: "Complaint",
    entityId: complaintId,
    before,
    after: { isRepeat: input.isRepeat }
  });
  return context.doc;
}
async function saveOverallEffectiveness(complaintId, input, user) {
  const context = await loadComplaintContext(complaintId, user);
  if (!hasPermission(context.actor, "capa.verify") && !hasPermission(context.actor, "8d.approve") && !isMasterAdmin(context.actor)) {
    throw httpError(403, "You do not have permission to record overall effectiveness");
  }
  context.doc.overallEffectiveness = {
    result: input.result,
    at: input.at ?? /* @__PURE__ */ new Date(),
    by: new Types4.ObjectId(context.actor.id),
    comments: input.comments
  };
  await context.doc.save();
  await writeAudit({
    actor: user,
    action: "CAPA_EFFECTIVENESS",
    entity: "Complaint",
    entityId: complaintId,
    after: { result: input.result }
  });
  if (input.result === "Not Effective") {
    await reopenComplaint(complaintId, "Overall effectiveness recorded as Not Effective", user, { system: true });
  }
  return Complaint.findById(complaintId);
}
async function deleteComplaint(complaintId, confirmation, user) {
  const context = await loadComplaintContext(complaintId, user);
  if (!isMasterAdmin(context.actor)) throw httpError(403, "Only a Master Admin can delete a complaint");
  if (confirmation !== context.doc.number) {
    throw businessRuleError("Deletion was not confirmed", [
      { field: "confirmation", message: "Type the exact complaint number to confirm deletion" }
    ]);
  }
  const snapshot = context.doc.toObject();
  await Capa.deleteMany({ complaint: context.doc._id });
  await Complaint.deleteOne({ _id: context.doc._id });
  await writeAudit({ actor: user, action: "DELETE", entity: "Complaint", entityId: complaintId, before: { number: snapshot.number } });
  return { deleted: true, number: snapshot.number };
}

// server/services/analytics.service.ts
var COMPLAINT_PROJECTION = "number company type status receivedAt closedAt priority owner responsibleDept customer product category rootCauseCategory d4Occurrence isRepeat repeatOf acknowledgedAt containmentAt rcaAt capaAssignedAt ackDelayReason contDelayReason rcaDelayReason capaDelayReason";
async function resolveScope(user, companyId) {
  const actor = await requireActor(user);
  if (!hasPermission(actor, "view.all") && !hasPermission(actor, "view.company")) {
    throw httpError(403, "You do not have permission to view analytics");
  }
  const filter = {};
  if (!hasPermission(actor, "view.all")) {
    filter.company = { $in: actor.companyIds.map((id2) => new Types5.ObjectId(id2)) };
  }
  if (companyId) {
    if (!canSeeCompany(actor, companyId)) throw httpError(403, "You do not have access to this company");
    filter.company = new Types5.ObjectId(companyId);
  }
  return { filter, companyId: companyId ?? null };
}
async function priorityMultipliers() {
  const priorities = await Priority.find().select("name tatMultiplier color order").lean();
  const byId = /* @__PURE__ */ new Map();
  priorities.forEach(
    (priority) => byId.set(String(priority._id), { name: priority.name, tatMultiplier: priority.tatMultiplier ?? 1, color: priority.color })
  );
  return byId;
}
function toDomain(row, multiplier) {
  return {
    id: String(row._id),
    number: row.number,
    companyId: String(row.company),
    type: row.type,
    status: row.status,
    receivedAt: row.receivedAt.toISOString(),
    priorityMultiplier: multiplier,
    acknowledgedAt: row.acknowledgedAt ? row.acknowledgedAt.toISOString() : null,
    containmentAt: row.containmentAt ? row.containmentAt.toISOString() : null,
    rcaAt: row.rcaAt ? row.rcaAt.toISOString() : null,
    capaAssignedAt: row.capaAssignedAt ? row.capaAssignedAt.toISOString() : null,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null
  };
}
function percent(part, total) {
  return total === 0 ? 0 : Math.round(part / total * 1e3) / 10;
}
function monthKey(date2) {
  return `${date2.getFullYear()}-${String(date2.getMonth() + 1).padStart(2, "0")}`;
}
function lastMonths(count) {
  const keys = [];
  const cursor = /* @__PURE__ */ new Date();
  cursor.setDate(1);
  for (let index = count - 1; index >= 0; index -= 1) {
    const date2 = new Date(cursor.getFullYear(), cursor.getMonth() - index, 1);
    keys.push(monthKey(date2));
  }
  return keys;
}
function countBy(items, key) {
  const map = /* @__PURE__ */ new Map();
  items.forEach((item) => {
    const value = key(item);
    if (!value) return;
    map.set(value, (map.get(value) ?? 0) + 1);
  });
  return [...map.entries()].map(([name2, value]) => ({ name: name2, value })).sort((a, b) => b.value - a.value);
}
async function loadComplaints(scope, extra = {}) {
  return Complaint.find({ ...scope.filter, ...extra }).select(COMPLAINT_PROJECTION).lean();
}
function stageStates(rows, multipliers, config, now) {
  return rows.map((row) => {
    const multiplier = multipliers.get(String(row.priority))?.tatMultiplier ?? 1;
    const plan = buildTatPlan(toDomain(row, multiplier), config, now);
    return { row, plan };
  });
}
async function dashboardAnalytics(user, companyId) {
  const scope = await resolveScope(user, companyId);
  const config = await resolveTatConfig(companyId ?? null);
  const [rows, multipliers] = await Promise.all([loadComplaints(scope), priorityMultipliers()]);
  const now = /* @__PURE__ */ new Date();
  const states = stageStates(rows, multipliers, config, now);
  const total = rows.length;
  const closed = rows.filter((row) => row.status === "Closed").length;
  const open = total - closed;
  const external = rows.filter((row) => row.type === "External").length;
  const repeat = rows.filter((row) => row.isRepeat).length;
  const overdue = states.filter(({ row, plan }) => row.status !== "Closed" && plan.some((stage) => stage.overdue)).length;
  let stageTotal = 0;
  let stageOnTime = 0;
  states.forEach(
    ({ plan }) => plan.forEach((stage) => {
      if (!stage.completedAt) return;
      stageTotal += 1;
      if (stage.health === "on-time") stageOnTime += 1;
    })
  );
  const closureDurations = rows.filter((row) => row.closedAt).map((row) => (new Date(row.closedAt).getTime() - new Date(row.receivedAt).getTime()) / 864e5);
  const averageClosureDays = closureDurations.length === 0 ? 0 : Math.round(closureDurations.reduce((sum, days) => sum + days, 0) / closureDurations.length * 10) / 10;
  const capaRows = await Capa.find(scope.filter).select("status dueDate effectiveness completedAt owner").lean();
  const capaClosed = capaRows.filter((capa) => capa.status === "Closed" || capa.status === "Completed").length;
  const capaOverdue = capaRows.filter(
    (capa) => capa.status !== "Closed" && capa.status !== "Completed" && capa.dueDate && new Date(capa.dueDate) < now
  ).length;
  const effectivenessFailures = capaRows.filter((capa) => capa.effectiveness === "Not Effective").length;
  const months = lastMonths(12);
  const trend = months.map((key) => ({
    month: key,
    received: rows.filter((row) => monthKey(new Date(row.receivedAt)) === key).length,
    closed: rows.filter((row) => row.closedAt && monthKey(new Date(row.closedAt)) === key).length
  }));
  const agingBuckets = [
    { name: "0-7 days", min: 0, max: 7 },
    { name: "8-15 days", min: 8, max: 15 },
    { name: "16-30 days", min: 16, max: 30 },
    { name: "31-60 days", min: 31, max: 60 },
    { name: "60+ days", min: 61, max: Number.MAX_SAFE_INTEGER }
  ];
  const openRows = rows.filter((row) => row.status !== "Closed");
  const aging = agingBuckets.map((bucket) => ({
    name: bucket.name,
    value: openRows.filter((row) => {
      const days = Math.floor((now.getTime() - new Date(row.receivedAt).getTime()) / 864e5);
      return days >= bucket.min && days <= bucket.max;
    }).length
  }));
  const priorityNames = new Map([...multipliers.entries()].map(([id2, value]) => [id2, value]));
  const recent = [...rows].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()).slice(0, 8).map((row) => ({
    id: String(row._id),
    number: row.number,
    type: row.type,
    status: row.status,
    customer: row.customer ?? "",
    category: row.category ?? "",
    receivedAt: row.receivedAt,
    isRepeat: Boolean(row.isRepeat)
  }));
  return {
    kpis: {
      total,
      open,
      closed,
      overdue,
      external,
      internal: total - external,
      repeat,
      repeatPercent: percent(repeat, total),
      closurePercent: percent(closed, total),
      tatCompliancePercent: percent(stageOnTime, stageTotal),
      averageClosureDays,
      capaTotal: capaRows.length,
      capaClosed,
      capaClosurePercent: percent(capaClosed, capaRows.length),
      capaOverdue,
      capaOverduePercent: percent(capaOverdue, capaRows.length),
      effectivenessFailures
    },
    statusDistribution: countBy(rows, (row) => row.status),
    priorityDistribution: countBy(rows, (row) => priorityNames.get(String(row.priority))?.name ?? "Unassigned"),
    typeDistribution: [
      { name: "External", value: external },
      { name: "Internal", value: total - external }
    ],
    trend,
    aging,
    rootCauseCategories: countBy(rows, (row) => row.rootCauseCategory),
    categories: countBy(rows, (row) => row.category).slice(0, 10),
    recent
  };
}
async function tatAnalytics(user, companyId) {
  const scope = await resolveScope(user, companyId);
  const config = await resolveTatConfig(companyId ?? null);
  const [rows, multipliers] = await Promise.all([loadComplaints(scope), priorityMultipliers()]);
  const now = /* @__PURE__ */ new Date();
  const states = stageStates(rows, multipliers, config, now);
  const stages = WORKFLOW_STAGES.map((stage) => {
    const entries = states.map(({ row, plan }) => ({ row, entry: plan.find((item) => item.stage === stage) }));
    const completed = entries.filter(({ entry }) => entry.completedAt);
    const onTime = completed.filter(({ entry }) => entry.health === "on-time").length;
    const late = completed.length - onTime;
    const overdueOpen = entries.filter(({ row, entry }) => !entry.completedAt && entry.overdue && row.status !== "Closed").length;
    const dueSoon = entries.filter(({ entry }) => !entry.completedAt && entry.health === "due-soon").length;
    return {
      stage,
      label: WORKFLOW_STAGE_LABELS[stage],
      total: entries.length,
      completed: completed.length,
      onTime,
      late,
      overdueOpen,
      dueSoon,
      compliancePercent: percent(onTime, completed.length)
    };
  });
  const months = lastMonths(12);
  const trend = months.map((key) => {
    const monthly = states.filter(({ row }) => monthKey(new Date(row.receivedAt)) === key);
    let completed = 0;
    let onTime = 0;
    monthly.forEach(
      ({ plan }) => plan.forEach((entry) => {
        if (!entry.completedAt) return;
        completed += 1;
        if (entry.health === "on-time") onTime += 1;
      })
    );
    return { month: key, completed, onTime, compliancePercent: percent(onTime, completed) };
  });
  const delayField = {
    ack: "ackDelayReason",
    cont: "contDelayReason",
    rca: "rcaDelayReason",
    capa: "capaDelayReason"
  };
  const paretoMap = /* @__PURE__ */ new Map();
  const drilldown = [];
  rows.forEach((row) => {
    WORKFLOW_STAGES.forEach((stage) => {
      const delay2 = row[delayField[stage]];
      if (!delay2?.category) return;
      paretoMap.set(delay2.category, (paretoMap.get(delay2.category) ?? 0) + 1);
      drilldown.push({
        stage,
        stageLabel: WORKFLOW_STAGE_LABELS[stage],
        complaintId: String(row._id),
        number: row.number,
        customer: row.customer ?? "",
        category: delay2.category,
        explanation: delay2.explanation ?? ""
      });
    });
  });
  const paretoTotal = [...paretoMap.values()].reduce((sum, value) => sum + value, 0);
  let running = 0;
  const pareto = [...paretoMap.entries()].sort((a, b) => b[1] - a[1]).map(([name2, value]) => {
    running += value;
    return { name: name2, value, cumulativePercent: percent(running, paretoTotal) };
  });
  return { stages, trend, pareto, drilldown, config };
}
async function capaAnalytics(user, companyId) {
  const scope = await resolveScope(user, companyId);
  const now = /* @__PURE__ */ new Date();
  const capas = await Capa.find(scope.filter).select("number status dueDate completedAt effectiveness owner type evidenceReview createdAt").populate("owner", "name").lean();
  const closed = capas.filter((capa) => capa.status === "Closed" || capa.status === "Completed");
  const overdue = capas.filter((capa) => capa.status !== "Closed" && capa.status !== "Completed" && capa.dueDate && new Date(capa.dueDate) < now);
  const ownerMap = /* @__PURE__ */ new Map();
  capas.forEach((capa) => {
    const owner = capa.owner;
    const key = owner?.name || "Unassigned";
    const entry = ownerMap.get(key) ?? { owner: key, assigned: 0, open: 0, closed: 0, overdue: 0, effective: 0, notEffective: 0 };
    entry.assigned += 1;
    const isClosed = capa.status === "Closed" || capa.status === "Completed";
    if (isClosed) entry.closed += 1;
    else entry.open += 1;
    if (!isClosed && capa.dueDate && new Date(capa.dueDate) < now) entry.overdue += 1;
    if (capa.effectiveness === "Effective") entry.effective += 1;
    if (capa.effectiveness === "Not Effective") entry.notEffective += 1;
    ownerMap.set(key, entry);
  });
  const personWise = [...ownerMap.values()].map((entry) => ({ ...entry, closurePercent: percent(entry.closed, entry.assigned) })).sort((a, b) => b.assigned - a.assigned);
  const months = lastMonths(12);
  const trend = months.map((key) => ({
    month: key,
    assigned: capas.filter((capa) => capa.createdAt && monthKey(new Date(capa.createdAt)) === key).length,
    closed: capas.filter((capa) => capa.completedAt && monthKey(new Date(capa.completedAt)) === key).length
  }));
  return {
    kpis: {
      total: capas.length,
      open: capas.length - closed.length,
      closed: closed.length,
      overdue: overdue.length,
      closurePercent: percent(closed.length, capas.length),
      effective: capas.filter((capa) => capa.effectiveness === "Effective").length,
      notEffective: capas.filter((capa) => capa.effectiveness === "Not Effective").length,
      pendingVerification: capas.filter((capa) => !capa.effectiveness && (capa.status === "Completed" || capa.status === "Under Verification")).length
    },
    statusDistribution: countBy(capas, (capa) => capa.status),
    typeDistribution: countBy(capas, (capa) => capa.type),
    effectivenessDistribution: countBy(capas, (capa) => capa.effectiveness ?? "Pending"),
    evidenceReviewDistribution: countBy(capas, (capa) => capa.evidenceReview?.status ?? "Pending"),
    personWise,
    trend
  };
}
async function repeatAnalytics(user, companyId) {
  const scope = await resolveScope(user, companyId);
  const config = await resolveTatConfig(companyId ?? null);
  const rows = await Complaint.find({ ...scope.filter, isRepeat: true }).select(`${COMPLAINT_PROJECTION} repeatBasis`).populate("company", "name code").populate("responsibleDept", "name").populate("owner", "name").sort({ receivedAt: -1 }).lean();
  const originalIds = rows.flatMap((row) => (row.repeatOf ?? []).map((link) => link.complaint));
  const originals = await Complaint.find({ _id: { $in: originalIds } }).select("number receivedAt customer product category d4Occurrence status").lean();
  const originalById = new Map(originals.map((entry) => [String(entry._id), entry]));
  const items = rows.map((row) => {
    const links = (row.repeatOf ?? []).map((link) => {
      const source = originalById.get(String(link.complaint));
      const intervalDays = source ? Math.round((new Date(row.receivedAt).getTime() - new Date(source.receivedAt).getTime()) / 864e5) : null;
      return {
        id: String(link.complaint),
        number: link.number || source?.number || "",
        receivedAt: source?.receivedAt ?? null,
        status: source?.status ?? "",
        basis: link.basis ?? [],
        intervalDays
      };
    });
    const company = row.company;
    const dept = row.responsibleDept;
    const owner = row.owner;
    return {
      id: String(row._id),
      number: row.number,
      companyName: company?.name ?? "",
      companyCode: company?.code ?? "",
      type: row.type,
      status: row.status,
      receivedAt: row.receivedAt,
      customer: row.customer ?? "",
      product: row.product ?? "",
      category: row.category ?? "",
      rootCause: row.d4Occurrence ?? "",
      rootCauseCategory: row.rootCauseCategory ?? "",
      responsibleDept: dept?.name ?? "",
      owner: owner?.name ?? "",
      basis: row.repeatBasis ?? "",
      originals: links,
      shortestIntervalDays: links.reduce(
        (min, link) => link.intervalDays === null ? min : min === null ? link.intervalDays : Math.min(min, link.intervalDays),
        null
      )
    };
  });
  return {
    windowDays: config.repeatWindowDays,
    total: items.length,
    byCustomer: countBy(items, (item) => item.customer || void 0).slice(0, 10),
    byCategory: countBy(items, (item) => item.category || void 0).slice(0, 10),
    byProduct: countBy(items, (item) => item.product || void 0).slice(0, 10),
    items
  };
}
async function assignableUsers(user, companyId) {
  const scope = await resolveScope(user, companyId);
  const filter = { active: true };
  const companyFilter = scope.filter.company;
  if (companyFilter) filter.companyIds = companyFilter;
  const users = await User.find(filter).select("name username email department").populate("role", "name").sort({ name: 1 }).limit(500).lean();
  return users.map((entry) => ({
    id: String(entry._id),
    name: entry.name,
    username: entry.username,
    email: entry.email ?? "",
    role: entry.role?.name ?? ""
  }));
}

// server/services/report.service.ts
import { Types as Types6 } from "mongoose";
function date(value) {
  if (!value) return "";
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}
function dateTime(value) {
  if (!value) return "";
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().replace("T", " ").slice(0, 16);
}
function name(value) {
  return value?.name ?? "";
}
function daysBetween(from, to) {
  if (!from) return "";
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();
  return Math.max(0, Math.round((end - start) / 864e5));
}
async function complaintQuery(context, extra = {}) {
  const scope = await resolveScope(context.user, context.companyId);
  const filter = { ...scope.filter, ...extra };
  if (context.from || context.to) {
    filter.receivedAt = { ...context.from ? { $gte: context.from } : {}, ...context.to ? { $lte: context.to } : {} };
  }
  return Complaint.find(filter).populate("company", "name code").populate("priority", "name").populate("owner", "name").populate("responsibleDept", "name").populate("internalDept", "name").populate("againstDept", "name").sort({ receivedAt: -1 }).lean();
}
async function capaQuery(context, extra = {}) {
  const scope = await resolveScope(context.user, context.companyId);
  const filter = { ...scope.filter, ...extra };
  if (context.from || context.to) {
    filter.dueDate = { ...context.from ? { $gte: context.from } : {}, ...context.to ? { $lte: context.to } : {} };
  }
  return Capa.find(filter).populate("company", "name code").populate("complaint", "number type customer status").populate("owner", "name").populate("department", "name").populate("priority", "name").sort({ dueDate: 1 }).lean();
}
function complaintBaseRow(complaint) {
  return {
    "Complaint No": String(complaint.number ?? ""),
    Company: name(complaint.company),
    Type: String(complaint.type ?? ""),
    Received: date(complaint.receivedAt),
    Priority: name(complaint.priority),
    Category: String(complaint.category ?? ""),
    "Sub Category": String(complaint.subCategory ?? ""),
    Customer: String(complaint.customer ?? ""),
    Product: String(complaint.product ?? ""),
    Project: String(complaint.project ?? ""),
    "Customer PO": String(complaint.customerPO ?? ""),
    Department: name(complaint.responsibleDept),
    Owner: name(complaint.owner),
    Status: String(complaint.status ?? ""),
    Repeat: complaint.isRepeat ? "Yes" : "No"
  };
}
var REPORT_DEFINITIONS = [
  {
    id: "complaint-register",
    title: "Complaint Register",
    description: "Every complaint in scope with registration, workflow and closure dates. The consolidated master record.",
    group: "Complaints",
    permission: "report.all",
    build: async (context) => {
      const rows = await complaintQuery(context);
      return rows.map((complaint) => ({
        ...complaintBaseRow(complaint),
        Acknowledged: date(complaint.acknowledgedAt),
        Contained: date(complaint.containmentAt),
        "RCA Done": date(complaint.rcaAt),
        "CAPA Assigned": date(complaint.capaAssignedAt),
        Closed: date(complaint.closedAt),
        "Days Open": daysBetween(complaint.receivedAt, complaint.closedAt),
        "Root Cause Category": String(complaint.rootCauseCategory ?? "")
      }));
    }
  },
  {
    id: "open-complaints",
    title: "Open Complaints",
    description: "Complaints that have not been closed, with their current stage and age in days. Use it for the daily review.",
    group: "Complaints",
    permission: "report.all",
    build: async (context) => {
      const rows = await complaintQuery(context, { status: { $ne: "Closed" } });
      return rows.map((complaint) => ({
        ...complaintBaseRow(complaint),
        "Age (days)": daysBetween(complaint.receivedAt, null),
        "Last Stage": complaint.capaAssignedAt ? WORKFLOW_STAGE_LABELS.capa : complaint.rcaAt ? WORKFLOW_STAGE_LABELS.rca : complaint.containmentAt ? WORKFLOW_STAGE_LABELS.cont : complaint.acknowledgedAt ? WORKFLOW_STAGE_LABELS.ack : "Registered"
      }));
    }
  },
  {
    id: "overdue-complaints",
    title: "Overdue Complaints",
    description: "Open complaints that have breached a TAT target at any stage, with the recorded delay reasons.",
    group: "TAT",
    permission: "report.all",
    build: async (context) => {
      const analytics = await tatAnalytics(context.user, context.companyId);
      const overdueIds = new Set(analytics.drilldown.map((entry) => entry.complaintId));
      const rows = await complaintQuery(context, { status: { $ne: "Closed" } });
      return rows.filter((complaint) => overdueIds.has(String(complaint._id))).map((complaint) => ({
        ...complaintBaseRow(complaint),
        "Delay Reasons": analytics.drilldown.filter((entry) => entry.complaintId === String(complaint._id)).map((entry) => `${entry.stageLabel}: ${entry.category}`).join("; "),
        "Age (days)": daysBetween(complaint.receivedAt, null)
      }));
    }
  },
  {
    id: "tat-compliance",
    title: "TAT Compliance Report",
    description: "Stage-wise turnaround performance: completed, on time, late, still overdue and the compliance percentage.",
    group: "TAT",
    permission: "report.all",
    build: async (context) => {
      const analytics = await tatAnalytics(context.user, context.companyId);
      return analytics.stages.map((stage) => ({
        Stage: stage.label,
        Complaints: stage.total,
        Completed: stage.completed,
        "On Time": stage.onTime,
        Late: stage.late,
        "Overdue Open": stage.overdueOpen,
        "Due Soon": stage.dueSoon,
        "Compliance %": stage.compliancePercent
      }));
    }
  },
  {
    id: "delay-pareto",
    title: "Delay Pareto Analysis",
    description: "Recorded delay reasons ranked by frequency with a cumulative percentage, so the vital few are obvious.",
    group: "TAT",
    permission: "report.all",
    build: async (context) => {
      const analytics = await tatAnalytics(context.user, context.companyId);
      return analytics.pareto.map((entry) => ({
        "Delay Reason": entry.name,
        Occurrences: entry.value,
        "Cumulative %": entry.cumulativePercent
      }));
    }
  },
  {
    id: "capa-register",
    title: "CAPA Register",
    description: "All CAPA items with owner, dates, status, evidence review and effectiveness outcome.",
    group: "CAPA",
    permission: "report.all",
    build: async (context) => {
      const rows = await capaQuery(context);
      return rows.map((capa) => ({
        "CAPA No": String(capa.number ?? ""),
        "Complaint No": capa.complaint?.number ?? "",
        Company: name(capa.company),
        Type: String(capa.type ?? ""),
        Action: String(capa.action ?? ""),
        Owner: name(capa.owner),
        Department: name(capa.department),
        Assigned: date(capa.assignedAt),
        Due: date(capa.dueDate),
        Completed: date(capa.completedAt),
        Status: String(capa.status ?? ""),
        "Evidence Review": capa.evidenceReview?.status ?? "Pending",
        Effectiveness: String(capa.effectiveness ?? "Pending"),
        "Verification Method": String(capa.verificationMethod ?? ""),
        "Days Late": capa.dueDate && capa.completedAt ? daysBetween(capa.dueDate, capa.completedAt) : ""
      }));
    }
  },
  {
    id: "capa-master-list",
    title: "CAPA Master List",
    description: "The advanced CAPA master view including evidence file counts and effectiveness verification details.",
    group: "CAPA",
    permission: "report.all",
    build: async (context) => {
      const rows = await capaQuery(context);
      return rows.map((capa) => ({
        "CAPA No": String(capa.number ?? ""),
        "Complaint No": capa.complaint?.number ?? "",
        "Complaint Type": capa.complaint?.type ?? "",
        Customer: capa.complaint?.customer ?? "",
        Company: name(capa.company),
        Type: String(capa.type ?? ""),
        Action: String(capa.action ?? ""),
        Owner: name(capa.owner),
        Department: name(capa.department),
        Due: date(capa.dueDate),
        Status: String(capa.status ?? ""),
        "Evidence Files": (capa.evidenceFiles ?? []).length,
        "Evidence Review": capa.evidenceReview?.status ?? "Pending",
        "Review Remarks": capa.evidenceReview?.remarks ?? "",
        Effectiveness: String(capa.effectiveness ?? "Pending"),
        "Verified On": date(capa.effectivenessVerifiedAt)
      }));
    }
  },
  {
    id: "person-wise-capa",
    title: "Person-wise CAPA Performance",
    description: "CAPA load and completion per owner, with overdue counts and closure percentage.",
    group: "CAPA",
    permission: "report.all",
    build: async (context) => {
      const analytics = await capaAnalytics(context.user, context.companyId);
      return analytics.personWise.map((entry) => ({
        Owner: entry.owner,
        Assigned: entry.assigned,
        Open: entry.open,
        "Closed / Completed": entry.closed,
        Overdue: entry.overdue,
        Effective: entry.effective,
        "Not Effective": entry.notEffective,
        "Closure %": entry.closurePercent
      }));
    }
  },
  {
    id: "customer-summary",
    title: "Customer Complaint Summary",
    description: "Complaint volume per customer with open, closed and repeat counts to expose problem accounts.",
    group: "Management",
    permission: "report.all",
    build: async (context) => {
      const rows = await complaintQuery(context, { type: "External" });
      const map = /* @__PURE__ */ new Map();
      rows.forEach((complaint) => {
        const key = complaint.customer || "Not specified";
        const entry = map.get(key) ?? { total: 0, open: 0, closed: 0, repeat: 0 };
        entry.total += 1;
        if (complaint.status === "Closed") entry.closed += 1;
        else entry.open += 1;
        if (complaint.isRepeat) entry.repeat += 1;
        map.set(key, entry);
      });
      return [...map.entries()].sort((a, b) => b[1].total - a[1].total).map(([customer, entry]) => ({
        Customer: customer,
        Complaints: entry.total,
        Open: entry.open,
        Closed: entry.closed,
        Repeat: entry.repeat,
        "Repeat %": entry.total === 0 ? 0 : Math.round(entry.repeat / entry.total * 1e3) / 10
      }));
    }
  },
  {
    id: "repeat-complaints",
    title: "Repeat Complaints Report",
    description: "Complaints auto-flagged as repeats inside the configured window, with the prior complaints they repeat.",
    group: "Quality",
    permission: "report.all",
    build: async (context) => {
      const analytics = await repeatAnalytics(context.user, context.companyId);
      return analytics.items.map((item) => ({
        "Complaint No": item.number,
        Company: item.companyCode,
        Received: date(item.receivedAt),
        Customer: item.customer,
        Product: item.product,
        Category: item.category,
        "Repeats Of": item.originals.map((entry) => entry.number).join(", "),
        "Shortest Interval (days)": item.shortestIntervalDays ?? "",
        "Matching Basis": item.basis,
        "Root Cause": item.rootCause,
        Department: item.responsibleDept,
        Owner: item.owner,
        Status: item.status
      }));
    }
  },
  {
    id: "root-cause-register",
    title: "Root Cause Analysis Register",
    description: "Occurrence, escape and systemic root causes per complaint with the QC tools that were used.",
    group: "Quality",
    permission: "report.all",
    build: async (context) => {
      const rows = await complaintQuery(context);
      return rows.filter((complaint) => complaint.d4Occurrence || complaint.rootCauseCategory).map((complaint) => ({
        "Complaint No": String(complaint.number ?? ""),
        Type: String(complaint.type ?? ""),
        Received: date(complaint.receivedAt),
        Customer: String(complaint.customer ?? ""),
        Category: String(complaint.category ?? ""),
        "Root Cause Category": String(complaint.rootCauseCategory ?? ""),
        "Occurrence Root Cause": String(complaint.d4Occurrence ?? ""),
        "Escape Root Cause": String(complaint.d4Escape ?? ""),
        "Systemic Root Cause": String(complaint.d4Systemic ?? ""),
        "QC Tools": (complaint.d4QcTools ?? []).join(", "),
        Status: String(complaint.status ?? "")
      }));
    }
  },
  {
    id: "root-cause-category",
    title: "Root Cause Category Analysis",
    description: "Complaint counts per 6M plus Management and Supplier category, the systemic view for management review.",
    group: "Quality",
    permission: "report.all",
    build: async (context) => {
      const analytics = await dashboardAnalytics(context.user, context.companyId);
      const total = analytics.rootCauseCategories.reduce((sum, entry) => sum + entry.value, 0);
      return analytics.rootCauseCategories.map((entry) => ({
        "Root Cause Category": entry.name,
        Complaints: entry.value,
        "Share %": total === 0 ? 0 : Math.round(entry.value / total * 1e3) / 10
      }));
    }
  },
  {
    id: "long-term-effectiveness",
    title: "Long-Term Effectiveness",
    description: "D7 short-term and long-term effectiveness review status for closed external complaints.",
    group: "Quality",
    permission: "report.all",
    build: async (context) => {
      const rows = await complaintQuery(context, { type: "External" });
      return rows.map((complaint) => ({
        "Complaint No": String(complaint.number ?? ""),
        Company: name(complaint.company),
        Customer: String(complaint.customer ?? ""),
        Closed: date(complaint.closedAt),
        "ST Date": String(complaint.d7ShortTermDate ?? ""),
        "ST Repeat Observed": complaint.d7RepeatObserved ? "Yes" : "No",
        "No Repeat Confirmed": complaint.d7NoRepeatConfirmed ? "Yes" : "No",
        "LT Date": String(complaint.d7LongTermDate ?? ""),
        "LT Repeat Observed": complaint.d7LongTermRepeatObserved ? "Yes" : "No",
        "LT Result": String(complaint.d7LongTermResult || "Pending"),
        Status: String(complaint.status ?? "")
      }));
    }
  },
  {
    id: "management-review",
    title: "Monthly Management Review",
    description: "Twelve-month summary of complaints received and closed with the headline quality indicators.",
    group: "Management",
    permission: "report.all",
    build: async (context) => {
      const analytics = await dashboardAnalytics(context.user, context.companyId);
      return analytics.trend.map((entry) => ({
        Month: entry.month,
        Received: entry.received,
        Closed: entry.closed,
        "Net Open Change": entry.received - entry.closed
      }));
    }
  },
  {
    id: "employee-master",
    title: "Employee Master",
    description: "Employee directory with department, designation, manager and HOD contacts used by 8D and escalation.",
    group: "Master",
    permission: "report.all",
    build: async (context) => {
      const scope = await resolveScope(context.user, context.companyId);
      const filter = {};
      if (scope.filter.company) filter.company = scope.filter.company;
      const employees = await Employee.find(filter).populate("company", "name code").populate("department", "name").sort({ name: 1 }).lean();
      return employees.map((employee) => ({
        "Employee Code": String(employee.employeeCode ?? ""),
        Name: String(employee.name ?? ""),
        Email: String(employee.email ?? ""),
        Designation: String(employee.designation ?? ""),
        Department: name(employee.department),
        Company: name(employee.company),
        "Manager Name": String(employee.managerName ?? ""),
        "Manager Email": String(employee.managerEmail ?? ""),
        "HOD Name": String(employee.hodName ?? ""),
        "HOD Email": String(employee.hodEmail ?? ""),
        Active: employee.active ? "Yes" : "No"
      }));
    }
  }
];
function reportCatalog() {
  return REPORT_DEFINITIONS.map(({ id: id2, title, description, group, permission }) => ({ id: id2, title, description, group, permission }));
}
async function buildReport(reportId, context) {
  const definition = REPORT_DEFINITIONS.find((entry) => entry.id === reportId);
  if (!definition) throw httpError(404, "Unknown report");
  return definition.build(context);
}
async function eightDReportData(complaintId, user) {
  if (!Types6.ObjectId.isValid(complaintId)) throw httpError(400, "Invalid complaint id");
  const scope = await resolveScope(user);
  const complaint = await Complaint.findOne({ _id: complaintId, ...scope.filter }).populate("company", "name code documentNumber revision effectiveDate logo").populate("priority", "name").populate("owner", "name email").populate("responsibleDept", "name").populate("internalDept", "name").populate("againstDept", "name").lean();
  if (!complaint) throw httpError(404, "Complaint not found");
  const capas = await Capa.find({ complaint: complaintId }).populate("owner", "name").populate("department", "name").sort({ sequence: 1 }).lean();
  return { complaint, capas };
}
function eightDExcelSheets(data) {
  const { complaint, capas } = data;
  const summary = [
    { Field: "Complaint No", Value: String(complaint.number ?? "") },
    { Field: "Company", Value: name(complaint.company) },
    { Field: "Type", Value: String(complaint.type ?? "") },
    { Field: "Received", Value: dateTime(complaint.receivedAt) },
    { Field: "Priority", Value: name(complaint.priority) },
    { Field: "Customer", Value: String(complaint.customer ?? "") },
    { Field: "Product", Value: String(complaint.product ?? "") },
    { Field: "Category", Value: String(complaint.category ?? "") },
    { Field: "Owner", Value: name(complaint.owner) },
    { Field: "Department", Value: name(complaint.responsibleDept) },
    { Field: "Status", Value: String(complaint.status ?? "") },
    { Field: "Description", Value: String(complaint.description ?? "") },
    { Field: "D0 Emergency Response", Value: String(complaint.d0 ?? "") },
    { Field: "D4 Occurrence Root Cause", Value: String(complaint.d4Occurrence ?? "") },
    { Field: "D4 Escape Root Cause", Value: String(complaint.d4Escape ?? "") },
    { Field: "D4 Systemic Root Cause", Value: String(complaint.d4Systemic ?? "") },
    { Field: "Root Cause Category", Value: String(complaint.rootCauseCategory ?? "") },
    { Field: "Closed", Value: dateTime(complaint.closedAt) },
    { Field: "Closure Remarks", Value: String(complaint.closureRemarks ?? "") }
  ];
  const team = (complaint.d1Team ?? []).map((member) => ({
    Name: String(member.name ?? ""),
    Department: String(member.dept ?? ""),
    Designation: String(member.designation ?? ""),
    Responsibility: String(member.role ?? "")
  }));
  const actions = [
    ...(complaint.d3Actions ?? []).map((row) => ({ Section: "D3 Containment", ...actionRow(row) })),
    ...(complaint.d5Occurrence ?? []).map((row) => ({ Section: "D5 Occurrence", ...actionRow(row) })),
    ...(complaint.d5Escape ?? []).map((row) => ({ Section: "D5 Escape", ...actionRow(row) })),
    ...(complaint.d5Systemic ?? []).map((row) => ({ Section: "D5 Systemic", ...actionRow(row) })),
    ...(complaint.d6Verify ?? []).map((row) => ({ Section: "D6 Verification", ...actionRow(row) }))
  ];
  const fiveWhy = ["occurrence", "escape", "systemic", "singleChain"].flatMap(
    (chain) => (complaint.fiveWhy?.[chain] ?? []).filter(Boolean).map((text2, index) => ({ Chain: chain, Step: `Why ${index + 1}`, Statement: text2 }))
  );
  const documents = (complaint.d6DocsList ?? []).map((entry) => ({
    Document: String(entry.docType ?? ""),
    Status: String(entry.status ?? ""),
    Revision: String(entry.revision ?? ""),
    "Revision Date": String(entry.revDate ?? ""),
    Approver: String(entry.approver ?? ""),
    "NA Justification": String(entry.naJustification ?? "")
  }));
  const capaRows = capas.map((capa) => ({
    "CAPA No": String(capa.number ?? ""),
    Type: String(capa.type ?? ""),
    Action: String(capa.action ?? ""),
    Owner: name(capa.owner),
    Department: name(capa.department),
    Due: date(capa.dueDate),
    Completed: date(capa.completedAt),
    Status: String(capa.status ?? ""),
    "Evidence Review": capa.evidenceReview?.status ?? "Pending",
    Effectiveness: String(capa.effectiveness ?? "Pending")
  }));
  const signatures = ["prepared", "reviewed", "approved"].map((role) => {
    const signature2 = complaint.signatures?.[role];
    return {
      Role: role === "prepared" ? "Prepared By" : role === "reviewed" ? "Reviewed By" : "Approved By",
      Name: signature2?.name ?? "Not signed",
      Designation: signature2?.designation ?? "",
      Department: signature2?.department ?? "",
      "Signed At": dateTime(signature2?.at)
    };
  });
  return { summary, team, actions, fiveWhy, documents, capaRows, signatures };
}
function actionRow(row) {
  return {
    Action: String(row.action ?? ""),
    Responsibility: String(row.resp ?? ""),
    Target: String(row.target ?? ""),
    Status: String(row.status ?? "")
  };
}

// server/utils/async-handler.ts
function asyncHandler(fn) {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}

// server/routes/analytics.routes.ts
var scopeQuery = z3.object({ company: objectIdSchema.optional() });
var reportQuery = scopeQuery.extend({ from: z3.coerce.date().optional(), to: z3.coerce.date().optional() });
var analyticsRouter = Router();
analyticsRouter.use(requireUser);
analyticsRouter.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const query = scopeQuery.parse(req.query);
    await connectDB();
    return ok(res, await dashboardAnalytics(req.user, query.company));
  })
);
analyticsRouter.get(
  "/tat",
  asyncHandler(async (req, res) => {
    const query = scopeQuery.parse(req.query);
    await connectDB();
    return ok(res, await tatAnalytics(req.user, query.company));
  })
);
analyticsRouter.get(
  "/capa",
  asyncHandler(async (req, res) => {
    const query = scopeQuery.parse(req.query);
    await connectDB();
    return ok(res, await capaAnalytics(req.user, query.company));
  })
);
analyticsRouter.get(
  "/repeat",
  asyncHandler(async (req, res) => {
    const query = scopeQuery.parse(req.query);
    await connectDB();
    return ok(res, await repeatAnalytics(req.user, query.company));
  })
);
analyticsRouter.get(
  "/assignable-users",
  asyncHandler(async (req, res) => {
    const query = scopeQuery.parse(req.query);
    await connectDB();
    return ok(res, { users: await assignableUsers(req.user, query.company) });
  })
);
var reportRouter = Router();
reportRouter.use(requireUser);
reportRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const actor = await requireActor(req.user);
    const catalog = reportCatalog().filter((entry) => hasPermission(actor, entry.permission) || hasPermission(actor, "view.company"));
    return ok(res, { reports: catalog });
  })
);
reportRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const query = reportQuery.parse(req.query);
    await connectDB();
    const actor = await requireActor(req.user);
    if (!hasPermission(actor, "report.all") && !hasPermission(actor, "view.company")) {
      throw httpError(403, "You do not have permission to run reports");
    }
    const rows = await buildReport(req.params.id, { user: req.user, companyId: query.company, from: query.from, to: query.to });
    return ok(res, { id: req.params.id, rows, generatedAt: (/* @__PURE__ */ new Date()).toISOString() });
  })
);
reportRouter.post(
  "/:id/export",
  asyncHandler(async (req, res) => {
    const query = reportQuery.parse(req.query);
    await connectDB();
    const actor = await requireActor(req.user);
    if (!hasPermission(actor, "export.all") && !hasPermission(actor, "report.all")) {
      throw httpError(403, "You do not have permission to export reports");
    }
    const rows = await buildReport(req.params.id, { user: req.user, companyId: query.company, from: query.from, to: query.to });
    await writeAudit({ actor: req.user, action: "EXPORT", entity: "Report", entityId: req.params.id, metadata: { rows: rows.length } });
    return ok(res, { id: req.params.id, rows, generatedAt: (/* @__PURE__ */ new Date()).toISOString() });
  })
);
reportRouter.get(
  "/complaint/:complaintId/8d",
  asyncHandler(async (req, res) => {
    await connectDB();
    const data = await eightDReportData(req.params.complaintId, req.user);
    await writeAudit({ actor: req.user, action: "EXPORT", entity: "Complaint8D", entityId: req.params.complaintId });
    return ok(res, { ...data, sheets: eightDExcelSheets(data) });
  })
);

// server/routes/attachment.routes.ts
import { Router as Router2 } from "express";
import { z as z4 } from "zod";

// server/models/Attachment.ts
import mongoose15, { Schema as Schema14 } from "mongoose";
var AttachmentSchema = new Schema14(
  {
    publicId: { type: String, required: true, trim: true, index: true },
    secureUrl: { type: String, required: true, trim: true },
    resourceType: { type: String, required: true, trim: true, default: "raw" },
    originalFilename: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    bytes: { type: Number, required: true },
    width: Number,
    height: Number,
    entityType: { type: String, required: true, trim: true, index: true },
    entityId: { type: Schema14.Types.ObjectId, required: true, index: true },
    purpose: { type: String, enum: ATTACHMENT_PURPOSES, required: true, index: true },
    company: { type: Schema14.Types.ObjectId, ref: "Company", index: true },
    uploadedBy: { type: Schema14.Types.ObjectId, ref: "User", index: true },
    uploadedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);
AttachmentSchema.index({ entityType: 1, entityId: 1, purpose: 1 });
var Attachment = mongoose15.models.Attachment || mongoose15.model("Attachment", AttachmentSchema);

// server/services/attachment.service.ts
import { v2 as cloudinary } from "cloudinary";
import { Types as Types7 } from "mongoose";

// server/domain/upload-rules.ts
var DANGEROUS_EXTENSIONS = [
  ".exe",
  ".dll",
  ".bat",
  ".cmd",
  ".com",
  ".msi",
  ".scr",
  ".js",
  ".mjs",
  ".vbs",
  ".ps1",
  ".sh",
  ".jar",
  ".php",
  ".html",
  ".htm",
  ".svg"
];
function sanitizeFilename(filename) {
  const base = filename.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, "").replace(/^\.+/, "").trim();
  return (cleaned || "file").slice(0, 180);
}
function validateUpload(file) {
  const issues = [];
  const name2 = sanitizeFilename(file.originalname);
  if (!name2) issues.push({ field: "file", message: "A file name is required" });
  if (DANGEROUS_EXTENSIONS.some((extension) => name2.toLowerCase().endsWith(extension))) {
    issues.push({ field: "file", message: "This file type is not allowed" });
  }
  if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.mimetype)) {
    issues.push({ field: "file", message: `Unsupported file type: ${file.mimetype}` });
  }
  if (!file.size || file.size <= 0) {
    issues.push({ field: "file", message: "The uploaded file is empty" });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    issues.push({ field: "file", message: `Maximum upload size is ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB` });
  }
  return issues;
}
function buildAttachmentMetadata(result, file) {
  if (!result.public_id || !result.secure_url) {
    throw new Error("Cloudinary did not return a usable asset reference");
  }
  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    resourceType: result.resource_type ?? "raw",
    originalFilename: sanitizeFilename(file.originalname),
    mimeType: file.mimetype,
    bytes: result.bytes ?? file.size,
    width: result.width,
    height: result.height
  };
}

// server/services/attachment.service.ts
var SAFE_FOLDER = /^[a-zA-Z0-9_-]{1,64}$/;
function configuredCloudinary() {
  const env = getEnv();
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw httpError(503, "Cloudinary is not configured on this environment");
  }
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true
  });
  return { cloudinary, env };
}
function folderFor(purpose) {
  const suffix = purpose.replace(/[^a-zA-Z0-9_-]/g, "-");
  if (!SAFE_FOLDER.test(suffix)) throw httpError(400, "Invalid upload folder");
  const env = getEnv();
  return `${env.CLOUDINARY_UPLOAD_FOLDER || "onepws-complaint-capa"}/${suffix}`;
}
function createUploadSignature(purpose) {
  const { cloudinary: client, env } = configuredCloudinary();
  const timestamp = Math.round(Date.now() / 1e3);
  const folder = folderFor(purpose);
  const signature2 = client.utils.api_sign_request({ timestamp, folder }, env.CLOUDINARY_API_SECRET);
  return {
    timestamp,
    folder,
    signature: signature2,
    apiKey: env.CLOUDINARY_API_KEY,
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    maxBytes: MAX_UPLOAD_BYTES,
    allowedMimeTypes: [...ALLOWED_UPLOAD_MIME_TYPES]
  };
}
async function confirmUpload(input, user) {
  if (!user) throw httpError(401, "Unauthorized");
  const { cloudinary: client } = configuredCloudinary();
  const folder = folderFor(input.purpose);
  if (!input.publicId.startsWith(`${folder}/`)) {
    throw businessRuleError("This asset does not belong to the declared upload folder", [
      { field: "publicId", message: "Upload the file with the signature issued for this purpose" }
    ]);
  }
  let resource;
  try {
    resource = await client.api.resource(input.publicId, { resource_type: "auto" });
  } catch {
    throw httpError(404, "The uploaded asset could not be verified with Cloudinary");
  }
  const issues = validateUpload({
    originalname: input.originalFilename,
    mimetype: input.mimeType,
    size: resource.bytes ?? 0
  });
  if (issues.length > 0) {
    await client.uploader.destroy(input.publicId, { resource_type: resource.resource_type ?? "raw" }).catch(() => void 0);
    throw businessRuleError("This file was rejected", issues);
  }
  const metadata = buildAttachmentMetadata(resource, {
    originalname: input.originalFilename,
    mimetype: input.mimeType,
    size: resource.bytes ?? 0
  });
  const attachment = await Attachment.create({
    ...metadata,
    entityType: input.entityType,
    entityId: new Types7.ObjectId(input.entityId),
    purpose: input.purpose,
    company: input.company ? new Types7.ObjectId(input.company) : void 0,
    uploadedBy: new Types7.ObjectId(user.id),
    uploadedAt: /* @__PURE__ */ new Date()
  });
  await writeAudit({
    actor: user,
    action: "UPLOAD",
    entity: "Attachment",
    entityId: String(attachment._id),
    after: { filename: metadata.originalFilename, bytes: metadata.bytes, purpose: input.purpose }
  });
  return attachment;
}
async function listAttachments(entityType, entityId) {
  if (!Types7.ObjectId.isValid(entityId)) throw httpError(400, "Invalid entity id");
  return Attachment.find({ entityType, entityId }).populate("uploadedBy", "name").sort({ createdAt: -1 }).lean();
}
async function deleteAttachment(attachmentId, user, allowed) {
  if (!user) throw httpError(401, "Unauthorized");
  if (!allowed) throw httpError(403, "You do not have permission to delete this file");
  if (!Types7.ObjectId.isValid(attachmentId)) throw httpError(400, "Invalid attachment id");
  const attachment = await Attachment.findById(attachmentId);
  if (!attachment) throw httpError(404, "Attachment not found");
  const { cloudinary: client } = configuredCloudinary();
  await client.uploader.destroy(attachment.publicId, { resource_type: attachment.resourceType }).catch(() => void 0);
  await Attachment.deleteOne({ _id: attachment._id });
  await writeAudit({
    actor: user,
    action: "DELETE_ATTACHMENT",
    entity: "Attachment",
    entityId: attachmentId,
    before: { filename: attachment.originalFilename, publicId: attachment.publicId }
  });
  return { deleted: true, filename: sanitizeFilename(attachment.originalFilename) };
}

// server/routes/attachment.routes.ts
var attachmentRouter = Router2();
attachmentRouter.use(requireUser);
var ENTITY_PURPOSES = {
  Complaint: ["complaint.attachment", "d6.document"],
  Capa: ["capa.evidence", "capa.effectiveness"],
  Company: ["company.logo"]
};
async function capaContext(capaId, user) {
  const capa = await Capa.findById(capaId);
  if (!capa) throw httpError(404, "CAPA not found");
  const complaint = await loadComplaintContext(String(capa.complaint), user);
  return { capa, complaint };
}
attachmentRouter.post(
  "/signature",
  asyncHandler(async (req, res) => {
    const input = z4.object({ purpose: z4.enum(ATTACHMENT_PURPOSES) }).parse(req.body);
    const actor = await requireActor(req.user);
    const allowed = isMasterAdmin(actor) || input.purpose === "company.logo" && isMasterAdmin(actor) || (input.purpose === "capa.evidence" || input.purpose === "capa.effectiveness") && (hasPermission(actor, "capa.edit.own") || hasPermission(actor, "complaint.assign") || hasPermission(actor, "capa.verify")) || (input.purpose === "complaint.attachment" || input.purpose === "d6.document") && (hasPermission(actor, "complaint.create") || hasPermission(actor, "complaint.edit") || hasPermission(actor, "complaint.edit.own") || hasPermission(actor, "complaint.edit.dept") || hasPermission(actor, "complaint.assign"));
    if (!allowed) throw httpError(403, "You do not have permission to upload files for this purpose");
    return ok(res, createUploadSignature(input.purpose));
  })
);
attachmentRouter.post(
  "/confirm",
  asyncHandler(async (req, res) => {
    const input = z4.object({
      publicId: z4.string().trim().min(1).max(300),
      originalFilename: z4.string().trim().min(1).max(255),
      mimeType: z4.enum(ALLOWED_UPLOAD_MIME_TYPES),
      entityType: z4.enum(["Complaint", "Capa", "Company"]),
      entityId: objectIdSchema,
      purpose: z4.enum(ATTACHMENT_PURPOSES),
      company: objectIdSchema.optional()
    }).parse(req.body);
    if (!ENTITY_PURPOSES[input.entityType].includes(input.purpose)) {
      throw httpError(400, "Attachment purpose does not match the selected entity type");
    }
    await connectDB();
    if (input.entityType === "Complaint") {
      const context = await loadComplaintContext(input.entityId, req.user);
      if (!canEditComplaint(context.actor, context.domain)) throw httpError(403, "You cannot attach files to this complaint");
    } else if (input.entityType === "Capa") {
      const context = await capaContext(input.entityId, req.user);
      if (!canEditCapa(context.complaint.actor, toDomainCapa(context.capa), context.complaint.domain)) {
        throw httpError(403, "You cannot attach files to this CAPA");
      }
    } else {
      const actor = await requireActor(req.user);
      if (!isMasterAdmin(actor)) throw httpError(403, "Only a Master Admin can replace a company logo");
      const company = await Company.findById(input.entityId).select("_id").lean();
      if (!company) throw httpError(404, "Company not found");
    }
    const attachment = await confirmUpload(input, req.user);
    return ok(res, { attachment }, 201);
  })
);
attachmentRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z4.object({ entityType: z4.enum(["Complaint", "Capa", "Company"]), entityId: objectIdSchema }).parse(req.query);
    await connectDB();
    if (query.entityType === "Complaint") {
      await loadComplaintContext(query.entityId, req.user);
    } else if (query.entityType === "Capa") {
      await capaContext(query.entityId, req.user);
    } else {
      const actor = await requireActor(req.user);
      if (!canSeeCompany(actor, query.entityId)) throw httpError(403, "You do not have access to this company");
      if (!await Company.exists({ _id: query.entityId })) throw httpError(404, "Company not found");
    }
    return ok(res, { attachments: await listAttachments(query.entityType, query.entityId) });
  })
);
attachmentRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await connectDB();
    const attachment = await Attachment.findById(req.params.id).lean();
    if (!attachment) throw httpError(404, "Attachment not found");
    const actor = await requireActor(req.user);
    let allowed = isMasterAdmin(actor);
    if (attachment.entityType === "Complaint") {
      const context = await loadComplaintContext(String(attachment.entityId), req.user);
      allowed = allowed || canEditComplaint(context.actor, context.domain);
    } else if (attachment.entityType === "Capa") {
      const context = await capaContext(String(attachment.entityId), req.user);
      allowed = allowed || canEditCapa(context.complaint.actor, toDomainCapa(context.capa), context.complaint.domain);
    } else if (attachment.entityType === "Company") {
      if (!canSeeCompany(actor, String(attachment.entityId))) throw httpError(403, "You do not have access to this company");
      allowed = isMasterAdmin(actor);
    }
    if (!allowed) throw httpError(403, "You do not have permission to delete this attachment");
    return ok(res, await deleteAttachment(req.params.id, req.user, true));
  })
);

// server/routes/audit.routes.ts
import { Router as Router3 } from "express";
import { z as z5 } from "zod";
var auditRouter = Router3();
auditRouter.use(requireUser);
auditRouter.get(
  "/",
  requirePermission("audit.view"),
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.extend({
      action: z5.enum(AUDIT_ACTIONS).optional(),
      entity: z5.string().trim().max(60).optional(),
      entityId: z5.string().trim().max(60).optional(),
      actor: z5.string().trim().max(60).optional(),
      from: z5.coerce.date().optional(),
      to: z5.coerce.date().optional()
    }).parse(req.query);
    await connectDB();
    const filter = {};
    if (query.action) filter.action = query.action;
    if (query.entity) filter.entity = query.entity;
    if (query.entityId) filter.entityId = query.entityId;
    if (query.actor) filter.actor = query.actor;
    if (query.from || query.to) {
      filter.createdAt = { ...query.from ? { $gte: query.from } : {}, ...query.to ? { $lte: query.to } : {} };
    }
    if (query.search) {
      const term = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(term, "i");
      filter.$or = [{ actorName: regex }, { entity: regex }, { entityId: regex }, { action: regex }];
    }
    const [rows, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: query.order === "asc" ? 1 : -1 }).skip((query.page - 1) * query.pageSize).limit(query.pageSize).lean(),
      AuditLog.countDocuments(filter)
    ]);
    return ok(res, paginate(rows, total, query));
  })
);

// server/routes/auth.routes.ts
import { Router as Router4 } from "express";

// shared/schemas/auth.ts
import { z as z6 } from "zod";
var usernameSchema = z6.string().trim().min(3).max(80).toLowerCase();
var passwordSchema = z6.string().min(8, "Password must be at least 8 characters").max(200).regex(/[A-Za-z]/, "Password must include a letter").regex(/[0-9]/, "Password must include a number");
var loginSchema = z6.object({
  username: usernameSchema,
  password: z6.string().min(1).max(200)
});
var forgotPasswordSchema = z6.object({
  emailOrUsername: z6.string().trim().min(3).max(160)
});
var resetPasswordSchema = z6.object({
  token: z6.string().min(32).max(256),
  newPassword: passwordSchema
});
var changePasswordSchema = z6.object({
  currentPassword: z6.string().min(1).max(200),
  newPassword: passwordSchema
});

// server/middleware/rate-limit.ts
var buckets = /* @__PURE__ */ new Map();
var MAX_BUCKETS = 1e4;
function clientKey(req, prefix) {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  const ip = raw?.trim() || req.ip || req.socket.remoteAddress || "unknown";
  return `${prefix}:${ip}`;
}
function sweepExpired(now) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
function createRateLimit(options) {
  const windowMs = Math.max(1e3, options.windowMs);
  const max = Math.max(1, options.max);
  return function rateLimit(req, res, next) {
    const now = Date.now();
    sweepExpired(now);
    const key = clientKey(req, options.keyPrefix);
    const existing = buckets.get(key);
    const bucket = !existing || existing.resetAt <= now ? { count: 0, resetAt: now + windowMs } : existing;
    bucket.count += 1;
    buckets.set(key, bucket);
    const remaining = Math.max(0, max - bucket.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1e3));
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1e3)));
    if (bucket.count > max) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        message: options.message || "Too many requests. Please try again later."
      });
    }
    return next();
  };
}

// server/routes/auth.routes.ts
var authRouter = Router4();
var loginRateLimit = createRateLimit({
  keyPrefix: "auth:login",
  windowMs: 15 * 60 * 1e3,
  max: 30,
  message: "Too many sign-in attempts from this network. Please try again later."
});
var forgotRateLimit = createRateLimit({
  keyPrefix: "auth:forgot",
  windowMs: 15 * 60 * 1e3,
  max: 10,
  message: "Too many password reset requests. Please try again later."
});
var resetRateLimit = createRateLimit({
  keyPrefix: "auth:reset",
  windowMs: 15 * 60 * 1e3,
  max: 20,
  message: "Too many password reset attempts. Please try again later."
});
function cookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    signed: true,
    maxAge: sessionMaxAgeMs(),
    path: "/"
  };
}
authRouter.post(
  "/login",
  loginRateLimit,
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    await connectDB();
    const user = await authenticate(input.username, input.password);
    res.cookie(SESSION_COOKIE, signSession(String(user._id)), cookieOptions());
    const apiUser = sanitizeUser(user);
    await writeAudit({ actor: apiUser, action: "LOGIN", entity: "User", entityId: apiUser.id });
    return ok(res, { user: apiUser });
  })
);
authRouter.post(
  "/logout",
  requireUser,
  asyncHandler(async (req, res) => {
    await writeAudit({ actor: req.user, action: "LOGOUT", entity: "User", entityId: req.user?.id });
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return ok(res, { loggedOut: true });
  })
);
authRouter.get("/me", requireUser, (req, res) => ok(res, { user: req.user }));
authRouter.post(
  "/forgot-password",
  forgotRateLimit,
  asyncHandler(async (req, res) => {
    const input = forgotPasswordSchema.parse(req.body);
    await connectDB();
    const result = await createPasswordResetToken(input.emailOrUsername);
    if (result?.user.email) {
      const baseUrl = getEnv().APP_BASE_URL || `${req.protocol}://${req.get("host") || "localhost:5173"}`;
      const resetUrl = new URL(`/reset-password?token=${result.token}`, baseUrl).toString();
      await sendTemplatedEmail({
        triggerEvent: "PASSWORD_RESET_REQUESTED",
        recipients: [result.user.email],
        data: {
          recipientName: result.user.name,
          resetUrl,
          expiresInHours: "1"
        },
        sentBySystem: true
      });
      await writeAudit({ action: "PASSWORD_RESET_REQUESTED", entity: "User", entityId: String(result.user._id) });
    }
    return ok(res, { requested: true });
  })
);
authRouter.post(
  "/reset-password",
  resetRateLimit,
  asyncHandler(async (req, res) => {
    const input = resetPasswordSchema.parse(req.body);
    await connectDB();
    const user = await resetPasswordWithToken(input.token, input.newPassword);
    await writeAudit({ action: "PASSWORD_RESET_COMPLETED", entity: "User", entityId: String(user._id) });
    if (user.email) {
      await sendTemplatedEmail({
        triggerEvent: "PASSWORD_CHANGED",
        recipients: [user.email],
        data: {
          recipientName: user.name,
          username: user.username
        },
        sentBySystem: true
      });
    }
    return ok(res, { reset: true });
  })
);
authRouter.post(
  "/change-password",
  requireUser,
  asyncHandler(async (req, res) => {
    const input = changePasswordSchema.parse(req.body);
    await connectDB();
    const user = await User.findById(req.user?.id).select("+passwordHash");
    if (!user) throw httpError(404, "User not found");
    if (!await verifyPassword(input.currentPassword, user.passwordHash)) throw httpError(400, "Current password is incorrect");
    if (await verifyPassword(input.newPassword, user.passwordHash)) throw httpError(400, "New password must be different from the current password");
    user.passwordHash = await hashPassword(input.newPassword);
    user.passwordChangedAt = /* @__PURE__ */ new Date();
    user.forcePasswordChange = false;
    await user.save();
    await writeAudit({ actor: req.user, action: "PASSWORD_CHANGED", entity: "User", entityId: String(user._id) });
    if (user.email) {
      await sendTemplatedEmail({
        triggerEvent: "PASSWORD_CHANGED",
        recipients: [user.email],
        data: {
          recipientName: user.name,
          username: user.username
        },
        sentBySystem: true
      });
    }
    return ok(res, { changed: true });
  })
);

// server/routes/capa.routes.ts
import { Router as Router5 } from "express";
import { z as z8 } from "zod";

// shared/schemas/capa.ts
import { z as z7 } from "zod";
var capaCreateSchema = z7.object({
  type: z7.enum(CAPA_TYPES).default("Corrective"),
  action: z7.string().trim().min(5, "Describe the action in at least 5 characters").max(4e3),
  owner: objectIdSchema,
  department: objectIdSchema.optional(),
  priority: objectIdSchema.optional(),
  dueDate: z7.coerce.date(),
  status: z7.enum(CAPA_STATUSES).default("Open"),
  evidence: z7.string().trim().max(4e3).optional().default("")
});
var capaUpdateSchema = capaCreateSchema.partial().extend({
  completedAt: z7.coerce.date().optional(),
  delayReason: z7.string().trim().max(200).optional()
});
var capaListQuerySchema = listQuerySchema.extend({
  company: objectIdSchema.optional(),
  complaint: objectIdSchema.optional(),
  owner: objectIdSchema.optional(),
  department: objectIdSchema.optional(),
  status: z7.enum(CAPA_STATUSES).optional(),
  type: z7.enum(CAPA_TYPES).optional(),
  effectiveness: z7.enum(CAPA_EFFECTIVENESS).optional(),
  evidenceReview: z7.enum(EVIDENCE_REVIEW_STATUSES).optional(),
  overdue: z7.coerce.boolean().optional(),
  dueFrom: z7.coerce.date().optional(),
  dueTo: z7.coerce.date().optional()
});
var evidenceReviewSchema = z7.object({
  decision: z7.enum(["Accepted", "Rejected"]),
  remarks: z7.string().trim().max(4e3).optional().default("")
});
var effectivenessSchema = z7.object({
  result: z7.enum(CAPA_EFFECTIVENESS),
  verificationMethod: z7.string().trim().min(2, "Verification method is required").max(400),
  effectivenessEvidence: z7.string().trim().min(2, "Evidence reference is required").max(4e3),
  remarks: z7.string().trim().max(4e3).optional().default(""),
  verifiedAt: z7.coerce.date().optional()
});

// server/services/capa.service.ts
import { Types as Types8 } from "mongoose";

// server/domain/capa-rules.ts
var ALLOWED_TRANSITIONS = {
  Open: ["Open", "In Progress", "Completed"],
  "In Progress": ["In Progress", "Completed", "Open"],
  Completed: ["Completed", "Under Verification", "Closed", "In Progress"],
  "Under Verification": ["Under Verification", "Closed", "Rejected/Reopened"],
  Closed: ["Closed", "Rejected/Reopened"],
  "Rejected/Reopened": ["Rejected/Reopened", "In Progress", "Completed"]
};
function isAllowedCapaTransition(from, to) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
function validateCapaStatusChange(capa, next, evidence) {
  const issues = [];
  if (!isAllowedCapaTransition(capa.status, next)) {
    issues.push({ field: "status", message: `A CAPA cannot move from ${capa.status} to ${next}` });
  }
  const effectiveEvidence = evidence ?? capa.evidence;
  if (next === "Closed" && !effectiveEvidence) {
    issues.push({ field: "evidence", message: "Evidence is required before a CAPA can be closed" });
  }
  return issues;
}
function validateEvidenceReview(decision, remarks) {
  const issues = [];
  if (decision === "Pending") {
    issues.push({ field: "decision", message: "A review decision must be Accepted or Rejected" });
  }
  if (decision === "Rejected" && (!remarks || !remarks.trim())) {
    issues.push({ field: "remarks", message: "Remarks are mandatory when rejecting evidence" });
  }
  return issues;
}
function reviewStateAfterReupload(current) {
  if (current?.status !== "Rejected") return null;
  return {
    status: "Pending",
    remarks: `Re-uploaded after rejection. Previous remarks: ${current.remarks ?? ""}`.trim()
  };
}
function validateEffectivenessVerification(capa, result, input) {
  const issues = [];
  const eligible = ["Completed", "Under Verification", "Closed"];
  if (!eligible.includes(capa.status)) {
    issues.push({ field: "status", message: "Only a completed CAPA can be verified for effectiveness" });
  }
  if (!input.evidence || !input.evidence.trim()) {
    issues.push({ field: "effectivenessEvidence", message: "Evidence reference is required to record effectiveness" });
  }
  if (!input.method || !input.method.trim()) {
    issues.push({ field: "verificationMethod", message: "Verification method is required, for example audit or sample check" });
  }
  if (result !== "Effective" && result !== "Not Effective") {
    issues.push({ field: "result", message: "Result must be Effective or Not Effective" });
  }
  return issues;
}
function capaStatusAfterEffectiveness(result) {
  return result === "Not Effective" ? "Rejected/Reopened" : "Closed";
}
function shouldReopenComplaint(result) {
  return result === "Not Effective";
}

// server/services/capa.service.ts
async function loadCapa(capaId) {
  if (!Types8.ObjectId.isValid(capaId)) throw httpError(400, "Invalid CAPA id");
  const capa = await Capa.findById(capaId);
  if (!capa) throw httpError(404, "CAPA not found");
  return capa;
}
async function complaintContextForCapa(capa, user) {
  return loadComplaintContext(String(capa.complaint), user);
}
async function listCapas(query, user) {
  const actor = await requireActor(user);
  if (!hasPermission(actor, "view.all") && !hasPermission(actor, "view.company")) {
    throw httpError(403, "You do not have permission to view CAPAs");
  }
  const filter = {};
  if (!hasPermission(actor, "view.all")) filter.company = { $in: actor.companyIds.map((id2) => new Types8.ObjectId(id2)) };
  if (query.company) {
    if (!canSeeCompany(actor, query.company)) throw httpError(403, "You do not have access to this company");
    filter.company = new Types8.ObjectId(query.company);
  }
  if (query.complaint) filter.complaint = new Types8.ObjectId(query.complaint);
  if (query.owner) filter.owner = new Types8.ObjectId(query.owner);
  if (query.department) filter.department = new Types8.ObjectId(query.department);
  if (query.status) filter.status = query.status;
  if (query.type) filter.type = query.type;
  if (query.effectiveness) filter.effectiveness = query.effectiveness;
  if (query.evidenceReview) filter["evidenceReview.status"] = query.evidenceReview;
  if (query.overdue) {
    filter.dueDate = { $lt: /* @__PURE__ */ new Date() };
    filter.status = { $nin: ["Closed", "Completed"] };
  }
  if (query.dueFrom || query.dueTo) {
    filter.dueDate = {
      ...query.dueFrom ? { $gte: query.dueFrom } : {},
      ...query.dueTo ? { $lte: query.dueTo } : {}
    };
  }
  if (query.search) {
    const term = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(term, "i");
    filter.$or = [{ number: regex }, { action: regex }];
  }
  const sortField = query.sort && /^[a-zA-Z]+$/.test(query.sort) ? query.sort : "dueDate";
  const sort = { [sortField]: query.order === "asc" ? 1 : -1 };
  const [rows, total] = await Promise.all([
    Capa.find(filter).sort(sort).skip((query.page - 1) * query.pageSize).limit(query.pageSize).populate("owner", "name username").populate("complaint", "number type status").populate("company", "name code").populate("department", "name").lean(),
    Capa.countDocuments(filter)
  ]);
  return { rows, total };
}
async function createCapa(complaintId, input, user) {
  const context = await loadComplaintContext(complaintId, user);
  if (!hasPermission(context.actor, "complaint.assign") && !hasPermission(context.actor, "capa.edit.own") && !hasPermission(context.actor, "complaint.edit") && !isMasterAdmin(context.actor)) {
    throw httpError(403, "You do not have permission to add CAPAs");
  }
  const sequence = await Capa.countDocuments({ complaint: context.doc._id }) + 1;
  const number = await nextCapaNumber(context.doc.company, context.doc.number, sequence);
  const capa = await Capa.create({
    number,
    complaint: context.doc._id,
    company: context.doc.company,
    sequence,
    type: input.type,
    action: input.action,
    owner: input.owner,
    department: input.department ?? context.doc.responsibleDept,
    priority: input.priority ?? context.doc.priority,
    dueDate: input.dueDate,
    status: input.status,
    evidence: input.evidence
  });
  await writeAudit({
    actor: user,
    action: "ASSIGN",
    entity: "Capa",
    entityId: String(capa._id),
    after: { number: capa.number, owner: String(capa.owner), dueDate: capa.dueDate }
  });
  await notify({
    recipients: [capa.owner].filter(Boolean),
    message: `CAPA ${capa.number} assigned to you (due ${new Date(capa.dueDate).toISOString().slice(0, 10)})`,
    category: "capa",
    entityType: "Capa",
    entityId: capa._id,
    link: `/complaints/${complaintId}`
  });
  const capaRecipients = await resolveRecipients({
    capaId: capa._id,
    targetRoles: ["CAPA Owner", "Department Head"]
  });
  if (capaRecipients.length > 0) {
    await sendTemplatedEmail({
      triggerEvent: "CAPA_ASSIGNED",
      recipients: capaRecipients,
      relatedCapaId: capa._id,
      relatedComplaintId: complaintId,
      data: {
        capaNumber: capa.number,
        capaType: capa.type,
        targetDate: new Date(capa.dueDate).toLocaleDateString("en-IN"),
        complaintNumber: context.doc.number,
        departmentName: context.doc.responsibleDept ? String(context.doc.responsibleDept) : "Production",
        capaTitle: capa.action,
        actionUrl: `/complaints/${complaintId}`
      }
    });
  }
  return capa;
}
async function updateCapa(capaId, input, user) {
  const capa = await loadCapa(capaId);
  const context = await complaintContextForCapa(capa, user);
  if (!canEditCapa(context.actor, toDomainCapa(capa), context.domain)) {
    throw httpError(403, "You do not have permission to edit this CAPA");
  }
  if (input.status && input.status !== capa.status) {
    const issues = validateCapaStatusChange(toDomainCapa(capa), input.status, input.evidence);
    if (issues.length > 0) throw businessRuleError("This CAPA status change is not allowed", issues);
  }
  const before = { status: capa.status, owner: String(capa.owner), dueDate: capa.dueDate };
  capa.set({
    ...input.type ? { type: input.type } : {},
    ...input.action ? { action: input.action } : {},
    ...input.owner ? { owner: input.owner } : {},
    ...input.department ? { department: input.department } : {},
    ...input.priority ? { priority: input.priority } : {},
    ...input.dueDate ? { dueDate: input.dueDate } : {},
    ...input.status ? { status: input.status } : {},
    ...input.evidence !== void 0 ? { evidence: input.evidence } : {},
    ...input.delayReason !== void 0 ? { delayReason: input.delayReason } : {}
  });
  if (input.status === "Completed" || input.status === "Closed") {
    capa.completedAt = input.completedAt ?? capa.completedAt ?? /* @__PURE__ */ new Date();
  }
  await capa.save();
  await writeAudit({ actor: user, action: "UPDATE", entity: "Capa", entityId: capaId, before, after: { status: capa.status } });
  return capa;
}
async function deleteCapa(capaId, user) {
  const capa = await loadCapa(capaId);
  const context = await complaintContextForCapa(capa, user);
  if (!isMasterAdmin(context.actor) && !hasPermission(context.actor, "complaint.assign")) {
    throw httpError(403, "You do not have permission to delete this CAPA");
  }
  const snapshot = { number: capa.number, action: capa.action, status: capa.status };
  await Capa.deleteOne({ _id: capa._id });
  await writeAudit({ actor: user, action: "DELETE", entity: "Capa", entityId: capaId, before: snapshot });
  return { deleted: true };
}
async function attachEvidence(capaId, attachmentId, description, user) {
  const capa = await loadCapa(capaId);
  const context = await complaintContextForCapa(capa, user);
  if (!canEditCapa(context.actor, toDomainCapa(capa), context.domain)) {
    throw httpError(403, "You do not have permission to add evidence to this CAPA");
  }
  capa.evidenceFiles.push({
    attachment: attachmentId,
    description,
    uploadedBy: new Types8.ObjectId(context.actor.id),
    uploadedAt: /* @__PURE__ */ new Date()
  });
  const reset = reviewStateAfterReupload(toDomainCapa(capa).evidenceReview);
  if (reset) {
    capa.evidenceReview = { status: reset.status, by: void 0, byName: "", at: null, remarks: reset.remarks };
  }
  await capa.save();
  await writeAudit({ actor: user, action: "UPLOAD", entity: "Capa", entityId: capaId, after: { attachment: String(attachmentId) } });
  const qualityRecipients = await resolveRecipients({
    capaId: capa._id,
    targetRoles: ["Quality Head", "Master Admin"]
  });
  if (qualityRecipients.length > 0) {
    await sendTemplatedEmail({
      triggerEvent: "CAPA_EVIDENCE_UPLOADED",
      recipients: qualityRecipients,
      relatedCapaId: capa._id,
      data: {
        capaNumber: capa.number,
        assignedTo: context.actor.name,
        evidenceFileName: description || "Evidence document attached",
        actionUrl: `/complaints/${String(capa.complaint)}`
      }
    });
  }
  return capa;
}
async function reviewEvidence(capaId, decision, remarks, user) {
  const capa = await loadCapa(capaId);
  const context = await complaintContextForCapa(capa, user);
  if (!canReviewCapaEvidence(context.actor, toDomainCapa(capa))) {
    throw httpError(403, "Only a Quality Head or Master Admin can review CAPA evidence");
  }
  const issues = validateEvidenceReview(decision, remarks);
  if (issues.length > 0) throw businessRuleError("This review decision is incomplete", issues);
  const entry = { status: decision, by: new Types8.ObjectId(context.actor.id), byName: context.actor.name, at: /* @__PURE__ */ new Date(), remarks };
  capa.evidenceReview = entry;
  capa.evidenceReviewHistory.push(entry);
  await capa.save();
  await writeAudit({
    actor: user,
    action: decision === "Accepted" ? "EVIDENCE_ACCEPT" : "EVIDENCE_REJECT",
    entity: "Capa",
    entityId: capaId,
    after: { decision, remarks }
  });
  await notify({
    recipients: [capa.owner].filter(Boolean),
    message: `Evidence for CAPA ${capa.number} was ${decision.toLowerCase()}${remarks ? `: ${remarks}` : ""}`,
    category: "evidence",
    priority: decision === "Rejected" ? "high" : "normal",
    entityType: "Capa",
    entityId: capa._id,
    link: `/complaints/${String(capa.complaint)}`
  });
  const ownerRecipients = await resolveRecipients({
    capaId: capa._id,
    targetRoles: ["CAPA Owner"]
  });
  if (ownerRecipients.length > 0) {
    await sendTemplatedEmail({
      triggerEvent: decision === "Accepted" ? "CAPA_EVIDENCE_ACCEPTED" : "CAPA_EVIDENCE_REJECTED",
      recipients: ownerRecipients,
      relatedCapaId: capa._id,
      data: {
        capaNumber: capa.number,
        reviewedBy: context.actor.name,
        rejectionRemarks: remarks || "Evidence does not satisfy acceptance criteria.",
        actionUrl: `/complaints/${String(capa.complaint)}`
      }
    });
  }
  return capa;
}
async function verifyEffectiveness(capaId, input, user) {
  const capa = await loadCapa(capaId);
  const context = await complaintContextForCapa(capa, user);
  if (!canVerifyEffectiveness(context.actor, toDomainCapa(capa))) {
    throw httpError(403, "You do not have permission to verify CAPA effectiveness");
  }
  const issues = validateEffectivenessVerification(toDomainCapa(capa), input.result, {
    method: input.verificationMethod,
    evidence: input.effectivenessEvidence
  });
  if (issues.length > 0) throw businessRuleError("Effectiveness verification is incomplete", issues);
  capa.effectiveness = input.result;
  capa.effectivenessVerifiedAt = input.verifiedAt ?? /* @__PURE__ */ new Date();
  capa.effectivenessVerifiedBy = new Types8.ObjectId(context.actor.id);
  capa.verificationMethod = input.verificationMethod;
  capa.effectivenessEvidence = input.effectivenessEvidence;
  capa.effectivenessRemarks = input.remarks;
  capa.status = capaStatusAfterEffectiveness(input.result);
  await capa.save();
  await writeAudit({
    actor: user,
    action: "CAPA_EFFECTIVENESS",
    entity: "Capa",
    entityId: capaId,
    after: { result: input.result, method: input.verificationMethod }
  });
  if (shouldReopenComplaint(input.result)) {
    await reopenComplaint(String(capa.complaint), `CAPA ${capa.number} verified as Not Effective`, user, { system: true });
    await notify({
      recipients: [capa.owner].filter(Boolean),
      message: `CAPA ${capa.number} was marked Not Effective. Add a supplementary corrective action.`,
      category: "effectiveness",
      priority: "high",
      entityType: "Capa",
      entityId: capa._id,
      link: `/complaints/${String(capa.complaint)}`
    });
    const notEffectiveRecipients = await resolveRecipients({
      capaId: capa._id,
      complaintId: capa.complaint,
      targetRoles: ["Complaint Owner", "CAPA Owner", "Quality Head"]
    });
    const mgmtCc = await resolveRecipients({
      capaId: capa._id,
      targetRoles: ["Department Head", "Management"]
    });
    if (notEffectiveRecipients.length > 0) {
      await sendTemplatedEmail({
        triggerEvent: "CAPA_NOT_EFFECTIVE",
        recipients: notEffectiveRecipients,
        cc: mgmtCc,
        relatedCapaId: capa._id,
        relatedComplaintId: capa.complaint,
        data: {
          capaNumber: capa.number,
          complaintNumber: context.doc.number,
          verifiedBy: context.actor.name,
          verificationRemarks: input.remarks || "Action did not prevent defect recurrence.",
          actionUrl: `/complaints/${String(capa.complaint)}`
        }
      });
    }
  } else {
    const effectiveRecipients = await resolveRecipients({
      capaId: capa._id,
      complaintId: capa.complaint,
      targetRoles: ["Complaint Owner", "CAPA Owner", "Quality Head"]
    });
    if (effectiveRecipients.length > 0) {
      await sendTemplatedEmail({
        triggerEvent: "CAPA_EFFECTIVENESS_VERIFIED",
        recipients: effectiveRecipients,
        relatedCapaId: capa._id,
        relatedComplaintId: capa.complaint,
        data: {
          capaNumber: capa.number,
          verifiedBy: context.actor.name,
          actionUrl: `/complaints/${String(capa.complaint)}`
        }
      });
    }
  }
  return capa;
}

// server/routes/capa.routes.ts
import { Types as Types9 } from "mongoose";
var capaRouter = Router5();
capaRouter.use(requireUser);
capaRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const isFullExport = req.query.pageSize === "5000";
    if (isFullExport) {
      const permissions = req.user?.role?.permissions || [];
      if (!permissions.includes("*") && !permissions.includes("export.all")) {
        throw httpError(403, "You do not have permission to export CAPAs");
      }
    }
    const query = capaListQuerySchema.parse({
      ...req.query,
      ...isFullExport ? { page: 1, pageSize: 100 } : {}
    });
    const effectiveQuery = isFullExport ? { ...query, page: 1, pageSize: 5e3 } : query;
    await connectDB();
    const { rows, total } = await listCapas(effectiveQuery, req.user);
    if (isFullExport) {
      await writeAudit({
        actor: req.user,
        action: "EXPORT",
        entity: "Capa",
        metadata: { count: rows.length, total, exportType: "full-entity" }
      });
    }
    return ok(res, paginate(rows, total, effectiveQuery));
  })
);
capaRouter.post(
  "/complaint/:complaintId",
  asyncHandler(async (req, res) => {
    const input = capaCreateSchema.parse(req.body);
    await connectDB();
    const capa = await createCapa(req.params.complaintId, input, req.user);
    return ok(res, { capa }, 201);
  })
);
capaRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = capaUpdateSchema.parse(req.body);
    await connectDB();
    const capa = await updateCapa(req.params.id, input, req.user);
    return ok(res, { capa });
  })
);
capaRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await connectDB();
    return ok(res, await deleteCapa(req.params.id, req.user));
  })
);
capaRouter.post(
  "/:id/evidence",
  asyncHandler(async (req, res) => {
    const input = z8.object({ attachment: objectIdSchema, description: z8.string().trim().max(500).optional().default("") }).parse(req.body);
    await connectDB();
    const capa = await attachEvidence(req.params.id, new Types9.ObjectId(input.attachment), input.description, req.user);
    return ok(res, { capa }, 201);
  })
);
capaRouter.post(
  "/:id/evidence/review",
  asyncHandler(async (req, res) => {
    const input = evidenceReviewSchema.parse(req.body);
    await connectDB();
    const capa = await reviewEvidence(req.params.id, input.decision, input.remarks, req.user);
    return ok(res, { capa });
  })
);
capaRouter.post(
  "/:id/effectiveness",
  asyncHandler(async (req, res) => {
    const input = effectivenessSchema.parse(req.body);
    await connectDB();
    const capa = await verifyEffectiveness(req.params.id, input, req.user);
    return ok(res, { capa });
  })
);

// server/routes/complaint.routes.ts
import { Router as Router6 } from "express";
import { z as z10 } from "zod";

// shared/schemas/complaint.ts
import { z as z9 } from "zod";
var optionalText = (max) => z9.string().trim().max(max).optional().default("");
var baseComplaintSchema = z9.object({
  type: z9.enum(COMPLAINT_TYPES),
  company: objectIdSchema,
  receivedAt: z9.coerce.date(),
  priority: objectIdSchema,
  source: optionalText(80),
  reportedBy: optionalText(160),
  customer: optionalText(160),
  customerContact: optionalText(160),
  customerLocation: optionalText(160),
  project: optionalText(160),
  customerPO: optionalText(80),
  product: optionalText(160),
  batch: optionalText(80),
  internalDept: objectIdSchema.optional(),
  againstDept: objectIdSchema.optional(),
  responsibleDept: objectIdSchema.optional(),
  category: z9.string().trim().min(1, "Category is required").max(120),
  subCategory: optionalText(120),
  description: z9.string().trim().min(10, "Describe the complaint in at least 10 characters").max(5e3),
  owner: objectIdSchema.optional(),
  attachments: z9.array(objectIdSchema).max(20).default([])
});
var complaintCreateSchema = baseComplaintSchema.superRefine((value, ctx) => {
  if (value.type === "External") {
    if (!value.customer) {
      ctx.addIssue({ code: z9.ZodIssueCode.custom, path: ["customer"], message: "Customer name is required for an external complaint" });
    }
    if (!value.responsibleDept) {
      ctx.addIssue({ code: z9.ZodIssueCode.custom, path: ["responsibleDept"], message: "Responsible department is required" });
    }
  } else {
    if (!value.internalDept) {
      ctx.addIssue({
        code: z9.ZodIssueCode.custom,
        path: ["internalDept"],
        message: "Raising department is required for an internal complaint"
      });
    }
    if (!value.againstDept) {
      ctx.addIssue({
        code: z9.ZodIssueCode.custom,
        path: ["againstDept"],
        message: "Against department is required for an internal complaint"
      });
    }
  }
});
var complaintUpdateSchema = baseComplaintSchema.partial().omit({ type: true, company: true }).extend({ status: z9.enum(COMPLAINT_STATUSES).optional() });
var complaintListQuerySchema = listQuerySchema.extend({
  company: objectIdSchema.optional(),
  type: z9.enum(COMPLAINT_TYPES).optional(),
  status: z9.enum(COMPLAINT_STATUSES).optional(),
  priority: objectIdSchema.optional(),
  category: z9.string().trim().max(120).optional(),
  responsibleDept: objectIdSchema.optional(),
  owner: objectIdSchema.optional(),
  isRepeat: z9.coerce.boolean().optional(),
  tat: z9.enum(["on-time", "due-soon", "overdue"]).optional(),
  receivedFrom: z9.coerce.date().optional(),
  receivedTo: z9.coerce.date().optional()
});
var delayInputSchema = z9.object({
  category: z9.string().trim().min(1).max(160).optional(),
  explanation: z9.string().trim().max(2e3).optional(),
  recovery: z9.string().trim().max(2e3).optional()
});
var stageCompleteSchema = z9.object({
  stage: z9.enum(WORKFLOW_STAGES),
  notes: optionalText(2e3),
  containmentNotes: optionalText(2e3),
  delay: delayInputSchema.optional()
});
var actionRowSchema = z9.object({
  action: z9.string().trim().max(2e3).optional().default(""),
  resp: z9.string().trim().max(160).optional().default(""),
  target: z9.string().trim().max(40).optional().default(""),
  status: z9.string().trim().max(40).optional().default("Open"),
  remarks: z9.string().trim().max(2e3).optional().default(""),
  ctqImpact: z9.string().trim().max(500).optional().default(""),
  customerApproval: z9.string().trim().max(200).optional().default("")
});
var fishboneSchema = z9.object(
  FISHBONE_CATEGORIES.reduce((acc, category) => {
    acc[category] = z9.array(z9.string().trim().max(500)).max(20).optional();
    return acc;
  }, {})
);
var eightDSchema = z9.object({
  d0: z9.string().trim().max(4e3).optional(),
  d1Team: z9.array(
    z9.object({
      employee: objectIdSchema.optional(),
      name: z9.string().trim().max(160).optional().default(""),
      dept: z9.string().trim().max(120).optional().default(""),
      designation: z9.string().trim().max(120).optional().default(""),
      email: z9.string().trim().max(160).optional().default(""),
      role: z9.string().trim().max(160).optional().default("")
    })
  ).max(30).optional(),
  d2: z9.object({
    what: z9.string().trim().max(2e3).optional(),
    where: z9.string().trim().max(2e3).optional(),
    when: z9.string().trim().max(2e3).optional(),
    who: z9.string().trim().max(2e3).optional(),
    involved: z9.string().trim().max(2e3).optional(),
    howMany: z9.string().trim().max(500).optional(),
    how: z9.string().trim().max(2e3).optional()
  }).optional(),
  d3Actions: z9.array(actionRowSchema).max(50).optional(),
  d4QcTools: z9.array(z9.string().trim().max(80)).max(20).optional(),
  d4Occurrence: z9.string().trim().max(4e3).optional(),
  d4Escape: z9.string().trim().max(4e3).optional(),
  d4Systemic: z9.string().trim().max(4e3).optional(),
  rootCauseCategory: z9.string().trim().max(120).optional(),
  fiveWhy: z9.object({
    occurrence: z9.array(z9.string().trim().max(1e3)).max(10).optional(),
    escape: z9.array(z9.string().trim().max(1e3)).max(10).optional(),
    systemic: z9.array(z9.string().trim().max(1e3)).max(10).optional(),
    singleChain: z9.array(z9.string().trim().max(1e3)).max(10).optional()
  }).optional(),
  fishbone: fishboneSchema.optional(),
  d5Occurrence: z9.array(actionRowSchema).max(50).optional(),
  d5Escape: z9.array(actionRowSchema).max(50).optional(),
  d5Systemic: z9.array(actionRowSchema).max(50).optional(),
  d5Safety: z9.string().trim().max(2e3).optional(),
  d6Verify: z9.array(actionRowSchema).max(50).optional(),
  d6DocsList: z9.array(
    z9.object({
      docType: z9.enum(D6_DOCUMENT_TYPES),
      status: z9.enum(D6_DOCUMENT_STATUSES),
      attachment: objectIdSchema.nullable().optional(),
      revision: z9.string().trim().max(40).optional().default(""),
      revDate: z9.string().trim().max(40).optional().default(""),
      approver: z9.string().trim().max(160).optional().default(""),
      naJustification: z9.string().trim().max(1e3).optional().default("")
    })
  ).max(D6_DOCUMENT_TYPES.length).optional(),
  d6Horizontal: z9.string().trim().max(4e3).optional(),
  d7ShortTermDate: z9.string().trim().max(40).optional(),
  d7RepeatObserved: z9.boolean().optional(),
  d7Regulatory: z9.string().trim().max(2e3).optional(),
  d7Actions: z9.array(actionRowSchema).max(50).optional(),
  d7LongTermDate: z9.string().trim().max(40).optional(),
  d7LongTermRepeatObserved: z9.boolean().optional(),
  d7LongTermResult: z9.enum(D7_LT_RESULTS).or(z9.literal("")).optional(),
  d7LongTermNotes: z9.string().trim().max(4e3).optional(),
  d8Recognition: z9.string().trim().max(4e3).optional(),
  d8ReviewedBy: z9.string().trim().max(160).optional(),
  d8ClosedDate: z9.string().trim().max(40).optional()
});
var internalInvestigationSchema = z9.object({
  d2: z9.object({ what: z9.string().trim().max(2e3).optional() }).optional(),
  fiveWhy: z9.object({ singleChain: z9.array(z9.string().trim().max(1e3)).max(10).optional() }).optional(),
  d4Occurrence: z9.string().trim().max(4e3).optional(),
  rootCauseCategory: z9.string().trim().max(120).optional(),
  internalInvestigation: z9.object({
    summary: z9.string().trim().max(4e3).optional(),
    findings: z9.string().trim().max(4e3).optional(),
    correctiveAction: z9.string().trim().max(4e3).optional(),
    evidence: z9.string().trim().max(4e3).optional()
  }).optional()
});
var closeComplaintSchema = z9.object({
  closureRemarks: z9.string().trim().min(5, "Closure remarks are required").max(4e3),
  noRepeatConfirmed: z9.boolean().default(false),
  force: z9.boolean().default(false)
});
var reopenComplaintSchema = z9.object({
  reason: z9.string().trim().min(5, "A reopen reason is required").max(2e3)
});
var signComplaintSchema = z9.object({
  role: z9.enum(SIGNATURE_ROLES),
  notes: z9.string().trim().max(1e3).optional().default("")
});
var revokeSignatureSchema = z9.object({
  role: z9.enum(SIGNATURE_ROLES),
  reason: z9.string().trim().min(5, "A revocation reason is required").max(1e3)
});
var repeatReviewSchema = z9.object({
  isRepeat: z9.boolean(),
  remarks: z9.string().trim().max(2e3).optional().default("")
});
var noteCreateSchema = z9.object({
  kind: z9.enum(NOTE_KINDS).default("Note"),
  referenceDate: z9.coerce.date().optional(),
  content: z9.string().trim().min(2).max(8e3)
});
var overallEffectivenessSchema = z9.object({
  result: z9.enum(["Effective", "Not Effective"]),
  at: z9.coerce.date().optional(),
  comments: z9.string().trim().max(4e3).optional().default("")
});

// server/models/ComplaintNote.ts
import mongoose16, { Schema as Schema15 } from "mongoose";
var ComplaintNoteSchema = new Schema15(
  {
    complaint: { type: Schema15.Types.ObjectId, ref: "Complaint", required: true, index: true },
    company: { type: Schema15.Types.ObjectId, ref: "Company", required: true, index: true },
    kind: { type: String, enum: NOTE_KINDS, default: "Note", index: true },
    referenceDate: { type: Date, default: null },
    content: { type: String, required: true, trim: true },
    createdBy: { type: Schema15.Types.ObjectId, ref: "User", index: true },
    createdByName: { type: String, trim: true }
  },
  { timestamps: true }
);
ComplaintNoteSchema.index({ complaint: 1, createdAt: -1 });
var ComplaintNote = mongoose16.models.ComplaintNote || mongoose16.model("ComplaintNote", ComplaintNoteSchema);

// server/routes/complaint.routes.ts
var complaintRouter = Router6();
complaintRouter.use(requireUser);
complaintRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const isFullExport = req.query.pageSize === "5000";
    if (isFullExport) {
      const permissions = req.user?.role?.permissions || [];
      if (!permissions.includes("*") && !permissions.includes("export.all")) {
        throw httpError(403, "You do not have permission to export complaints");
      }
    }
    const query = complaintListQuerySchema.parse({
      ...req.query,
      ...isFullExport ? { page: 1, pageSize: 100 } : {}
    });
    const effectiveQuery = isFullExport ? { ...query, page: 1, pageSize: 5e3 } : query;
    await connectDB();
    const { rows, total } = await listComplaints(effectiveQuery, req.user);
    if (isFullExport) {
      await writeAudit({
        actor: req.user,
        action: "EXPORT",
        entity: "Complaint",
        metadata: { count: rows.length, total, exportType: "full-entity" }
      });
    }
    return ok(res, paginate(rows, total, effectiveQuery));
  })
);
complaintRouter.post(
  "/",
  requirePermission("complaint.create"),
  asyncHandler(async (req, res) => {
    const input = complaintCreateSchema.parse(req.body);
    await connectDB();
    const complaint = await createComplaint(input, req.user);
    return ok(res, { complaint }, 201);
  })
);
complaintRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    await connectDB();
    return ok(res, await getComplaintDetail(req.params.id, req.user));
  })
);
complaintRouter.post(
  "/:id/stage",
  asyncHandler(async (req, res) => {
    const input = stageCompleteSchema.parse(req.body);
    await connectDB();
    const complaint = await completeStage(req.params.id, input, req.user);
    return ok(res, { complaint });
  })
);
complaintRouter.patch(
  "/:id/8d",
  asyncHandler(async (req, res) => {
    const input = eightDSchema.parse(req.body);
    await connectDB();
    const context = await loadComplaintContext(req.params.id, req.user);
    if (context.doc.type !== "External") throw httpError(400, "The 8D report only applies to external complaints");
    const complaint = await saveInvestigation(req.params.id, input, req.user);
    return ok(res, { complaint });
  })
);
complaintRouter.patch(
  "/:id/internal",
  asyncHandler(async (req, res) => {
    const input = internalInvestigationSchema.parse(req.body);
    await connectDB();
    const context = await loadComplaintContext(req.params.id, req.user);
    if (context.doc.type !== "Internal") throw httpError(400, "The internal investigation only applies to internal complaints");
    const complaint = await saveInvestigation(req.params.id, input, req.user);
    return ok(res, { complaint });
  })
);
complaintRouter.post(
  "/:id/signatures",
  asyncHandler(async (req, res) => {
    const input = signComplaintSchema.parse(req.body);
    await connectDB();
    const complaint = await signComplaint(req.params.id, input.role, input.notes, req.user);
    return ok(res, { complaint });
  })
);
complaintRouter.delete(
  "/:id/signatures",
  asyncHandler(async (req, res) => {
    const input = revokeSignatureSchema.parse(req.body);
    await connectDB();
    const complaint = await revokeSignature(req.params.id, input.role, input.reason, req.user);
    return ok(res, { complaint });
  })
);
complaintRouter.post(
  "/:id/close",
  requirePermission("complaint.close"),
  asyncHandler(async (req, res) => {
    const input = closeComplaintSchema.parse(req.body);
    await connectDB();
    const complaint = await closeComplaint(req.params.id, input, req.user);
    return ok(res, { complaint });
  })
);
complaintRouter.post(
  "/:id/reopen",
  asyncHandler(async (req, res) => {
    const input = reopenComplaintSchema.parse(req.body);
    await connectDB();
    const complaint = await reopenComplaint(req.params.id, input.reason, req.user);
    return ok(res, { complaint });
  })
);
complaintRouter.post(
  "/:id/repeat-review",
  asyncHandler(async (req, res) => {
    const input = repeatReviewSchema.parse(req.body);
    await connectDB();
    const complaint = await reviewRepeatLinkage(req.params.id, input, req.user);
    return ok(res, { complaint });
  })
);
complaintRouter.post(
  "/:id/effectiveness",
  asyncHandler(async (req, res) => {
    const input = overallEffectivenessSchema.parse(req.body);
    await connectDB();
    const complaint = await saveOverallEffectiveness(req.params.id, input, req.user);
    return ok(res, { complaint });
  })
);
complaintRouter.get(
  "/:id/notes",
  asyncHandler(async (req, res) => {
    await connectDB();
    await loadComplaintContext(req.params.id, req.user);
    const notes = await ComplaintNote.find({ complaint: req.params.id }).sort({ createdAt: -1 }).lean();
    return ok(res, { notes });
  })
);
complaintRouter.post(
  "/:id/notes",
  asyncHandler(async (req, res) => {
    const input = noteCreateSchema.parse(req.body);
    await connectDB();
    const context = await loadComplaintContext(req.params.id, req.user);
    const note = await ComplaintNote.create({
      complaint: context.doc._id,
      company: context.doc.company,
      kind: input.kind,
      referenceDate: input.referenceDate,
      content: input.content,
      createdBy: context.actor.id,
      createdByName: context.actor.name
    });
    await writeAudit({ actor: req.user, action: "CREATE", entity: "ComplaintNote", entityId: String(note._id), after: { kind: note.kind } });
    return ok(res, { note }, 201);
  })
);
complaintRouter.delete(
  "/:id/notes/:noteId",
  asyncHandler(async (req, res) => {
    await connectDB();
    const context = await loadComplaintContext(req.params.id, req.user);
    const note = await ComplaintNote.findOne({ _id: req.params.noteId, complaint: context.doc._id });
    if (!note) throw httpError(404, "Note not found");
    const isAuthor = String(note.createdBy) === context.actor.id;
    if (!isAuthor && !canEditComplaint(context.actor, context.domain)) throw httpError(403, "You can only delete your own notes");
    await ComplaintNote.deleteOne({ _id: note._id });
    await writeAudit({ actor: req.user, action: "DELETE", entity: "ComplaintNote", entityId: String(note._id) });
    return ok(res, { deleted: true });
  })
);
complaintRouter.get(
  "/:id/audit",
  asyncHandler(async (req, res) => {
    await connectDB();
    await loadComplaintContext(req.params.id, req.user);
    const entries = await AuditLog.find({ entityId: req.params.id }).sort({ createdAt: -1 }).limit(200).lean();
    return ok(res, { entries });
  })
);
complaintRouter.delete(
  "/:id",
  requirePermission("complaint.delete"),
  asyncHandler(async (req, res) => {
    const input = z10.object({ confirmation: z10.string().trim().min(1) }).parse(req.body);
    await connectDB();
    return ok(res, await deleteComplaint(req.params.id, input.confirmation, req.user));
  })
);

// server/routes/configuration.routes.ts
import { Router as Router7 } from "express";
import { z as z12 } from "zod";

// shared/schemas/configuration.ts
import { z as z11 } from "zod";
var tatConfigSchema = z11.object({
  company: objectIdSchema.nullable().optional(),
  ackHours: z11.number().int().min(1).max(2e3),
  containmentDays: z11.number().int().min(1).max(365),
  rcaDays: z11.number().int().min(1).max(365),
  capaDays: z11.number().int().min(1).max(365),
  d3ContainmentDays: z11.number().int().min(1).max(365),
  d5CorrectiveActionDays: z11.number().int().min(1).max(365),
  d6VerificationDays: z11.number().int().min(1).max(365),
  d7ShortTermDays: z11.number().int().min(1).max(730),
  d7LongTermDays: z11.number().int().min(1).max(730),
  repeatWindowDays: z11.number().int().min(1).max(730),
  dueSoonHours: z11.number().int().min(1).max(720)
});
var escalationConfigSchema = z11.object({
  company: objectIdSchema.nullable().optional(),
  levels: z11.array(
    z11.object({
      level: z11.number().int().min(1).max(10),
      name: z11.string().trim().min(2).max(80),
      triggerHoursOverdue: z11.number().int().min(0).max(8760)
    })
  ).min(1).max(10),
  reminderPercentages: z11.array(z11.number().int().min(1).max(100)).min(1).max(10),
  active: z11.boolean().default(true)
});
var numberingConfigSchema = z11.object({
  company: objectIdSchema,
  prefix: z11.string().trim().min(2).max(40),
  sequencePadding: z11.number().int().min(3).max(10).default(5),
  capaSequencePadding: z11.number().int().min(2).max(6).default(2),
  resetOnFinancialYear: z11.boolean().default(true),
  active: z11.boolean().default(true)
});
var simpleListItemSchema = z11.object({
  name: z11.string().trim().min(1).max(160),
  order: z11.number().int().min(0).max(999).default(0),
  active: z11.boolean().default(true)
});
var categorySchema = simpleListItemSchema.extend({
  complaintType: z11.enum(COMPLAINT_TYPES),
  parent: objectIdSchema.nullable().optional()
});
var prioritySchema = simpleListItemSchema.extend({
  color: z11.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour"),
  tatMultiplier: z11.number().min(0.1).max(10)
});

// server/routes/configuration.routes.ts
var configurationRouter = Router7();
configurationRouter.use(requireUser);
configurationRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    await connectDB();
    const company = typeof req.query.company === "string" && req.query.company ? req.query.company : null;
    const [tat, escalation, delayReasonItems, categories, priorities, rootCauseCategories, numbering] = await Promise.all([
      resolveTatConfig(company),
      resolveEscalation(company),
      DelayReason.find({ active: true }).sort({ order: 1, name: 1 }).lean(),
      Category.find({ active: true }).sort({ complaintType: 1, order: 1, name: 1 }).lean(),
      Priority.find({ active: true }).sort({ order: 1 }).lean(),
      RootCauseCategory.find({ active: true }).sort({ order: 1, name: 1 }).lean(),
      company ? NumberingConfiguration.findOne({ company, active: true }).lean() : Promise.resolve(null)
    ]);
    return ok(res, {
      tat,
      escalation,
      numbering,
      delayReasons: delayReasonItems.map((item) => item.name),
      delayReasonItems,
      categories,
      priorities,
      rootCauseCategories,
      fishboneCategories: FISHBONE_CATEGORIES,
      qcTools: QC_TOOLS,
      complaintTypes: COMPLAINT_TYPES
    });
  })
);
configurationRouter.put(
  "/tat",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = tatConfigSchema.parse(req.body);
    await connectDB();
    const company = input.company ?? null;
    const before = await TATConfiguration.findOne({ company }).lean();
    const config = await TATConfiguration.findOneAndUpdate({ company }, { ...input, company }, { new: true, upsert: true });
    await writeAudit({ actor: req.user, action: "MASTER_DATA_CHANGE", entity: "TATConfiguration", entityId: String(config._id), before, after: input });
    return ok(res, { config });
  })
);
configurationRouter.put(
  "/escalation",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = escalationConfigSchema.parse(req.body);
    await connectDB();
    const company = input.company ?? null;
    const before = await EscalationConfiguration.findOne({ company }).lean();
    const config = await EscalationConfiguration.findOneAndUpdate({ company }, { ...input, company }, { new: true, upsert: true });
    await writeAudit({ actor: req.user, action: "MASTER_DATA_CHANGE", entity: "EscalationConfiguration", entityId: String(config._id), before, after: input });
    return ok(res, { config });
  })
);
configurationRouter.put(
  "/numbering",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = numberingConfigSchema.parse(req.body);
    await connectDB();
    const before = await NumberingConfiguration.findOne({ company: input.company }).lean();
    const config = await NumberingConfiguration.findOneAndUpdate({ company: input.company }, input, { new: true, upsert: true });
    await writeAudit({ actor: req.user, action: "MASTER_DATA_CHANGE", entity: "NumberingConfiguration", entityId: String(config._id), before, after: input });
    return ok(res, { config });
  })
);
var listModels = {
  "delay-reasons": DelayReason,
  "root-cause-categories": RootCauseCategory
};
configurationRouter.post(
  "/lists/:list",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const key = req.params.list;
    const model = listModels[key];
    if (!model) throw httpError(404, "Unknown configuration list");
    const input = simpleListItemSchema.parse(req.body);
    await connectDB();
    const created = await model.findOneAndUpdate({ name: input.name }, input, { new: true, upsert: true });
    await writeAudit({ actor: req.user, action: "MASTER_DATA_CHANGE", entity: key, entityId: String(created._id), after: input });
    return ok(res, { item: created }, 201);
  })
);
configurationRouter.patch(
  "/lists/:list/:id",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const key = req.params.list;
    const model = listModels[key];
    if (!model) throw httpError(404, "Unknown configuration list");
    const input = simpleListItemSchema.partial().parse(req.body);
    await connectDB();
    const before = await model.findById(req.params.id).lean();
    if (!before) throw httpError(404, "Item not found");
    const updated = await model.findByIdAndUpdate(req.params.id, input, { new: true });
    await writeAudit({ actor: req.user, action: "MASTER_DATA_CHANGE", entity: key, entityId: req.params.id, before, after: input });
    return ok(res, { item: updated });
  })
);
configurationRouter.post(
  "/categories",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = categorySchema.parse(req.body);
    await connectDB();
    const category = await Category.findOneAndUpdate(
      { name: input.name, complaintType: input.complaintType, parent: input.parent ?? null },
      { ...input, parent: input.parent ?? null },
      { new: true, upsert: true }
    );
    await writeAudit({ actor: req.user, action: "MASTER_DATA_CHANGE", entity: "Category", entityId: String(category._id), after: input });
    return ok(res, { category }, 201);
  })
);
configurationRouter.patch(
  "/categories/:id",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = categorySchema.partial().parse(req.body);
    const params = z12.object({ id: objectIdSchema }).parse(req.params);
    await connectDB();
    const before = await Category.findById(params.id).lean();
    if (!before) throw httpError(404, "Category not found");
    const category = await Category.findByIdAndUpdate(params.id, input, { new: true });
    await writeAudit({ actor: req.user, action: "MASTER_DATA_CHANGE", entity: "Category", entityId: params.id, before, after: input });
    return ok(res, { category });
  })
);
configurationRouter.post(
  "/priorities",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = prioritySchema.parse(req.body);
    await connectDB();
    const priority = await Priority.findOneAndUpdate({ name: input.name }, input, { new: true, upsert: true });
    await writeAudit({ actor: req.user, action: "MASTER_DATA_CHANGE", entity: "Priority", entityId: String(priority._id), after: input });
    return ok(res, { priority }, 201);
  })
);
configurationRouter.patch(
  "/priorities/:id",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = prioritySchema.partial().parse(req.body);
    const params = z12.object({ id: objectIdSchema }).parse(req.params);
    await connectDB();
    const before = await Priority.findById(params.id).lean();
    if (!before) throw httpError(404, "Priority not found");
    const priority = await Priority.findByIdAndUpdate(params.id, input, { new: true });
    await writeAudit({ actor: req.user, action: "MASTER_DATA_CHANGE", entity: "Priority", entityId: params.id, before, after: input });
    return ok(res, { priority });
  })
);

// server/routes/health.routes.ts
import { Router as Router8 } from "express";
import mongoose17 from "mongoose";
var healthRouter = Router8();
healthRouter.get("/", (_req, res) => ok(res, { status: "ok", service: "onepws-complaint-capa-api" }));
healthRouter.get(
  "/db",
  asyncHandler(async (_req, res) => {
    await connectDB();
    return ok(res, { status: mongoose17.connection.readyState === 1 ? "connected" : "not-connected" });
  })
);

// server/routes/import.routes.ts
import { Router as Router9 } from "express";
import { z as z14 } from "zod";

// server/services/import.service.ts
import { Types as Types10 } from "mongoose";

// server/models/Department.ts
import mongoose18, { Schema as Schema16 } from "mongoose";
var DepartmentSchema = new Schema16(
  {
    name: { type: String, required: true, trim: true, index: true },
    code: { type: String, trim: true },
    company: { type: Schema16.Types.ObjectId, ref: "Company", index: true },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);
DepartmentSchema.index({ name: 1, company: 1 }, { unique: true });
var Department = mongoose18.models.Department || mongoose18.model("Department", DepartmentSchema);

// server/services/upload.service.ts
import { v2 as cloudinary2 } from "cloudinary";
var MAX_UPLOAD_BYTES2 = 10 * 1024 * 1024;
var SAFE_FOLDER_SUFFIX = /^[a-zA-Z0-9_-]{1,64}$/;
async function uploadBuffer(input) {
  const env = getEnv();
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw httpError(400, "Cloudinary is not configured");
  }
  if (input.buffer.byteLength > MAX_UPLOAD_BYTES2) throw httpError(400, "File is larger than 10 MB");
  if (!SAFE_FOLDER_SUFFIX.test(input.folderSuffix)) throw httpError(400, "Invalid upload folder");
  cloudinary2.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET
  });
  const folder = `${env.CLOUDINARY_UPLOAD_FOLDER || "onepws-complaint-capa"}/${input.folderSuffix}`;
  return new Promise((resolve, reject) => {
    const stream = cloudinary2.uploader.upload_stream({ folder, resource_type: "auto" }, (error, result) => {
      if (error || !result) reject(httpError(400, "Upload failed"));
      else resolve({ secureUrl: result.secure_url, publicId: result.public_id, sizeBytes: result.bytes ?? input.buffer.byteLength });
    });
    stream.end(input.buffer);
  });
}

// server/services/import.service.ts
var COMPLAINT_IMPORT_COLUMNS = [
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
];
function text(value) {
  if (value === void 0 || value === null) return "";
  return String(value).trim();
}
function parseDate(value) {
  const raw = text(value);
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (serial > 2e4 && serial < 6e4) return new Date(Math.round((serial - 25569) * 864e5));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
async function loadMasters() {
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
function normalise(row, index, masters) {
  const issues = [];
  const push = (field, message) => issues.push({ row: index, field, message });
  const type = text(row.Type) || "External";
  if (!COMPLAINT_TYPES.includes(type)) push("Type", "Must be External or Internal");
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
  const owner = ownerUsername ? masters.users.get(ownerUsername) : void 0;
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
    internalDept: type === "Internal" ? internalDept : void 0,
    againstDept: type === "Internal" ? againstDept : void 0,
    owner,
    source: text(row.Source),
    reportedBy: text(row["Reported By"]),
    description
  };
}
async function detectDuplicates(rows) {
  const map = /* @__PURE__ */ new Map();
  const valid = rows.filter((row) => row.issues.length === 0 && row.company && row.receivedAt);
  if (valid.length === 0) return map;
  const config = await resolveTatConfig(null);
  const companies = [...new Set(valid.map((row) => String(row.company)))];
  const cutoff = new Date(Date.now() - config.repeatWindowDays * 864e5);
  const existing = await Complaint.find({ company: { $in: companies }, receivedAt: { $gte: cutoff } }).select("number company customer product category receivedAt").lean();
  valid.forEach((row) => {
    const matches = findRepeatMatches(
      {
        id: `row-${row.index}`,
        companyId: String(row.company),
        customer: row.customer,
        product: row.product,
        category: row.category,
        receivedAt: row.receivedAt.toISOString()
      },
      existing.map((entry) => ({
        id: String(entry._id),
        companyId: String(entry.company),
        customer: entry.customer ?? void 0,
        product: entry.product ?? void 0,
        category: entry.category ?? void 0,
        receivedAt: entry.receivedAt.toISOString()
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
async function previewComplaintImport(rows, user) {
  const actor = await requireActor(user);
  if (!actor.permissions.includes("*") && !actor.permissions.includes("complaint.create")) {
    throw httpError(403, "You do not have permission to import complaints");
  }
  if (rows.length === 0) throw businessRuleError("The uploaded sheet has no data rows", [{ field: "file", message: "No rows were found" }]);
  if (rows.length > 2e3) throw businessRuleError("Too many rows in one import", [{ field: "file", message: "Import at most 2000 rows at a time" }]);
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
async function commitComplaintImport(rows, strategy, user) {
  const actor = await requireActor(user);
  if (!actor.permissions.includes("*") && !actor.permissions.includes("complaint.create")) {
    throw httpError(403, "You do not have permission to import complaints");
  }
  const masters = await loadMasters();
  const normalised = rows.map((row, index) => normalise(row, index + 2, masters));
  const duplicates = await detectDuplicates(normalised);
  const created = [];
  const skipped = [];
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
    const number = await nextComplaintNumber(row.company, row.receivedAt);
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
      owner: row.owner ?? new Types10.ObjectId(actor.id),
      createdBy: new Types10.ObjectId(actor.id),
      isRepeat: isDuplicate,
      repeatBasis: isDuplicate ? "Flagged during Excel import" : "",
      workflowLog: [{ stage: "Registered", at: /* @__PURE__ */ new Date(), by: new Types10.ObjectId(actor.id), byName: actor.name, notes: "Imported from Excel" }]
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
function assertLegacyShape(payload) {
  if (!payload || typeof payload !== "object") {
    throw businessRuleError("The backup file could not be read", [{ field: "file", message: "Expected a JSON object" }]);
  }
  const database = payload;
  if (!Array.isArray(database.complaints)) {
    throw businessRuleError("This does not look like a prototype export", [
      { field: "complaints", message: "The file has no complaints array" }
    ]);
  }
  return database;
}
async function migrateLegacyDatabase(payload, options, user) {
  const actor = await requireActor(user);
  if (!isMasterAdmin(actor)) throw httpError(403, "Only a Master Admin can run a migration");
  const database = assertLegacyShape(payload);
  const warnings = [];
  const report = {
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
  const companyByLegacyId = /* @__PURE__ */ new Map();
  (database.companies ?? []).forEach((legacy) => {
    const match = companies.find(
      (entry) => entry.code.toUpperCase() === (legacy.code ?? "").toUpperCase() || entry.complaintNumberingPrefix === legacy.numberingPrefix
    );
    if (match) companyByLegacyId.set(legacy.id, match._id);
    else warnings.push(`No company matches legacy company ${legacy.code ?? legacy.id}. Its complaints will be skipped.`);
  });
  const deptByName = new Map(departments.map((entry) => [entry.name.toLowerCase(), entry._id]));
  const priorityByLegacyId = /* @__PURE__ */ new Map();
  (database.priorities ?? []).forEach((legacy) => {
    const match = priorities.find((entry) => entry.name.toLowerCase() === (legacy.name ?? "").toLowerCase());
    if (match) priorityByLegacyId.set(legacy.id, match._id);
  });
  const fallbackPriority = priorities.find((entry) => entry.name === "Medium") ?? priorities[0];
  const userByLegacyId = /* @__PURE__ */ new Map();
  (database.users ?? []).forEach((legacy) => {
    const match = users.find((entry) => entry.username === (legacy.username ?? "").toLowerCase());
    if (match) userByLegacyId.set(legacy.id, match._id);
  });
  const existingNumbers = new Set((await Complaint.find().select("number").lean()).map((entry) => entry.number));
  const legacyToNewComplaint = /* @__PURE__ */ new Map();
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
      number: number || await nextComplaintNumber(company, receivedAt),
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
      owner: userByLegacyId.get(String(legacy.ownerId ?? "")) ?? new Types10.ObjectId(actor.id),
      createdBy: new Types10.ObjectId(actor.id),
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
      d2: legacy.d2 ?? {},
      fiveWhy: legacy.fivewhy ?? {},
      fishbone: legacy.fishbone ?? {},
      workflowLog: [
        { stage: "Migrated", at: /* @__PURE__ */ new Date(), by: new Types10.ObjectId(actor.id), byName: actor.name, notes: "Imported from the prototype export" }
      ]
    });
    legacyToNewComplaint.set(legacyId, { id: created._id, number: created.number });
    existingNumbers.add(created.number);
    report.complaintsCreated += 1;
    const attachmentIds = Array.isArray(legacy.attachmentIds) ? legacy.attachmentIds : [];
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
          uploadedBy: new Types10.ObjectId(actor.id)
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
      const sequence = await Capa.countDocuments({ complaint: parent.id }) + 1;
      const complaint = await Complaint.findById(parent.id).select("company responsibleDept priority").lean();
      if (!complaint) continue;
      await Capa.create({
        number: String(legacy.number ?? await nextCapaNumber(complaint.company, parent.number, sequence)),
        complaint: parent.id,
        company: complaint.company,
        sequence,
        type: String(legacy.type ?? "Corrective"),
        action: String(legacy.action ?? "Migrated action"),
        owner: userByLegacyId.get(String(legacy.ownerId ?? "")) ?? new Types10.ObjectId(actor.id),
        department: complaint.responsibleDept,
        priority: complaint.priority,
        assignedAt: legacy.assignedAt ? new Date(String(legacy.assignedAt)) : /* @__PURE__ */ new Date(),
        dueDate: legacy.dueDate ? new Date(String(legacy.dueDate)) : /* @__PURE__ */ new Date(),
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

// server/services/system-backup.service.ts
import { Types as Types11 } from "mongoose";
import { z as z13 } from "zod";
var recordSchema = z13.record(z13.unknown());
var systemBackupSchema = z13.object({
  format: z13.literal("ONEPWS_COMPLAINT_CAPA_BACKUP"),
  version: z13.literal(2),
  generatedAt: z13.string(),
  data: z13.object({
    companies: z13.array(recordSchema),
    departments: z13.array(recordSchema),
    employees: z13.array(recordSchema),
    categories: z13.array(recordSchema),
    priorities: z13.array(recordSchema),
    delayReasons: z13.array(recordSchema),
    rootCauseCategories: z13.array(recordSchema),
    tatConfigurations: z13.array(recordSchema),
    escalationConfigurations: z13.array(recordSchema),
    numberingConfigurations: z13.array(recordSchema),
    emailTemplates: z13.array(recordSchema),
    complaints: z13.array(recordSchema),
    capas: z13.array(recordSchema),
    attachments: z13.array(recordSchema)
  })
});
var COLLECTION_KEYS = [
  "companies",
  "departments",
  "employees",
  "categories",
  "priorities",
  "delayReasons",
  "rootCauseCategories",
  "tatConfigurations",
  "escalationConfigurations",
  "numberingConfigurations",
  "emailTemplates",
  "complaints",
  "capas",
  "attachments"
];
function emptyCounts() {
  return Object.fromEntries(COLLECTION_KEYS.map((key) => [key, 0]));
}
function idOf(record) {
  const raw = record._id;
  return raw && Types11.ObjectId.isValid(String(raw)) ? String(raw) : "";
}
function stringField(record, key) {
  const value = record[key];
  return typeof value === "string" ? value : value == null ? "" : String(value);
}
function safeRecord(record) {
  const copy = { ...record };
  delete copy.__v;
  return copy;
}
async function assertAdmin(user) {
  const actor = await requireActor(user);
  if (!isMasterAdmin(actor)) throw httpError(403, "Only a Master Admin can export or restore a system backup");
  return actor;
}
async function exportSystemBackup(user) {
  await assertAdmin(user);
  const [
    companies,
    departments,
    employees,
    categories,
    priorities,
    delayReasons,
    rootCauseCategories,
    tatConfigurations,
    escalationConfigurations,
    numberingConfigurations,
    emailTemplates,
    complaints,
    capas,
    attachments
  ] = await Promise.all([
    Company.find().lean(),
    Department.find().lean(),
    Employee.find().lean(),
    Category.find().lean(),
    Priority.find().lean(),
    DelayReason.find().lean(),
    RootCauseCategory.find().lean(),
    TATConfiguration.find().lean(),
    EscalationConfiguration.find().lean(),
    NumberingConfiguration.find().lean(),
    EmailTemplate.find().select("-createdBy -updatedBy").lean(),
    Complaint.find().lean(),
    Capa.find().lean(),
    Attachment.find().lean()
  ]);
  const backup = {
    format: "ONEPWS_COMPLAINT_CAPA_BACKUP",
    version: 2,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    data: {
      companies,
      departments,
      employees,
      categories,
      priorities,
      delayReasons,
      rootCauseCategories,
      tatConfigurations,
      escalationConfigurations,
      numberingConfigurations,
      emailTemplates,
      complaints,
      capas,
      attachments
    }
  };
  await writeAudit({
    actor: user,
    action: "EXPORT",
    entity: "SystemBackup",
    metadata: Object.fromEntries(COLLECTION_KEYS.map((key) => [key, backup.data[key].length]))
  });
  return backup;
}
async function restoreCompany(record, dryRun) {
  const id2 = idOf(record);
  const code = stringField(record, "code");
  if (!id2 || !code) return "conflict";
  if (await Company.exists({ $or: [{ _id: id2 }, { code }] })) return "existing";
  if (!dryRun) await Company.create(safeRecord(record));
  return "inserted";
}
async function restoreDepartment(record, dryRun) {
  const id2 = idOf(record);
  const name2 = stringField(record, "name");
  if (!id2 || !name2) return "conflict";
  if (await Department.exists({ _id: id2 })) return "existing";
  if (!dryRun) await Department.create(safeRecord(record));
  return "inserted";
}
async function restoreEmployee(record, dryRun) {
  const id2 = idOf(record);
  const employeeCode = stringField(record, "employeeCode");
  if (!id2 || !employeeCode) return "conflict";
  if (await Employee.exists({ $or: [{ _id: id2 }, { employeeCode }] })) return "existing";
  if (!dryRun) await Employee.create(safeRecord(record));
  return "inserted";
}
async function restoreCategory(record, dryRun) {
  const id2 = idOf(record);
  const name2 = stringField(record, "name");
  const complaintType = stringField(record, "complaintType");
  if (!id2 || !name2 || !complaintType) return "conflict";
  if (await Category.exists({ _id: id2 })) return "existing";
  if (!dryRun) await Category.create(safeRecord(record));
  return "inserted";
}
async function restorePriority(record, dryRun) {
  const id2 = idOf(record);
  const name2 = stringField(record, "name");
  if (!id2 || !name2) return "conflict";
  if (await Priority.exists({ $or: [{ _id: id2 }, { name: name2 }] })) return "existing";
  if (!dryRun) await Priority.create(safeRecord(record));
  return "inserted";
}
async function restoreDelayReason(record, dryRun) {
  const id2 = idOf(record);
  const name2 = stringField(record, "name");
  if (!id2 || !name2) return "conflict";
  if (await DelayReason.exists({ $or: [{ _id: id2 }, { name: name2 }] })) return "existing";
  if (!dryRun) await DelayReason.create(safeRecord(record));
  return "inserted";
}
async function restoreRootCause(record, dryRun) {
  const id2 = idOf(record);
  const name2 = stringField(record, "name");
  if (!id2 || !name2) return "conflict";
  if (await RootCauseCategory.exists({ $or: [{ _id: id2 }, { name: name2 }] })) return "existing";
  if (!dryRun) await RootCauseCategory.create(safeRecord(record));
  return "inserted";
}
async function restoreConfiguration(key, record, dryRun) {
  const id2 = idOf(record);
  if (!id2) return "conflict";
  const company = record.company ?? null;
  if (key === "tatConfigurations") {
    if (await TATConfiguration.exists({ $or: [{ _id: id2 }, { company }] })) return "existing";
    if (!dryRun) await TATConfiguration.create(safeRecord(record));
  } else if (key === "escalationConfigurations") {
    if (await EscalationConfiguration.exists({ $or: [{ _id: id2 }, { company }] })) return "existing";
    if (!dryRun) await EscalationConfiguration.create(safeRecord(record));
  } else {
    if (await NumberingConfiguration.exists({ $or: [{ _id: id2 }, { company }] })) return "existing";
    if (!dryRun) await NumberingConfiguration.create(safeRecord(record));
  }
  return "inserted";
}
async function restoreEmailTemplate(record, dryRun) {
  const id2 = idOf(record);
  const templateKey = stringField(record, "templateKey");
  if (!id2 || !templateKey) return "conflict";
  if (await EmailTemplate.exists({ $or: [{ _id: id2 }, { templateKey }] })) return "existing";
  if (!dryRun) await EmailTemplate.create(safeRecord(record));
  return "inserted";
}
async function restoreComplaint(record, dryRun) {
  const id2 = idOf(record);
  const number = stringField(record, "number");
  if (!id2 || !number) return "conflict";
  if (await Complaint.exists({ $or: [{ _id: id2 }, { number }] })) return "existing";
  const company = stringField(record, "company");
  if (!company || !await Company.exists({ _id: company })) return "conflict";
  if (!dryRun) await Complaint.create(safeRecord(record));
  return "inserted";
}
async function restoreCapa(record, dryRun) {
  const id2 = idOf(record);
  const number = stringField(record, "number");
  if (!id2 || !number) return "conflict";
  if (await Capa.exists({ $or: [{ _id: id2 }, { number }] })) return "existing";
  const complaint = stringField(record, "complaint");
  if (!complaint || !await Complaint.exists({ _id: complaint })) return "conflict";
  if (!dryRun) await Capa.create(safeRecord(record));
  return "inserted";
}
async function restoreAttachment(record, dryRun) {
  const id2 = idOf(record);
  const publicId = stringField(record, "publicId");
  if (!id2 || !publicId) return "conflict";
  if (await Attachment.exists({ $or: [{ _id: id2 }, { publicId }] })) return "existing";
  if (!dryRun) await Attachment.create(safeRecord(record));
  return "inserted";
}
async function restoreOne(key, record, dryRun) {
  switch (key) {
    case "companies":
      return restoreCompany(record, dryRun);
    case "departments":
      return restoreDepartment(record, dryRun);
    case "employees":
      return restoreEmployee(record, dryRun);
    case "categories":
      return restoreCategory(record, dryRun);
    case "priorities":
      return restorePriority(record, dryRun);
    case "delayReasons":
      return restoreDelayReason(record, dryRun);
    case "rootCauseCategories":
      return restoreRootCause(record, dryRun);
    case "tatConfigurations":
    case "escalationConfigurations":
    case "numberingConfigurations":
      return restoreConfiguration(key, record, dryRun);
    case "emailTemplates":
      return restoreEmailTemplate(record, dryRun);
    case "complaints":
      return restoreComplaint(record, dryRun);
    case "capas":
      return restoreCapa(record, dryRun);
    case "attachments":
      return restoreAttachment(record, dryRun);
  }
}
async function restoreSystemBackup(payload, options, user) {
  await assertAdmin(user);
  const parsed = systemBackupSchema.safeParse(payload);
  if (!parsed.success) {
    throw businessRuleError("Backup validation failed", parsed.error.issues.slice(0, 20).map((issue) => ({
      field: issue.path.join(".") || "backup",
      message: issue.message
    })));
  }
  if (!options.dryRun && options.confirmation !== "RESTORE_MERGE") {
    throw businessRuleError("Restore confirmation is required", [{ field: "confirmation", message: "Type RESTORE_MERGE to perform a merge-only restore" }]);
  }
  const result = {
    dryRun: options.dryRun,
    mode: "merge-only",
    inserted: emptyCounts(),
    skippedExisting: emptyCounts(),
    conflicts: []
  };
  for (const key of COLLECTION_KEYS) {
    for (const record of parsed.data.data[key]) {
      try {
        const status = await restoreOne(key, record, options.dryRun);
        if (status === "inserted") result.inserted[key] += 1;
        else if (status === "existing") result.skippedExisting[key] += 1;
        else result.conflicts.push({ collection: key, identifier: idOf(record) || "unknown", reason: "Missing required identifier or referenced parent record" });
      } catch (error) {
        result.conflicts.push({
          collection: key,
          identifier: idOf(record) || "unknown",
          reason: error instanceof Error ? error.message : "Record could not be restored"
        });
      }
    }
  }
  await writeAudit({
    actor: user,
    action: options.dryRun ? "RESTORE_PREVIEW" : "IMPORT",
    entity: "SystemBackup",
    metadata: { mode: result.mode, dryRun: result.dryRun, inserted: result.inserted, skippedExisting: result.skippedExisting, conflicts: result.conflicts.length }
  });
  return result;
}

// server/routes/import.routes.ts
var importRouter = Router9();
importRouter.use(requireUser);
var rowsSchema = z14.object({
  rows: z14.array(z14.record(z14.union([z14.string(), z14.number(), z14.undefined()]))).max(2e3)
});
importRouter.get(
  "/template",
  asyncHandler(async (_req, res) => {
    return ok(res, {
      columns: COMPLAINT_IMPORT_COLUMNS,
      sample: {
        Type: "External",
        "Company Code": "ONEPWS",
        "Received Date": (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
        Priority: "Medium",
        Category: "Product quality issue",
        Customer: "Example Customer Ltd",
        Product: "Workstation",
        "Responsible Department": "Production",
        "Owner Username": "",
        Description: "Describe the complaint in at least ten characters"
      }
    });
  })
);
importRouter.post(
  "/complaints/preview",
  requirePermission("complaint.create"),
  asyncHandler(async (req, res) => {
    const input = rowsSchema.parse(req.body);
    await connectDB();
    return ok(res, await previewComplaintImport(input.rows, req.user));
  })
);
importRouter.post(
  "/complaints/commit",
  requirePermission("complaint.create"),
  asyncHandler(async (req, res) => {
    const input = rowsSchema.extend({ strategy: z14.enum(["skip-duplicates", "import-and-flag"]).default("skip-duplicates") }).parse(req.body);
    await connectDB();
    return ok(res, await commitComplaintImport(input.rows, input.strategy, req.user), 201);
  })
);
importRouter.get(
  "/backup",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    await connectDB();
    return ok(res, await exportSystemBackup(req.user));
  })
);
importRouter.post(
  "/restore",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = z14.object({
      payload: z14.unknown(),
      dryRun: z14.boolean().default(true),
      confirmation: z14.string().optional()
    }).parse(req.body);
    await connectDB();
    return ok(res, await restoreSystemBackup(input.payload, { dryRun: input.dryRun, confirmation: input.confirmation }, req.user));
  })
);
importRouter.post(
  "/legacy",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = z14.object({
      payload: z14.unknown(),
      dryRun: z14.boolean().default(true),
      confirmation: z14.string().optional()
    }).parse(req.body);
    await connectDB();
    const dryRun = input.dryRun || input.confirmation !== "MIGRATE";
    return ok(res, await migrateLegacyDatabase(input.payload, { dryRun }, req.user));
  })
);

// server/routes/master-admin.routes.ts
import { Router as Router10 } from "express";
import { z as z16 } from "zod";

// shared/schemas/master-data.ts
import { z as z15 } from "zod";

// shared/constants/permissions.ts
var PERMISSIONS = [
  "view.all",
  "view.company",
  "dash.all",
  "report.all",
  "export.all",
  "complaint.create",
  "complaint.edit",
  "complaint.edit.own",
  "complaint.edit.dept",
  "complaint.assign",
  "complaint.close",
  "complaint.delete",
  "capa.edit.own",
  "capa.approve.dept",
  "capa.verify",
  "capa.evidence.review",
  "8d.approve",
  "audit.view"
];
var ROLE_NAMES = [
  "Master Admin",
  "Management",
  "Complaint Coordinator",
  "Complaint Owner",
  "Department Head",
  "CAPA Owner",
  "Quality Head",
  "Sales / Customer Service",
  "Auditor",
  "Viewer"
];
var DEFAULT_ROLE_PERMISSIONS = {
  "Master Admin": ["*"],
  Management: ["view.all", "dash.all", "report.all", "export.all"],
  "Complaint Coordinator": ["complaint.create", "complaint.edit", "complaint.assign", "view.company"],
  "Complaint Owner": ["complaint.edit.own", "view.company"],
  "Department Head": ["complaint.edit.dept", "capa.approve.dept", "view.company"],
  "CAPA Owner": ["capa.edit.own", "view.company"],
  "Quality Head": ["complaint.close", "capa.verify", "capa.evidence.review", "view.company", "8d.approve"],
  "Sales / Customer Service": ["complaint.create", "view.company"],
  Auditor: ["view.all", "audit.view", "report.all"],
  Viewer: ["view.company"]
};

// shared/schemas/master-data.ts
var objectId = z15.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
var optionalObjectId = objectId.optional();
var permissionKeySchema = z15.union([z15.enum(PERMISSIONS), z15.literal("*")]);
var roleCreateSchema = z15.object({
  name: z15.enum(ROLE_NAMES),
  permissions: z15.array(permissionKeySchema).min(1),
  active: z15.boolean().default(true)
});
var companyCreateSchema = z15.object({
  name: z15.string().trim().min(2).max(160),
  code: z15.string().trim().min(2).max(24).toUpperCase(),
  logo: z15.object({
    secureUrl: z15.string().url(),
    publicId: z15.string().min(1)
  }).optional(),
  documentNumber: z15.string().trim().max(80).optional().default(""),
  revision: z15.string().trim().max(24).optional().default(""),
  effectiveDate: z15.coerce.date().optional(),
  complaintNumberingPrefix: z15.string().trim().min(2).max(40),
  active: z15.boolean().default(true)
});
var departmentCreateSchema = z15.object({
  name: z15.string().trim().min(2).max(120),
  code: z15.string().trim().max(24).optional().default(""),
  company: optionalObjectId,
  active: z15.boolean().default(true)
});
var employeeCreateSchema = z15.object({
  employeeCode: z15.string().trim().min(1).max(40),
  name: z15.string().trim().min(2).max(160),
  email: z15.string().trim().email().optional().or(z15.literal("")),
  designation: z15.string().trim().max(120).optional().default(""),
  department: objectId,
  company: objectId,
  managerName: z15.string().trim().max(160).optional().default(""),
  managerEmail: z15.string().trim().email().optional().or(z15.literal("")),
  hodName: z15.string().trim().max(160).optional().default(""),
  hodEmail: z15.string().trim().email().optional().or(z15.literal("")),
  linkedUser: optionalObjectId,
  active: z15.boolean().default(true)
});
var userCreateSchema = z15.object({
  name: z15.string().trim().min(2).max(160),
  username: z15.string().trim().min(3).max(80).toLowerCase(),
  email: z15.string().trim().email().optional().or(z15.literal("")),
  password: passwordSchema,
  role: objectId,
  companyIds: z15.array(objectId).default([]),
  department: optionalObjectId,
  employee: optionalObjectId,
  active: z15.boolean().default(true),
  forcePasswordChange: z15.boolean().default(true)
});
var userUpdateSchema = userCreateSchema.partial().omit({ password: true }).strict();

// server/routes/master-admin.routes.ts
var masterAdminRouter = Router10();
masterAdminRouter.use(requireUser);
function escapeRegex(term) {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
masterAdminRouter.get(
  "/employees",
  requirePermission("view.company"),
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.extend({ company: z16.string().optional(), active: z16.coerce.boolean().optional() }).parse(req.query);
    await connectDB();
    const filter = {};
    if (query.company) filter.company = query.company;
    if (typeof query.active === "boolean") filter.active = query.active;
    if (query.search) {
      const regex = new RegExp(escapeRegex(query.search), "i");
      filter.$or = [{ name: regex }, { employeeCode: regex }, { email: regex }, { designation: regex }];
    }
    const [rows, total] = await Promise.all([
      Employee.find(filter).populate("company", "name code").populate("department", "name").sort({ name: 1 }).skip((query.page - 1) * query.pageSize).limit(query.pageSize).lean(),
      Employee.countDocuments(filter)
    ]);
    return ok(res, paginate(rows, total, query));
  })
);
masterAdminRouter.patch(
  "/employees/:id",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = employeeCreateSchema.partial().parse(req.body);
    await connectDB();
    const before = await Employee.findById(req.params.id).lean();
    if (!before) throw httpError(404, "Employee not found");
    const employee = await Employee.findByIdAndUpdate(req.params.id, input, { new: true });
    await writeAudit({ actor: req.user, action: "MASTER_DATA_CHANGE", entity: "Employee", entityId: req.params.id, before, after: input });
    return ok(res, { employee });
  })
);
masterAdminRouter.post(
  "/employees/bulk",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = z16.object({ employees: z16.array(employeeCreateSchema).max(1e3) }).parse(req.body);
    await connectDB();
    let created = 0;
    let updated = 0;
    for (const employee of input.employees) {
      const existing = await Employee.findOne({ employeeCode: employee.employeeCode });
      if (existing) {
        await Employee.updateOne({ _id: existing._id }, employee);
        updated += 1;
      } else {
        await Employee.create(employee);
        created += 1;
      }
    }
    await writeAudit({ actor: req.user, action: "IMPORT", entity: "Employee", metadata: { created, updated } });
    return ok(res, { created, updated }, 201);
  })
);
masterAdminRouter.get(
  "/companies",
  requirePermission("view.company"),
  asyncHandler(async (_req, res) => {
    await connectDB();
    return ok(res, { companies: await Company.find().sort({ name: 1 }).lean() });
  })
);
masterAdminRouter.patch(
  "/companies/:id",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = companyCreateSchema.partial().parse(req.body);
    await connectDB();
    const before = await Company.findById(req.params.id).lean();
    if (!before) throw httpError(404, "Company not found");
    const company = await Company.findByIdAndUpdate(req.params.id, input, { new: true });
    await writeAudit({ actor: req.user, action: "MASTER_DATA_CHANGE", entity: "Company", entityId: req.params.id, before, after: input });
    return ok(res, { company });
  })
);
masterAdminRouter.patch(
  "/departments/:id",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = departmentCreateSchema.partial().parse(req.body);
    await connectDB();
    const before = await Department.findById(req.params.id).lean();
    if (!before) throw httpError(404, "Department not found");
    const department = await Department.findByIdAndUpdate(req.params.id, input, { new: true });
    await writeAudit({ actor: req.user, action: "MASTER_DATA_CHANGE", entity: "Department", entityId: req.params.id, before, after: input });
    return ok(res, { department });
  })
);
masterAdminRouter.patch(
  "/roles/:id",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = z16.object({ permissions: z16.array(permissionKeySchema).min(1), active: z16.boolean().optional() }).parse(req.body);
    await connectDB();
    const before = await Role.findById(req.params.id).lean();
    if (!before) throw httpError(404, "Role not found");
    const role = await Role.findByIdAndUpdate(req.params.id, input, { new: true });
    await writeAudit({ actor: req.user, action: "MASTER_DATA_CHANGE", entity: "Role", entityId: req.params.id, before, after: input });
    return ok(res, { role });
  })
);
masterAdminRouter.post(
  "/users/:id/reset-access",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    await connectDB();
    const user = await User.findById(req.params.id).select("+passwordResetTokenHash +passwordResetExpires +failedLoginCount +lockedUntil");
    if (!user) throw httpError(404, "User not found");
    const token = randomToken();
    user.passwordResetTokenHash = sha256(token);
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1e3);
    user.forcePasswordChange = true;
    user.failedLoginCount = 0;
    user.lockedUntil = void 0;
    await user.save();
    let emailed = false;
    let emailStatus = "skipped";
    if (user.email) {
      const baseUrl = getEnv().APP_BASE_URL || `${req.protocol}://${req.get("host") || "localhost:5173"}`;
      const resetUrl = new URL(`/reset-password?token=${token}`, baseUrl).toString();
      const result = await sendTemplatedEmail({
        triggerEvent: "PASSWORD_RESET_REQUESTED",
        recipients: [user.email],
        data: { recipientName: user.name, resetUrl, expiresInHours: "1" },
        sentBySystem: false
      });
      emailStatus = result.status;
      emailed = result.status === "sent";
    }
    await writeAudit({ actor: req.user, action: "UPDATE", entity: "User", entityId: req.params.id, after: { accessReset: true, emailStatus } });
    return ok(res, { reset: true, emailed, emailStatus, hasEmail: Boolean(user.email) });
  })
);

// server/routes/master.routes.ts
import { Router as Router11 } from "express";

// server/models/Permission.ts
import mongoose19, { Schema as Schema17 } from "mongoose";
var PermissionSchema = new Schema17(
  {
    key: { type: String, required: true, unique: true, trim: true, index: true },
    label: { type: String, required: true, trim: true },
    group: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);
var Permission = mongoose19.models.Permission || mongoose19.model("Permission", PermissionSchema);

// server/routes/master.routes.ts
var masterRouter = Router11();
masterRouter.use(requireUser);
masterRouter.get(
  "/bootstrap",
  requirePermission("view.company"),
  asyncHandler(async (_req, res) => {
    await connectDB();
    const [companies, departments, roles, permissions, employees] = await Promise.all([
      Company.find().sort({ name: 1 }).lean(),
      Department.find().sort({ name: 1 }).lean(),
      Role.find().sort({ name: 1 }).lean(),
      Permission.find().sort({ key: 1 }).lean(),
      Employee.find().sort({ name: 1 }).limit(500).lean()
    ]);
    return ok(res, { companies, departments, roles, permissions, employees });
  })
);
masterRouter.post(
  "/seed-permissions",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    await connectDB();
    await Permission.bulkWrite(
      PERMISSIONS.map((key) => ({
        updateOne: {
          filter: { key },
          update: { $setOnInsert: { key, label: key, group: key.split(".")[0], active: true } },
          upsert: true
        }
      }))
    );
    await Role.bulkWrite(
      Object.entries(DEFAULT_ROLE_PERMISSIONS).map(([name2, permissions]) => ({
        updateOne: { filter: { name: name2 }, update: { $setOnInsert: { name: name2, permissions, active: true } }, upsert: true }
      }))
    );
    await writeAudit({ actor: req.user, action: "UPSERT_DEFAULTS", entity: "Permission" });
    return ok(res, { seeded: true });
  })
);
masterRouter.get(
  "/users",
  requirePermission("view.all"),
  asyncHandler(async (_req, res) => {
    await connectDB();
    const users = await User.find().populate("role").sort({ createdAt: -1 }).lean();
    return ok(res, { users: users.map((user) => sanitizeUser(user)) });
  })
);
masterRouter.post(
  "/users",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = userCreateSchema.parse(req.body);
    await connectDB();
    const passwordHash = await hashPassword(input.password);
    const { password: _password, ...safeInput } = input;
    const user = await User.create({ ...safeInput, passwordHash, passwordChangedAt: /* @__PURE__ */ new Date() });
    await writeAudit({ actor: req.user, action: "CREATE", entity: "User", entityId: String(user._id), after: { username: user.username } });
    const populated = await user.populate("role");
    if (user.email) {
      await sendTemplatedEmail({
        triggerEvent: "USER_CREATED",
        recipients: [user.email],
        data: {
          recipientName: user.name,
          username: user.username,
          roleName: populated.role && typeof populated.role === "object" && "name" in populated.role ? String(populated.role.name) : "Portal User"
        },
        sentBySystem: false
      });
    }
    return ok(res, { user: sanitizeUser(populated) }, 201);
  })
);
masterRouter.patch(
  "/users/:id",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = userUpdateSchema.parse(req.body);
    await connectDB();
    const before = await User.findById(req.params.id).lean();
    if (!before) throw httpError(404, "User not found");
    const user = await User.findByIdAndUpdate(req.params.id, input, { new: true }).populate("role");
    if (!user) throw httpError(404, "User not found");
    await writeAudit({
      actor: req.user,
      action: "UPDATE",
      entity: "User",
      entityId: req.params.id,
      before,
      after: { username: user.username, active: user.active, role: String(user.role) }
    });
    return ok(res, { user: sanitizeUser(user) });
  })
);
masterRouter.post(
  "/companies",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = companyCreateSchema.parse(req.body);
    await connectDB();
    const company = await Company.create(input);
    await writeAudit({ actor: req.user, action: "CREATE", entity: "Company", entityId: String(company._id), after: input });
    return ok(res, { company }, 201);
  })
);
masterRouter.post(
  "/departments",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = departmentCreateSchema.parse(req.body);
    await connectDB();
    const department = await Department.create(input);
    await writeAudit({ actor: req.user, action: "CREATE", entity: "Department", entityId: String(department._id), after: input });
    return ok(res, { department }, 201);
  })
);
masterRouter.post(
  "/employees",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = employeeCreateSchema.parse(req.body);
    await connectDB();
    const employee = await Employee.create(input);
    await writeAudit({ actor: req.user, action: "CREATE", entity: "Employee", entityId: String(employee._id), after: input });
    return ok(res, { employee }, 201);
  })
);

// server/routes/notification.routes.ts
import { Router as Router12 } from "express";
import { z as z17 } from "zod";
var notificationRouter = Router12();
notificationRouter.use(requireUser);
notificationRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z17.object({
      unreadOnly: z17.coerce.boolean().default(false),
      page: z17.coerce.number().int().min(1).default(1),
      pageSize: z17.coerce.number().int().min(1).max(100).default(25)
    }).parse(req.query);
    await connectDB();
    const result = await listNotifications(req.user.id, {
      unreadOnly: query.unreadOnly,
      limit: query.pageSize,
      skip: (query.page - 1) * query.pageSize
    });
    return ok(res, {
      items: result.items,
      unread: result.unread,
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
      totalPages: Math.max(1, Math.ceil(result.total / query.pageSize))
    });
  })
);
notificationRouter.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    await connectDB();
    const notification = await markRead(req.user.id, req.params.id);
    if (!notification) throw httpError(404, "Notification not found");
    return ok(res, { notification });
  })
);
notificationRouter.post(
  "/read-all",
  asyncHandler(async (req, res) => {
    await connectDB();
    return ok(res, { updated: await markAllRead(req.user.id) });
  })
);

// server/routes/email.routes.ts
import { Router as Router13 } from "express";

// shared/schemas/email.ts
import { z as z18 } from "zod";
var emailTemplateSchema = z18.object({
  templateKey: z18.string().min(2).max(100).regex(/^[a-z0-9-]+$/, "Template key must contain only lowercase letters, numbers, and hyphens"),
  templateName: z18.string().min(2).max(120),
  triggerEvent: z18.enum(EMAIL_TRIGGER_EVENTS),
  subject: z18.string().min(1).max(250),
  htmlBody: z18.string().min(1),
  textBody: z18.string().min(1),
  supportedVariables: z18.array(z18.string()).default([]),
  isActive: z18.boolean().default(true),
  allowedRolesToReceive: z18.array(z18.string()).default([]),
  ccRules: z18.array(z18.string()).default([]),
  bccRules: z18.array(z18.string()).default([])
});
var emailTemplateUpdateSchema = emailTemplateSchema.partial().omit({ templateKey: true });
var sendTestEmailSchema = z18.object({
  to: z18.string().email("Please provide a valid recipient email address"),
  subject: z18.string().optional(),
  message: z18.string().optional()
});
var templateTestSendSchema = z18.object({
  to: z18.string().email("Please provide a valid recipient email address"),
  sampleData: z18.record(z18.union([z18.string(), z18.number()])).optional()
});
var templatePreviewSchema = z18.object({
  htmlBody: z18.string().optional(),
  textBody: z18.string().optional(),
  subject: z18.string().optional(),
  sampleData: z18.record(z18.union([z18.string(), z18.number()])).optional()
});
var emailLogQuerySchema = z18.object({
  page: z18.coerce.number().min(1).default(1),
  pageSize: z18.coerce.number().min(1).max(100).default(20),
  status: z18.enum(["sent", "failed", "skipped", "all"]).optional().default("all"),
  triggerEvent: z18.string().optional(),
  templateKey: z18.string().optional(),
  recipient: z18.string().optional(),
  search: z18.string().optional(),
  startDate: z18.string().optional(),
  endDate: z18.string().optional()
});
var retryEmailSchema = z18.object({
  logId: z18.string().min(1, "Log ID is required")
});
var shareReportSchema = z18.object({
  complaintId: z18.string().min(1, "Complaint ID is required"),
  recipientEmail: z18.string().email("Valid recipient email is required"),
  recipientName: z18.string().min(1, "Recipient name is required"),
  notes: z18.string().optional()
});

// server/services/escalation.service.ts
function getActiveStage(c) {
  if (!c.acknowledgedAt) return "ack";
  if (!c.containmentAt) return "cont";
  if (!c.rcaAt) return "rca";
  if (!c.capaAssignedAt) return "capa";
  return null;
}
async function processEscalations() {
  await connectDB();
  let complaintsEscalated = 0;
  let capasEscalated = 0;
  const now = /* @__PURE__ */ new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const [escalationConfig, tatConfigDoc] = await Promise.all([
    EscalationConfiguration.findOne({ company: null, active: true }).lean(),
    TATConfiguration.findOne({ company: null }).lean()
  ]);
  const levels = escalationConfig?.levels && escalationConfig.levels.length > 0 ? escalationConfig.levels : [...DEFAULT_ESCALATION_LEVELS];
  const sortedLevels = [...levels].sort((a, b) => a.triggerHoursOverdue - b.triggerHoursOverdue);
  const tatConfig = {
    ackHours: tatConfigDoc?.ackHours ?? DEFAULT_TAT_CONFIG.ackHours,
    containmentDays: tatConfigDoc?.containmentDays ?? DEFAULT_TAT_CONFIG.containmentDays,
    rcaDays: tatConfigDoc?.rcaDays ?? DEFAULT_TAT_CONFIG.rcaDays,
    capaDays: tatConfigDoc?.capaDays ?? DEFAULT_TAT_CONFIG.capaDays,
    d3ContainmentDays: tatConfigDoc?.d3ContainmentDays ?? DEFAULT_TAT_CONFIG.d3ContainmentDays,
    d5CorrectiveActionDays: tatConfigDoc?.d5CorrectiveActionDays ?? DEFAULT_TAT_CONFIG.d5CorrectiveActionDays,
    d6VerificationDays: tatConfigDoc?.d6VerificationDays ?? DEFAULT_TAT_CONFIG.d6VerificationDays,
    d7ShortTermDays: tatConfigDoc?.d7ShortTermDays ?? DEFAULT_TAT_CONFIG.d7ShortTermDays,
    d7LongTermDays: tatConfigDoc?.d7LongTermDays ?? DEFAULT_TAT_CONFIG.d7LongTermDays,
    repeatWindowDays: tatConfigDoc?.repeatWindowDays ?? DEFAULT_TAT_CONFIG.repeatWindowDays,
    dueSoonHours: tatConfigDoc?.dueSoonHours ?? DEFAULT_TAT_CONFIG.dueSoonHours
  };
  const openComplaints = await Complaint.find({
    status: { $nin: ["Closed"] }
  }).populate("owner", "name email").populate("responsibleDept", "name").populate("priority", "name tatMultiplier").lean();
  for (const complaint of openComplaints) {
    const stage = getActiveStage(complaint);
    if (!stage) continue;
    const multiplier = complaint.priority?.tatMultiplier ?? 1;
    const stageDues = computeStageDueDates({ receivedAt: new Date(complaint.receivedAt).toISOString(), priorityMultiplier: multiplier }, tatConfig);
    const targetDate = stageDues[stage];
    if (now <= targetDate) {
      continue;
    }
    const overdueDurationMs = now.getTime() - targetDate.getTime();
    const overdueHours = Math.floor(overdueDurationMs / (1e3 * 60 * 60));
    let matchedLevel = null;
    for (const lvl of sortedLevels) {
      if (overdueHours >= lvl.triggerHoursOverdue) {
        matchedLevel = lvl;
      }
    }
    if (matchedLevel) {
      const dedupeKey = `ESCALATION_CMP_${complaint._id}_${stage}_L${matchedLevel.level}_${todayStr}`;
      let targetRoles = ["Complaint Owner"];
      if (matchedLevel.level === 2) {
        targetRoles = ["Complaint Owner", "Department Head"];
      } else if (matchedLevel.level === 3) {
        targetRoles = ["Complaint Owner", "Department Head", "Quality Head"];
      } else if (matchedLevel.level >= 4) {
        targetRoles = ["Complaint Owner", "Department Head", "Quality Head", "Management"];
      }
      const recipients = await resolveRecipients({
        complaintId: complaint._id,
        targetRoles
      });
      if (recipients.length > 0) {
        const res = await sendTemplatedEmail({
          triggerEvent: "TAT_ESCALATION",
          recipients,
          dedupeKey,
          relatedComplaintId: complaint._id,
          data: {
            complaintNumber: complaint.number,
            stage: stage.toUpperCase(),
            escalationLevel: `Level ${matchedLevel.level} (${matchedLevel.name})`,
            dueDate: targetDate.toLocaleDateString("en-IN"),
            overdueHours: String(overdueHours),
            departmentName: complaint.responsibleDept?.name || "General",
            ownerName: complaint.owner?.name || "Assigned Owner",
            priority: complaint.priority?.name || "Standard",
            actionUrl: `/complaints/${complaint._id}`
          }
        });
        if (res.status === "sent") complaintsEscalated++;
      }
    }
  }
  const overdueCapas = await Capa.find({
    status: { $nin: ["Closed", "Completed", "Under Verification"] },
    dueDate: { $lt: now }
  }).populate("owner", "name email").populate("complaint", "number").lean();
  for (const capa of overdueCapas) {
    if (!capa.dueDate) continue;
    const targetDate = new Date(capa.dueDate);
    const dedupeKey = `ESCALATION_CAPA_${capa._id}_${todayStr}`;
    const recipients = await resolveRecipients({
      capaId: capa._id,
      targetRoles: ["CAPA Owner", "Department Head"]
    });
    if (recipients.length > 0) {
      const res = await sendTemplatedEmail({
        triggerEvent: "CAPA_OVERDUE",
        recipients,
        dedupeKey,
        relatedCapaId: capa._id,
        data: {
          capaNumber: capa.number,
          assignedTo: capa.owner?.name || "CAPA Owner",
          targetDate: targetDate.toLocaleDateString("en-IN"),
          complaintNumber: capa.complaint?.number || "N/A",
          actionUrl: `/capa/tracker`
        }
      });
      if (res.status === "sent") capasEscalated++;
    }
  }
  return {
    complaintsChecked: openComplaints.length,
    complaintsEscalated,
    capasChecked: overdueCapas.length,
    capasEscalated
  };
}

// server/routes/email.routes.ts
var emailRouter = Router13();
function isMasterAdmin2(req) {
  return req.user?.role?.name === "Master Admin";
}
function assertMasterAdmin(req) {
  if (!isMasterAdmin2(req)) throw httpError(403, "Only Master Admin can access email administration");
}
emailRouter.get(
  "/settings",
  requireUser,
  asyncHandler(async (req, res) => {
    assertMasterAdmin(req);
    return ok(res, getSmtpStatus());
  })
);
emailRouter.post(
  "/settings/verify",
  requireUser,
  asyncHandler(async (req, res) => {
    assertMasterAdmin(req);
    return ok(res, await verifySmtpConnection());
  })
);
emailRouter.post(
  "/settings/test",
  requireUser,
  asyncHandler(async (req, res) => {
    assertMasterAdmin(req);
    const input = sendTestEmailSchema.parse(req.body);
    return ok(res, await sendRawTestEmail(input));
  })
);
emailRouter.get(
  "/templates",
  requireUser,
  asyncHandler(async (req, res) => {
    assertMasterAdmin(req);
    const triggerEvent = typeof req.query.triggerEvent === "string" ? req.query.triggerEvent : void 0;
    const activeOnly = req.query.activeOnly === "true";
    const search = typeof req.query.search === "string" ? req.query.search : void 0;
    return ok(res, await listEmailTemplates({ triggerEvent, activeOnly, search }));
  })
);
emailRouter.get(
  "/templates/:id",
  requireUser,
  asyncHandler(async (req, res) => {
    assertMasterAdmin(req);
    return ok(res, await getEmailTemplateById(req.params.id));
  })
);
emailRouter.post(
  "/templates",
  requireUser,
  asyncHandler(async (req, res) => {
    assertMasterAdmin(req);
    const input = emailTemplateSchema.parse(req.body);
    return ok(res, await createEmailTemplate(input, req.user?.id), 201);
  })
);
emailRouter.patch(
  "/templates/:id",
  requireUser,
  asyncHandler(async (req, res) => {
    assertMasterAdmin(req);
    const input = emailTemplateUpdateSchema.parse(req.body);
    return ok(res, await updateEmailTemplate(req.params.id, input, req.user?.id));
  })
);
emailRouter.post(
  "/templates/:id/preview",
  requireUser,
  asyncHandler(async (req, res) => {
    assertMasterAdmin(req);
    const input = templatePreviewSchema.parse(req.body);
    return ok(res, await previewEmailTemplate(req.params.id, input));
  })
);
emailRouter.post(
  "/templates/:id/test-send",
  requireUser,
  asyncHandler(async (req, res) => {
    assertMasterAdmin(req);
    const input = templateTestSendSchema.parse(req.body);
    const template = await getEmailTemplateById(req.params.id);
    return ok(
      res,
      await sendTemplatedEmail({
        triggerEvent: template.triggerEvent,
        recipients: [input.to],
        data: input.sampleData || {},
        sentBySystem: false
      })
    );
  })
);
emailRouter.get(
  "/logs",
  requireUser,
  asyncHandler(async (req, res) => {
    assertMasterAdmin(req);
    const query = emailLogQuerySchema.parse(req.query);
    return ok(res, await queryEmailLogs(query));
  })
);
emailRouter.get(
  "/logs/:id",
  requireUser,
  asyncHandler(async (req, res) => {
    assertMasterAdmin(req);
    return ok(res, await getEmailLogById(req.params.id));
  })
);
emailRouter.post(
  "/logs/retry",
  requireUser,
  asyncHandler(async (req, res) => {
    assertMasterAdmin(req);
    const input = retryEmailSchema.parse(req.body);
    return ok(res, await retryEmail(input.logId));
  })
);
emailRouter.post(
  "/escalation/run",
  requireUser,
  asyncHandler(async (req, res) => {
    assertMasterAdmin(req);
    return ok(res, await processEscalations());
  })
);
emailRouter.post(
  "/share-report",
  requireUser,
  asyncHandler(async (req, res) => {
    const input = shareReportSchema.parse(req.body);
    const permissions = req.user?.role?.permissions || [];
    const allowedToShare = permissions.includes("*") || permissions.includes("report.all") || permissions.includes("8d.approve") || permissions.includes("complaint.assign");
    if (!allowedToShare) throw httpError(403, "You do not have permission to share complaint reports");
    const context = await loadComplaintContext(input.complaintId, req.user);
    const complaint = context.doc;
    const appUrl = getAppUrl();
    const reportUrl = `${appUrl}/complaints/${complaint._id}`;
    const result = await sendTemplatedEmail({
      triggerEvent: "COMPLAINT_REPORT_SHARED",
      recipients: [input.recipientEmail],
      relatedComplaintId: complaint._id,
      sentBySystem: false,
      data: {
        sharedBy: req.user?.name || "Quality Team",
        recipientName: input.recipientName,
        complaintNumber: complaint.number,
        customerName: complaint.customer || "Customer",
        partName: complaint.product || "Component",
        status: complaint.status,
        notes: input.notes || "Please find the formal Quality 8D report linked below.",
        reportUrl
      }
    });
    return ok(res, result);
  })
);

// server/routes/cron.routes.ts
import { Router as Router14 } from "express";

// server/lib/cron-auth.ts
function requireCronAuth(req, _res, next) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) {
    throw httpError(500, "CRON_SECRET is not configured on the server");
  }
  const authHeader = req.headers.authorization;
  const headerSecret = req.headers["x-cron-secret"];
  const bearerSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const provided = (typeof headerSecret === "string" ? headerSecret.trim() : null) || bearerSecret;
  if (!provided || provided !== secret) {
    throw httpError(401, "Unauthorized cron execution");
  }
  next();
}

// server/services/reminder.service.ts
function getActiveStage2(c) {
  if (!c.acknowledgedAt) return "ack";
  if (!c.containmentAt) return "cont";
  if (!c.rcaAt) return "rca";
  if (!c.capaAssignedAt) return "capa";
  return null;
}
async function processReminders() {
  await connectDB();
  let complaintRemindersSent = 0;
  let capaRemindersSent = 0;
  const now = /* @__PURE__ */ new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const [escalationConfig, tatConfigDoc] = await Promise.all([
    EscalationConfiguration.findOne({ company: null }).lean(),
    TATConfiguration.findOne({ company: null }).lean()
  ]);
  const thresholds = escalationConfig?.reminderPercentages?.length ? escalationConfig.reminderPercentages : [...DEFAULT_REMINDER_PERCENTAGES];
  const tatConfig = {
    ackHours: tatConfigDoc?.ackHours ?? DEFAULT_TAT_CONFIG.ackHours,
    containmentDays: tatConfigDoc?.containmentDays ?? DEFAULT_TAT_CONFIG.containmentDays,
    rcaDays: tatConfigDoc?.rcaDays ?? DEFAULT_TAT_CONFIG.rcaDays,
    capaDays: tatConfigDoc?.capaDays ?? DEFAULT_TAT_CONFIG.capaDays,
    d3ContainmentDays: tatConfigDoc?.d3ContainmentDays ?? DEFAULT_TAT_CONFIG.d3ContainmentDays,
    d5CorrectiveActionDays: tatConfigDoc?.d5CorrectiveActionDays ?? DEFAULT_TAT_CONFIG.d5CorrectiveActionDays,
    d6VerificationDays: tatConfigDoc?.d6VerificationDays ?? DEFAULT_TAT_CONFIG.d6VerificationDays,
    d7ShortTermDays: tatConfigDoc?.d7ShortTermDays ?? DEFAULT_TAT_CONFIG.d7ShortTermDays,
    d7LongTermDays: tatConfigDoc?.d7LongTermDays ?? DEFAULT_TAT_CONFIG.d7LongTermDays,
    repeatWindowDays: tatConfigDoc?.repeatWindowDays ?? DEFAULT_TAT_CONFIG.repeatWindowDays,
    dueSoonHours: tatConfigDoc?.dueSoonHours ?? DEFAULT_TAT_CONFIG.dueSoonHours
  };
  const openComplaints = await Complaint.find({
    status: { $nin: ["Closed"] }
  }).populate("owner", "name email").populate("responsibleDept", "name").populate("priority", "name tatMultiplier").lean();
  for (const complaint of openComplaints) {
    const stage = getActiveStage2(complaint);
    if (!stage) continue;
    const multiplier = complaint.priority?.tatMultiplier ?? 1;
    const stageDues = computeStageDueDates({ receivedAt: new Date(complaint.receivedAt).toISOString(), priorityMultiplier: multiplier }, tatConfig);
    const targetDate = stageDues[stage];
    const receivedAt = new Date(complaint.receivedAt);
    const totalDurationMs = Math.max(1, targetDate.getTime() - receivedAt.getTime());
    const elapsedMs = now.getTime() - receivedAt.getTime();
    const elapsedPct = Math.round(elapsedMs / totalDurationMs * 100);
    const msUntilDue = targetDate.getTime() - now.getTime();
    const hoursUntilDue = msUntilDue / (1e3 * 60 * 60);
    for (const pct of thresholds) {
      if (elapsedPct >= pct && elapsedPct < 100) {
        const dedupeKey = `REMINDER_CMP_${complaint._id}_${stage}_${pct}`;
        const recipients = await resolveRecipients({
          complaintId: complaint._id,
          targetRoles: ["Complaint Owner", "Coordinator"]
        });
        if (recipients.length > 0) {
          const res = await sendTemplatedEmail({
            triggerEvent: "TAT_REMINDER",
            recipients,
            dedupeKey,
            relatedComplaintId: complaint._id,
            data: {
              complaintNumber: complaint.number,
              thresholdPct: String(pct),
              stage: stage.toUpperCase(),
              dueDate: targetDate.toLocaleDateString("en-IN"),
              ownerName: complaint.owner?.name || "Assigned Owner",
              priority: complaint.priority?.name || "Standard",
              actionUrl: `/complaints/${complaint._id}`
            }
          });
          if (res.status === "sent") complaintRemindersSent++;
        }
      }
    }
    if (hoursUntilDue > 0 && hoursUntilDue <= tatConfig.dueSoonHours) {
      const dedupeKey = `DUESOON_CMP_${complaint._id}_${stage}_${todayStr}`;
      const recipients = await resolveRecipients({
        complaintId: complaint._id,
        targetRoles: ["Complaint Owner", "Coordinator"]
      });
      if (recipients.length > 0) {
        const res = await sendTemplatedEmail({
          triggerEvent: "TAT_DUE_SOON",
          recipients,
          dedupeKey,
          relatedComplaintId: complaint._id,
          data: {
            complaintNumber: complaint.number,
            stage: stage.toUpperCase(),
            hoursLeft: String(Math.max(1, Math.round(hoursUntilDue))),
            dueDate: targetDate.toLocaleDateString("en-IN"),
            priority: complaint.priority?.name || "Standard",
            actionUrl: `/complaints/${complaint._id}`
          }
        });
        if (res.status === "sent") complaintRemindersSent++;
      }
    }
  }
  const openCapas = await Capa.find({
    status: { $nin: ["Closed", "Completed", "Under Verification"] }
  }).populate("owner", "name email").populate("complaint", "number").lean();
  for (const capa of openCapas) {
    if (!capa.dueDate) continue;
    const targetDate = new Date(capa.dueDate);
    const msUntilDue = targetDate.getTime() - now.getTime();
    const daysUntilDue = Math.round(msUntilDue / (1e3 * 60 * 60 * 24));
    if (daysUntilDue >= 0 && daysUntilDue <= 3) {
      const dedupeKey = `REMINDER_CAPA_${capa._id}_${todayStr}`;
      const recipients = await resolveRecipients({
        capaId: capa._id,
        targetRoles: ["CAPA Owner"]
      });
      if (recipients.length > 0) {
        const res = await sendTemplatedEmail({
          triggerEvent: "CAPA_DUE_REMINDER",
          recipients,
          dedupeKey,
          relatedCapaId: capa._id,
          data: {
            capaNumber: capa.number,
            capaTitle: capa.action || "Corrective Action",
            targetDate: targetDate.toLocaleDateString("en-IN"),
            assignedTo: capa.owner?.name || "CAPA Owner",
            actionUrl: `/capa/tracker`
          }
        });
        if (res.status === "sent") capaRemindersSent++;
      }
    }
  }
  return {
    complaintsChecked: openComplaints.length,
    complaintRemindersSent,
    capasChecked: openCapas.length,
    capaRemindersSent
  };
}

// server/services/summary.service.ts
function getActiveStage3(c) {
  if (!c.acknowledgedAt) return "ack";
  if (!c.containmentAt) return "cont";
  if (!c.rcaAt) return "rca";
  if (!c.capaAssignedAt) return "capa";
  return null;
}
async function processDailySummaries() {
  await connectDB();
  let sent = 0;
  const now = /* @__PURE__ */ new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const tatConfigDoc = await TATConfiguration.findOne({ company: null }).lean();
  const tatConfig = {
    ackHours: tatConfigDoc?.ackHours ?? DEFAULT_TAT_CONFIG.ackHours,
    containmentDays: tatConfigDoc?.containmentDays ?? DEFAULT_TAT_CONFIG.containmentDays,
    rcaDays: tatConfigDoc?.rcaDays ?? DEFAULT_TAT_CONFIG.rcaDays,
    capaDays: tatConfigDoc?.capaDays ?? DEFAULT_TAT_CONFIG.capaDays,
    d3ContainmentDays: tatConfigDoc?.d3ContainmentDays ?? DEFAULT_TAT_CONFIG.d3ContainmentDays,
    d5CorrectiveActionDays: tatConfigDoc?.d5CorrectiveActionDays ?? DEFAULT_TAT_CONFIG.d5CorrectiveActionDays,
    d6VerificationDays: tatConfigDoc?.d6VerificationDays ?? DEFAULT_TAT_CONFIG.d6VerificationDays,
    d7ShortTermDays: tatConfigDoc?.d7ShortTermDays ?? DEFAULT_TAT_CONFIG.d7ShortTermDays,
    d7LongTermDays: tatConfigDoc?.d7LongTermDays ?? DEFAULT_TAT_CONFIG.d7LongTermDays,
    repeatWindowDays: tatConfigDoc?.repeatWindowDays ?? DEFAULT_TAT_CONFIG.repeatWindowDays,
    dueSoonHours: tatConfigDoc?.dueSoonHours ?? DEFAULT_TAT_CONFIG.dueSoonHours
  };
  const companies = await Company.find({ active: true }).lean();
  const companyList = [...companies, { _id: null, name: "ONEPWS All-Plant Division" }];
  for (const comp of companyList) {
    const compFilter = comp._id ? { company: comp._id } : {};
    const [openComplaints, openCapas] = await Promise.all([
      Complaint.find({
        ...compFilter,
        status: { $nin: ["Closed"] }
      }).populate("priority", "tatMultiplier").lean(),
      Capa.find({
        ...compFilter,
        status: { $nin: ["Closed", "Completed", "Under Verification"] }
      }).lean()
    ]);
    let dueSoonCount = 0;
    let overdueCount = 0;
    for (const c of openComplaints) {
      const stage = getActiveStage3(c);
      if (!stage) continue;
      const multiplier = c.priority?.tatMultiplier ?? 1;
      const dues = computeStageDueDates({ receivedAt: new Date(c.receivedAt).toISOString(), priorityMultiplier: multiplier }, tatConfig);
      const target = dues[stage];
      if (target < now) {
        overdueCount++;
      } else if (target.getTime() - now.getTime() < 24 * 60 * 60 * 1e3) {
        dueSoonCount++;
      }
    }
    let capaOverdueCount = 0;
    for (const capa of openCapas) {
      if (capa.dueDate && new Date(capa.dueDate) < now) {
        capaOverdueCount++;
      }
    }
    const recipients = await resolveRecipients({
      companyId: comp._id || void 0,
      targetRoles: ["Quality Head", "Management", "Master Admin"]
    });
    if (recipients.length > 0) {
      const dedupeKey = `DAILY_SUMMARY_${comp._id || "GLOBAL"}_${todayStr}`;
      const res = await sendTemplatedEmail({
        triggerEvent: "DAILY_SUMMARY",
        recipients,
        dedupeKey,
        data: {
          companyName: comp.name,
          totalOpen: String(openComplaints.length),
          dueSoonCount: String(dueSoonCount),
          overdueCount: String(overdueCount),
          openCapasCount: String(openCapas.length),
          capaOverdueCount: String(capaOverdueCount)
        }
      });
      if (res.status === "sent") sent++;
    }
  }
  return { sent };
}
async function processWeeklySummaries() {
  await connectDB();
  let sent = 0;
  const now = /* @__PURE__ */ new Date();
  const weekNumber = Math.ceil(now.getDate() / 7);
  const periodStr = `Week ${weekNumber}, ${now.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}`;
  const dedupeWeekKey = `${now.getFullYear()}_W${weekNumber}`;
  const tatConfigDoc = await TATConfiguration.findOne({ company: null }).lean();
  const tatConfig = {
    ackHours: tatConfigDoc?.ackHours ?? DEFAULT_TAT_CONFIG.ackHours,
    containmentDays: tatConfigDoc?.containmentDays ?? DEFAULT_TAT_CONFIG.containmentDays,
    rcaDays: tatConfigDoc?.rcaDays ?? DEFAULT_TAT_CONFIG.rcaDays,
    capaDays: tatConfigDoc?.capaDays ?? DEFAULT_TAT_CONFIG.capaDays,
    d3ContainmentDays: tatConfigDoc?.d3ContainmentDays ?? DEFAULT_TAT_CONFIG.d3ContainmentDays,
    d5CorrectiveActionDays: tatConfigDoc?.d5CorrectiveActionDays ?? DEFAULT_TAT_CONFIG.d5CorrectiveActionDays,
    d6VerificationDays: tatConfigDoc?.d6VerificationDays ?? DEFAULT_TAT_CONFIG.d6VerificationDays,
    d7ShortTermDays: tatConfigDoc?.d7ShortTermDays ?? DEFAULT_TAT_CONFIG.d7ShortTermDays,
    d7LongTermDays: tatConfigDoc?.d7LongTermDays ?? DEFAULT_TAT_CONFIG.d7LongTermDays,
    repeatWindowDays: tatConfigDoc?.repeatWindowDays ?? DEFAULT_TAT_CONFIG.repeatWindowDays,
    dueSoonHours: tatConfigDoc?.dueSoonHours ?? DEFAULT_TAT_CONFIG.dueSoonHours
  };
  const companies = await Company.find({ active: true }).lean();
  const companyList = [...companies, { _id: null, name: "ONEPWS All-Plant Division" }];
  for (const comp of companyList) {
    const compFilter = comp._id ? { company: comp._id } : {};
    const [openComplaints, openCapas, repeatComplaints] = await Promise.all([
      Complaint.find({
        ...compFilter,
        status: { $nin: ["Closed"] }
      }).populate("priority", "tatMultiplier").lean(),
      Capa.find({
        ...compFilter,
        status: { $nin: ["Closed", "Completed"] }
      }).lean(),
      Complaint.find({
        ...compFilter,
        isRepeat: true
      }).lean()
    ]);
    let overdueCount = 0;
    for (const c of openComplaints) {
      const stage = getActiveStage3(c);
      if (!stage) continue;
      const multiplier = c.priority?.tatMultiplier ?? 1;
      const dues = computeStageDueDates({ receivedAt: new Date(c.receivedAt).toISOString(), priorityMultiplier: multiplier }, tatConfig);
      const target = dues[stage];
      if (target < now) {
        overdueCount++;
      }
    }
    const recipients = await resolveRecipients({
      companyId: comp._id || void 0,
      targetRoles: ["Quality Head", "Management", "Master Admin"]
    });
    if (recipients.length > 0) {
      const dedupeKey = `WEEKLY_SUMMARY_${comp._id || "GLOBAL"}_${dedupeWeekKey}`;
      const res = await sendTemplatedEmail({
        triggerEvent: "WEEKLY_SUMMARY",
        recipients,
        dedupeKey,
        data: {
          companyName: comp.name,
          period: periodStr,
          totalOpen: String(openComplaints.length),
          overdueCount: String(overdueCount),
          repeatCount: String(repeatComplaints.length),
          openCapasCount: String(openCapas.length)
        }
      });
      if (res.status === "sent") sent++;
    }
  }
  return { sent };
}

// server/routes/cron.routes.ts
var cronRouter = Router14();
cronRouter.use(requireCronAuth);
cronRouter.post(
  "/reminders",
  asyncHandler(async (_req, res) => {
    const result = await processReminders();
    return ok(res, { job: "reminders", ...result, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  })
);
cronRouter.post(
  "/escalations",
  asyncHandler(async (_req, res) => {
    const result = await processEscalations();
    return ok(res, { job: "escalations", ...result, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  })
);
cronRouter.post(
  "/summaries",
  asyncHandler(async (req, res) => {
    const dailyResult = await processDailySummaries();
    let weeklyResult = null;
    const now = /* @__PURE__ */ new Date();
    const isMonday = now.getDay() === 1;
    const forceWeekly = req.query.weekly === "true";
    if (isMonday || forceWeekly) {
      weeklyResult = await processWeeklySummaries();
    }
    return ok(res, {
      job: "summaries",
      dailySent: dailyResult.sent,
      weeklySent: weeklyResult?.sent ?? null,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  })
);

// server/app.ts
function createApp() {
  const app = express();
  const env = getEnv();
  const production = isProduction();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: production ? void 0 : false,
      crossOriginResourcePolicy: { policy: "same-site" }
    })
  );
  app.use(
    cors({
      origin: production ? env.APP_BASE_URL || false : env.APP_BASE_URL || true,
      credentials: true,
      methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
    })
  );
  app.use("/api/import", express.json({ limit: "25mb" }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser(env.COOKIE_SECRET));
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    next();
  });
  app.use(optionalUser);
  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/master", masterRouter);
  app.use("/api/master", masterAdminRouter);
  app.use("/api/configuration", configurationRouter);
  app.use("/api/complaints", complaintRouter);
  app.use("/api/capas", capaRouter);
  app.use("/api/attachments", attachmentRouter);
  app.use("/api/notifications", notificationRouter);
  app.use("/api/audit", auditRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/reports", reportRouter);
  app.use("/api/import", importRouter);
  app.use("/api/email", emailRouter);
  app.use("/api/cron", cronRouter);
  app.use((_req, res) => res.status(404).json({ message: "API route not found" }));
  app.use(errorHandler);
  return app;
}

// server/vercel-entry.ts
var cachedApp = null;
function getApp() {
  if (!cachedApp) {
    cachedApp = createApp();
  }
  return cachedApp;
}
async function handler(req, res) {
  try {
    const app = getApp();
    return app(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server initialization failed";
    console.error("Vercel Serverless Function Error:", message);
    return res.status(500).json({
      error: "SERVER_CONFIG_ERROR",
      message: `Server Configuration Error: ${message}. Check Vercel Project Settings > Environment Variables.`
    });
  }
}
export {
  handler as default
};
