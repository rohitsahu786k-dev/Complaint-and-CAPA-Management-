const SCRIPT_TAG_REGEX = /<script[\s\S]*?>[\s\S]*?<\/script>/gi;
const INLINE_EVENT_REGEX = /\son\w+\s*=\s*(["']).*?\1/gi;
const JAVASCRIPT_HREF_REGEX = /href\s*=\s*(["'])javascript:[\s\S]*?\1/gi;

/**
 * Escapes HTML characters in variable values to prevent injection.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Strips script tags and executable attributes from HTML.
 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(SCRIPT_TAG_REGEX, "")
    .replace(INLINE_EVENT_REGEX, "")
    .replace(JAVASCRIPT_HREF_REGEX, 'href="#"');
}

/**
 * Substitutes {{variable}} placeholders with escaped data.
 * Does not execute code or eval.
 */
export function renderTemplate(
  templateString: string,
  data: Record<string, string | number | undefined | null>
): { rendered: string; missingVariables: string[] } {
  if (!templateString) return { rendered: "", missingVariables: [] };

  const missing = new Set<string>();

  const replaced = templateString.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const val = data[key];
    if (val === undefined || val === null || val === "") {
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

/**
 * Extracts all unique {{variableName}} tokens declared in the given strings.
 */
export function variablesInTemplate(...parts: string[]): string[] {
  const vars = new Set<string>();
  for (const part of parts) {
    if (!part) continue;
    const matches = part.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g);
    for (const match of matches) {
      if (match[1]) vars.add(match[1]);
    }
  }
  return Array.from(vars);
}

/**
 * Generates sample data suitable for previewing any email template in the admin panel.
 */
export function getSampleVariables(triggerEvent?: string): Record<string, string | number> {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  const common: Record<string, string | number> = {
    companyName: "ONEPWS Private Limited",
    appUrl: "http://localhost:5173",
    recipientName: "Priya Sharma",
    recipientEmail: "priya.sharma@onepws.com",
    today: dateStr
  };

  const complaintVars: Record<string, string | number> = {
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

  const capaVars: Record<string, string | number> = {
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

  const authVars: Record<string, string | number> = {
    ...common,
    userName: "Amit Verma",
    username: "averma",
    resetUrl: "http://localhost:5173/reset-password?token=sample_token_abc123",
    expiresInHours: "1"
  };

  const summaryVars: Record<string, string | number> = {
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
