# Email Variable Reference

This document serves as the official dictionary of template variables available for the ONEPWS Complaint & CAPA Management System email automation engine.

Templates support standard placeholder substitution using `{{variableName}}`. Values are automatically HTML-escaped and stripped of executable scripts to ensure bulletproof email client rendering and security.

---

## 1. Global & Branding Variables
These variables are available across **all** email templates regardless of trigger event.

| Variable | Description | Example Value |
| :--- | :--- | :--- |
| `{{companyName}}` | Registered company / plant name | `ONEPWS Private Limited` |
| `{{logoUrl}}` | Cloudinary URL for corporate high-res logo | `https://res.cloudinary.com/.../onepws-logo-email.png` |
| `{{appUrl}}` | Base application web portal URL | `https://portal.onepws.com` |
| `{{today}}` | Current formatted date | `07 Sep 2026` |
| `{{recipientName}}` | Resolved name of the recipient | `Amit Verma` |
| `{{recipientEmail}}` | Resolved destination email address | `amit.verma@onepws.com` |

---

## 2. Complaint Domain Variables
Available in all `COMPLAINT_*`, `TAT_*`, and `SIGNATURE_*` events.

| Variable | Description | Example Value |
| :--- | :--- | :--- |
| `{{complaintNumber}}` | Unique complaint identification code | `CMP-2026-00128` |
| `{{complaintTitle}}` | Brief summary / title of the complaint | `Dimensional variation on assembly batch 42B` |
| `{{complaintType}}` | Type of complaint (`External` or `Internal`) | `External` |
| `{{customerName}}` | Customer or external complainant name | `Global Auto Industries` |
| `{{partName}}` | Name of defective or investigated component | `Front Lower Control Arm Bracket` |
| `{{partNumber}}` | Part / drawing / SKU number | `BKT-42-FL` |
| `{{priority}}` | SLA priority tier (`Critical`, `High`, `Medium`, `Low`) | `High` |
| `{{stage}}` | Current active workflow stage | `Containment (D3)` |
| `{{status}}` | System status of complaint | `Under Investigation` |
| `{{ownerName}}` | Full name of appointed Complaint Owner | `Amit Verma` |
| `{{coordinatorName}}` | Full name of Complaint Coordinator | `Rajesh Patel` |
| `{{departmentName}}` | Responsible manufacturing/business department | `Production` |
| `{{dueDate}}` | Target stage completion deadline | `10 Sep 2026` |
| `{{targetDate}}` | Overall target resolution deadline | `18 Sep 2026` |
| `{{overdueHours}}` | Number of hours past SLA target | `36` |
| `{{escalationLevel}}` | Overdue escalation tier badge/name | `Level 2 (Department Head)` |
| `{{remarks}}` | Comments, review notes, or stage remarks | `Initial review confirmed supplier component tolerance deviation.` |
| `{{reopenReason}}` | Reason provided when reopening complaint | `Recurring defect observed during subsequent batch run.` |
| `{{revocationReason}}` | Reason provided for revoking electronic signature | `Drawing revision 2.1 was superseded by change order.` |
| `{{senderName}}` | Name of user initiating report sharing | `Priya Sharma` |
| `{{reportUrl}}` | Direct portal deep link to complaint / 8D report | `https://portal.onepws.com/complaints/68f1...` |
| `{{actionUrl}}` | Deep link to execute required review or action | `https://portal.onepws.com/complaints/68f1...` |

---

## 3. CAPA Domain Variables
Available in all `CAPA_*` events.

| Variable | Description | Example Value |
| :--- | :--- | :--- |
| `{{capaNumber}}` | Derived CAPA number | `CMP-2026-00128-CAPA-01` |
| `{{capaTitle}}` | Action item description | `Tool recalibration and operator retraining for fixture #3` |
| `{{capaType}}` | Type of action (`Corrective` or `Preventive`) | `Corrective` |
| `{{capaStatus}}` | Current status of CAPA item | `In Progress` |
| `{{assignedTo}}` | Appointed CAPA owner name | `Karan Singh` |
| `{{previousOwner}}` | Previous CAPA owner name during reassignment | `Deepak Sharma` |
| `{{rejectionReason}}` | Mandatory reason when Quality rejects evidence | `Supporting evidence lacks torque audit check sheet verification.` |
| `{{effectivenessResult}}`| Verification result (`Effective` or `Not Effective`) | `Effective` |
| `{{verificationNotes}}` | Detailed notes from effectiveness audit | `30-day trial batch showed zero defects across 5,000 components.` |

---

## 4. Authentication & Security Variables
Available in all `AUTH_*` events.

| Variable | Description | Example Value |
| :--- | :--- | :--- |
| `{{userName}}` | User's full display name | `Amit Verma` |
| `{{username}}` | User's account login identifier | `averma` |
| `{{resetUrl}}` | Cryptographically signed one-time reset link | `https://portal.onepws.com/reset-password?token=...` |
| `{{expiresInHours}}` | Token validity duration | `1` |

---

## 5. Management Digest & Summary Variables
Available in `DAILY_SUMMARY` and `WEEKLY_SUMMARY` events.

| Variable | Description | Example Value |
| :--- | :--- | :--- |
| `{{period}}` | Summary timeframe | `Last 24 Hours` / `Last 7 Days` |
| `{{totalOpen}}` | Total active complaints in system | `14` |
| `{{dueSoonCount}}` | Complaints within SLA warning threshold | `3` |
| `{{overdueCount}}` | Total complaints breaching turnaround time | `2` |
| `{{openCapasCount}}` | Total pending corrective/preventive actions | `8` |
| `{{capaOverdueCount}}` | CAPAs exceeding target completion date | `1` |
| `{{repeatCount}}` | Repeat complaint occurrences identified | `1` |
