export const COMPLAINT_TYPES = ["External", "Internal"] as const;
export type ComplaintType = (typeof COMPLAINT_TYPES)[number];

export const COMPLAINT_STATUSES = [
  "Open",
  "Acknowledged",
  "Contained",
  "RCA Done",
  "CAPA Assigned",
  "Under Verification",
  "Closed",
  "Reopened"
] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const WORKFLOW_STAGES = ["ack", "cont", "rca", "capa"] as const;
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export const WORKFLOW_STAGE_LABELS: Record<WorkflowStage, string> = {
  ack: "Acknowledgement",
  cont: "Containment",
  rca: "RCA Completion",
  capa: "CAPA Assignment"
};

export const WORKFLOW_STAGE_STATUS: Record<WorkflowStage, ComplaintStatus> = {
  ack: "Acknowledged",
  cont: "Contained",
  rca: "RCA Done",
  capa: "CAPA Assigned"
};

export const TAT_HEALTH = ["on-time", "due-soon", "overdue"] as const;
export type TatHealth = (typeof TAT_HEALTH)[number];

export const CAPA_TYPES = ["Corrective", "Preventive", "Systemic", "Containment"] as const;
export type CapaType = (typeof CAPA_TYPES)[number];

export const CAPA_STATUSES = ["Open", "In Progress", "Completed", "Under Verification", "Closed", "Rejected/Reopened"] as const;
export type CapaStatus = (typeof CAPA_STATUSES)[number];

export const CAPA_EFFECTIVENESS = ["Effective", "Not Effective"] as const;
export type CapaEffectiveness = (typeof CAPA_EFFECTIVENESS)[number];

export const EVIDENCE_REVIEW_STATUSES = ["Pending", "Accepted", "Rejected"] as const;
export type EvidenceReviewStatus = (typeof EVIDENCE_REVIEW_STATUSES)[number];

export const SIGNATURE_ROLES = ["prepared", "reviewed", "approved"] as const;
export type SignatureRole = (typeof SIGNATURE_ROLES)[number];

export const SIGNATURE_ROLE_LABELS: Record<SignatureRole, string> = {
  prepared: "Prepared By",
  reviewed: "Reviewed By",
  approved: "Approved By"
};

export const FISHBONE_CATEGORIES = ["Man", "Machine", "Method", "Material", "Measurement", "Environment"] as const;
export type FishboneCategory = (typeof FISHBONE_CATEGORIES)[number];

export const FIVE_WHY_CHAINS = ["occurrence", "escape", "systemic", "singleChain"] as const;
export type FiveWhyChain = (typeof FIVE_WHY_CHAINS)[number];

/** 6M + Management + Supplier, as required by the final legacy patch. */
export const ROOT_CAUSE_CATEGORIES = [
  "Man (Human error / Training)",
  "Machine (Equipment / Tooling)",
  "Method (Process / Procedure)",
  "Material (Raw material / Component)",
  "Measurement (Inspection / Gauging)",
  "Environment (Facility / Conditions)",
  "Management (Systemic / Resources)",
  "Supplier (Vendor / Subcontractor)",
  "Design / Specification",
  "Other"
] as const;

export const D6_DOCUMENT_TYPES = [
  "Drawing",
  "Process Spec",
  "FMEA",
  "Control Plan",
  "Work Instruction",
  "Config Matrix",
  "Inspection Plan",
  "Lessons Learnt DB"
] as const;
export type D6DocumentType = (typeof D6_DOCUMENT_TYPES)[number];

export const D6_DOCUMENT_STATUSES = ["Pending", "Attached", "NA"] as const;
export type D6DocumentStatus = (typeof D6_DOCUMENT_STATUSES)[number];

export const QC_TOOLS = [
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
] as const;

export const D7_LT_RESULTS = ["Sustained", "Not Sustained"] as const;
export type D7LongTermResult = (typeof D7_LT_RESULTS)[number];

export const NOTE_KINDS = ["Note", "MOM", "Customer Communication", "Internal Discussion", "Site Visit"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const DEFAULT_DELAY_REASONS = [
  "Customer dependency",
  "Supplier dependency",
  "Internal resource constraint",
  "Technical investigation required",
  "Material availability",
  "Management decision pending",
  "Data / information pending",
  "Repeated failure requiring extended investigation",
  "Other"
] as const;

export const DEFAULT_TAT_CONFIG = {
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
export type TatConfigValues = typeof DEFAULT_TAT_CONFIG;

export const DEFAULT_ESCALATION_LEVELS = [
  { level: 1, name: "Owner", triggerHoursOverdue: 0 },
  { level: 2, name: "Department Head", triggerHoursOverdue: 24 },
  { level: 3, name: "Quality Head", triggerHoursOverdue: 72 },
  { level: 4, name: "Management", triggerHoursOverdue: 168 }
] as const;

export const DEFAULT_REMINDER_PERCENTAGES = [50, 75, 90] as const;

export const DEFAULT_PRIORITIES = [
  { name: "Critical", color: "#7F1D1D", tatMultiplier: 0.5, order: 1 },
  { name: "High", color: "#DC2626", tatMultiplier: 0.75, order: 2 },
  { name: "Medium", color: "#D97706", tatMultiplier: 1, order: 3 },
  { name: "Low", color: "#16A34A", tatMultiplier: 1.5, order: 4 }
] as const;

export const DEFAULT_EXTERNAL_CATEGORIES = [
  "Product quality issue",
  "Product performance issue",
  "Design issue",
  "Delivery issue",
  "Installation issue",
  "Documentation issue",
  "Packaging issue",
  "Service issue",
  "Warranty issue",
  "Customer expectation mismatch",
  "Other"
] as const;

export const DEFAULT_INTERNAL_CATEGORIES = [
  "Department-to-department",
  "Process deviation",
  "Internal quality issue",
  "Material issue",
  "Production issue",
  "Procurement issue",
  "Documentation issue",
  "Planning issue",
  "Dispatch issue",
  "Installation issue",
  "System/process issue",
  "Other"
] as const;

export const DEFAULT_DEPARTMENTS = [
  "Production",
  "Quality",
  "Design / R&D",
  "Purchase",
  "Sales",
  "Projects",
  "Dispatch / Logistics",
  "Installation",
  "Accounts",
  "HR",
  "IT",
  "Store / Warehouse",
  "PPC / Planning",
  "Management"
] as const;

export const AUDIT_ACTIONS = [
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
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const NOTIFICATION_CATEGORIES = ["complaint", "capa", "workflow", "evidence", "effectiveness", "system"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const ATTACHMENT_PURPOSES = ["complaint.attachment", "capa.evidence", "capa.effectiveness", "d6.document", "company.logo"] as const;
export type AttachmentPurpose = (typeof ATTACHMENT_PURPOSES)[number];

export const ALLOWED_UPLOAD_MIME_TYPES = [
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
] as const;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
