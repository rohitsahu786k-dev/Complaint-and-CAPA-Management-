# Role-Based Access Control (RBAC) Matrix

This document defines the official permission and capability matrix for all 10 standard user roles in the ONEPWS Complaint & CAPA Management System, including company scoping and multi-tenant data isolation rules.

---

## 1. Multi-Tenant Company Scoping Rules

1. **Company Scope (`companyIds`):**
   - Users associated with specific company ID(s) can only view and manage records matching their assigned company IDs.
   - Users with `"view.all"` or `"*" in companyIds` (e.g., Master Admin, Management, Auditor) possess multi-company visibility across all registered entities.
2. **Owner Scope (`ownerId`):**
   - Roles with `.own` permissions (Complaint Owner, CAPA Owner) can only mutate records explicitly assigned to their user ID.
3. **Department Scope (`department`):**
   - Roles with `.dept` permissions (Department Head) can only mutate records where the complaint's or CAPA's responsible department matches their designated department.

---

## 2. Comprehensive RBAC Capability Matrix

| Feature / Domain Action | Master Admin | Management | Complaint Coordinator | Complaint Owner | Department Head | CAPA Owner | Quality Head | Sales / CS | Auditor | Viewer |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **System Administration** |
| Master Data Configuration | **CRUD** | None | None | None | None | None | None | None | None | None |
| User & Role Management | **CRUD** | None | None | None | None | None | None | None | None | None |
| Email Automation & SMTP | **Full** | None | None | None | None | None | None | None | None | None |
| Hard Deletion (Typed Confirm) | **Yes** | None | None | None | None | None | None | None | None | None |
| Revoke Signatures | **Yes** | None | None | None | None | None | None | None | None | None |
| **Complaints Management** |
| View Complaints List | All Co. | All Co. | Own Co. | Own Co. | Own Co. | Own Co. | Own Co. | Own Co. | All Co. | Own Co. |
| Log New Complaint | Create | None | Create | None | None | None | None | Create | None | None |
| Assign Owner / Coordinator | Yes | None | Yes | None | None | None | None | None | None | None |
| Edit Complaint (General) | Edit | None | Edit | Own Only | Dept Only | None | None | None | None | None |
| Acknowledge Stage (D0) | Yes | None | Yes | Own | None | None | None | None | None | None |
| Containment Stage (D3) | Yes | None | Yes | Own | Dept | None | None | None | None | None |
| RCA Stage (D4/D5) | Yes | None | Yes | Own | Dept | None | None | None | None | None |
| 5-Why / Fishbone / 6M+2 | Edit | None | Edit | Own | Dept | None | None | None | None | None |
| Internal Investigation Tab | Edit | None | Edit | Own | Dept | None | None | None | None | None |
| Close Complaint | Close | None | None | None | None | None | Close | None | None | None |
| Reopen Complaint | Reopen | None | None | None | None | None | Reopen | None | None | None |
| **CAPA Management** |
| View CAPA Tracker / Master | All Co. | All Co. | Own Co. | Own Co. | Own Co. | Own Co. | Own Co. | Own Co. | All Co. | Own Co. |
| Create CAPA Action Item | Create | None | Create | Own | Dept | None | None | None | None | None |
| Edit CAPA Item Details | Edit | None | Edit | Own (Cmp) | Dept | Own (CAPA)| None | None | None | None |
| Upload Evidence Attachment | Upload | None | Upload | Own | Dept | Own (CAPA)| None | None | None | None |
| Review Evidence (Accept/Reject)| Review | None | None | None | None | None | Review | None | None | None |
| Mark CAPA Completed | Complete| None | Complete| Own | Dept | Own (CAPA)| None | None | None | None |
| Effectiveness Verification | Verify | None | None | None | None | None | Verify | None | None | None |
| **Signatures & Approvals** |
| Prepared By (D1-D8 Sign) | Sign | None | Sign | Own | Dept | None | None | None | None | None |
| Reviewed By Sign | Sign | None | None | None | Dept | None | Sign | None | None | None |
| Approved By Sign | Sign | None | None | None | None | None | Sign | None | None | None |
| **Analytics, Reports & Audit** |
| Executive Dashboard & KPIs | View | View | View | View | View | View | View | View | View | View |
| TAT Compliance Dashboard | View | View | View | View | View | View | View | View | View | View |
| Repeat Analysis Page | View | View | View | View | View | View | View | View | View | View |
| Report Catalog & Preview | View | View | None | None | None | None | View | None | View | None |
| Excel Sheet Exports | Export | Export | None | None | None | None | Export | None | Export | None |
| PDF 8D Customer Report | Export | Export | Export | Export | Export | Export | Export | None | Export | None |
| Audit Trail (System Log) | View | None | None | None | None | None | None | None | View | None |
| In-App Notification Center | Own | Own | Own | Own | Own | Own | Own | Own | Own | Own |

---

## 3. Enforcement Layers

1. **API Middleware:** Every route validates authentication via HttpOnly JWT and permission via `requirePermission(permissionKey)`.
2. **Domain Service Logic:** `server/domain/rbac.ts` enforces `canSeeCompany`, `canEditComplaint`, `canEditCapa`, `canReviewCapaEvidence`, `canVerifyEffectiveness`, and `canCloseComplaint`.
3. **Database Queries:** All list, filter, and analytics queries explicitly apply `{ company: { $in: actor.companyIds } }` unless the actor possesses `"view.all"`.
4. **UI Navigation:** Menu items and action buttons in `AppShell.tsx` and detail tabs render conditionally based on `usePermissions()` and `user.role`.
