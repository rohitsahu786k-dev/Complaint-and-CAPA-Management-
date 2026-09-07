# Phase 2 Report — Complaint and CAPA Domain and Backend Workflows

Status: complete for the backend domain. Verified with lint, typecheck and 56 passing tests. The production bundle (`npm run build`) was deliberately not produced at the request of the project owner.

Phase 1 architecture was extended, not replaced. Nothing from Phase 1 was removed.

## Where the rules live

All workflow rules are pure functions in `server/domain/`, with no Mongoose dependency. Services in `server/services/` load documents, call those rules, and persist. Routes in `server/routes/` only parse, authorize and delegate. That separation is what makes the rules testable without a database and impossible to bypass from the client.

| Module | Responsibility |
| --- | --- |
| `domain/numbering.ts` | Financial-year label, counter key, complaint and CAPA number formatting |
| `domain/tat.ts` | Stage due dates, priority multiplier, health classification, D3/D5/D6 target dates, reminder timestamps, escalation level selection |
| `domain/repeat.ts` | Repeat matching rule and matching basis |
| `domain/workflow.ts` | Per-stage gates, stage sequencing, delay-reason requirements |
| `domain/closure.ts` | Full closure validation and the long-term auto-reopen rule |
| `domain/signature.ts` | Signature permissions, sequence, separation of duties, revocation cascade |
| `domain/capa-rules.ts` | CAPA state machine, evidence review, effectiveness verification |
| `domain/rbac.ts` | Permission, company-scope, owner-scope and department-scope checks |
| `domain/upload-rules.ts` | Filename sanitisation, MIME and size validation, Cloudinary metadata construction |

## 1. Models

New: `Complaint`, `Capa`, `Attachment`, `Notification`, `Counter`, `ComplaintNote`, plus `Category`, `Priority`, `DelayReason`, `RootCauseCategory` (in `models/masters.ts`) and `TATConfiguration`, `EscalationConfiguration`, `NumberingConfiguration` (in `models/configuration.ts`). Existing Phase 1 models are unchanged.

Indexes: unique complaint number and CAPA number; company; status; owner; responsible department; received date; CAPA due date; CAPA status and owner; repeat flag; effectiveness; evidence review status; a text index on complaint number, description, customer, product and project; and compound indexes for the list screens (`company + status + receivedAt`, `company + category + customer + receivedAt`, `company + product + receivedAt`). `Attachment` is indexed by `entityType + entityId + purpose` and by `publicId`, which is also what future email-log lookups will key on.

No binary or base64 content is stored in MongoDB. `Attachment` holds Cloudinary metadata only.

## 2. Complaint numbering

`Counter` holds one document per prefix and financial year. `mongoCounterStore.increment` uses a single atomic `findOneAndUpdate` with `$inc` and `upsert`, so concurrent registrations can never share a sequence. The prefix, padding and financial-year reset come from `NumberingConfiguration` with the company prefix as fallback. CAPA numbers derive from the complaint number (`<complaint>-CAPA-01`). Every numbering configuration change is written to the audit log as `MASTER_DATA_CHANGE`.

## 3. Complaint creation

`POST /api/complaints` validates with a shared Zod schema whose `superRefine` enforces the different required fields per type: an external complaint needs a customer and a responsible department, an internal complaint needs both the raising and the against department. On success the server generates the number, runs repeat detection, writes the `Registered` workflow entry, writes a `CREATE` audit record, notifies the owner and every Quality Head scoped to that company, and returns the persisted complaint.

## 4. Repeat engine

Server-side only. The window defaults to 60 days and is read from `TATConfiguration.repeatWindowDays`, resolved company-first then global then default. The rule is same company, same category, and a matching customer or product inside the window. Matches are stored as `isRepeat`, `repeatOf[]` (each with the linked complaint, its number and the matching basis) and a human-readable `repeatBasis`. `POST /api/complaints/:id/repeat-review` lets an authorized user confirm or clear the linkage, recording the reviewer, timestamp and remarks.

