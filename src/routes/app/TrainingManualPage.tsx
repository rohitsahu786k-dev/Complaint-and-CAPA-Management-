import { useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  FileDown,
  Gauge,
  History,
  Layers,
  Mail,
  Repeat2,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Timer
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/Cards";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface ModuleSection {
  id: string;
  title: string;
  badge: string;
  icon: typeof Gauge;
  summary: string;
  screenshot: string;
  standards: string[];
  steps: { title: string; desc: string; role: string }[];
  rules: string[];
}

const MODULES: ModuleSection[] = [
  {
    id: "auth",
    title: "1. Authentication & Profile Management",
    badge: "Security & RBAC",
    icon: ShieldCheck,
    summary:
      "Secure sign-in protocol, first-time temporary password enforcement, session lifetime governance, and user profile management.",
    screenshot: "/screenshots/01_login_screen.png",
    standards: ["ISO 9001: Clause 7.1.5", "FDA 21 CFR Part 11"],
    steps: [
      {
        title: "Access Corporate Portal",
        desc: "Open portal URL in Chrome/Edge. Enter assigned username or email address and password.",
        role: "All Users"
      },
      {
        title: "Forced Password Reset (New Accounts)",
        desc: "On first login with a temporary admin-generated password, immediately set a new strong password (min 8 chars, mixed case, number, symbol).",
        role: "All Users"
      },
      {
        title: "Profile Review & Password Update",
        desc: "Access the Profile page from the bottom left user badge to view company scopes, assigned permissions, and update login credentials.",
        role: "All Users"
      }
    ],
    rules: [
      "Zero shared logins; every individual must maintain their own authenticated account.",
      "Administrative users cannot replace passwords through profile edits; user-initiated verification is required."
    ]
  },
  {
    id: "dashboard",
    title: "2. Executive Dashboard & KPI Monitoring",
    badge: "Operations Intelligence",
    icon: Gauge,
    summary:
      "Real-time visibility into plant non-conformances, SLA turnaround health, stage distribution, and recurrence trends.",
    screenshot: "/screenshots/02_dashboard_kpis.png",
    standards: ["ISO 9001: Clause 9.1", "IATF 16949: Clause 9.1.2"],
    steps: [
      {
        title: "Review High-Level Quality KPIs",
        desc: "Inspect active volume, open complaints, overdue SLA counts, and rolling recurrence rate (Target < 2.0%).",
        role: "Management & Quality Head"
      },
      {
        title: "Filter by Plant & Date Horizon",
        desc: "Use the top header filters to slice metrics by specific manufacturing company entity or financial quarter.",
        role: "Department Heads & Coordinators"
      },
      {
        title: "Drill Down to Urgent Items",
        desc: "Click on overdue or critical status chips to immediately navigate to prioritized complaint worklists.",
        role: "Complaint Owners"
      }
    ],
    rules: [
      "Daily standup review of overdue SLA counters is mandatory for all plant department heads.",
      "Recurrence rates above 2% trigger an immediate plant quality review meeting."
    ]
  },
  {
    id: "complaints",
    title: "3. Complaint Logging & Classification",
    badge: "Registration Wizard",
    icon: ClipboardList,
    summary:
      "Registration of External customer complaints (Full 8D: D0–D8) vs Internal shop-floor issues with automated numbering.",
    screenshot: "/screenshots/04_new_complaint_wizard.png",
    standards: ["ISO 9001: Clause 8.7", "IATF 16949: Clause 10.2"],
    steps: [
      {
        title: "Initiate Complaint Entry",
        desc: "Click '+ Log Complaint' from the Complaints Register. Select 'External' for customer claims or 'Internal' for in-house defects.",
        role: "Complaint Coordinator"
      },
      {
        title: "Select Priority Multiplier",
        desc: "Assign Critical (0.5x SLA multiplier), High (0.75x), Medium (1.0x), or Low (1.5x) based on safety, line stoppage, or cosmetic impact.",
        role: "Coordinator & QA Head"
      },
      {
        title: "Traceability & Ownership Assignment",
        desc: "Provide Customer, PO, Product, Batch / Heat number, responsible department, and designated Complaint Owner.",
        role: "Complaint Coordinator"
      }
    ],
    rules: [
      "All external customer complaints must be registered within 2 hours of formal receipt.",
      "System issues a tamper-proof financial-year number (CMP-YY-XXXXX) and notifies the owner automatically via email."
    ]
  },
  {
    id: "eight_d",
    title: "4. 8D Problem Solving Lifecycle (D0 to D8)",
    badge: "Core Methodology",
    icon: Layers,
    summary:
      "Rigorous 8-Discipline root cause investigation engine featuring 5W2H, Ishikawa 6M Fishbone, 3-Legged 5-Why, and PCA deployment.",
    screenshot: "/screenshots/09_8d_rca_fishbone_d4.png",
    standards: ["VDA 8D Problem Solving", "AS9100D Clause 10.2"],
    steps: [
      {
        title: "D0 & D1: Emergency Response & Team Formation",
        desc: "Execute immediate 24h containment at customer/warehouse. Form multi-disciplinary team with Leader, Quality, and Process members.",
        role: "Complaint Owner & CFT"
      },
      {
        title: "D2 & D3: 5W2H Description & Interim Containment",
        desc: "Formulate problem narrative using What, Where, When, Who, Why, How, How Many. Enforce 100% stock sorting across transit, WIP, and FG.",
        role: "Cross-Functional Team"
      },
      {
        title: "D4: Multi-Cause RCA (5-Why & Fishbone 6M)",
        desc: "Brainstorm Man, Machine, Material, Method, Measurement, Milieu. Build 3 independent 5-Why chains for Occurrence, Escape, and Systemic causes.",
        role: "CFT & Quality Engineers"
      },
      {
        title: "D5 & D6: Permanent Corrective Actions (PCA)",
        desc: "Formulate mistake-proofing (Poka-Yoke) solutions. Update Control Plans, PFMEAs, and SOPs. Deploy horizontally to sibling machines.",
        role: "Complaint Owner & Process Lead"
      },
      {
        title: "D7 & D8: Recurrence Prevention & Formal Recognition",
        desc: "Schedule 30-day and 90-day effectiveness audits. Formally recognize team contributions upon zero recurrence.",
        role: "Quality Head & BUH"
      }
    ],
    rules: [
      "Strict workflow gates prevent jumping to RCA before D3 Containment is completed and logged.",
      "Recurrence observed during D7 checks automatically reopens the complaint for mandatory re-investigation."
    ]
  },
  {
    id: "signatures",
    title: "5. Electronic 3-Tier Signatures & Gating",
    badge: "Audit & Compliance",
    icon: FileCheck2,
    summary:
      "Three-tier digital approvals enforcing automated separation of duties, cryptographic timestamps, and revocation cascade.",
    screenshot: "/screenshots/12_electronic_signatures.png",
    standards: ["FDA 21 CFR Part 11", "Annex 11 EU GMP"],
    steps: [
      {
        title: "Tier 1: Prepared by (Complaint Owner)",
        desc: "After verifying that all D0–D8 sections and CAPAs are complete, the Owner applies the first electronic signature stamp.",
        role: "Complaint Owner"
      },
      {
        title: "Tier 2: Reviewed by (Department Head)",
        desc: "Department Head audits technical investigation validity, containment verification, and signs as reviewer.",
        role: "Department Head (HOD)"
      },
      {
        title: "Tier 3: Approved by (Quality Head)",
        desc: "Quality Head grants final organizational signoff and authorizes customer report transmission.",
        role: "Quality Head"
      }
    ],
    rules: [
      "Separation of Duties: The user who signs 'Prepared by' cannot sign 'Reviewed by' or 'Approved by'.",
      "Revocation Cascade: Editing any upstream 8D data (D2, D4, D5) automatically invalidates existing downstream signatures."
    ]
  },
  {
    id: "capa",
    title: "6. CAPA Lifecycle & Evidence State Machine",
    badge: "Evidence Verification",
    icon: ShieldAlert,
    summary:
      "Four-stage corrective action workflow requiring signed objective proof and independent Quality Head approval.",
    screenshot: "/screenshots/14_capa_tracker.png",
    standards: ["ISO 9001: Clause 10.2", "IATF 16949: Clause 10.2.3"],
    steps: [
      {
        title: "CAPA Assignment",
        desc: "CAPAs are auto-numbered (<Complaint>-CAPA-XX) with assigned target dates and designated action owners.",
        role: "Complaint Owner"
      },
      {
        title: "Evidence Upload",
        desc: "CAPA Owner implements physical modification, captures photos/test reports/signed SOPs, and uploads files to Cloudinary.",
        role: "CAPA Owner"
      },
      {
        title: "Independent Quality Head Review",
        desc: "Quality Head inspects evidence. Can Accept Evidence or Reject with mandatory written corrective remarks.",
        role: "Quality Head"
      },
      {
        title: "Short & Long-Term Verification",
        desc: "Audit consecutive production runs to verify zero defect escape before setting status to Completed.",
        role: "Quality QA Auditor"
      }
    ],
    rules: [
      "Zero CAPAs may be marked completed without uploaded, verified objective evidence.",
      "Complaints with open or rejected CAPAs cannot be formally closed by the portal."
    ]
  },
  {
    id: "tat",
    title: "7. Turnaround Time (TAT) & Escalation Chain",
    badge: "SLA Governance",
    icon: Timer,
    summary:
      "Stage milestone tracking, pre-overdue reminder alerts (50%, 75%, 90%), and 4-tier automated escalation hierarchy.",
    screenshot: "/screenshots/16_tat_dashboard.png",
    standards: ["Automotive OEM Delivery SLAs"],
    steps: [
      {
        title: "Monitor Stage Milestones",
        desc: "Track real-time countdowns for Acknowledgement (24h), Containment (48h), RCA (120h), and CAPA Assignment (168h).",
        role: "All Action Owners"
      },
      {
        title: "Receive Pre-Overdue Warnings",
        desc: "Automated emails alert owners when 50%, 75%, and 90% of permissible turnaround time has elapsed.",
        role: "Complaint Owners & HODs"
      },
      {
        title: "Handle Overdue Escalations",
        desc: "Unresolved breaches escalate: Owner (0h) -> HOD (24h) -> Quality Head (72h) -> Management (168h).",
        role: "Leadership & HODs"
      },
      {
        title: "Log Mandatory Delay Reasons",
        desc: "When completing an overdue stage, select a valid delay reason from the catalog for Pareto analysis.",
        role: "Complaint Owner"
      }
    ],
    rules: [
      "Priority multipliers scale deadlines: Critical issues cut permissible time by 50%.",
      "Escalation emails bypass user mute settings to ensure SLA awareness."
    ]
  },
  {
    id: "repeat",
    title: "8. Repeat Defect Intelligence & Recurrence",
    badge: "Recurrence Prevention",
    icon: Repeat2,
    summary:
      "Automated matching engine scanning rolling history for identical plant, defect category, and customer/product.",
    screenshot: "/screenshots/17_repeat_analysis.png",
    standards: ["IATF 16949: Clause 10.2.4"],
    steps: [
      {
        title: "Automated Repeat Flagging",
        desc: "The system automatically tags new complaints matching prior category + customer/part inside 180 days.",
        role: "System Automation"
      },
      {
        title: "Inspect Linked Historical 8Ds",
        desc: "Click the linked prior complaint IDs to examine why earlier corrective actions failed to sustain quality.",
        role: "Complaint Owner & CFT"
      },
      {
        title: "Formulate Systemic Solutions",
        desc: "Repeat defects require systemic poka-yoke tooling and mandatory Quality Head oversight before closure.",
        role: "Quality Head & BUH"
      }
    ],
    rules: [
      "Repeat complaints require explicit confirmation that earlier failure modes have been permanently engineered out."
    ]
  },
  {
    id: "reports",
    title: "9. Reports Catalog & Customer 8D PDF",
    badge: "Executive Reporting",
    icon: FileDown,
    summary:
      "Dynamic data grids, Excel workbook exports, and standardized multi-page Customer 8D PDF reports.",
    screenshot: "/screenshots/18_reports_catalog.png",
    standards: ["AIAG CQI-20 8D Reporting Standard"],
    steps: [
      {
        title: "Browse Reports Catalog",
        desc: "Access Master Complaints Log, CAPA Status, SLA Breach Records, and Recurrence Analytics.",
        role: "Auditors & Managers"
      },
      {
        title: "Export Dynamic Excel (.xlsx)",
        desc: "Filter by plant or date horizon and click 'Export Excel' to download structured workbooks.",
        role: "Quality Analysts"
      },
      {
        title: "Generate Customer 8D PDF",
        desc: "From any complaint workspace, click 'Download 8D PDF' to compile a professional, multi-page OEM report.",
        role: "Complaint Owners & Sales"
      }
    ],
    rules: [
      "Generated Customer 8D PDFs automatically include digital signature stamps and verified CAPA completion dates."
    ]
  },
  {
    id: "audit",
    title: "10. Tamper-Evident Audit Trail & Governance",
    badge: "Regulatory Compliance",
    icon: History,
    summary:
      "Immutable, timestamped record of every user action, status transition, signature application, and data modification.",
    screenshot: "/screenshots/19_audit_trail.png",
    standards: ["ISO 27001", "FDA 21 CFR Part 11"],
    steps: [
      {
        title: "Inspect System Activity Log",
        desc: "Filter audit records by Action (LOGIN, CREATE, UPDATE, SIGN, CLOSE), Entity, Date range, or Actor.",
        role: "Auditors & Master Admin"
      },
      {
        title: "Examine Field Change Diffs",
        desc: "Click on any log entry to view the exact before-and-after JSON state changes.",
        role: "Compliance Officers"
      }
    ],
    rules: [
      "Audit trail records cannot be edited or deleted by any user, including Master Admins."
    ]
  },
  {
    id: "admin",
    title: "11. Master Data & Email Automation",
    badge: "System Administration",
    icon: Settings,
    summary:
      "Administration of user accounts, plant entities, categories, SLA matrices, and 34 transactional email templates.",
    screenshot: "/screenshots/21_master_data.png",
    standards: ["Enterprise IT Governance"],
    steps: [
      {
        title: "Manage Users & Role Permissions",
        desc: "Provision corporate employees, assign departments, and configure least-privilege permission grants.",
        role: "Master Admin"
      },
      {
        title: "Configure SLA Thresholds",
        desc: "Fine-tune baseline hours per stage and priority multipliers to align with corporate contracts.",
        role: "Master Admin"
      },
      {
        title: "Email Governance & SMTP Status",
        desc: "Monitor live SMTP heartbeat, customize 34 template contents, utilize variable helpers, and review dispatch logs.",
        role: "Master Admin"
      }
    ],
    rules: [
      "Template edits must maintain required bracket tags (e.g., {{complaint.number}}, {{portalUrl}}) to prevent dispatch errors."
    ]
  }
];

