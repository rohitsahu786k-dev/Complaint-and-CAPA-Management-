import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  FileSpreadsheet,
  FileText,
  Lock,
  RefreshCw,
  Repeat2,
  ShieldAlert,
  Trash2,
  Unlock,
  UserRoundCog
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DefinitionList, SectionCard } from "@/components/ui/Cards";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/toast-context";
import { api, ApiError } from "@/lib/api";
import { downloadWorkbook } from "@/lib/excel";
import { formatDate, formatDateTime, statusTone, tatLabel, tatTone } from "@/lib/format";
import { generateComplaintPdf, type PdfCapa, type PdfComplaint } from "@/lib/pdf";
import {
  issuesFrom,
  useApiMutation,
  useAssignableUsers,
  useComplaintDetail,
  useMasterBootstrap,
  usePermissions,
  type ApiIssue,
  type ComplaintDetail
} from "@/services/queries";
import { AttachmentsTab } from "./AttachmentsTab";
import { AuditTab } from "./AuditTab";
import { CapaTab } from "./CapaTab";
import { EffectivenessTab } from "./EffectivenessTab";
import { EightDTab } from "./EightDTab";
import { InternalTab } from "./InternalTab";
import { NotesTab } from "./NotesTab";
import { BlockedReasons, TabPanel } from "./shared";
import { TimelineTab } from "./TimelineTab";
import { WorkflowPanel } from "./WorkflowPanel";

type TabKey =
  | "overview"
  | "investigation"
  | "capa"
  | "effectiveness"
  | "attachments"
  | "notes"
  | "timeline"
  | "audit";