## 5. External 8D

`PATCH /api/complaints/:id/8d` persists D0 through D8: emergency response; the D1 team with employee links and auto-filled details; the D2 5W2H block; D3 containment rows with responsibility, target and status; D4 QC tools, occurrence, escape and systemic root causes, three separate 5-Why chains, the six-category fishbone and the 6M-plus-Management-plus-Supplier root cause category; D5 occurrence, escape and systemic action groups with safety concerns and customer approval; D6 verification rows with CTQ impact plus the structured document checklist of eight document types each carrying Attached-with-revision or NA-with-justification; D7 short-term and long-term effectiveness with configurable windows; and D8 recognition, reviewer and closing date. Target dates for D3, D5 and D6 rows come from `computeActionTargetDate`, never from a hardcoded number. Every save is audited.

## 6. Internal complaints

Internal complaints keep their reduced workflow through `PATCH /api/complaints/:id/internal`: problem statement, investigation summary and findings, a single-chain 5-Why, root cause, corrective action, evidence and closure. The gate and closure validators branch on complaint type, so an internal complaint is never asked for a D1 team, QC tools, an escape chain or the D6 document checklist.

## 7. Workflow gating

`POST /api/complaints/:id/stage` refuses to advance on a button press alone. It runs three checks: sequence (stages run in order and each may only be completed once), content (the final legacy `workflowStageGaps` rules), and delay (a stage completed after its due date must carry a delay reason drawn from active master data plus an explanation). Failures return HTTP 422 with a `issues` array naming the exact section and field. There is no vague failure message on a business rule.

## 8. TAT engine

`server/domain/tat.ts` is the only place stage dates are calculated. It produces acknowledgement, containment, RCA and CAPA due dates scaled by the priority multiplier, classifies each stage as on-time, due-soon or overdue, and exposes the extended D3, D5, D6, D7 short-term and D7 long-term planned days. `dueSoonHours` is configurable rather than fixed at 24. All values are Master Admin editable through `PUT /api/configuration/tat`. Ten unit tests cover it.

## 9. Delay reasons and escalation

The nine legacy delay reasons, the four escalation levels (Owner, Department Head at 24h, Quality Head at 72h, Management at 168h) and the 50 / 75 / 90 percent reminder thresholds are seeded into MongoDB and read through `config.service.ts`. `escalationLevelFor` and `reminderTimestamps` take those values as arguments, so no email or UI function contains a hardcoded threshold. Editable through `PUT /api/configuration/escalation` and `POST /api/configuration/lists/delay-reasons`.

## 10. CAPA domain

Full CRUD with number, linked complaint, company, type, action, owner, department, priority, assigned date, due date, completed date, status, textual evidence, delay reason, effectiveness, verification date, verifier, effectiveness evidence and verification method. Multiple CAPAs per complaint are supported and numbered by sequence. The state machine rejects illegal jumps (for example Open straight to Closed) and refuses to close a CAPA without evidence. Authorization uses `canEditCapa`, which grants the CAPA owner their own items, a Department Head their department, a Quality Head verification rights, a coordinator the complaints they may already edit, and a Master Admin everything, always inside company scope.

## 11. CAPA evidence review

The owner uploads evidence; a Quality Head or Master Admin accepts or rejects it. Rejection without remarks is refused. A re-upload after a rejection resets the review to Pending while carrying the previous rejection remarks forward, and every decision is appended to `evidenceReviewHistory` in addition to the audit log, so the rejection history is never destroyed.

## 12. Effectiveness verification

Separate from closure. Verification requires a completed CAPA, a verification method and an evidence reference. `Effective` closes the CAPA. `Not Effective` sets the CAPA to `Rejected/Reopened` and then reopens the linked complaint: status changes, a workflow log entry is appended, a `REOPEN` audit event is written and the owner is notified at high priority. The same reopen path serves the D7 long-term `Not Sustained` result and a `Not Effective` overall complaint effectiveness. The Phase 4 email trigger hooks onto this single path.

