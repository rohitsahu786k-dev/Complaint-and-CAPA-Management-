import { emailButton, highlightBox, infoRow, infoTable, wrapEmailLayout } from "./email-layout";
import type { EmailTriggerEvent } from "@shared/constants/domain";

export type DefaultEmailTemplate = {
  templateKey: string;
  templateName: string;
  triggerEvent: EmailTriggerEvent;
  subject: string;
  htmlBody: string;
  textBody: string;
  supportedVariables: string[];
  allowedRolesToReceive?: string[];
  ccRules?: string[];
  bccRules?: string[];
};

const heading = (text: string) => `<h2 style="margin:0 0 14px;font-size:18px;font-weight:700;color:#1e293b;">${text}</h2>`;
const greeting = () => `<p style="margin:0 0 12px;">Hello {{recipientName}},</p>`;
const closing = () =>
  `<p style="margin:24px 0 0;font-size:13px;color:#64748b;">Regards,<br><strong>{{companyName}}</strong> &mdash; Quality &amp; Continuous Improvement</p>`;

export const DEFAULT_EMAIL_TEMPLATES: DefaultEmailTemplate[] = [
  // ==================== AUTH ====================
  {
    templateKey: "auth-user-created",
    templateName: "User Created Notification",
    triggerEvent: "USER_CREATED",
    subject: "Welcome to ONEPWS Complaint & CAPA Portal",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Your Account Has Been Created")}` +
        `<p style="margin:0 0 12px;">A user account has been registered for you on the ONEPWS Complaint &amp; CAPA Management Portal.</p>` +
        infoTable(
          infoRow("Username", "{{username}}") +
            infoRow("Assigned Role", "{{roleName}}") +
            infoRow("Company Scope", "{{companyName}}")
        ) +
        `<p style="margin:12px 0;">Please contact your Quality Administrator or click below to sign in:</p>` +
        emailButton("{{appUrl}}/login", "Sign In to Portal") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nYour user account has been registered on the ONEPWS Complaint & CAPA Management Portal.\n\nUsername: {{username}}\nAssigned Role: {{roleName}}\nCompany: {{companyName}}\n\nSign in at: {{appUrl}}/login\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "username", "roleName", "companyName", "appUrl"]
  },
  {
    templateKey: "auth-password-reset",
    templateName: "Password Reset Requested",
    triggerEvent: "PASSWORD_RESET_REQUESTED",
    subject: "Password Reset Request - ONEPWS Quality Portal",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Password Reset Request")}` +
        `<p style="margin:0 0 12px;">A password reset request was received for your account. Use the secure button below to set a new password. This link is valid for <strong>{{expiresInHours}} hour(s)</strong>.</p>` +
        emailButton("{{resetUrl}}", "Reset Password") +
        `<p style="margin:12px 0 0;font-size:12px;color:#64748b;">If you did not request a password reset, you can safely ignore this email. Your current password remains unchanged.</p>` +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nA password reset request was received for your account. Use the secure link below to reset your password. It expires in {{expiresInHours}} hour(s):\n\n{{resetUrl}}\n\nIf you did not request this, please ignore this email.\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "resetUrl", "expiresInHours", "companyName", "appUrl"]
  },
  {
    templateKey: "auth-password-changed",
    templateName: "Password Changed Confirmation",
    triggerEvent: "PASSWORD_CHANGED",
    subject: "Security Alert: Password Changed - ONEPWS Quality Portal",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Your Password Has Been Changed")}` +
        `<p style="margin:0 0 12px;">This is a confirmation that the password for your portal account (<strong>{{username}}</strong>) was successfully updated.</p>` +
        `<p style="margin:12px 0;padding:10px 14px;background-color:#fef2f2;border-left:3px solid #E31E25;border-radius:4px;color:#991B1B;font-size:13px;">If you did not perform this change, please notify your System Administrator immediately.</p>` +
        emailButton("{{appUrl}}/login", "Sign In") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nThis is a confirmation that the password for your portal account ({{username}}) was successfully updated.\n\nIf you did not perform this change, notify your Administrator immediately.\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "username", "companyName", "appUrl"]
  },

  // ==================== COMPLAINT LIFECYCLE ====================
  {
    templateKey: "complaint-created",
    templateName: "Complaint Created",
    triggerEvent: "COMPLAINT_CREATED",
    subject: "Complaint {{complaintNumber}} Registered: {{complaintTitle}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("New Complaint Registered")}` +
        `<p style="margin:0 0 12px;">A new complaint has been registered and logged in the system.</p>` +
        infoTable(
          infoRow("Complaint No.", "{{complaintNumber}}") +
            infoRow("Type", "{{complaintType}}") +
            infoRow("Customer / Source", "{{customerName}}") +
            infoRow("Part / Assembly", "{{partName}} ({{partNumber}})") +
            infoRow("Priority", "{{priority}}") +
            infoRow("Responsible Dept.", "{{departmentName}}") +
            infoRow("Coordinator", "{{coordinatorName}}") +
            infoRow("Target Ack. Date", "{{ackDueDate}}")
        ) +
        highlightBox("<strong>Issue Description:</strong><br>{{complaintTitle}}") +
        emailButton("{{actionUrl}}", "View Complaint in Portal") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nA new complaint has been registered:\n\nComplaint No: {{complaintNumber}}\nType: {{complaintType}}\nSource: {{customerName}}\nPart: {{partName}} ({{partNumber}})\nPriority: {{priority}}\nResponsible Dept: {{departmentName}}\nCoordinator: {{coordinatorName}}\n\nDescription: {{complaintTitle}}\n\nView: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "complaintTitle", "complaintType", "customerName", "partName", "partNumber", "priority", "departmentName", "coordinatorName", "ackDueDate", "actionUrl", "companyName"]
  },
  {
    templateKey: "complaint-assigned",
    templateName: "Complaint Assigned",
    triggerEvent: "COMPLAINT_ASSIGNED",
    subject: "Assignment: Complaint {{complaintNumber}} Assigned to You",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Complaint Assigned for Action")}` +
        `<p style="margin:0 0 12px;">Complaint <strong>{{complaintNumber}}</strong> has been assigned to you as owner. Please review and acknowledge promptly within the SLA window.</p>` +
        infoTable(
          infoRow("Complaint No.", "{{complaintNumber}}") +
            infoRow("Priority", "{{priority}}") +
            infoRow("Customer", "{{customerName}}") +
            infoRow("Part", "{{partName}}") +
            infoRow("Target Ack.", "{{ackDueDate}}")
        ) +
        emailButton("{{actionUrl}}", "Open Complaint") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nComplaint {{complaintNumber}} has been assigned to you as owner.\n\nPriority: {{priority}}\nCustomer: {{customerName}}\nPart: {{partName}}\nTarget Ack: {{ackDueDate}}\n\nOpen: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "priority", "customerName", "partName", "ackDueDate", "actionUrl", "companyName"]
  },
  {
    templateKey: "complaint-reassigned",
    templateName: "Complaint Reassigned",
    triggerEvent: "COMPLAINT_REASSIGNED",
    subject: "Reassigned: Complaint {{complaintNumber}} Handover",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Complaint Ownership Reassigned")}` +
        `<p style="margin:0 0 12px;">Complaint <strong>{{complaintNumber}}</strong> has been reassigned to <strong>{{ownerName}}</strong>.</p>` +
        infoTable(
          infoRow("Complaint No.", "{{complaintNumber}}") +
            infoRow("Current Owner", "{{ownerName}}") +
            infoRow("Department", "{{departmentName}}") +
            infoRow("Current Stage", "{{stage}}")
        ) +
        emailButton("{{actionUrl}}", "Review Complaint") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nComplaint {{complaintNumber}} has been reassigned to {{ownerName}}.\n\nDepartment: {{departmentName}}\nCurrent Stage: {{stage}}\n\nReview: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "ownerName", "departmentName", "stage", "actionUrl", "companyName"]
  },
  {
    templateKey: "complaint-acknowledged",
    templateName: "Complaint Acknowledged",
    triggerEvent: "COMPLAINT_ACKNOWLEDGED",
    subject: "Acknowledged: Complaint {{complaintNumber}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Complaint Formally Acknowledged")}` +
        `<p style="margin:0 0 12px;">Complaint <strong>{{complaintNumber}}</strong> has been formally acknowledged. Containment planning is now required.</p>` +
        infoTable(
          infoRow("Complaint No.", "{{complaintNumber}}") +
            infoRow("Acknowledged By", "{{acknowledgedBy}}") +
            infoRow("Target Containment", "{{containmentDueDate}}")
        ) +
        emailButton("{{actionUrl}}", "View Complaint") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nComplaint {{complaintNumber}} has been acknowledged by {{acknowledgedBy}}. Target Containment: {{containmentDueDate}}.\n\nView: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "acknowledgedBy", "containmentDueDate", "actionUrl", "companyName"]
  },
  {
    templateKey: "complaint-containment-completed",
    templateName: "Containment Completed",
    triggerEvent: "COMPLAINT_CONTAINMENT_COMPLETED",
    subject: "Containment Completed: Complaint {{complaintNumber}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Containment Actions Completed")}` +
        `<p style="margin:0 0 12px;">Interim containment actions for complaint <strong>{{complaintNumber}}</strong> have been documented and closed.</p>` +
        infoTable(
          infoRow("Complaint No.", "{{complaintNumber}}") +
            infoRow("Completed By", "{{ownerName}}") +
            infoRow("Next Milestone", "Root Cause Analysis (RCA)") +
            infoRow("Target RCA Date", "{{rcaDueDate}}")
        ) +
        emailButton("{{actionUrl}}", "Review Containment") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nContainment actions for complaint {{complaintNumber}} have been completed by {{ownerName}}. Target RCA Date: {{rcaDueDate}}.\n\nReview: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "ownerName", "rcaDueDate", "actionUrl", "companyName"]
  },
  {
    templateKey: "complaint-rca-completed",
    templateName: "RCA Completed",
    triggerEvent: "COMPLAINT_RCA_COMPLETED",
    subject: "RCA Completed: Complaint {{complaintNumber}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Root Cause Analysis Completed")}` +
        `<p style="margin:0 0 12px;">Root cause investigation (5-Why / Fishbone) for complaint <strong>{{complaintNumber}}</strong> has been concluded.</p>` +
        infoTable(
          infoRow("Complaint No.", "{{complaintNumber}}") +
            infoRow("Category", "{{rootCauseCategory}}") +
            infoRow("Next Step", "CAPA Assignment") +
            infoRow("Target CAPA Date", "{{capaDueDate}}")
        ) +
        highlightBox("<strong>Root Cause Summary:</strong><br>{{rootCauseSummary}}") +
        emailButton("{{actionUrl}}", "Review RCA Findings") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nRCA for complaint {{complaintNumber}} is complete. Root Cause Category: {{rootCauseCategory}}.\n\nSummary: {{rootCauseSummary}}\n\nReview: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "rootCauseCategory", "rootCauseSummary", "capaDueDate", "actionUrl", "companyName"]
  },
  {
    templateKey: "complaint-capa-assigned",
    templateName: "CAPA Assigned from Complaint",
    triggerEvent: "COMPLAINT_CAPA_ASSIGNED",
    subject: "CAPA Assigned: Complaint {{complaintNumber}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Corrective & Preventive Action Assigned")}` +
        `<p style="margin:0 0 12px;">Corrective actions have been assigned following RCA completion for complaint <strong>{{complaintNumber}}</strong>.</p>` +
        infoTable(
          infoRow("Complaint No.", "{{complaintNumber}}") +
            infoRow("CAPA Count", "{{capaCount}}") +
            infoRow("Lead Assignee", "{{assignedTo}}")
        ) +
        emailButton("{{actionUrl}}", "View CAPAs") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nCAPA assigned for complaint {{complaintNumber}}. Count: {{capaCount}}, Assignee: {{assignedTo}}.\n\nView: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "capaCount", "assignedTo", "actionUrl", "companyName"]
  },
  {
    templateKey: "complaint-status-changed",
    templateName: "Complaint Status Changed",
    triggerEvent: "COMPLAINT_STATUS_CHANGED",
    subject: "Status Update: Complaint {{complaintNumber}} &rarr; {{status}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Complaint Status Updated")}` +
        `<p style="margin:0 0 12px;">Complaint <strong>{{complaintNumber}}</strong> transitioned to status <strong>{{status}}</strong>.</p>` +
        infoTable(
          infoRow("Complaint No.", "{{complaintNumber}}") +
            infoRow("New Status", "{{status}}") +
            infoRow("Updated By", "{{updatedBy}}")
        ) +
        emailButton("{{actionUrl}}", "Open Complaint") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nComplaint {{complaintNumber}} status changed to {{status}} by {{updatedBy}}.\n\nOpen: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "status", "updatedBy", "actionUrl", "companyName"]
  },
  {
    templateKey: "complaint-closed",
    templateName: "Complaint Closed",
    triggerEvent: "COMPLAINT_CLOSED",
    subject: "Closed: Complaint {{complaintNumber}} Resolution Verified",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Complaint Successfully Closed")}` +
        `<p style="margin:0 0 12px;">Complaint <strong>{{complaintNumber}}</strong> has satisfied all closure criteria, signatures, and effectiveness verifications, and is now <span style="color:#15803D;font-weight:700;">CLOSED</span>.</p>` +
        infoTable(
          infoRow("Complaint No.", "{{complaintNumber}}") +
            infoRow("Customer", "{{customerName}}") +
            infoRow("Part", "{{partName}}") +
            infoRow("Closed By", "{{closedBy}}")
        ) +
        emailButton("{{actionUrl}}", "View Final Report") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nComplaint {{complaintNumber}} has been formally closed by {{closedBy}}.\n\nCustomer: {{customerName}}\nPart: {{partName}}\n\nView: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "customerName", "partName", "closedBy", "actionUrl", "companyName"]
  },
  {
    templateKey: "complaint-reopened",
    templateName: "Complaint Reopened",
    triggerEvent: "COMPLAINT_REOPENED",
    subject: "Attention: Complaint {{complaintNumber}} Reopened",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Complaint Has Been Reopened")}` +
        `<p style="margin:0 0 12px;">Complaint <strong>{{complaintNumber}}</strong> has been <span style="color:#B91C1C;font-weight:700;">REOPENED</span> due to recurrence or effectiveness review failure.</p>` +
        infoTable(
          infoRow("Complaint No.", "{{complaintNumber}}") +
            infoRow("Reopened By", "{{reopenedBy}}") +
            infoRow("Responsible Dept.", "{{departmentName}}")
        ) +
        highlightBox("<strong>Reopening Reason:</strong><br>{{reopenReason}}", "#B91C1C", "#FEF2F2") +
        emailButton("{{actionUrl}}", "Investigate Reopened Complaint") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nComplaint {{complaintNumber}} has been REOPENED by {{reopenedBy}}.\n\nDepartment: {{departmentName}}\nReason: {{reopenReason}}\n\nInvestigate: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "reopenedBy", "departmentName", "reopenReason", "actionUrl", "companyName"]
  },
  {
    templateKey: "complaint-report-shared",
    templateName: "Complaint Report Shared",
    triggerEvent: "COMPLAINT_REPORT_SHARED",
    subject: "Quality 8D Report Shared: {{complaintNumber}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Complaint 8D Report Shared With You")}` +
        `<p style="margin:0 0 12px;"><strong>{{sharedBy}}</strong> has shared the formal Quality 8D Report for complaint <strong>{{complaintNumber}}</strong> with you.</p>` +
        infoTable(
          infoRow("Complaint No.", "{{complaintNumber}}") +
            infoRow("Customer / Product", "{{customerName}} / {{partName}}") +
            infoRow("Status", "{{status}}")
        ) +
        highlightBox("<strong>Sender Note:</strong><br>{{notes}}") +
        emailButton("{{reportUrl}}", "Access 8D Report") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\n{{sharedBy}} shared the 8D Report for complaint {{complaintNumber}}.\n\nCustomer: {{customerName}}\nPart: {{partName}}\nStatus: {{status}}\nNote: {{notes}}\n\nAccess: {{reportUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "sharedBy", "complaintNumber", "customerName", "partName", "status", "notes", "reportUrl", "companyName"]
  },

  // ==================== TAT NOTIFICATIONS ====================
  {
    templateKey: "tat-reminder",
    templateName: "TAT SLA Milestone Reminder",
    triggerEvent: "TAT_REMINDER",
    subject: "Reminder ({{thresholdPct}}% SLA): Complaint {{complaintNumber}} Stage {{stage}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("SLA Milestone Reminder")}` +
        `<p style="margin:0 0 12px;">Complaint <strong>{{complaintNumber}}</strong> has reached <strong>{{thresholdPct}}%</strong> of its allowed turnaround time for stage <strong>{{stage}}</strong>.</p>` +
        infoTable(
          infoRow("Complaint No.", "{{complaintNumber}}") +
            infoRow("Current Stage", "{{stage}}") +
            infoRow("Due Date", "{{dueDate}}") +
            infoRow("Owner", "{{ownerName}}") +
            infoRow("Priority", "{{priority}}")
        ) +
        emailButton("{{actionUrl}}", "Complete Stage Action") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nComplaint {{complaintNumber}} has reached {{thresholdPct}}% of allowed TAT for stage {{stage}}.\n\nDue Date: {{dueDate}}\nOwner: {{ownerName}}\nPriority: {{priority}}\n\nComplete Action: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "thresholdPct", "stage", "dueDate", "ownerName", "priority", "actionUrl", "companyName"]
  },
  {
    templateKey: "tat-due-soon",
    templateName: "TAT Stage Due Soon",
    triggerEvent: "TAT_DUE_SOON",
    subject: "Urgent: Complaint {{complaintNumber}} Due Within {{hoursLeft}} Hours",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Stage Action Due Shortly")}` +
        `<p style="margin:0 0 12px;">Stage <strong>{{stage}}</strong> for complaint <strong>{{complaintNumber}}</strong> is due within <strong>{{hoursLeft}} hour(s)</strong>.</p>` +
        infoTable(
          infoRow("Complaint No.", "{{complaintNumber}}") +
            infoRow("Stage", "{{stage}}") +
            infoRow("Target Due Date", "{{dueDate}}") +
            infoRow("Priority", "{{priority}}")
        ) +
        emailButton("{{actionUrl}}", "Take Immediate Action") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nComplaint {{complaintNumber}} stage {{stage}} is due within {{hoursLeft}} hours.\n\nDue: {{dueDate}}\nPriority: {{priority}}\n\nAction: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "stage", "hoursLeft", "dueDate", "priority", "actionUrl", "companyName"]
  },
  {
    templateKey: "tat-overdue",
    templateName: "TAT Stage Overdue",
    triggerEvent: "TAT_OVERDUE",
    subject: "OVERDUE Notice: Complaint {{complaintNumber}} Stage {{stage}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Turnaround Time SLA Exceeded")}` +
        `<p style="margin:0 0 12px;">Complaint <strong>{{complaintNumber}}</strong> is currently <span style="color:#B91C1C;font-weight:700;">OVERDUE</span> for milestone <strong>{{stage}}</strong>.</p>` +
        infoTable(
          infoRow("Complaint No.", "{{complaintNumber}}") +
            infoRow("Overdue Stage", "{{stage}}") +
            infoRow("Original Due Date", "{{dueDate}}") +
            infoRow("Overdue Duration", "{{overdueHours}} hours") +
            infoRow("Responsible Dept.", "{{departmentName}}") +
            infoRow("Owner", "{{ownerName}}")
        ) +
        emailButton("{{actionUrl}}", "Resolve Overdue Stage") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nOVERDUE NOTICE: Complaint {{complaintNumber}} is overdue for stage {{stage}}.\n\nDue Date: {{dueDate}}\nOverdue Duration: {{overdueHours}} hours\nDept: {{departmentName}}\nOwner: {{ownerName}}\n\nResolve: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "stage", "dueDate", "overdueHours", "departmentName", "ownerName", "actionUrl", "companyName"]
  },
  {
    templateKey: "tat-escalation",
    templateName: "TAT Overdue Escalation",
    triggerEvent: "TAT_ESCALATION",
    subject: "ESCALATION ({{escalationLevel}}): Complaint {{complaintNumber}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("SLA Breach Escalation Notice")}` +
        `<p style="margin:0 0 12px;">This complaint has breached defined SLA thresholds and has been escalated to <strong>{{escalationLevel}}</strong>.</p>` +
        infoTable(
          infoRow("Complaint No.", "{{complaintNumber}}") +
            infoRow("Escalation Tier", "{{escalationLevel}}") +
            infoRow("Pending Stage", "{{stage}}") +
            infoRow("Overdue Duration", "{{overdueHours}} hours") +
            infoRow("Responsible Dept.", "{{departmentName}}") +
            infoRow("Complaint Owner", "{{ownerName}}") +
            infoRow("Priority", "{{priority}}")
        ) +
        emailButton("{{actionUrl}}", "Intervene on Complaint") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nESCALATION: Complaint {{complaintNumber}} has been escalated to {{escalationLevel}}.\n\nStage: {{stage}}\nOverdue: {{overdueHours}} hours\nDept: {{departmentName}}\nOwner: {{ownerName}}\nPriority: {{priority}}\n\nIntervene: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "escalationLevel", "stage", "overdueHours", "departmentName", "ownerName", "priority", "actionUrl", "companyName"]
  },

  // ==================== CAPA LIFECYCLE ====================
  {
    templateKey: "capa-assigned",
    templateName: "CAPA Assigned",
    triggerEvent: "CAPA_ASSIGNED",
    subject: "Action Assigned: CAPA {{capaNumber}} ({{capaType}})",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("New CAPA Action Item Assigned")}` +
        `<p style="margin:0 0 12px;">You have been assigned as the action owner for <strong>CAPA {{capaNumber}}</strong>.</p>` +
        infoTable(
          infoRow("CAPA No.", "{{capaNumber}}") +
            infoRow("Type", "{{capaType}}") +
            infoRow("Target Date", "{{targetDate}}") +
            infoRow("Linked Complaint", "{{complaintNumber}}") +
            infoRow("Department", "{{departmentName}}")
        ) +
        highlightBox("<strong>Action Required:</strong><br>{{capaTitle}}") +
        emailButton("{{actionUrl}}", "Review CAPA Task") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nYou have been assigned CAPA {{capaNumber}} ({{capaType}}).\n\nTarget Date: {{targetDate}}\nLinked Complaint: {{complaintNumber}}\nDepartment: {{departmentName}}\n\nAction: {{capaTitle}}\n\nReview: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "capaNumber", "capaType", "targetDate", "complaintNumber", "departmentName", "capaTitle", "actionUrl", "companyName"]
  },
  {
    templateKey: "capa-reassigned",
    templateName: "CAPA Reassigned",
    triggerEvent: "CAPA_REASSIGNED",
    subject: "Reassigned: CAPA {{capaNumber}} Handover",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("CAPA Action Item Reassigned")}` +
        `<p style="margin:0 0 12px;">CAPA <strong>{{capaNumber}}</strong> ownership has been reassigned to <strong>{{assignedTo}}</strong>.</p>` +
        infoTable(
          infoRow("CAPA No.", "{{capaNumber}}") +
            infoRow("New Assignee", "{{assignedTo}}") +
            infoRow("Target Date", "{{targetDate}}")
        ) +
        emailButton("{{actionUrl}}", "Open CAPA") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nCAPA {{capaNumber}} reassigned to {{assignedTo}}. Target Date: {{targetDate}}.\n\nOpen: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "capaNumber", "assignedTo", "targetDate", "actionUrl", "companyName"]
  },
  {
    templateKey: "capa-due-reminder",
    templateName: "CAPA Target Date Reminder",
    triggerEvent: "CAPA_DUE_REMINDER",
    subject: "Target Date Reminder: CAPA {{capaNumber}} Due {{targetDate}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("CAPA Due Date Reminder")}` +
        `<p style="margin:0 0 12px;">This is a reminder that <strong>CAPA {{capaNumber}}</strong> is approaching its target completion date.</p>` +
        infoTable(
          infoRow("CAPA No.", "{{capaNumber}}") +
            infoRow("Action Plan", "{{capaTitle}}") +
            infoRow("Target Completion", "{{targetDate}}") +
            infoRow("Assignee", "{{assignedTo}}")
        ) +
        emailButton("{{actionUrl}}", "Submit Implementation Progress") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nReminder: CAPA {{capaNumber}} is approaching its target completion date ({{targetDate}}).\n\nAction: {{capaTitle}}\nAssignee: {{assignedTo}}\n\nSubmit: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "capaNumber", "capaTitle", "targetDate", "assignedTo", "actionUrl", "companyName"]
  },
  {
    templateKey: "capa-overdue",
    templateName: "CAPA Action Overdue",
    triggerEvent: "CAPA_OVERDUE",
    subject: "OVERDUE: CAPA {{capaNumber}} Completion Past Target Date",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("CAPA Implementation Overdue")}` +
        `<p style="margin:0 0 12px;">CAPA <strong>{{capaNumber}}</strong> is <span style="color:#B91C1C;font-weight:700;">OVERDUE</span>. Target completion date was <strong>{{targetDate}}</strong>.</p>` +
        infoTable(
          infoRow("CAPA No.", "{{capaNumber}}") +
            infoRow("Owner", "{{assignedTo}}") +
            infoRow("Target Date", "{{targetDate}}") +
            infoRow("Linked Complaint", "{{complaintNumber}}")
        ) +
        emailButton("{{actionUrl}}", "Expedite CAPA Closure") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nOVERDUE: CAPA {{capaNumber}} is past its target date ({{targetDate}}).\n\nOwner: {{assignedTo}}\nLinked Complaint: {{complaintNumber}}\n\nExpedite: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "capaNumber", "assignedTo", "targetDate", "complaintNumber", "actionUrl", "companyName"]
  },
  {
    templateKey: "capa-completed",
    templateName: "CAPA Completed",
    triggerEvent: "CAPA_COMPLETED",
    subject: "Action Completed: CAPA {{capaNumber}} Implemented",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("CAPA Implementation Marked Complete")}` +
        `<p style="margin:0 0 12px;">Corrective action implementation for <strong>CAPA {{capaNumber}}</strong> has been submitted. Objective evidence review is now pending.</p>` +
        infoTable(
          infoRow("CAPA No.", "{{capaNumber}}") +
            infoRow("Implemented By", "{{assignedTo}}") +
            infoRow("Linked Complaint", "{{complaintNumber}}")
        ) +
        emailButton("{{actionUrl}}", "Review Evidence") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nCAPA {{capaNumber}} implementation completed by {{assignedTo}}. Evidence review pending.\n\nReview: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "capaNumber", "assignedTo", "complaintNumber", "actionUrl", "companyName"]
  },
  {
    templateKey: "capa-evidence-uploaded",
    templateName: "CAPA Evidence Uploaded",
    triggerEvent: "CAPA_EVIDENCE_UPLOADED",
    subject: "Evidence Uploaded: CAPA {{capaNumber}} Ready for Review",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("CAPA Evidence Ready for Quality Review")}` +
        `<p style="margin:0 0 12px;">Implementation evidence documents have been uploaded for <strong>CAPA {{capaNumber}}</strong>.</p>` +
        infoTable(
          infoRow("CAPA No.", "{{capaNumber}}") +
            infoRow("Submitted By", "{{assignedTo}}") +
            infoRow("Evidence File(s)", "{{evidenceFileName}}")
        ) +
        emailButton("{{actionUrl}}", "Review & Verify Evidence") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nEvidence uploaded for CAPA {{capaNumber}} by {{assignedTo}}.\n\nFile: {{evidenceFileName}}\n\nReview: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "capaNumber", "assignedTo", "evidenceFileName", "actionUrl", "companyName"]
  },
  {
    templateKey: "capa-evidence-accepted",
    templateName: "CAPA Evidence Accepted",
    triggerEvent: "CAPA_EVIDENCE_ACCEPTED",
    subject: "Evidence Accepted: CAPA {{capaNumber}} Verified",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("CAPA Evidence Approved")}` +
        `<p style="margin:0 0 12px;">Submitted implementation evidence for <strong>CAPA {{capaNumber}}</strong> has been reviewed and <span style="color:#15803D;font-weight:700;">ACCEPTED</span>.</p>` +
        infoTable(
          infoRow("CAPA No.", "{{capaNumber}}") +
            infoRow("Reviewed By", "{{reviewedBy}}") +
            infoRow("Status", "Approved / Verification Phase")
        ) +
        emailButton("{{actionUrl}}", "View CAPA") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nEvidence for CAPA {{capaNumber}} accepted by {{reviewedBy}}.\n\nView: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "capaNumber", "reviewedBy", "actionUrl", "companyName"]
  },
  {
    templateKey: "capa-evidence-rejected",
    templateName: "CAPA Evidence Rejected",
    triggerEvent: "CAPA_EVIDENCE_REJECTED",
    subject: "Evidence Rejected: Action Required on CAPA {{capaNumber}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("CAPA Evidence Rejected &mdash; Revision Required")}` +
        `<p style="margin:0 0 12px;">The evidence submitted for <strong>CAPA {{capaNumber}}</strong> was <span style="color:#B91C1C;font-weight:700;">REJECTED</span>. Please revise and upload compliant proof.</p>` +
        infoTable(
          infoRow("CAPA No.", "{{capaNumber}}") +
            infoRow("Reviewed By", "{{reviewedBy}}")
        ) +
        highlightBox("<strong>Rejection Remarks:</strong><br>{{rejectionRemarks}}", "#B91C1C", "#FEF2F2") +
        emailButton("{{actionUrl}}", "Resubmit CAPA Evidence") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nEvidence for CAPA {{capaNumber}} was REJECTED by {{reviewedBy}}.\n\nRemarks: {{rejectionRemarks}}\n\nResubmit: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "capaNumber", "reviewedBy", "rejectionRemarks", "actionUrl", "companyName"]
  },
  {
    templateKey: "capa-effectiveness-verified",
    templateName: "CAPA Effectiveness Verified",
    triggerEvent: "CAPA_EFFECTIVENESS_VERIFIED",
    subject: "Effectiveness Verified: CAPA {{capaNumber}} Sustained",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("CAPA Effectiveness Verified &amp; Confirmed")}` +
        `<p style="margin:0 0 12px;">Post-implementation audit confirmed that corrective actions under <strong>CAPA {{capaNumber}}</strong> are <strong>EFFECTIVE</strong> and sustained.</p>` +
        infoTable(
          infoRow("CAPA No.", "{{capaNumber}}") +
            infoRow("Result", "Effective") +
            infoRow("Verified By", "{{verifiedBy}}")
        ) +
        emailButton("{{actionUrl}}", "View Verification Record") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nCAPA {{capaNumber}} effectiveness verified by {{verifiedBy}}. Result: Effective.\n\nView: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "capaNumber", "verifiedBy", "actionUrl", "companyName"]
  },
  {
    templateKey: "capa-not-effective",
    templateName: "CAPA Not Effective / Complaint Reopened",
    triggerEvent: "CAPA_NOT_EFFECTIVE",
    subject: "Alert: CAPA {{capaNumber}} Not Effective - Complaint Reopened",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Action Ineffective &mdash; Complaint Reopened")}` +
        `<p style="margin:0 0 12px;">Post-implementation verification determined that corrective action <strong>CAPA {{capaNumber}}</strong> was <span style="color:#B91C1C;font-weight:700;">NOT EFFECTIVE</span>. Linked complaint <strong>{{complaintNumber}}</strong> has been automatically reopened.</p>` +
        infoTable(
          infoRow("CAPA No.", "{{capaNumber}}") +
            infoRow("Linked Complaint", "{{complaintNumber}}") +
            infoRow("Reviewed By", "{{verifiedBy}}")
        ) +
        highlightBox("<strong>Verification Finding:</strong><br>{{verificationRemarks}}", "#B91C1C", "#FEF2F2") +
        emailButton("{{actionUrl}}", "Initiate Re-Investigation") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nALERT: CAPA {{capaNumber}} was NOT EFFECTIVE. Complaint {{complaintNumber}} has been reopened.\n\nReviewed By: {{verifiedBy}}\nFindings: {{verificationRemarks}}\n\nAction: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "capaNumber", "complaintNumber", "verifiedBy", "verificationRemarks", "actionUrl", "companyName"]
  },

  // ==================== SIGNATURES ====================
  {
    templateKey: "signature-prepared",
    templateName: "8D Report Prepared",
    triggerEvent: "COMPLAINT_PREPARED",
    subject: "8D Prepared: Complaint {{complaintNumber}} Ready for Review",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("8D Report Signed as Prepared")}` +
        `<p style="margin:0 0 12px;">The 8D investigation report for complaint <strong>{{complaintNumber}}</strong> has been signed by the preparation team and is awaiting formal Department Review.</p>` +
        infoTable(
          infoRow("Complaint No.", "{{complaintNumber}}") +
            infoRow("Prepared By", "{{signerName}}") +
            infoRow("Role", "Prepared By")
        ) +
        emailButton("{{actionUrl}}", "Perform Review Sign-Off") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nComplaint {{complaintNumber}} 8D report prepared by {{signerName}}. Ready for review.\n\nReview: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "signerName", "actionUrl", "companyName"]
  },
  {
    templateKey: "signature-reviewed",
    templateName: "8D Report Reviewed",
    triggerEvent: "COMPLAINT_REVIEWED",
    subject: "8D Reviewed: Complaint {{complaintNumber}} Ready for Approval",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("8D Report Reviewed &amp; Endorsed")}` +
        `<p style="margin:0 0 12px;">Complaint <strong>{{complaintNumber}}</strong> has been formally reviewed and is ready for Final Approval by Quality Leadership.</p>` +
        infoTable(
          infoRow("Complaint No.", "{{complaintNumber}}") +
            infoRow("Reviewed By", "{{signerName}}")
        ) +
        emailButton("{{actionUrl}}", "Approve 8D Report") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nComplaint {{complaintNumber}} 8D reviewed by {{signerName}}. Ready for final approval.\n\nApprove: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "signerName", "actionUrl", "companyName"]
  },
  {
    templateKey: "signature-approved",
    templateName: "8D Report Approved",
    triggerEvent: "COMPLAINT_APPROVED",
    subject: "8D Approved: Complaint {{complaintNumber}} Fully Authorized",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("8D Report Formally Approved")}` +
        `<p style="margin:0 0 12px;">Final approval has been granted for complaint <strong>{{complaintNumber}}</strong> by Quality Leadership.</p>` +
        infoTable(
          infoRow("Complaint No.", "{{complaintNumber}}") +
            infoRow("Approved By", "{{signerName}}")
        ) +
        emailButton("{{actionUrl}}", "View Approved 8D Report") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nComplaint {{complaintNumber}} 8D report approved by {{signerName}}.\n\nView: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "signerName", "actionUrl", "companyName"]
  },
  {
    templateKey: "signature-revoked",
    templateName: "8D Signature Revoked",
    triggerEvent: "SIGNATURE_REVOKED",
    subject: "Signature Revoked: Complaint {{complaintNumber}} 8D",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("8D Sign-Off Revoked")}` +
        `<p style="margin:0 0 12px;">A signature on complaint <strong>{{complaintNumber}}</strong> was <span style="color:#B91C1C;font-weight:700;">REVOKED</span> due to downstream document edits or explicit revocation.</p>` +
        infoTable(
          infoRow("Complaint No.", "{{complaintNumber}}") +
            infoRow("Revoked By", "{{revokedBy}}") +
            infoRow("Revoked Role", "{{signatureRole}}")
        ) +
        highlightBox("<strong>Reason:</strong><br>{{revocationReason}}", "#B91C1C", "#FEF2F2") +
        emailButton("{{actionUrl}}", "Review Impacted 8D") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nSignature on complaint {{complaintNumber}} was REVOKED by {{revokedBy}} (Role: {{signatureRole}}).\n\nReason: {{revocationReason}}\n\nReview: {{actionUrl}}\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "complaintNumber", "revokedBy", "signatureRole", "revocationReason", "actionUrl", "companyName"]
  },

  // ==================== SUMMARIES ====================
  {
    templateKey: "summary-daily",
    templateName: "Daily Management Digest",
    triggerEvent: "DAILY_SUMMARY",
    subject: "Daily Quality Digest: {{totalOpen}} Open Complaints, {{overdueCount}} Overdue",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Daily Complaint &amp; CAPA Summary")}` +
        `<p style="margin:0 0 12px;">Here is your daily operational summary for <strong>{{today}}</strong> across active quality workflows.</p>` +
        infoTable(
          infoRow("Open Complaints", "{{totalOpen}}") +
            infoRow("Due Soon (&lt;24h)", "{{dueSoonCount}}") +
            infoRow("Overdue Complaints", "{{overdueCount}}") +
            infoRow("Open CAPA Items", "{{openCapasCount}}") +
            infoRow("Overdue CAPAs", "{{capaOverdueCount}}")
        ) +
        emailButton("{{appUrl}}/tat", "Open TAT Dashboard") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nDaily Quality Summary for {{today}}:\n\nOpen Complaints: {{totalOpen}}\nDue Soon: {{dueSoonCount}}\nOverdue Complaints: {{overdueCount}}\nOpen CAPAs: {{openCapasCount}}\nOverdue CAPAs: {{capaOverdueCount}}\n\nDashboard: {{appUrl}}/tat\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "today", "totalOpen", "dueSoonCount", "overdueCount", "openCapasCount", "capaOverdueCount", "appUrl", "companyName"]
  },
  {
    templateKey: "summary-weekly",
    templateName: "Weekly Quality Digest",
    triggerEvent: "WEEKLY_SUMMARY",
    subject: "Weekly Quality Performance Report: {{period}}",
    htmlBody: wrapEmailLayout(
      `${greeting()}${heading("Weekly Quality Performance Overview")}` +
        `<p style="margin:0 0 12px;">Here is the executive weekly summary of quality non-conformities, corrective action velocity, and repeat issues for <strong>{{period}}</strong>.</p>` +
        infoTable(
          infoRow("Reporting Period", "{{period}}") +
            infoRow("Active Complaints", "{{totalOpen}}") +
            infoRow("SLA Breaches", "{{overdueCount}}") +
            infoRow("Repeat Non-Conformities", "{{repeatCount}}") +
            infoRow("Open CAPAs", "{{openCapasCount}}")
        ) +
        emailButton("{{appUrl}}/reports", "Review Full Reports") +
        closing()
    ),
    textBody:
      "Hello {{recipientName}},\n\nWeekly Quality Performance Report ({{period}}):\n\nActive Complaints: {{totalOpen}}\nSLA Breaches: {{overdueCount}}\nRepeat Non-Conformities: {{repeatCount}}\nOpen CAPAs: {{openCapasCount}}\n\nReports: {{appUrl}}/reports\n\nRegards,\n{{companyName}}",
    supportedVariables: ["recipientName", "period", "totalOpen", "overdueCount", "repeatCount", "openCapasCount", "appUrl", "companyName"]
  }
];
