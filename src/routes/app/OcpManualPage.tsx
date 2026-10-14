import { useState, useRef, useEffect } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FileDown,
  FileText,
  Maximize2,
  Minimize2,
  Printer,
  RotateCcw,
  Search,
  ShieldCheck,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { Button } from "@/components/ui/Button";

interface Chapter {
  page: number;
  title: string;
  section: string;
}

const CHAPTERS: Chapter[] = [
  { page: 1, section: "Cover", title: "Visual SOP Cover & Portal Identity" },
  { page: 2, section: "Governance", title: "Document Control & Revision History" },
  { page: 3, section: "Approvals", title: "Signatures & Distribution Matrix" },
  { page: 4, section: "Index", title: "Table of Contents" },
  { page: 5, section: "1.0", title: "Introduction, Purpose & Scope" },
  { page: 7, section: "2.0", title: "Getting Started & User Authentication" },
  { page: 9, section: "3.0", title: "Portal Navigation & Sidebar Layout" },
  { page: 10, section: "4.0", title: "Executive Dashboard & Quality KPIs" },
  { page: 12, section: "5.0", title: "Registering a New Complaint (Wizard)" },
  { page: 15, section: "6.0", title: "Complaints Register & Workflow Tracking" },
  { page: 18, section: "7.0", title: "External Complaints - 8D Report (D0 to D8)" },
  { page: 23, section: "7.11", title: "3-Tier Electronic Signatures Workflow" },
  { page: 27, section: "8.0", title: "Internal Complaints Lifecycle" },
  { page: 29, section: "9.0", title: "CAPA Management & Evidence Verification" },
  { page: 34, section: "10.0", title: "CAPA Dashboard, Tracker & Master List" },
  { page: 37, section: "11.0", title: "Notes & Minutes of Meeting (MOM)" },
  { page: 39, section: "12.0", title: "Attachments & Evidence Vault" },
  { page: 40, section: "13.0", title: "TAT Dashboard & SLA Escalation Matrix" },
  { page: 42, section: "14.0", title: "Reports Catalog & 8D Customer Export" },
  { page: 44, section: "15.0", title: "Master Admin & RBAC User Management" },
  { page: 46, section: "16.0", title: "Audit Trail & Immutable Change Logs" },
  { page: 47, section: "17.0", title: "Standard Operating Procedures (SOP 01-05)" }
];

const TOTAL_PAGES = 47;
const ZOOM_LEVELS = [75, 90, 100, 125, 150, 175, 200, 240];