## 13. Digital signatures

Prepared, then Reviewed, then Approved, enforced server-side. Prepared is open to editors and coordinators, Reviewed to a Department Head, Quality Head or Management, Approved to the Quality Head for the company or a Master Admin. Signing stores a snapshot of user id, name, designation, department, email, timestamp and notes. Self-review and self-approval are blocked outright rather than merely warned about, which is a deliberate hardening of the browser-confirm behaviour in the prototype. Only a Master Admin can revoke, only with a reason of at least five characters, and revoking a stage invalidates every later stage. The Approved signature is a closure gate.

## 14. Final closure

`POST /api/complaints/:id/close` runs the full legacy `detailedValidateForClosure` on the server and returns every unmet requirement grouped by section. External complaints need the four workflow stages, D0, D1, D2 what, QC tools, three 5-Why chains of at least three whys, all three root causes, at least one D5 action, a resolved D6 checklist entry for every document type, at least one CAPA and all three signatures. Internal complaints need the problem statement, a three-step 5-Why, a root cause, a CAPA and the signatures. Open CAPAs produce an explicit warning that the caller must acknowledge with `force`. Closure stores `closedAt`, `closedBy`, `closureRemarks` and the D7 no-repeat confirmation. Reopen requires a reason and is audited.

## 15. Cloudinary storage

Signed direct upload. `POST /api/attachments/signature` returns a short-lived signature, the folder and the public API key; the browser uploads straight to Cloudinary; `POST /api/attachments/confirm` verifies the asset through the Cloudinary Admin API, re-checks folder, MIME type and byte size against the server-side allowlist, deletes the asset if it fails, and stores only metadata: public id, secure URL, resource type, original filename, MIME type, bytes, width, height, uploader, timestamp, entity type, entity id and purpose. `CLOUDINARY_API_SECRET` never reaches the browser and no file passes through the API. Deleting an attachment removes the Cloudinary asset too. Dangerous extensions, path traversal, empty files and anything over 10 MB are rejected.

## 16. Audit trail

`writeAudit` records timestamp, actor, actor name snapshot, action, entity, entity id, before, after and metadata. Actions in use: CREATE, UPDATE, DELETE, ASSIGN, ACKNOWLEDGE, STAGE_COMPLETE, UPLOAD, DELETE_ATTACHMENT, SIGN, UNSIGN, CLOSE, REOPEN, CAPA_EFFECTIVENESS, EVIDENCE_ACCEPT, EVIDENCE_REJECT, MASTER_DATA_CHANGE, LOGIN, LOGOUT and the password events. A request correlation id is attached to every request. `GET /api/audit` is read-only and permission-gated; there is no API that updates or deletes an audit entry, so the log is append-only through the application. Deleting a complaint keeps its audit history.

## 17. In-app notifications

Persistent in MongoDB with recipient, message, category, priority, entity reference, link, read flag and timestamps. `GET /api/notifications` (paginated, with an unread count), `POST /api/notifications/:id/read` and `POST /api/notifications/read-all`. Nothing uses localStorage.

## 18. API quality

Every route parses input with Zod, returns `{ data }` on success and `{ message, issues }` on failure, uses 400 for validation, 401 unauthenticated, 403 unauthorized, 404 missing, 409 conflict and 422 for a business rule. List endpoints require pagination and cap the page size at 100; sorting, filtering and regex-escaped text search are supported. No endpoint returns a whole collection by default.

## 19. Tests

56 tests across five files, all passing.

