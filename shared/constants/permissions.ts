export const PERMISSIONS = [
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
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number] | "*";

export const ROLE_NAMES = [
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
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export const DEFAULT_ROLE_PERMISSIONS: Record<RoleName, PermissionKey[]> = {
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
