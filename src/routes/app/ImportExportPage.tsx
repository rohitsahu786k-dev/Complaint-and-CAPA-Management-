import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Download,
  ShieldAlert,
  Upload,
  UploadCloud
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/Cards";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Field, Select } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/toast-context";
import { api, ApiError } from "@/lib/api";
import { downloadSheet, downloadTemplate, readSheet } from "@/lib/excel";
import { formatDate } from "@/lib/format";
import { usePermissions } from "@/services/queries";

type TabKey = "import" | "export" | "backup";

type PreviewResult = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  issues: { row: number; field: string; message: string }[];
  preview: {
    row: number;
    valid: boolean;
    duplicate: boolean;
    type: string;
    customer: string;
    product: string;
    category: string;
  }[];
};

export function ImportExportPage() {
  const toast = useToast();
  const permissions = usePermissions();
  const [activeTab, setActiveTab] = useState<TabKey>("import");

  // Import flow states
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([]);
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [strategy, setStrategy] = useState<"skip-duplicates" | "import-and-flag">("skip-duplicates");
  const [isValidating, setIsValidating] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<{ created: number; skipped: number } | null>(null);

  // Export states
  const [isExportingEntity, setIsExportingEntity] = useState<string | null>(null);

  // Backup state
  const [isBackingUp, setIsBackingUp] = useState(false);

  async function handleDownloadTemplate() {
    try {
      const res = await api<{ columns: string[]; sample: Record<string, string> }>("/api/import/template");
      downloadTemplate("Complaint_Import_Template.xlsx", res.columns, res.sample);
      toast.success("Import template downloaded");
    } catch {
      toast.error("Failed to load import template");
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setPreviewData(null);
    setCommitResult(null);
    setIsValidating(true);

    try {
      const rows = await readSheet(selected);
      if (rows.length === 0) {
        toast.error("The uploaded spreadsheet is empty.");
        setIsValidating(false);
        return;
      }
      setParsedRows(rows);

      // Request server preview
      const preview = await api<PreviewResult>("/api/import/complaints/preview", {
        method: "POST",
        body: JSON.stringify({ rows })
      });
      setPreviewData(preview);
      toast.success(`Parsed ${rows.length} rows: ${preview.validRows} valid, ${preview.invalidRows} invalid.`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to parse file";
      toast.error(msg);
      setFile(null);
      setParsedRows([]);
    } finally {
      setIsValidating(false);
    }
  }

  async function handleCommitImport() {
    if (!parsedRows.length) return;
    setIsCommitting(true);
    try {
      const res = await api<{ created: number; skipped: number }>("/api/import/complaints/commit", {
        method: "POST",
        body: JSON.stringify({ rows: parsedRows, strategy })
      });
      setCommitResult(res);
      toast.success(`Import complete! ${res.created} complaints registered, ${res.skipped} skipped.`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Import failed";
      toast.error(msg);
    } finally {
      setIsCommitting(false);
    }
  }

  async function handleExportComplaints() {
    setIsExportingEntity("complaints");
    try {
      const res = await api<{ items: Record<string, unknown>[] }>("/api/complaints?pageSize=5000");
      if (!res.items || res.items.length === 0) {
        toast.error("No complaint records found");
        return;
      }
      const flattened = res.items.map((c) => ({
        "Complaint Number": String(c.number ?? ""),
        Type: String(c.type ?? ""),
        Company: typeof c.company === "object" ? String((c.company as { name?: string })?.name ?? "") : String(c.company ?? "—"),
        Status: String(c.status ?? ""),
        Priority: typeof c.priority === "object" ? String((c.priority as { name?: string })?.name ?? "") : String(c.priority ?? "—"),
        Category: String(c.category ?? ""),
        Customer: String(c.customer ?? "—"),
        Product: String(c.product ?? "—"),
        "Received Date": formatDate(c.receivedAt as string),
        "Is Repeat": c.isRepeat ? "Yes" : "No",
        Description: String(c.description ?? "")
      }));
      downloadSheet("All-Complaints-Export", "Complaints", flattened);
      toast.success(`Exported ${flattened.length} complaints to Excel`);
    } catch {
      toast.error("Failed to export complaints");
    } finally {
      setIsExportingEntity(null);
    }
  }

  async function handleExportCapas() {
    setIsExportingEntity("capas");
    try {
      const res = await api<{ items: Record<string, unknown>[] }>("/api/capas?pageSize=5000");
      if (!res.items || res.items.length === 0) {
        toast.error("No CAPA records found");
        return;
      }
      const flattened = res.items.map((c) => ({
        "CAPA Number": String(c.number ?? ""),
        Type: String(c.type ?? ""),
        Action: String(c.action ?? ""),
        Status: String(c.status ?? ""),
        Owner: typeof c.owner === "object" ? String((c.owner as { name?: string })?.name ?? "") : String(c.owner ?? "Unassigned"),
        "Due Date": formatDate(c.dueDate as string),
        "Completed Date": formatDate(c.completedAt as string),
        Effectiveness: String(c.effectiveness ?? "Pending")
      }));
      downloadSheet("All-CAPAs-Export", "CAPAs", flattened);
      toast.success(`Exported ${flattened.length} CAPA actions to Excel`);
    } catch {
      toast.error("Failed to export CAPAs");
    } finally {
      setIsExportingEntity(null);
    }
  }

  async function handleDownloadBackup() {
    setIsBackingUp(true);
    try {
      const backup = await api<unknown>("/api/import/backup");
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ONEPWS-Full-Backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Operational database backup downloaded successfully");
    } catch {
      toast.error("Failed to generate database backup");
    } finally {
      setIsBackingUp(false);
    }
  }

  const issueColumns: Column<{ row: number; field: string; message: string }>[] = [
    {
      key: "row",
      header: "Row #",
      primary: true,
      render: (r) => <span className="font-mono font-bold text-slate-800">Row {r.row}</span>
    },
    {
      key: "field",
      header: "Field",
      render: (r) => <span className="font-semibold text-slate-700">{r.field}</span>
    },
    {
      key: "message",
      header: "Validation Error",
      render: (r) => <span className="text-red-700 text-xs font-medium">{r.message}</span>
    }
  ];

  return (
    <main className="space-y-6 pb-12">
      <PageHeader
        title="Import & Export Center"
        description="Batch upload historical complaints, export system registers to Excel, and generate administrative operational backups."
      />

      <div className="space-y-6 px-4 sm:px-6">
        {/* Navigation Tabs */}
        <div className="flex gap-2 border-b border-slate-200 pb-2">
          <button
            type="button"
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-colors ${
              activeTab === "import"
                ? "bg-brand-red text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
            onClick={() => setActiveTab("import")}
          >
            <UploadCloud className="h-4 w-4" />
            <span>Bulk Complaint Import</span>
          </button>

          <button
            type="button"
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-colors ${
              activeTab === "export"
                ? "bg-brand-red text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
            onClick={() => setActiveTab("export")}
          >
            <Download className="h-4 w-4" />
            <span>Full Entity Exports</span>
          </button>

          {permissions.isMasterAdmin && (
            <button
              type="button"
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-colors ${
                activeTab === "backup"
                  ? "bg-brand-red text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              onClick={() => setActiveTab("backup")}
            >
              <Database className="h-4 w-4" />
              <span>Database Backup</span>
            </button>
          )}
        </div>

        {/* TAB 1: BULK IMPORT */}
        {activeTab === "import" && (
          <div className="space-y-6">
            <SectionCard
              title="Step 1: Download Standard Template"
              description="Download the official Excel template containing all required column headers, enum options, and sample entries."
              actions={
                <Button
                  type="button"
                  variant="secondary"
                  className="text-xs"
                  onClick={handleDownloadTemplate}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download Excel Template (.xlsx)
                </Button>
              }
            >
              <p className="text-xs text-slate-500">
                Ensure all required fields (Company Code, Received Date, Priority, Category, Description) match system master data before uploading.
              </p>
            </SectionCard>

            <SectionCard
              title="Step 2: Upload Populated Spreadsheet"
              description="Upload your Excel (.xlsx) or CSV file. The file is validated for column adherence, mandatory fields, and duplicate checks before anything is saved."
            >
              <div className="mt-2 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center hover:bg-slate-50 transition-colors">
                <UploadCloud className="h-10 w-10 text-slate-400 mb-3" />
                <p className="text-sm font-semibold text-slate-800">
                  {file ? file.name : "Select an Excel or CSV file to import"}
                </p>
                <p className="text-xs text-slate-500 mt-1">Maximum 2,000 rows per batch upload</p>
                <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-charcoal px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Choose Spreadsheet File</span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileChange}
                  />
                </label>
              </div>

              {isValidating && (
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-600">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-red border-t-transparent" />
                  <span>Validating spreadsheet rows on server...</span>
                </div>
              )}
            </SectionCard>

            {/* Validation Results & Confirmation */}
            {previewData && (
              <SectionCard
                title="Step 3: Verification Summary & Import Strategy"
                description="Review validation findings and choose how duplicate or repeating complaints should be treated."
              >
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                    <span className="text-xs text-slate-500 block">Total Rows</span>
                    <span className="text-xl font-bold text-slate-800">{previewData.totalRows}</span>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
                    <span className="text-xs text-emerald-700 block">Valid Rows</span>
                    <span className="text-xl font-bold text-emerald-800">{previewData.validRows}</span>
                  </div>
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                    <span className="text-xs text-red-700 block">Invalid Rows</span>
                    <span className="text-xl font-bold text-red-800">{previewData.invalidRows}</span>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
                    <span className="text-xs text-amber-700 block">Potential Duplicates</span>
                    <span className="text-xl font-bold text-amber-800">{previewData.duplicateRows}</span>
                  </div>
                </div>

                {previewData.issues.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <h4 className="text-xs font-bold text-red-900 flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      Row Validation Errors ({previewData.issues.length})
                    </h4>
                    <DataTable
                      rows={previewData.issues.slice(0, 10)}
                      rowKey={(i) => `${i.row}-${i.field}`}
                      columns={issueColumns}
                      emptyTitle="No issues"
                      emptyDescription=""
                    />
                    {previewData.issues.length > 10 && (
                      <p className="text-[11px] text-slate-500 italic">
                        Showing first 10 validation issues. Please fix all errors in Excel and re-upload.
                      </p>
                    )}
                  </div>
                )}

                <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-100 pt-4">
                  <div className="w-full sm:max-w-xs">
                    <Field label="Duplicate Handling Strategy">
                      <Select
                        value={strategy}
                        onChange={(e) => setStrategy(e.target.value as "skip-duplicates" | "import-and-flag")}
                      >
                        <option value="skip-duplicates">Skip detected duplicates</option>
                        <option value="import-and-flag">Import and flag as repeat defects</option>
                      </Select>
                    </Field>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 px-4"
                      disabled={isCommitting || previewData.validRows === 0}
                      onClick={handleCommitImport}
                    >
                      {isCommitting ? "Importing Records..." : `Commit Import (${previewData.validRows} Records)`}
                    </Button>
                  </div>
                </div>

                {commitResult && (
                  <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-bold">Batch import processed successfully</p>
                      <p className="mt-1">
                        {commitResult.created} complaints registered into the system. {commitResult.skipped} duplicate or invalid rows skipped.
                      </p>
                    </div>
                  </div>
                )}
              </SectionCard>
            )}
          </div>
        )}

        {/* TAB 2: DATA EXPORT CENTER */}
        {activeTab === "export" && (
          <div className="grid gap-6 md:grid-cols-2">
            <SectionCard
              title="Complaints Register Export"
              description="Export all permitted customer and internal complaints with lifecycle metadata, classifications, and resolution status."
            >
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-slate-500">Comprehensive Excel dataset</span>
                <Button
                  type="button"
                  variant="primary"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                  disabled={isExportingEntity === "complaints"}
                  onClick={handleExportComplaints}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  {isExportingEntity === "complaints" ? "Exporting..." : "Export Complaints (.xlsx)"}
                </Button>
              </div>
            </SectionCard>

            <SectionCard
              title="CAPA Master Export"
              description="Export all corrective, preventive, and containment actions with ownership, due dates, completion evidence, and verified effectiveness."
            >
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-slate-500">Full CAPA register</span>
                <Button
                  type="button"
                  variant="primary"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                  disabled={isExportingEntity === "capas"}
                  onClick={handleExportCapas}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  {isExportingEntity === "capas" ? "Exporting..." : "Export CAPAs (.xlsx)"}
                </Button>
              </div>
            </SectionCard>
          </div>
        )}

        {/* TAB 3: DATABASE BACKUP (MASTER ADMIN ONLY) */}
        {activeTab === "backup" && permissions.isMasterAdmin && (
          <SectionCard
            title="Operational Database Snapshot Backup"
            description="Generate an atomic JSON snapshot of all system collections (Complaints, CAPAs, Configurations, Master Data, and Audit Trails) for disaster recovery and offline compliance storage."
          >
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 mb-6">
              <div className="flex items-start gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Authorized Administrative Procedure</p>
                  <p className="mt-1 leading-relaxed">
                    This action exports every record in the MongoDB database into a serialized JSON bundle. Sensitive password hashes and reset tokens are automatically excluded from the backup payload.
                  </p>
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant="danger"
              disabled={isBackingUp}
              onClick={handleDownloadBackup}
            >
              <Database className="mr-1.5 h-3.5 w-3.5" />
              {isBackingUp ? "Compiling Snapshot..." : "Download Full JSON Database Backup"}
            </Button>
          </SectionCard>
        )}
      </div>
    </main>
  );
}
export default ImportExportPage;
