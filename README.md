# ONEPWS Complaint & CAPA Management Portal

A full-stack, enterprise-grade MERN application designed for high-precision Complaint, Turnaround Time (TAT) SLA compliance, 8D Problem Solving, Corrective and Preventive Action (CAPA) tracking, and automated email delivery.

---

## 1. Project Overview

The ONEPWS Complaint & CAPA Management Portal replaces disparate manual spreadsheets and legacy prototype systems with a secure, centralized, and multi-tenant quality governance portal. It manages the complete lifecycle of customer-reported (External) and shop-floor (Internal) complaints, enforces strict workflow gating across 8D stages (D0–D8), tracks CAPAs through an evidence-backed state machine, and provides executive analytics with real-time SLA breach escalation.

---

## 2. Key Features

- **End-to-End Complaint Lifecycle:**
  - Distinct External (Full 8D: D0–D8) and Internal (streamlined investigation) workflows.
  - Concurrency-safe financial-year numbering (`CMP-YY-XXXXX`).
  - Strict workflow gates: Acknowledgement, Containment, RCA, and CAPA.
  - Multi-cause analysis tools: 5-Why (occurrence, escape, systemic chains), Fishbone (6M), and root cause categorization.
  - Three-tier electronic signatures (Prepared by, Reviewed by, Approved by) with automated separation of duties and revocation cascade.
  - Automatic complaint reopening upon failed effectiveness verification (`Not Effective`).
- **CAPA Management & Evidence Verification:**
  - Automated CAPA numbering (`<ComplaintNumber>-CAPA-XX`).
  - Four-stage evidence review: upload, Quality Head review (accept/reject with mandatory remarks), and history preservation.
  - Effectiveness verification tracking with short- and long-term sustainment checks.
- **SLA Milestones & Automated Multi-Tier Escalation:**
  - Configurable stage deadlines scaled by priority multipliers (Critical 0.5x, High 0.75x, Medium 1.0x, Low 1.5x).
  - Pre-overdue notifications at 50%, 75%, and 90% of turnaround time.
  - Automated multi-tier escalation chain: Owner (0h) $\rightarrow$ Department Head (24h) $\rightarrow$ Quality Head (72h) $\rightarrow$ Management (168h).
  - Delay reason capturing with Pareto distribution analytics.
- **Repeat Complaint Detection Engine:**
  - Intelligent matching within configurable repeat windows (same company + category + matching customer or product).
  - Repeat analysis drill-down, recurrence rates, and linkage reviews.
- **Enterprise Email Automation & Administration:**
  - Central `sendTemplatedEmail()` dispatcher inspired by `6S-AuditPro`.
  - 34 pre-seeded default templates across Auth, Complaint, TAT, CAPA, Signatures, and Summaries.
  - Dynamic recipient resolution engine respecting company scope, department hierarchy, and active user status.
  - Protected cron endpoints with idempotent deduplication keys.
  - Master Admin email governance: live SMTP status, template editor, variable helpers, delivery audit logs, and safe retry.
- **Cloudinary Signed Asset Storage:**
  - Signed direct uploads for complaint attachments and CAPA evidence files.
  - Strict MIME validation and 10 MB size limits; zero binary blobs in MongoDB.
- **Data Import & Multi-Format Reports:**
  - Bulk Excel import engine with error row reporting.
  - Dynamic report catalog with tabular preview, Excel exports (`.xlsx`), and multi-page customer 8D PDF generation.

---

## 3. Technology Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, React Router 6, Recharts, Lucide React icons.
- **Backend:** Node.js, Express, TypeScript, Mongoose ODM, Nodemailer, Cloudinary SDK, xlsx, jsPDF, Zod.
- **Database:** MongoDB Atlas with SCRAM-SHA-256 and connection pooling.
- **Deployment:** Vercel serverless runtime (`api/index.ts` + SPA rewrites).

---

## 4. Repository Structure