export function ComplaintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const permissions = usePermissions();
  const master = useMasterBootstrap();

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);

  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closureRemarks, setClosureRemarks] = useState("");
  const [noRepeatConfirmed, setNoRepeatConfirmed] = useState(false);
  const [forceClose, setForceClose] = useState(false);
  const [closeIssues, setCloseIssues] = useState<ApiIssue[]>([]);
  const [closeError, setCloseError] = useState<string | null>(null);

  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showOwnerModal, setShowOwnerModal] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState("");

  const detailQuery = useComplaintDetail(id);
  const data = detailQuery.data;
  const complaint = data?.complaint;
  const capas = data?.capas ?? [];
  const tat = data?.tat ?? [];
  const canEdit = Boolean(data?.permissions?.canEdit);
  const canClose = Boolean(data?.permissions?.canClose);
  const canDelete = Boolean(data?.permissions?.canDelete && permissions.isMasterAdmin);
  const canAssign = permissions.can("complaint.assign") && complaint?.status !== "Closed";
  const assignableUsers = useAssignableUsers(complaint?.company);

  const invalidate = [["complaint", id], ["complaints"], ["analytics"]];

  const closeMutation = useApiMutation<
    { complaint: ComplaintDetail },
    { closureRemarks: string; noRepeatConfirmed: boolean; force: boolean }
  >("POST", `/api/complaints/${id}/close`, invalidate);

  const reopenMutation = useApiMutation<{ complaint: ComplaintDetail }, { reason: string }>(
    "POST",
    `/api/complaints/${id}/reopen`,
    invalidate
  );

  const deleteMutation = useApiMutation<
    { deleted: boolean; number: string; removedCapas: number; removedAttachments: number },
    { confirmation: string }
  >("DELETE", `/api/complaints/${id}`, [["complaints"], ["analytics"]]);

  const ownerMutation = useApiMutation<{ complaint: ComplaintDetail }, { owner: string }>(
    "PATCH",
    `/api/complaints/${id}/owner`,
    invalidate
  );

  const overallTatHealth = useMemo(() => {
    if (!tat || tat.length === 0) return "on-time";
    if (tat.some((s) => s.overdue && !s.completedAt)) return "overdue";
    if (tat.some((s) => s.health === "due-soon" && !s.completedAt)) return "due-soon";
    return "on-time";
  }, [tat]);

  const targetDates = data?.targetDates ?? { d3: "", d5: "", d6: "" };
  const resolved = data?.resolved;

  const companyObj = useMemo(() => {
    if (!complaint?.company) return null;
    return master.data?.companies.find((c) => c._id === complaint.company);
  }, [complaint?.company, master.data?.companies]);

  if (detailQuery.isLoading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center space-y-3">
        <RefreshCw className="h-6 w-6 animate-spin text-brand-red" />
        <p className="text-sm font-semibold text-slate-600">Loading complaint details...</p>
      </div>
    );
  }

  if (detailQuery.isError || !complaint) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-red-600" />
          <h3 className="mt-2 text-base font-bold text-red-900">Complaint Not Found</h3>
          <p className="mt-1 text-xs text-red-700">
            The requested complaint record does not exist or you do not have permission to view it.
          </p>
          <Button type="button" variant="secondary" className="mt-4" onClick={() => navigate("/complaints")}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Complaints List
          </Button>
        </div>
      </div>
    );
  }

  const isClosed = complaint.status === "Closed";

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      const response = await api<{ complaint: PdfComplaint; capas: PdfCapa[] }>(`/api/reports/complaint/${complaint._id}/8d`);
      generateComplaintPdf(response.complaint, response.capas);
      toast.success("PDF generated and download started");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to generate 8D PDF");
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function handleDownloadExcel() {
    setDownloadingExcel(true);
    try {
      const response = await api<{ sheets: { name: string; rows: Record<string, string | number>[] }[] }>(
        `/api/reports/complaint/${complaint._id}/8d`
      );
      downloadWorkbook(`${complaint.number}-${complaint.type === "External" ? "8D" : "Internal"}`, response.sheets);
      toast.success("8D Excel workbook exported");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to export 8D Excel");
    } finally {
      setDownloadingExcel(false);
    }
  }

  async function handleCloseSubmit() {
    if (closureRemarks.trim().length < 5) {
      setCloseError("Closure remarks must be at least 5 characters.");
      return;
    }
    setCloseIssues([]);
    setCloseError(null);
    try {
      await closeMutation.mutateAsync({ closureRemarks: closureRemarks.trim(), noRepeatConfirmed, force: forceClose });
      toast.success(`Complaint ${complaint.number} formally closed`);
      setShowCloseModal(false);
      setClosureRemarks("");
      setNoRepeatConfirmed(false);
      setForceClose(false);
    } catch (error) {
      const fieldIssues = issuesFrom(error);
      if (fieldIssues.length > 0) setCloseIssues(fieldIssues);
      else if (error instanceof ApiError) setCloseError(error.message);
      else setCloseError("Failed to close complaint due to validation requirements.");
      toast.error("Complaint closure blocked by audit rules");
    }
  }

  async function handleReopenSubmit() {
    if (reopenReason.trim().length < 5) {
      toast.error("A reopen reason of at least 5 characters is required");
      return;
    }
    try {
      await reopenMutation.mutateAsync({ reason: reopenReason.trim() });
      toast.success(`Complaint ${complaint.number} reopened`);
      setShowReopenModal(false);
      setReopenReason("");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to reopen complaint");
    }
  }

  async function handleDeleteConfirm() {
    try {
      await deleteMutation.mutateAsync({ confirmation: complaint.number });
      toast.success(`Complaint ${complaint.number} permanently deleted`);
      navigate("/complaints");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to delete complaint");
    }
  }

  async function handleOwnerSubmit() {
    if (!selectedOwner) {
      toast.error("Select a complaint owner");
      return;
    }
    try {
      await ownerMutation.mutateAsync({ owner: selectedOwner });
      toast.success("Complaint owner updated", "The assignment was audited and the new owner was notified.");
      setShowOwnerModal(false);
      setSelectedOwner("");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to update complaint owner");
    }
  }

  const tabs: { id: TabKey; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "investigation", label: complaint.type === "External" ? "8D Investigation" : "Internal Investigation" },
    { id: "capa", label: "CAPA Actions", count: capas.length },
    { id: "effectiveness", label: "Effectiveness" },
    { id: "attachments", label: "Attachments" },
    { id: "notes", label: "Notes & MOM" },
    { id: "timeline", label: "Workflow Timeline" },
    ...(permissions.can("audit.view") ? [{ id: "audit" as TabKey, label: "Audit Trail" }] : [])
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={complaint.number}
        description={`Registered on ${formatDate(complaint.receivedAt)} • ${complaint.type} Complaint • Company: ${companyObj?.name ?? complaint.company ?? "—"}`}
        breadcrumb={
          <div className="flex items-center gap-1.5">
            <Link to="/complaints" className="hover:text-brand-red hover:underline">Complaints</Link>
            <span>/</span>
            <span className="text-slate-700">{complaint.number}</span>
          </div>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" className="text-xs" disabled={downloadingPdf} onClick={handleDownloadPdf}>
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              {downloadingPdf ? "Generating..." : "Download 8D PDF"}
            </Button>
            <Button type="button" variant="secondary" className="text-xs" disabled={downloadingExcel} onClick={handleDownloadExcel}>
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
              {downloadingExcel ? "Exporting..." : "Export 8D Excel"}
            </Button>
            {canAssign ? (
              <Button
                type="button"
                variant="secondary"
                className="text-xs"
                onClick={() => {
                  setSelectedOwner(resolved?.owner?._id ?? complaint.owner ?? "");
                  setShowOwnerModal(true);
                }}
              >
                <UserRoundCog className="mr-1.5 h-3.5 w-3.5" />
                Assign Owner
              </Button>
            ) : null}
            {!isClosed && canClose ? (
              <Button
                type="button"
                variant="primary"
                className="bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                onClick={() => {
                  setCloseIssues([]);
                  setCloseError(null);
                  setShowCloseModal(true);
                }}
              >
                <Lock className="mr-1.5 h-3.5 w-3.5" />
                Close Complaint
              </Button>
            ) : null}
            {isClosed && (canClose || permissions.can("8d.approve") || permissions.isMasterAdmin) ? (
              <Button type="button" variant="secondary" className="border-amber-300 text-xs text-amber-700 hover:bg-amber-50" onClick={() => setShowReopenModal(true)}>
                <Unlock className="mr-1.5 h-3.5 w-3.5" />
                Reopen Complaint
              </Button>
            ) : null}
            {canDelete ? (
              <Button type="button" variant="ghost" className="text-xs text-brand-red hover:bg-red-50" onClick={() => setShowDeleteModal(true)}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge tone={statusTone(complaint.status)}>{complaint.status}</StatusBadge>
        <StatusBadge tone={tatTone(overallTatHealth)}>{`TAT: ${tatLabel(overallTatHealth)}`}</StatusBadge>
        {complaint.isRepeat ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
            <Repeat2 className="h-3.5 w-3.5" />
            Repeat Issue
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-sm sm:grid-cols-2 lg:grid-cols-6">
        <div>
          <span className="block font-medium text-slate-400">Type / Priority</span>
          <span className="mt-0.5 block text-sm font-bold text-slate-800">{complaint.type} • {resolved?.priority?.name ?? "Normal"}</span>
        </div>
        <div>
          <span className="block font-medium text-slate-400">Customer / Raising Dept</span>
          <span className="mt-0.5 block truncate text-sm font-semibold text-slate-800">{complaint.customer || resolved?.internalDept?.name || "Internal"}</span>
        </div>
        <div>
          <span className="block font-medium text-slate-400">Product / Batch</span>
          <span className="mt-0.5 block truncate text-sm font-semibold text-slate-800">{complaint.product || "—"} {complaint.batch ? `(${complaint.batch})` : ""}</span>
        </div>
        <div>
          <span className="block font-medium text-slate-400">Responsible Dept</span>
          <span className="mt-0.5 block truncate text-sm font-semibold text-slate-800">{resolved?.responsibleDept?.name ?? resolved?.againstDept?.name ?? "—"}</span>
        </div>
        <div>
          <span className="block font-medium text-slate-400">Owner</span>
          <span className="mt-0.5 block truncate text-sm font-semibold text-slate-800">{resolved?.owner?.name ?? "Unassigned"}</span>
        </div>
        <div>
          <span className="block font-medium text-slate-400">Closed Date</span>
          <span className="mt-0.5 block text-sm font-semibold text-slate-800">{complaint.closedAt ? formatDate(complaint.closedAt) : "Open"}</span>
        </div>
      </div>

      {complaint.reopenReason && !isClosed ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-bold">This complaint was reopened for re-investigation:</p>
            <p className="mt-1 italic">&ldquo;{complaint.reopenReason}&rdquo;</p>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto border-b border-slate-200">
        <nav className="flex space-x-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                  isActive ? "border-brand-red font-bold text-brand-red" : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined ? (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${isActive ? "bg-red-100 text-brand-red" : "bg-slate-100 text-slate-600"}`}>
                    {tab.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === "overview" ? (
        <TabPanel>
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-8">
              <SectionCard title="Problem Description & Customer Voice">
                <div className="space-y-4 text-xs">
                  <div>
                    <span className="font-medium text-slate-400">Detailed Description:</span>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{complaint.description}</p>
                  </div>
                  {complaint.containmentNotes ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                      <span className="block font-semibold text-slate-500">Immediate Containment Action:</span>
                      <p className="mt-1 text-slate-800">{complaint.containmentNotes}</p>
                    </div>
                  ) : null}
                  {isClosed && complaint.closureRemarks ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-emerald-900">
                      <span className="block font-bold">Closure Remarks:</span>
                      <p className="mt-1">{complaint.closureRemarks}</p>
                    </div>
                  ) : null}
                </div>
              </SectionCard>

              {complaint.isRepeat ? (
                <SectionCard title="Repeat Occurrence Linkage" description="This complaint was flagged as a repeat defect based on matching category and customer/product inside the repeat window.">
                  <div className="space-y-3 text-xs">
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">
                      <p className="font-semibold">Matching Basis: {complaint.repeatBasis || "Category & Customer Match"}</p>
                    </div>
                    {complaint.repeatOf && complaint.repeatOf.length > 0 ? (
                      <div className="space-y-2">
                        <p className="font-bold text-slate-700">Linked Prior Complaints:</p>
                        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                          {complaint.repeatOf.map((orig, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 hover:bg-slate-50">
                              <div className="flex items-center gap-2">
                                <Repeat2 className="h-4 w-4 text-brand-red" />
                                <Link to={`/complaints/${orig.complaint}`} className="font-mono font-bold text-brand-red hover:underline">{orig.number || orig.complaint}</Link>
                              </div>
                              <span className="text-[11px] text-slate-500">{orig.basis?.join(", ") || "Repeat match"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </SectionCard>
              ) : null}

              <WorkflowPanel complaint={complaint} tat={tat} canEdit={canEdit && !isClosed} />
            </div>

            <div className="space-y-6 lg:col-span-4">
              <SectionCard title="Registration Details">
                <DefinitionList
                  items={[
                    { label: "Complaint Number", value: complaint.number },
                    { label: "Classification", value: complaint.type },
                    { label: "Status", value: complaint.status },
                    { label: "Priority", value: resolved?.priority?.name ?? "Normal" },
                    { label: "Owner", value: resolved?.owner?.name ?? "Unassigned" },
                    { label: "Responsible Department", value: resolved?.responsibleDept?.name ?? resolved?.againstDept?.name ?? "—" },
                    { label: "Category", value: complaint.category ?? "—" },
                    { label: "Sub Category", value: complaint.subCategory ?? "—" },
                    { label: "Source", value: complaint.source ?? "Customer" },
                    { label: "Reported By", value: complaint.reportedBy ?? "—" },
                    { label: "Customer PO", value: complaint.customerPO ?? "—" },
                    { label: "Project", value: complaint.project ?? "—" },
                    { label: "Customer Location", value: complaint.customerLocation ?? "—" },
                    { label: "Registered At", value: formatDateTime(complaint.receivedAt) }
                  ]}
                />
              </SectionCard>

              <SectionCard title="Quick Summaries">
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
                    <span className="text-slate-500">CAPA Items</span><span className="font-bold text-slate-800">{capas.length}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
                    <span className="text-slate-500">Overall TAT Status</span><StatusBadge tone={tatTone(overallTatHealth)}>{tatLabel(overallTatHealth)}</StatusBadge>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
                    <span className="text-slate-500">Signatures Completed</span>
                    <span className="font-bold text-slate-800">{[complaint.signatures?.prepared, complaint.signatures?.reviewed, complaint.signatures?.approved].filter(Boolean).length}/3</span>
                  </div>
                </div>
              </SectionCard>
            </div>
          </div>
        </TabPanel>
      ) : null}

      {activeTab === "investigation" ? (
        complaint.type === "External" ? <EightDTab complaint={complaint} canEdit={canEdit && !isClosed} targetDates={targetDates} /> : <InternalTab complaint={complaint} canEdit={canEdit && !isClosed} />
      ) : null}
      {activeTab === "capa" ? <CapaTab complaint={complaint} capas={capas} canEdit={canEdit && !isClosed} /> : null}
      {activeTab === "effectiveness" ? <EffectivenessTab complaint={complaint} capas={capas} canEdit={canEdit} /> : null}
      {activeTab === "attachments" ? <AttachmentsTab complaint={complaint} canEdit={canEdit && !isClosed} /> : null}
      {activeTab === "notes" ? <NotesTab complaint={complaint} canEdit={canEdit && !isClosed} /> : null}
      {activeTab === "timeline" ? <TimelineTab complaint={complaint} /> : null}
      {activeTab === "audit" && permissions.can("audit.view") ? <AuditTab complaint={complaint} /> : null}

      <Modal open={showOwnerModal} onOpenChange={setShowOwnerModal} title={`Assign Complaint Owner: ${complaint.number}`}>
        <div className="space-y-4 text-sm">
          <p className="text-xs text-slate-600">Only active users with access to this company can be assigned. The change is audited and the new owner receives an in-app and email notification.</p>
          <Field label="Complaint Owner" required>
            <Select value={selectedOwner} onChange={(event) => setSelectedOwner(event.target.value)} disabled={assignableUsers.isLoading || ownerMutation.isPending}>
              <option value="">Select owner</option>
              {(assignableUsers.data?.users ?? []).map((user) => <option key={user.id} value={user.id}>{user.name} ({user.role})</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="secondary" onClick={() => setShowOwnerModal(false)}>Cancel</Button>
            <Button type="button" disabled={!selectedOwner || ownerMutation.isPending} onClick={handleOwnerSubmit}>{ownerMutation.isPending ? "Assigning..." : "Save Assignment"}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={showCloseModal} onOpenChange={setShowCloseModal} title={`Formal Closure: ${complaint.number}`}>
        <div className="space-y-4 text-sm">
          <p className="text-xs text-slate-600">Closing a complaint validates that all required workflow stages, investigation sections, digital signatures, and CAPAs have been fulfilled.</p>
          {closeError ? <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" /><span>{closeError}</span></div> : null}
          {closeIssues.length > 0 ? <BlockedReasons title="Closure requirements not satisfied:" issues={closeIssues} /> : null}
          {capas.some((c) => c.status !== "Completed" && c.status !== "Closed") ? (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <div className="flex items-center gap-2 font-bold text-amber-900"><ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" /><span>Open CAPA Items Exist</span></div>
              <p>There are still open or pending verification CAPA items. Closing requires explicit acknowledgement.</p>
              <label className="flex cursor-pointer items-center gap-2 pt-1 font-semibold text-slate-800"><input type="checkbox" checked={forceClose} onChange={(e) => setForceClose(e.target.checked)} className="rounded border-slate-300 text-brand-red focus:ring-brand-red" /><span>I acknowledge open CAPAs and authorize force closure</span></label>
            </div>
          ) : null}
          <Field label="Formal Closure Remarks" required><Textarea rows={3} placeholder="Summarize the investigation outcome and corrective verification..." value={closureRemarks} onChange={(e) => setClosureRemarks(e.target.value)} /></Field>
          <label className="flex cursor-pointer items-start gap-2 pt-1 text-xs text-slate-700"><input type="checkbox" checked={noRepeatConfirmed} onChange={(e) => setNoRepeatConfirmed(e.target.checked)} className="mt-0.5 rounded border-slate-300 text-brand-red focus:ring-brand-red" /><span>I confirm that corrective and containment actions have eliminated the root cause and no repeat defect has been observed during the verification window.</span></label>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><Button type="button" variant="secondary" onClick={() => setShowCloseModal(false)}>Cancel</Button><Button type="button" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={closeMutation.isPending || closureRemarks.trim().length < 5} onClick={handleCloseSubmit}>{closeMutation.isPending ? "Validating & Closing..." : "Confirm Closure"}</Button></div>
        </div>
      </Modal>

      <Modal open={showReopenModal} onOpenChange={setShowReopenModal} title={`Reopen Complaint: ${complaint.number}`}>
        <div className="space-y-4 text-sm">
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><span>Reopening returns this complaint to investigation, appends an audit event, and notifies responsible stakeholders.</span></div>
          <Field label="Reopen Reason & Justification" required><Textarea rows={3} placeholder="Specify why this complaint is being reopened..." value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} /></Field>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-2"><Button type="button" variant="secondary" onClick={() => setShowReopenModal(false)}>Cancel</Button><Button type="button" className="bg-amber-600 text-white hover:bg-amber-700" disabled={reopenMutation.isPending || reopenReason.trim().length < 5} onClick={handleReopenSubmit}>{reopenMutation.isPending ? "Reopening..." : "Confirm Reopen"}</Button></div>
        </div>
      </Modal>

      <ConfirmDialog
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        title={`Permanently Delete ${complaint.number}`}
        description={`This action permanently deletes complaint ${complaint.number}, associated CAPAs, notes and Cloudinary attachments. The audit trail is retained.`}
        confirmLabel="Delete Permanently"
        destructive
        confirmationPhrase={complaint.number}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}

export default ComplaintDetailPage;
