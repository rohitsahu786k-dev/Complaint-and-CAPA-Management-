# Legacy Feature Inventory

Source reviewed: `C:\Users\rohit.sahu\Downloads\complaint_portal_New_2.9.26.html`

The HTML is a single-file localStorage prototype. It embeds base64 logos, plaintext seeded users, browser-only persistence, Chart.js, XLSX, jsPDF, and several later patch blocks that override earlier functions. Production must preserve final effective behavior after those patches execute, while replacing storage, auth, authorization, files, emails, and exports with server-backed MERN services.

## Final Routes

| Route | Final Purpose | Notes |
| --- | --- | --- |
| `#/dashboard` | KPI cards and charts for complaints/CAPA/TAT/repeats/root cause category | Later patch adds root cause category doughnut/table card. |
| `#/complaints` | Filtered complaint list and new complaint modal | Supports type, status, priority, category, department, TAT and search filters. |
| `#/complaint/:id` | Complaint detail tabs | Tabs include workflow, 8D, internal investigation, CAPA, effectiveness, attachments, audit, and patched notes. |
| `#/tat` | Turnaround-time compliance dashboard | Later overrides add delay drilldowns, pareto by delay reason, and expanded stage targets. |
| `#/repeat` | Repeat complaint analysis | Uses same company plus customer/product/category inside repeat window. |
| `#/capa` | CAPA dashboard | Later patch renames it CAPA Dashboard and adds link to tracker. |
| `#/capa-master` | CAPA master list | Later route for master CAPA list, filters, and Excel export. |
| `#/capa-tracker` | CAPA tracker | Final patch adds filterable/exportable CAPA review list with evidence and effectiveness columns. |
| `#/audit` | Audit log | Filterable by user/entity/action/search, last 500 shown. |
| `#/notifications` | User notification center | Marks current user notifications read when opened. |
| `#/reports` | Report catalog | Final override converts reports to preview/download definitions. |
| `#/master` | Master data | Companies, users, roles, departments, categories, priorities, TAT, employees, counters. |
| `#/import` | Import/export | Complaint import template, complaint import, full DB export/import. |

## Data Domains

| Domain | Legacy Data | Final Notes |
| --- | --- | --- |
| Users and roles | `DB.users`, `DB.roles` | Plaintext prototype passwords must be discarded. Role concepts and permission keys are preserved. |
| Companies | `DB.companies` | Name, code, logo/base64, document number, revision, effective date, complaint prefix, active. |
| Departments | `DB.departments` | Drives routing, filters, TAT escalation, CAPA ownership, and employee records. |
| Employees | `DB.employees` from v2 migration | Employee code, name, email, designation, department, company, manager/HOD details, linked user. |
| Complaints | `DB.complaints` | External/internal workflow, status, owner, responsible departments, 8D fields, internal investigation, attachments, notes, signatures. |
| CAPA | `DB.capas` | Corrective/preventive/systemic/containment actions, owner, due date, status, evidence, quality review, effectiveness. |
| Attachments | `DB.attachments` | Stored as localStorage data URLs; final app must use Cloudinary/server metadata. |
| Audit | `DB.audit` | Create/edit/delete/close/login/export/signature operations logged; capped at 5000 in prototype. |
| Notifications | `DB.notifications` | In-app unread/read messages linked to routes; capped at 500 in prototype. |
| Counters | `DB.counters` | Complaint number uses company prefix + financial year + sequence; CAPA derives from complaint number. |
| TAT config | `DB.tatConfig` | Ack hours, containment, RCA, CAPA assignment, D3/D5/D6 targets, D7 ST/LT effectiveness windows. |
| Master lists | categories, priorities, delay reasons, fishbone cats, root cause categories, permission master | Used in forms, reports, dashboards and validations. |

## Workflow and Rules

| Area | Effective Legacy Behavior |
| --- | --- |
| Authentication | Browser login matches plaintext username/password in `DB.users`; session kept in `DB.session`. Production replaces fully. |
| Visibility | Company scope comes from `companyIds`; `*` sees all. Complaint/CAPA lists filter by company and some owner/department rules. |
| Complaint numbering | `nextComplaintNumber(companyId, refDate)` increments `prefix-FY` counters and pads sequence to 5 digits. |
| Repeat detection | `findPotentialDuplicates` checks repeat window, same company, same category, and matching customer or product. |
| TAT | `computeTATDue` applies priority multiplier to ack/containment/RCA/CAPA dates; later patches add D3/D5/D6 and D7 ST/LT windows. |
| Workflow gates | Mark acknowledgement, containment, RCA, CAPA assignment; overdue stages require delay reason/category. |
| 8D external workflow | D0 containment, D1 team, D2 problem, D3 interim actions, D4 root cause and QC tools, D5 actions, D6 verification, D7 prevention/effectiveness, D8 closure/recognition. |
| Internal complaints | Uses internal investigation tab instead of full external 8D, with department-to-department fields and shared root cause classification. |
| CAPA | Add/edit/delete CAPA items, assign owner/dept/priority/due date/status/evidence/effectiveness. |
| Evidence review | Final patch adds CAPA evidence file upload, delete, Quality Head/Master Admin acceptance or rejection; rejection remarks required. |
| Closure | Later closure validation checks required 8D/signature/effectiveness/CAPA conditions; D7 short-term no-repeat checkbox; LT failure can auto-reopen. |
| Signatures | v3 migration adds prepared/reviewed/approved signatures with employee snapshot; permissions control prepare/review/approve. |
| Deletion | Final patch permits Master Admin-only complaint delete with typed complaint-number confirmation and cascades CAPAs/attachments while retaining audit. |
| Notes | Final patch adds timestamped notes/MOM with kind, reference date, creator, delete authorization, and Excel export. |

## Reports and Exports

Final `REPORT_DEFS` includes consolidated complaints, open complaints, overdue complaints, TAT compliance, person-wise CAPA, customer summary, repeat complaints, root cause category analysis, management review summary, delay reason Pareto, employee master, long-term effectiveness, and CAPA master/tracker links. Legacy exports use client-side XLSX/jsPDF. Production should generate or authorize exports through API routes and audit every export.

## Later Patch Blocks

The bottom of the file contains v2/v3/v4 and final patch code that changes behavior after original functions are defined:

- v2 adds employees, expanded TAT fields, employee master import/export, and overrides 8D array target autofill.
- TAT/workflow override adds stage gap calculation and stricter overdue delay capture.
- 8D override adds action target dates, D6 document controls, D7 short-term and long-term effectiveness.
- Closure override adds detailed validation, D7 ST acknowledgement, and long-term follow-up behavior.
- CAPA master and 8D Excel/PDF overrides add richer exports.
- v3 adds prepare/review/approve signatures and rewrites PDF signature output.
- v4 adds root cause categories, permission master, role permission UI, department cards, report previews, notes, CAPA tracker, evidence review, permanent delete, and multi-file new complaint preview.
