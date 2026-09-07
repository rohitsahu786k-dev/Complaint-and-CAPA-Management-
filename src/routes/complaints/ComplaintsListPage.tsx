import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Download, FilterX, Plus, Search } from "lucide-react";
import { COMPLAINT_STATUSES, COMPLAINT_TYPES } from "@shared/constants/domain";
import { SectionCard } from "@/components/ui/Cards";
import { DataTable, Pagination, type Column } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/toast-context";
import { downloadSheet, timestampedName } from "@/lib/excel";
import { formatDate, statusTone } from "@/lib/format";
import { api } from "@/lib/api";
import {
  useComplaints,
  useConfiguration,
  useMasterBootstrap,
  usePermissions,
  type ComplaintListItem,
  type Paginated
} from "@/services/queries";

const FILTER_KEYS = ["type", "status", "priority", "category", "responsibleDept", "company", "isRepeat", "search", "receivedFrom", "receivedTo"] as const;

export function ComplaintsListPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const permissions = usePermissions();
  const [params, setParams] = useSearchParams();
  const master = useMasterBootstrap();
  const configuration = useConfiguration();

  const query = useMemo(() => {
    const entries: Record<string, string | number> = {
      page: Number(params.get("page") ?? 1),
      pageSize: Number(params.get("pageSize") ?? 25),
      sort: params.get("sort") ?? "receivedAt",
      order: params.get("order") ?? "desc"
    };
    FILTER_KEYS.forEach((key) => {
      const value = params.get(key);
      if (value) entries[key] = value;
    });
    return entries;
  }, [params]);

  const { data, isLoading, error } = useComplaints(query);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.set("page", "1");
    setParams(next, { replace: true });
  }

  function clearFilters() {
    const next = new URLSearchParams();
    next.set("page", "1");
    setParams(next, { replace: true });
  }

  const activeFilterCount = FILTER_KEYS.filter((key) => params.get(key)).length;

  const columns: Column<ComplaintListItem>[] = [
    {
      key: "number",
      header: "Complaint",
      primary: true,
      sortable: true,
      render: (row) => (
        <span className="block">
          <span className="font-semibold text-brand-charcoal">{row.number}</span>
          <span className="mt-0.5 block text-xs text-slate-500">{row.company?.code ?? ""}</span>
        </span>
      )
    },
    { key: "type", header: "Type", render: (row) => row.type },
    { key: "customer", header: "Customer / Product", render: (row) => row.customer || row.product || "—" },
    { key: "category", header: "Category", render: (row) => row.category || "—" },
    { key: "responsibleDept", header: "Department", render: (row) => row.responsibleDept?.name ?? "—", hideOnMobile: true },
    { key: "priority", header: "Priority", render: (row) => row.priority?.name ?? "—" },
    { key: "owner", header: "Owner", render: (row) => row.owner?.name ?? "—", hideOnMobile: true },
    { key: "receivedAt", header: "Received", sortable: true, render: (row) => formatDate(row.receivedAt) },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge>
          {row.isRepeat ? <StatusBadge tone="red">Repeat</StatusBadge> : null}
        </span>
      )
    }
  ];

  async function exportFiltered() {
    try {
      const all = await api<Paginated<ComplaintListItem>>(
        `/api/complaints?${new URLSearchParams({ ...(query as Record<string, string>), page: "1", pageSize: "100" }).toString()}`
      );
      downloadSheet(
        timestampedName("complaints"),
        "Complaints",
        all.items.map((row) => ({
          "Complaint No": row.number,
          Company: row.company?.name ?? "",
          Type: row.type,
          Received: formatDate(row.receivedAt, ""),
          Priority: row.priority?.name ?? "",
          Category: row.category ?? "",
          Customer: row.customer ?? "",
          Product: row.product ?? "",
          Department: row.responsibleDept?.name ?? "",
          Owner: row.owner?.name ?? "",
          Status: row.status,
          Repeat: row.isRepeat ? "Yes" : "No",
          Closed: formatDate(row.closedAt, "")
        }))
      );
      toast.success("Export ready", `${all.items.length} rows exported using the current filters.`);
    } catch (exportError) {
      toast.error("Export failed", exportError instanceof Error ? exportError.message : "Try again.");
    }
  }

  const categories = (configuration.data?.categories ?? []).filter((category) => {
    const type = params.get("type");
    return !type || category.complaintType === type;
  });

  return (
    <main className="pb-10">
      <PageHeader
        title="Complaints"
        description="Every complaint you are permitted to see, filtered on the server."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={exportFiltered} disabled={!data || data.items.length === 0}>
              <Download className="h-4 w-4" />
              Export
            </Button>
            {permissions.can("complaint.create") ? (
              <Button onClick={() => navigate("/complaints/new")}>
                <Plus className="h-4 w-4" />
                New complaint
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="space-y-4 p-3 sm:p-6">
        <SectionCard
          title="Filters"
          description={activeFilterCount > 0 ? `${activeFilterCount} filter(s) applied. Filters stay in the page address so a view can be shared.` : "Filters stay in the page address so a view can be shared."}
          actions={
            activeFilterCount > 0 ? (
              <Button variant="secondary" onClick={clearFilters}>
                <FilterX className="h-4 w-4" />
                Clear filters
              </Button>
            ) : undefined
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Search">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-9"
                  placeholder="Number, customer, product, PO, description"
                  defaultValue={params.get("search") ?? ""}
                  onBlur={(event) => setParam("search", event.target.value.trim())}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") setParam("search", (event.target as HTMLInputElement).value.trim());
                  }}
                />
              </div>
            </Field>
            <Field label="Type">
              <Select value={params.get("type") ?? ""} onChange={(event) => setParam("type", event.target.value)}>
                <option value="">All types</option>
                {COMPLAINT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={params.get("status") ?? ""} onChange={(event) => setParam("status", event.target.value)}>
                <option value="">All statuses</option>
                {COMPLAINT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={params.get("priority") ?? ""} onChange={(event) => setParam("priority", event.target.value)}>
                <option value="">All priorities</option>
                {(configuration.data?.priorities ?? []).map((priority) => (
                  <option key={priority._id} value={priority._id}>
                    {priority.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Category">
              <Select value={params.get("category") ?? ""} onChange={(event) => setParam("category", event.target.value)}>
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category._id} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Department">
              <Select value={params.get("responsibleDept") ?? ""} onChange={(event) => setParam("responsibleDept", event.target.value)}>
                <option value="">All departments</option>
                {(master.data?.departments ?? []).map((department) => (
                  <option key={department._id} value={department._id}>
                    {department.name}
                  </option>
                ))}
              </Select>
            </Field>
            {(master.data?.companies.length ?? 0) > 1 ? (
              <Field label="Company">
                <Select value={params.get("company") ?? ""} onChange={(event) => setParam("company", event.target.value)}>
                  <option value="">All permitted companies</option>
                  {(master.data?.companies ?? []).map((company) => (
                    <option key={company._id} value={company._id}>
                      {company.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Repeat only">
              <Select value={params.get("isRepeat") ?? ""} onChange={(event) => setParam("isRepeat", event.target.value)}>
                <option value="">All complaints</option>
                <option value="true">Repeat complaints only</option>
              </Select>
            </Field>
            <Field label="Received from">
              <Input type="date" value={params.get("receivedFrom") ?? ""} onChange={(event) => setParam("receivedFrom", event.target.value)} />
            </Field>
            <Field label="Received to">
              <Input type="date" value={params.get("receivedTo") ?? ""} onChange={(event) => setParam("receivedTo", event.target.value)} />
            </Field>
          </div>
        </SectionCard>

        <div>
          <DataTable
            columns={columns}
            rows={data?.items ?? []}
            rowKey={(row) => row._id}
            isLoading={isLoading}
            error={error}
            onRowClick={(row) => navigate(`/complaints/${row._id}`)}
            sort={{ field: String(query.sort), order: query.order === "asc" ? "asc" : "desc" }}
            onSortChange={(sort) => {
              const next = new URLSearchParams(params);
              next.set("sort", sort.field);
              next.set("order", sort.order);
              setParams(next, { replace: true });
            }}
            emptyTitle="No complaints match these filters"
            emptyDescription="Adjust or clear the filters to widen the search."
            caption="Complaint register"
          />
          {data ? (
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              totalPages={data.totalPages}
              onPageChange={(page) => setParam("page", String(page))}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}
