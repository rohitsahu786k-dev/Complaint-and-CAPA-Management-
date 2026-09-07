# 6S Reference Architecture Notes

Reference reviewed from `D:\onepws\6S-AuditPro-reference` on branch `master`. It was used as read-only source material for architecture patterns only.

## Reusable Patterns

| Pattern | 6S Source | Complaint/CAPA Adaptation |
| --- | --- | --- |
| Cached Mongo connection | `lib/db.ts` | Reused as `server/config/db.ts` with `globalThis` cache, rejected promise reset, `bufferCommands: false`, pool cap, and server selection timeout. |
| Central env names | `.env.example` | Adapted to MERN/Vite with no client-side secrets and `server/config/env.ts` Zod validation. |
| Password hashing | `lib/auth.ts`, `services/user.service.ts` | Reused bcryptjs approach with `passwordHash` select false. |
| Current user sanitization | `lib/auth.ts` | Adapted to Express middleware and `ApiUser` response; never returns `passwordHash`. |
| Forgot/reset password | `app/api/auth/forgot-password`, `app/api/auth/reset-password` | Adapted with random raw token, SHA-256 token hash in DB, 1 hour expiry, and generic request response. |
| Change password | `app/api/auth/change-password`, `app/api/users/[id]/change-password` | Adapted as self-service current-password endpoint; admin reset pattern reserved for user management without exposing old password. |
| Email layout/template pattern | `lib/email-layout.ts`, `lib/email-template-defaults.ts`, `lib/email-template-renderer.ts` | Not fully implemented in Phase 1, but the reusable direction is templated mail, HTML sanitization, supported variables, and audit/log visibility. |
| SMTP sending | `lib/mailer.ts`, `services/email.service.ts` | Adapted as `server/services/email.service.ts`; skips if SMTP is not configured rather than leaking details. |
| Email logs/retry | `models/EmailLog.ts`, `services/email-log.service.ts`, `app/api/email/retry` | Documented for later phases; not yet implemented because complaint/CAPA triggers are not built. |
| Recipient resolution | `services/email-recipient.service.ts` | Later Complaint/CAPA implementation should resolve owners, department HOD/manager, Quality Head, management, and configured escalation recipients from `Employee`, `Department`, `User`, and `Role`. |
| Cloudinary upload | `lib/cloudinary.ts`, `services/upload.service.ts`, `app/api/upload` | Adapted as buffer upload service with `resource_type: auto`, safe folder suffix, and server-side byte limit. Route will be added with domain attachment models in later phase. |
| Cron authorization | `lib/cron-auth.ts`, `app/api/cron/*` | Pattern reserved: `CRON_SECRET` via bearer or header, no public cron mutations. |
| Admin email UI | `components/admin/Email*`, `EscalationMailPanel` | Useful UI pattern for later admin settings: tables, template editor, variable helper, test/retry controls. |
| Vercel API boundaries | `app/api/*` | Adapted to Express through `api/index.ts` for one repo and same-origin `/api` paths without moving to Next.js. |

## Intentional Differences

- 6S role names, audit zones, findings, and severity workflow are not copied into Complaint/CAPA business logic.
- The Complaint/CAPA role names and permissions remain aligned with the legacy HTML and user requirements.
- The app uses React Router/Vite and Express, not Next.js route handlers or NextAuth.
- 6S default seed credentials were not copied. Public repository security requires no hardcoded credentials.

## Later Phase Candidates

- Email templates model, template variable helper, logs table, retry endpoint, and escalation mail panel.
- Cron routes for overdue TAT reminders, CAPA due reminders, summary emails, and D7 long-term effectiveness checks.
- Cloudinary-backed complaint attachments, CAPA evidence, company logos, and document/photo preview metadata.
