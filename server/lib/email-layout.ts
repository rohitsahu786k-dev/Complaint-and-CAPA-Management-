export const BRAND_RED = "#E31E25";
export const BRAND_RED_DARK = "#B91C1C";
export const BRAND_CHARCOAL = "#2B2A28";
export const TEXT_DARK = "#1E293B";
export const TEXT_MUTED = "#64748B";
export const BORDER_COLOR = "#E2E8F0";
export const BG_LIGHT = "#F8FAFC";

export const DEFAULT_EMAIL_LOGO_URL =
  "https://res.cloudinary.com/mcymctsr/image/upload/v1783505369/onepws-6s-auditpro/branding/onepws-logo-email.png";

/**
 * Wraps content in a robust table-based responsive HTML shell suitable for Outlook,
 * Gmail, Apple Mail, and mobile clients. Zero emojis, pure corporate branding.
 */
export function wrapEmailLayout(bodyHtml: string): string {
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

/**
 * Creates a prominent CTA button.
 */
export function emailButton(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;">
  <tr>
    <td align="center" style="border-radius:6px;background-color:${BRAND_RED};">
      <a href="${url}" target="_blank" style="display:inline-block;padding:11px 24px;font-size:13px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:6px;letter-spacing:0.02em;">${label}</a>
    </td>
  </tr>
</table>`;
}

/**
 * Renders an info table for metadata like Complaint ID, Priority, Due Date, Owner.
 */
export function infoTable(rows: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;border-top:1px solid ${BORDER_COLOR};border-bottom:1px solid ${BORDER_COLOR};">
    ${rows}
  </table>`;
}

/**
 * Renders a single row in the info table.
 */
export function infoRow(label: string, valueToken: string): string {
  return `<tr>
    <td style="padding:7px 0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:${TEXT_MUTED};width:34%;vertical-align:top;">${label}</td>
    <td style="padding:7px 0 7px 12px;font-size:13px;font-weight:500;color:${TEXT_DARK};vertical-align:top;">${valueToken}</td>
  </tr>`;
}

/**
 * Highlighting blockquote for notes or descriptions.
 */
export function highlightBox(content: string, borderColor = BRAND_RED, bgColor = "#f8fafc"): string {
  return `<div style="margin:14px 0;padding:12px 16px;background-color:${bgColor};border-left:3px solid ${borderColor};border-radius:4px;color:#334155;font-size:13px;line-height:1.5;">${content}</div>`;
}

/**
 * Renders a status badge token.
 */
export function statusBadge(statusToken: string, color = BRAND_RED): string {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:0.03em;background-color:#fef2f2;color:${color};border:1px solid #fecaca;">${statusToken}</span>`;
}
