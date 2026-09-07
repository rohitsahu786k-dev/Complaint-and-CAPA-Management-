import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FilterX,
  History,
  Lock,
  Search,
  User
} from "lucide-react";
import { AUDIT_ACTIONS } from "@shared/constants/domain";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/Cards";
import { DataTable, Pagination, type Column } from "@/components/ui/DataTable";
import { Field, Select } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/toast-context";
import { downloadSheet } from "@/lib/excel";
import { formatDateTime } from "@/lib/format";
import { useAuditTrail, usePermissions, type AuditEntry } from "@/services/queries";

const ENTITIES = ["Complaint", "Capa", "Attachment", "User", "Role", "Company", "Department", "Employee", "Configuration"];

export function AuditTrailPage() {
  const toast = useToast();
  const permissions = usePermissions();
  const [params, setParams] = useSearchParams();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const query = useMemo(() => {
    const entries: Record<string, string | number> = {
      page: Number(params.get("page") ?? 1),
      pageSize: Number(params.get("pageSize") ?? 25),
      sort: "createdAt",
      order: "desc"
    };
    ["action", "entity", "search", "from", "to"].forEach((key) => {
      const val = params.get(key);
      if (val) entries[key] = val;
    });
    return entries;
  }, [params]);

  const { data, isLoading, error } = useAuditTrail(query, permissions.can("audit.view") || permissions.isMasterAdmin);
  const logs = data?.items ?? [];

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.set("page", "1");
    setParams(next);
  }

  function clearFilters() {
    setParams(new URLSearchParams({ page: "1", pageSize: "25" }));
  }

  function handleExport() {
    if (logs.length === 0) {
      toast.error("No audit records to export");
      return;
    }
    const rows = logs.map((l) => ({
      "Timestamp (UTC)": formatDateTime(l.createdAt),
      Actor: l.actorName || "System",
      Action: l.action,
      Entity: l.entity,
      "Entity ID": l.entityId || "—",
      "Before State": l.before ? JSON.stringify(l.before) : "—",
      "After State": l.after ? JSON.stringify(l.after) : "—",
      Metadata: l.metadata ? JSON.stringify(l.metadata) : "—"
    }));
    downloadSheet("Audit-Trail-Export", "Audit Logs", rows);
    toast.success("Audit trail exported to Excel");
  }

  function actionTone(action: string): "green" | "red" | "neutral" | "amber" {
    if (action.includes("CREATE") || action.includes("SIGN") || action.includes("ACCEPT")) return "green";
    if (action.includes("DELETE") || action.includes("REJECT") || action.includes("UNSIGN")) return "red";
    if (action.includes("UPDATE") || action.includes("STAGE")) return "amber";
    return "neutral";
  }

  const columns: Column<AuditEntry>[] = [
    {
      key: "expand",
      header: "",
      width: "36px",
      render: (row) => (
        <button
          type="button"
          className="p-1 text-slate-400 hover:text-slate-600 rounded"
          onClick={(e) => {
            e.stopPropagation();
            setExpandedId(expandedId === row._id ? null : row._id);
          }}
          aria-label="Expand audit details"
        >
          {expandedId === row._id ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      )
    },
    {
      key: "createdAt",
      header: "Timestamp",
      primary: true,
      render: (row) => (
        <span className="font-mono text-xs text-slate-700 font-medium">
          {formatDateTime(row.createdAt)}
        </span>
      )
    },
    {
      key: "actorName",
      header: "Actor",
      render: (row) => (
        <div className="flex items-center gap-1.5 text-xs text-slate-800">
          <User className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-medium">{row.actorName || "Automated System"}</span>
        </div>
      )
    },
    {
      key: "action",
      header: "Action Executed",
      render: (row) => (
        <StatusBadge tone={actionTone(row.action)}>{row.action}</StatusBadge>
      )
    },
    {
      key: "entity",
      header: "Entity Scope",
      render: (row) => (
        <span className="text-xs text-slate-700 font-semibold">{row.entity}</span>
      )
    },
    {
      key: "entityId",
      header: "Record Identifier",
      render: (row) => (
        <span className="font-mono text-xs text-slate-500">{row.entityId || "—"}</span>
      )
    }
  ];

  return (
    <main className="space-y-6 pb-12">
      <PageHeader
        title="Immutable Audit Trail"
        description="Comprehensive, non-repudiable log of every change, lifecycle stage completion, electronic signature, and administrative modification."
        actions={
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 rounded bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200">
              <Lock className="h-3.5 w-3.5 text-emerald-600" />
              <span>Tamper-Proof & Append-Only</span>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              onClick={handleExport}
              disabled={logs.length === 0}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export Audit Trail
            </Button>
          </div>
        }
      />

      <div className="space-y-4 px-4 sm:px-6">
        <SectionCard>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            <Field label="Search">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-8 text-xs"
                  placeholder="Actor, action, ID..."
                  value={params.get("search") ?? ""}
                  onChange={(e) => updateFilter("search", e.target.value)}
                />
              </div>
            </Field>

            <Field label="Action Type">
              <Select
                className="text-xs"
                value={params.get("action") ?? ""}
                onChange={(e) => updateFilter("action", e.target.value)}
              >
                <option value="">All Actions</option>
                {AUDIT_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Entity Scope">
              <Select
                className="text-xs"
                value={params.get("entity") ?? ""}
                onChange={(e) => updateFilter("entity", e.target.value)}
              >
                <option value="">All Entities</option>
                {ENTITIES.map((en) => (
                  <option key={en} value={en}>
                    {en}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Date From">
              <Input
                type="date"
                className="text-xs"
                value={params.get("from") ?? ""}
                onChange={(e) => updateFilter("from", e.target.value)}
              />
            </Field>

            <Field label="Date To">
              <Input
                type="date"
                className="text-xs"
                value={params.get("to") ?? ""}
                onChange={(e) => updateFilter("to", e.target.value)}
              />
            </Field>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-xs text-slate-500">
              Showing {logs.length} of {data?.total ?? 0} Audit Entries
            </span>
            <Button
              type="button"
              variant="ghost"
              className="text-xs text-slate-600"
              onClick={clearFilters}
            >
              <FilterX className="mr-1.5 h-3.5 w-3.5" />
              Reset Filters
            </Button>
          </div>
        </SectionCard>

        <SectionCard>
          <DataTable<AuditEntry>
            rows={logs}
            rowKey={(item) => item._id}
            columns={columns}
            isLoading={isLoading}
            error={error}
            onRowClick={(row) => setExpandedId(expandedId === row._id ? null : row._id)}
            emptyTitle="No audit trail entries found"
            emptyDescription="No recorded changes match the active search and date filters."
          />

          {/* Details drawer/expansion if a row is opened */}
          {expandedId && (
            (() => {
              const item = logs.find((l) => l._id === expandedId);
              if (!item) return null;
              return (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <History className="h-4 w-4 text-brand-red" />
                      Payload Inspection: {item.action} on {item.entity} ({item.entityId || "General"})
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-6 text-[11px] px-2"
                      onClick={() => setExpandedId(null)}
                    >
                      Close Details
                    </Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-1">
                      <span className="font-semibold text-slate-600 block">Before Mutation:</span>
                      <pre className="max-h-48 overflow-auto rounded border border-slate-200 bg-white p-2 font-mono text-[11px] text-slate-700">
                        {item.before ? JSON.stringify(item.before, null, 2) : "— No prior state —"}
                      </pre>
                    </div>

                    <div className="space-y-1">
                      <span className="font-semibold text-slate-600 block">After Mutation:</span>
                      <pre className="max-h-48 overflow-auto rounded border border-slate-200 bg-white p-2 font-mono text-[11px] text-slate-700">
                        {item.after ? JSON.stringify(item.after, null, 2) : "— No changes logged —"}
                      </pre>
                    </div>

                    <div className="space-y-1">
                      <span className="font-semibold text-slate-600 block">Metadata Context:</span>
                      <pre className="max-h-48 overflow-auto rounded border border-slate-200 bg-white p-2 font-mono text-[11px] text-slate-700">
                        {item.metadata ? JSON.stringify(item.metadata, null, 2) : "— None —"}
                      </pre>
                    </div>
                  </div>
                </div>
              );
            })()
          )}

          {data && data.totalPages > 1 && (
            <div className="pt-4">
              <Pagination
                page={data.page}
                totalPages={data.totalPages}
                total={data.total}
                pageSize={data.pageSize}
                onPageChange={(p) => updateFilter("page", String(p))}
              />
            </div>
          )}
        </SectionCard>
      </div>
    </main>
  );
}
export default AuditTrailPage;
