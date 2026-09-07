export const LEGACY_ROUTES = [
  "dashboard",
  "complaints",
  "complaint/:id",
  "tat",
  "repeat",
  "capa",
  "capa-master",
  "capa-tracker",
  "audit",
  "notifications",
  "reports",
  "master",
  "import"
] as const;

export const COMPLAINT_STATUSES = ["Open", "Acknowledged", "Containment Done", "RCA Done", "CAPA Assigned", "Closed", "Reopened"] as const;

export const CAPA_STATUSES = ["Open", "In Progress", "Completed", "Closed", "Overdue"] as const;

export const PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;
