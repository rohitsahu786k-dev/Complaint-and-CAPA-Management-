import { describe, expect, it, beforeAll } from "vitest";
import {
  renderTemplate,
  getSampleVariables,
  variablesInTemplate,
  escapeHtml,
  sanitizeHtml
} from "../lib/email-template-renderer";
import {
  wrapEmailLayout,
  emailButton,
  infoTable,
  infoRow,
  highlightBox,
  statusBadge
} from "../lib/email-layout";
import { getSmtpStatus } from "../lib/mailer";
import { EMAIL_TRIGGER_EVENTS } from "@shared/constants/domain";
import { DEFAULT_EMAIL_TEMPLATES } from "../lib/email-template-defaults";

beforeAll(() => {
  process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "12345678901234567890123456789012";
  process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || "1234567890123456";
});

describe("Email Template Renderer", () => {
  it("should replace {{variable}} placeholders with provided values", () => {
    const template = "Hello {{recipientName}}, complaint {{complaintNumber}} is {{status}}.";
    const result = renderTemplate(template, {
      recipientName: "Jane Doe",
      complaintNumber: "CMP-2026-0001",
      status: "UNDER_INVESTIGATION"
    });

    expect(result.rendered).toBe("Hello Jane Doe, complaint CMP-2026-0001 is UNDER_INVESTIGATION.");
    expect(result.missingVariables).toEqual([]);
  });

  it("should escape special characters with escapeHtml", () => {
    expect(escapeHtml("<script>\"'&")).toBe("&lt;script&gt;&quot;&#39;&amp;");
  });

  it("should safely escape HTML tags and sanitize dangerous scripts in variables", () => {
    const template = "<p>Customer remarks: {{remarks}}</p>";
    const result = renderTemplate(template, {
      remarks: "<script>alert('xss')</script><b>bold</b>"
    });

    // Unsafe script tags should be stripped or escaped
    expect(result.rendered).not.toContain("<script>");
    expect(result.rendered).not.toContain("alert('xss')");
  });

  it("should strip dangerous event handler attributes like onerror and onload from HTML", () => {
    const rawHtml = '<img src="invalid" onerror="alert(1)" /><a href="javascript:steal()">link</a>';
    const sanitized = sanitizeHtml(rawHtml);

    expect(sanitized).not.toContain("onerror");
    expect(sanitized).not.toContain("javascript:steal()");
  });

  it("should track missing variables without throwing an error", () => {
    const template = "Ticket {{ticketId}} by {{reportedBy}} at {{location}}.";
    const result = renderTemplate(template, {
      ticketId: "TCK-101"
    });

    expect(result.rendered).toContain("Ticket TCK-101");
    expect(result.missingVariables).toContain("reportedBy");
    expect(result.missingVariables).toContain("location");
  });

  it("should extract variable tokens from template strings", () => {
    const vars = variablesInTemplate(
      "Subject: {{complaintNumber}} assigned to {{ownerName}}",
      "Body: Please check {{complaintNumber}} by {{dueDate}}."
    );
    expect(vars).toContain("complaintNumber");
    expect(vars).toContain("ownerName");
    expect(vars).toContain("dueDate");
  });

  it("should provide sample variables for all 34 default email triggers", () => {
    for (const trigger of Object.values(EMAIL_TRIGGER_EVENTS)) {
      const sample = getSampleVariables(trigger);
      expect(sample).toBeDefined();
      expect(typeof sample).toBe("object");
      expect(sample.appUrl).toBeDefined();
    }
  });
});

describe("Corporate Email Layout", () => {
  it("should include ONEPWS branding, DM Sans web fonts, and no emojis", () => {
    const buttonHtml = emailButton("https://portal.onepws.com/complaints/123", "View Complaint in Portal");
    const tableHtml = infoTable(
      infoRow("Customer", "Acme Corp") + infoRow("Stage", "Containment (D3)")
    );
    const boxHtml = highlightBox("Mandatory containment action within 24h.");
    const badgeHtml = statusBadge("UNDER_INVESTIGATION");

    const innerContent = `
      <p>Hello Team,</p>
      ${badgeHtml}
      ${tableHtml}
      ${boxHtml}
      ${buttonHtml}
    `;

    const html = wrapEmailLayout(innerContent);

    expect(html).toContain("ONEPWS");
    expect(html).toContain("#E31E25"); // brand red
    expect(html).toContain("DM Sans");
    expect(html).toContain("View Complaint in Portal");
    expect(html).toContain("https://portal.onepws.com/complaints/123");
    expect(html).toContain("Acme Corp");
    expect(html).toContain("Containment (D3)");
    expect(html).toContain("UNDER_INVESTIGATION");

    // Ensure zero emoji presence
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(html)).toBe(false);
  });
});

describe("SMTP Security", () => {
  it("should never expose SMTP_APP_PASSWORD in status reports", () => {
    const status = getSmtpStatus();

    // Verify properties
    expect(status).toHaveProperty("isConfigured");
    expect(status).toHaveProperty("host");
    expect(status).toHaveProperty("port");
    expect(status).toHaveProperty("secure");
    expect(status).toHaveProperty("fromEmail");
    expect(status).toHaveProperty("fromName");

    // Under no circumstances should password or secret keys be returned
    expect(status).not.toHaveProperty("password");
    expect(status).not.toHaveProperty("appPassword");
    expect(status).not.toHaveProperty("auth");
    expect((status as Record<string, unknown>).SMTP_APP_PASSWORD).toBeUndefined();
  });
});

describe("Default Templates Integrity", () => {
  it("should have pre-seeded templates for all 34 required trigger events", () => {
    const requiredTriggers = Object.values(EMAIL_TRIGGER_EVENTS);
    const preSeededTriggers = DEFAULT_EMAIL_TEMPLATES.map((t) => t.triggerEvent);

    for (const req of requiredTriggers) {
      expect(preSeededTriggers).toContain(req);
    }
  });

  it("every default template must have a valid templateKey, subject, htmlBody, and textBody", () => {
    for (const tpl of DEFAULT_EMAIL_TEMPLATES) {
      expect(tpl.templateKey).toMatch(/^[a-z0-9-]+$/);
      expect(tpl.subject.trim().length).toBeGreaterThan(0);
      expect(tpl.htmlBody.trim().length).toBeGreaterThan(0);
      expect(tpl.textBody.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(tpl.supportedVariables)).toBe(true);
    }
  });
});