export function OcpManualPage() {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoomIndex, setZoomIndex] = useState<number>(4); // default 150%
  const [fitWidth, setFitWidth] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [filterQuery, setFilterQuery] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const zoomPercent = ZOOM_LEVELS[zoomIndex];

  function handlePrev() {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  }

  function handleNext() {
    setCurrentPage((prev) => Math.min(TOTAL_PAGES, prev + 1));
  }

  function handleZoomIn() {
    setFitWidth(false);
    setZoomIndex((prev) => Math.min(ZOOM_LEVELS.length - 1, prev + 1));
  }

  function handleZoomOut() {
    setFitWidth(false);
    setZoomIndex((prev) => Math.max(0, prev - 1));
  }

  function handleFitWidth() {
    setFitWidth(true);
    setZoomIndex(3); // 125% fit standard
  }

  function handlePrint() {
    const frame = iframeRef.current;
    if (frame && frame.contentWindow) {
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        return;
      } catch {
        // Fallback to window print
      }
    }
    window.open("/docs/ONEPWS_Portal_Visual_SOP.pdf", "_blank")?.print();
  }

  function toggleFullscreen() {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const filteredChapters = filterQuery.trim()
    ? CHAPTERS.filter(
        (c) =>
          c.title.toLowerCase().includes(filterQuery.toLowerCase()) ||
          c.section.toLowerCase().includes(filterQuery.toLowerCase())
      )
    : CHAPTERS;

  // Build the PDF hash URL
  const pdfUrl = `/docs/ONEPWS_Portal_Visual_SOP.pdf#page=${currentPage}&zoom=${fitWidth ? "page-width" : zoomPercent}`;

  return (
    <div className="space-y-4 pb-12" ref={containerRef}>
      {/* Top Header matching reference */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-brand-charcoal sm:text-2xl">OCP Manual</h1>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
              Doc No: IMS-01-01-L4-05
            </span>
          </div>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            Viewer access only <span className="mx-1 text-slate-300">•</span> Revision 02 (30-Apr-2026){" "}
            <span className="mx-1 text-slate-300">•</span> ISO 9001:2015 &amp; AS9100 Rev D
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Print button */}
          <Button
            type="button"
            variant="secondary"
            className="h-9 gap-1.5 px-3 text-xs font-semibold text-slate-700"
            onClick={handlePrint}
            title="Print OCP Manual"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Print</span>
          </Button>

          {/* Download DOCX button */}
          <a
            href="/docs/ONEPWS_Portal_Visual_SOP.docx"
            download="ONEPWS_Portal_Visual_SOP.docx"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 hover:text-brand-charcoal"
            title="Download original Microsoft Word format (8.05 MB)"
          >
            <FileText className="h-4 w-4 text-blue-600" />
            <span>Word DOCX</span>
          </a>

          {/* Download PDF button */}
          <a
            href="/docs/ONEPWS_Portal_Visual_SOP.pdf"
            download="ONEPWS_Portal_Visual_SOP.pdf"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 hover:text-brand-charcoal"
            title="Download vector PDF version (4.4 MB)"
          >
            <Download className="h-4 w-4 text-emerald-600" />
            <span>Download PDF</span>
          </a>

          {/* View Manual red button matching reference */}
          <a
            href="/docs/ONEPWS_Portal_Visual_SOP.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-red px-3.5 text-xs font-semibold text-white shadow-xs transition hover:bg-red-700"
          >
            <ExternalLink className="h-4 w-4" />
            <span>View Manual</span>
          </a>
        </div>
      </div>

      {/* Main Document Viewer Card */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {/* Card Header matching reference */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-slate-50/60 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-red animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 sm:text-xs">
              Operating Control Procedure
            </span>
            <span className="hidden text-xs text-slate-400 sm:inline">—</span>
            <span className="hidden text-xs font-medium text-slate-500 sm:inline">
              ONEPWS AuditPro &amp; CAPA Integrated QMS Portal
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-bold text-purple-700">
              View Only
            </span>
            <Button
              type="button"
              variant="ghost"
              className="h-7 w-7 p-0 text-slate-500 hover:text-slate-800"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Viewer"}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Toolbar matching reference */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2 sm:px-6">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="h-8 px-2.5 text-xs font-semibold"
              onClick={handlePrev}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="mr-1 h-3.5 w-3.5" />
              Previous
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-8 px-2.5 text-xs font-semibold"
              onClick={handleNext}
              disabled={currentPage >= TOTAL_PAGES}
            >
              Next
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
            <div className="flex items-center gap-1.5 pl-2 text-xs font-semibold text-slate-700">
              <span>Page</span>
              <select
                value={currentPage}
                onChange={(e) => setCurrentPage(Number(e.target.value))}
                className="h-8 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-brand-charcoal focus:border-brand-red focus:outline-none"
              >
                {Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <span className="text-slate-400">of {TOTAL_PAGES}</span>
              <span className="mx-1 text-slate-300">•</span>
              <span className="text-slate-500">{fitWidth ? "Fit Width" : `${zoomPercent}%`}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              className="h-8 w-8 p-0 text-slate-600 hover:bg-slate-100"
              onClick={handleZoomOut}
              disabled={zoomIndex <= 0}
              title="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-8 w-8 p-0 text-slate-600 hover:bg-slate-100"
              onClick={handleZoomIn}
              disabled={zoomIndex >= ZOOM_LEVELS.length - 1}
              title="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={fitWidth ? "primary" : "secondary"}
              className="h-8 px-2.5 text-xs font-semibold"
              onClick={handleFitWidth}
            >
              Fit Width
            </Button>

            {/* Quick Section Jump Dropdown */}
            <div className="relative pl-2">
              <select
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val > 0) setCurrentPage(val);
                }}
                className="h-8 max-w-[200px] truncate rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-white focus:border-brand-red focus:outline-none sm:max-w-[260px]"
                aria-label="Jump to section"
              >
                <option value="">Jump to Chapter / SOP...</option>
                {CHAPTERS.map((c) => (
                  <option key={c.page} value={c.page}>
                    p.{c.page}: {c.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Viewport & PDF iframe layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 bg-slate-100">
          {/* Left mini table of contents / chapters for rapid navigation */}
          <div className="hidden border-r border-slate-200 bg-white p-3 lg:block lg:col-span-1 max-h-[780px] overflow-y-auto">
            <div className="mb-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter chapters..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs focus:border-brand-red focus:bg-white focus:outline-none"
                />
              </div>
            </div>
            <p className="px-1 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Document Chapters ({filteredChapters.length})
            </p>
            <nav className="space-y-0.5">
              {filteredChapters.map((ch) => {
                const isActive = currentPage === ch.page;
                return (
                  <button
                    key={ch.page}
                    type="button"
                    onClick={() => setCurrentPage(ch.page)}
                    className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${
                      isActive
                        ? "bg-brand-red text-white font-bold shadow-xs"
                        : "text-slate-700 hover:bg-slate-100 font-medium"
                    }`}
                  >
                    <span
                      className={`inline-block min-w-[28px] rounded px-1 text-center text-[10px] font-bold ${
                        isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      p.{ch.page}
                    </span>
                    <span className="line-clamp-1">{ch.title}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <p className="text-[11px] font-bold text-slate-700">Document Ownership</p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Prepared: Jatin Singh Chouhan (QA Head)
                <br />
                Reviewed: Ritik Porwal (Quality Dept)
                <br />
                Approved: Management, ONEPWS Group
              </p>
            </div>
          </div>

          {/* Right Main PDF Canvas Viewport */}
          <div className="lg:col-span-3 p-2 sm:p-4 flex flex-col items-center justify-center bg-slate-200/80 min-h-[780px]">
            <div className="w-full h-full flex flex-col items-center">
              <iframe
                ref={iframeRef}
                key={pdfUrl}
                src={pdfUrl}
                title="ONEPWS OCP Manual & Visual SOP"
                className="w-full h-[780px] rounded-lg border border-slate-300 bg-white shadow-xl"
              />
            </div>
          </div>
        </div>

        {/* Footer info strip */}
        <div className="flex flex-wrap items-center justify-between border-t border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-500 sm:px-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>Official QMS Document • Classification: Confidential</span>
          </div>
          <div>
            <span>Applicable to: ONEPWS Private Limited • WMSPL • PWS Floors LLP</span>
          </div>
        </div>
      </div>
    </div>
  );
}