export function TrainingManualPage() {
  const [activeTab, setActiveTab] = useState<string>("auth");
  const [search, setSearch] = useState("");

  const filteredModules = MODULES.filter(
    (m) =>
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      m.summary.toLowerCase().includes(search.toLowerCase()) ||
      m.steps.some(
        (s) =>
          s.title.toLowerCase().includes(search.toLowerCase()) ||
          s.desc.toLowerCase().includes(search.toLowerCase())
      )
  );

  const current = MODULES.find((m) => m.id === activeTab) || MODULES[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training Manual & Standard Operating Procedure (SOP)"
        description="Comprehensive, step-by-step operational handbook and compliance manual for the ONEPWS Complaint & CAPA Management Portal (SOP-QMS-08D-001)."
        breadcrumb={
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Governance</span>
            <span>/</span>
            <span className="font-semibold text-slate-700">Training Manual & SOP</span>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              onClick={() => {
                const link = document.createElement("a");
                link.href = "/screenshots/01_login_screen.png";
                link.download = "ONEPWS-Portal-Manual-Summary.png";
                link.click();
              }}
            >
              <FileDown className="mr-1.5 h-3.5 w-3.5" />
              Reference Asset
            </Button>
          </div>
        }
      />

      {/* Compliance Overview Banner */}
      <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 via-slate-50 to-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-blue-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
                SOP-QMS-08D-001
              </span>
              <span className="text-xs font-semibold text-blue-900">
                Effective: October 2026 • Revision 2.0
              </span>
            </div>
            <h2 className="text-base font-bold text-slate-900">
              ONEPWS Quality Assurance & 8D Governance Manual
            </h2>
            <p className="text-xs text-slate-600 max-w-3xl">
              This procedure standardizes non-conformance logging, 8-Discipline containment, root cause analysis, evidence-backed CAPA execution, and SLA multi-tier escalations compliant with ISO 9001:2015, IATF 16949, and VDA 8D standards.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" />
              ISO 9001 / IATF Compliant
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-800">
              <ShieldCheck className="h-3.5 w-3.5" />
              21 CFR Part 11 Ready
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Layout: Sidebar Modules + Active Detail View */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Module Navigation & Search */}
        <div className="lg:col-span-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search SOP modules, steps, or rules..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red"
            />
          </div>

          <div className="space-y-1.5 overflow-y-auto max-h-[750px] pr-1">
            {filteredModules.map((m) => {
              const Icon = m.icon;
              const isActive = m.id === activeTab;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setActiveTab(m.id)}
                  className={`w-full text-left rounded-xl p-3.5 transition flex items-start gap-3 border ${
                    isActive
                      ? "border-brand-red bg-red-50/60 shadow-xs"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                  }`}
                >
                  <div
                    className={`rounded-lg p-2 shrink-0 ${
                      isActive ? "bg-brand-red text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {m.badge}
                      </span>
                      <ChevronRight
                        className={`h-3.5 w-3.5 transition ${
                          isActive ? "text-brand-red translate-x-0.5" : "text-slate-300"
                        }`}
                      />
                    </div>
                    <h3
                      className={`text-xs font-bold truncate mt-0.5 ${
                        isActive ? "text-brand-red" : "text-slate-900"
                      }`}
                    >
                      {m.title}
                    </h3>
                    <p className="text-[11px] text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                      {m.summary}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Active Module Detailed Walkthrough */}
        <div className="lg:col-span-8 space-y-6">
          <SectionCard
            title={current.title}
            description={current.summary}
            actions={
              <div className="flex items-center gap-1.5">
                {current.standards.map((std, idx) => (
                  <span
                    key={idx}
                    className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700"
                  >
                    {std}
                  </span>
                ))}
              </div>
            }
          >
            <div className="space-y-6">
              {/* Screenshot Preview with Frame */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-700 block">
                  Applicable Portal Section Screenshot:
                </span>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-900 shadow-md">
                  <div className="flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 border-b border-slate-700">
                    <div className="h-2 w-2 rounded-full bg-red-500" />
                    <div className="h-2 w-2 rounded-full bg-yellow-500" />
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="ml-2 font-mono text-[10px] text-slate-400 truncate">
                      {current.screenshot}
                    </span>
                  </div>
                  <img
                    src={current.screenshot}
                    alt={current.title}
                    className="w-full h-auto object-cover max-h-[480px]"
                    loading="lazy"
                  />
                </div>
              </div>

              {/* Step-by-Step Training Guidelines */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Step-by-Step Operational Instructions
                </h4>
                <div className="space-y-3">
                  {current.steps.map((step, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 transition hover:bg-white hover:shadow-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-red text-[10px] font-bold text-white">
                            {idx + 1}
                          </span>
                          <h5 className="text-xs font-bold text-slate-900">{step.title}</h5>
                        </div>
                        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold text-blue-800">
                          Role: {step.role}
                        </span>
                      </div>
                      <p className="mt-2 pl-7 text-xs text-slate-600 leading-relaxed">
                        {step.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mandatory Governance Rules & Blockers */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-900 text-xs">
                  <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Mandatory Compliance Rules & Workflow Gating</span>
                </div>
                <ul className="list-disc pl-5 text-xs text-amber-900 space-y-1">
                  {current.rules.map((rule, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {rule}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