| Area | File |
| --- | --- |
| Financial year, number formatting, concurrency (50 parallel allocations, no duplicates), per-prefix isolation | `server/domain/numbering.test.ts` |
| TAT due dates, priority multiplier, health classification, action target dates, reminders, escalation selection | `server/domain/rules.test.ts` |
| Repeat detection including negative cases and self-match | `server/domain/rules.test.ts` |
| RBAC: wildcard, company scope, owner scope, department scope, closure, CAPA ownership | `server/domain/rules.test.ts` |
| External and internal workflow gates, stage sequencing, delay capture | `server/domain/workflow.test.ts` |
| Closure validation including the D6 checklist and the long-term auto-reopen rule | `server/domain/workflow.test.ts` |
| Signature sequence, role permissions, separation of duties, revocation cascade, snapshot | `server/domain/workflow.test.ts` |
| CAPA transitions, evidence rejection remarks, re-upload reset, effectiveness, Not Effective to reopen | `server/domain/capa.test.ts` |
| Cloudinary metadata and upload validation | `server/domain/capa.test.ts` |

## New API surface

```
GET    /api/complaints                    list, filter, sort, search, paginate
POST   /api/complaints                    register (numbering, repeat, audit, notify)
GET    /api/complaints/:id                detail with TAT plan and permissions
POST   /api/complaints/:id/stage          gated workflow stage completion
PATCH  /api/complaints/:id/8d             external 8D save
PATCH  /api/complaints/:id/internal       internal investigation save
POST   /api/complaints/:id/signatures     sign
DELETE /api/complaints/:id/signatures     revoke (Master Admin, reason required)
POST   /api/complaints/:id/close          validated closure
POST   /api/complaints/:id/reopen         reopen with reason
POST   /api/complaints/:id/repeat-review  confirm or clear repeat linkage
POST   /api/complaints/:id/effectiveness  overall effectiveness
GET    /POST /DELETE  /api/complaints/:id/notes[/:noteId]
GET    /api/complaints/:id/audit
DELETE /api/complaints/:id                Master Admin, typed confirmation

GET    /api/capas                         list, filter, sort, search, paginate
POST   /api/capas/complaint/:complaintId  create
PATCH  /api/capas/:id                     update with state machine
DELETE /api/capas/:id
POST   /api/capas/:id/evidence            link an uploaded evidence file
POST   /api/capas/:id/evidence/review     accept or reject
POST   /api/capas/:id/effectiveness       verify

POST   /api/attachments/signature         signed direct upload
POST   /api/attachments/confirm           verify and persist metadata
GET    /api/attachments                   list for an entity
DELETE /api/attachments/:id               permission-checked, removes the Cloudinary asset

GET    /api/notifications
POST   /api/notifications/:id/read
POST   /api/notifications/read-all

GET    /api/audit                         read-only, audit.view

GET    /api/configuration                 everything the forms need
PUT    /api/configuration/tat | /escalation | /numbering
POST   /api/configuration/lists/:list     delay reasons, root cause categories
PATCH  /api/configuration/lists/:list/:id
POST   /api/configuration/categories | /priorities
PATCH  /api/configuration/priorities/:id
```

## Commands executed

| Command | Result |
| --- | --- |
| `npx tsc -b` | Passes, no errors |
| `npx eslint .` | Passes, no errors, no warnings |
| `npx vitest run` | 5 files, 56 tests, all passing |
| `npx prettier --write` | Applied across `server`, `shared`, `src`, `api` |
| `npm run build` | Not run. The project owner asked for no production build in this session. |

## What Phase 2 does not include

The React screens for complaints, the 8D form, CAPA, TAT, repeat analysis, reports and master data remain Phase 3. Reports, Excel and PDF generation, email automation, escalation mail and cron endpoints remain Phases 3 and 4. `docs/FEATURE_PARITY.md` tracks each of them.

## Known blockers

None internal. Exercising these endpoints end to end needs `MONGODB_URI`, `JWT_SECRET` and `COOKIE_SECRET` in a local `.env`, then `npm run seed` with `SEED_ADMIN_USERNAME` and `SEED_ADMIN_PASSWORD` set. Attachments additionally need the four Cloudinary variables.