```text
├── api/                   # Vercel serverless entrypoint (index.ts)
├── docs/                  # Architectural documentation, matrices, and deployment guide
│   ├── 6S_REFERENCE_ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   ├── EMAIL_EVENT_MATRIX.md
│   ├── EMAIL_VARIABLE_REFERENCE.md
│   ├── FEATURE_PARITY.md
│   ├── LEGACY_FEATURE_INVENTORY.md
│   └── RBAC_MATRIX.md
├── server/                # Express backend application
│   ├── config/            # Environment parsing (Zod), DB connection cache
│   ├── domain/            # Pure business rule modules and unit tests
│   ├── lib/               # Email layout, template renderer, mailer, cron auth
│   ├── middleware/        # JWT auth, RBAC permissions, error handlers
│   ├── models/            # Mongoose schemas (Complaint, Capa, EmailTemplate, EmailLog, etc.)
│   ├── routes/            # API endpoints (/auth, /complaints, /capas, /email, /cron, etc.)
│   ├── scripts/           # Idempotent database seed script (seed.ts)
│   └── services/          # Business logic services (email, analytics, escalation, etc.)
├── shared/                # Shared TypeScript types, Zod schemas, and domain constants
│   ├── constants/         # Role definitions, permissions, stages, MIME types
│   └── schemas/           # Request/response validation schemas
├── src/                   # React frontend application
│   ├── components/        # UI components (Cards, DataTable, Modal, Admin panels)
│   ├── features/          # Feature components (Complaint tabs, 8D forms, CAPA)
│   ├── layouts/           # AppShell, navigation, user menu
│   ├── lib/               # API client, Excel parser, PDF generator, formatters
│   ├── routes/            # Page routes (Dashboard, Complaints, TAT, Reports, etc.)
│   └── services/          # TanStack query definitions and API hooks
├── vercel.json            # Vercel deployment routes and cron configurations
└── package.json           # Dependencies and project scripts
```

---

## 5. Local Development Setup

### 5.1 Prerequisites
- Node.js 20+ installed
- Local or cloud MongoDB instance
- (Optional) SMTP credentials and Cloudinary account for testing file upload and email dispatch

### 5.2 Installation
```bash
# Clone the repository
git clone https://github.com/rohitsahu786k-dev/Complaint-and-CAPA-Management-.git
cd "Complaint and CAPA Management Software"

# Install dependencies
npm install
```

### 5.3 Environment Configuration
Copy `.env.example` to `.env` and supply your development settings:
```bash
cp .env.example .env
```
Populate `.env` with your MongoDB URI, random JWT secrets, and optional service keys.

### 5.4 Database Seeding (First Admin Bootstrap)
Run the idempotent seed script to create default roles, permissions, master data, and initial Master Admin:
```bash
SEED_ADMIN_NAME="Master Admin" \
SEED_ADMIN_USERNAME="admin" \
SEED_ADMIN_EMAIL="admin@onepws.com" \
SEED_ADMIN_PASSWORD="StrongPassword123!" \
npm run seed
```

### 5.5 Starting Development Servers
```bash
# Run both Vite frontend and Express backend concurrently
npm run dev

# Or run frontend and backend separately in distinct terminals:
npm run dev        # Starts Vite on http://localhost:5173
npm run dev:api    # Starts Express API on http://localhost:5000
```

---

## 6. Testing & Quality Assurance

```bash
# Run automated Vitest unit & domain test suite
npm test

# Run ESLint code quality check
npm run lint

# Run TypeScript compiler check
npm run typecheck

# Run production Vite build
npm run build
```

---

## 7. Role-Based Access Control (RBAC)

The application implements 10 standardized roles with multi-tenant company isolation:
1. **Master Admin:** Unrestricted global access, system configuration, user/role management, email administration, and hard delete.
2. **Management:** Multi-company executive visibility, KPI dashboards, and reports.
3. **Complaint Coordinator:** Create, assign, and manage complaints within assigned company.
4. **Complaint Owner:** Execute 8D workflow and actions on assigned complaints.
5. **Department Head:** Oversee complaints and approve CAPAs for their designated department.
6. **CAPA Owner:** Implement corrective actions and upload verification evidence.
7. **Quality Head:** Evidence review, effectiveness verification, 8D approvals, and complaint closure.
8. **Sales / Customer Service:** Log external complaints and track status.
9. **Auditor:** Multi-company read-only access to audit logs and compliance reports.
10. **Viewer:** Read-only access within their designated company.

For detailed capability mapping, see [`docs/RBAC_MATRIX.md`](docs/RBAC_MATRIX.md).

---

## 8. Security & Secret Hygiene

- **HttpOnly Cookies:** JWT tokens are stored in secure, HttpOnly, SameSite cookies.
- **Zero Secrets in MongoDB / Git:** Passwords, private keys, and SMTP credentials are never stored in plain text or exposed to client bundles.
- **Password Hashes Excluded:** User APIs explicitly use `.select("-password")` to prevent hash leakage.
- **Cron Authentication:** Protected by `CRON_SECRET` bearer token validation.
- **Injection Prevention:** HTML escaping and strict script tag sanitization on all email templates.

---

## 9. Production Deployment

Refer to [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for full instructions on configuring Vercel, MongoDB Atlas network access, and production environment variables.
