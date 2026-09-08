import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import type { ApiUser } from "@shared/types/api";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/hooks/useAuth";

export type QueryValue = string | number | boolean | undefined | null;

export function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const serialised = search.toString();
  return serialised ? `?${serialised}` : "";
}

function useApiQuery<T>(key: unknown[], path: string, options?: Partial<UseQueryOptions<T, Error>>) {
  return useQuery<T, Error>({ queryKey: key, queryFn: () => api<T>(path), ...options });
}

/* ------------------------------------------------------------------ permissions */

export function usePermissions() {
  const { data } = useCurrentUser();
  const user = data?.user;
  const permissions = user?.role?.permissions ?? [];
  const can = (permission: string) => permissions.includes("*") || permissions.includes(permission as never);
  return {
    user,
    permissions,
    can,
    isMasterAdmin: user?.role?.name === "Master Admin" || permissions.includes("*"),
    roleName: user?.role?.name ?? ""
  };
}

export type Permissions = ReturnType<typeof usePermissions>;

/* ------------------------------------------------------------------ shared reference data */

export type ConfigurationResponse = {
  tat: Record<string, number>;
  escalation: { levels: { level: number; name: string; triggerHoursOverdue: number }[]; reminderPercentages: number[] };
  delayReasons: string[];
  categories: { _id: string; name: string; complaintType: "External" | "Internal"; parent: string | null }[];
  priorities: { _id: string; name: string; color: string; tatMultiplier: number }[];
  rootCauseCategories: { _id: string; name: string }[];
  fishboneCategories: string[];
  qcTools: string[];
  complaintTypes: string[];
};

export function useConfiguration(company?: string) {
  return useApiQuery<ConfigurationResponse>(["configuration", company ?? "all"], `/api/configuration${buildQuery({ company })}`, {
    staleTime: 5 * 60 * 1000
  });
}

export type MasterBootstrap = {
  companies: { _id: string; name: string; code: string; complaintNumberingPrefix: string; active: boolean }[];
  departments: { _id: string; name: string; active: boolean }[];
  roles: { _id: string; name: string; permissions: string[]; active: boolean }[];
  permissions: { _id: string; key: string; label: string; group: string }[];
  employees: { _id: string; name: string; employeeCode: string; designation?: string; email?: string; department?: string }[];
};

export function useMasterBootstrap() {
  return useApiQuery<MasterBootstrap>(["master", "bootstrap"], "/api/master/bootstrap", { staleTime: 5 * 60 * 1000 });
}

export function useSystemUsers(enabled = true) {
  return useApiQuery<{ users: ApiUser[] }>(["master", "users"], "/api/master/users", { enabled, staleTime: 60 * 1000 });
}

export type AssignableUser = { id: string; name: string; username: string; email: string; role: string };

export function useAssignableUsers(company?: string) {
  return useApiQuery<{ users: AssignableUser[] }>(
    ["assignable-users", company ?? "all"],
    `/api/analytics/assignable-users${buildQuery({ company })}`,
    { staleTime: 5 * 60 * 1000 }
  );
}

/* ------------------------------------------------------------------ analytics */

export type DashboardResponse = {
  kpis: Record<string, number>;
  statusDistribution: { name: string; value: number }[];
  priorityDistribution: { name: string; value: number }[];
  typeDistribution: { name: string; value: number }[];
  trend: { month: string; received: number; closed: number }[];
  aging: { name: string; value: number }[];
  rootCauseCategories: { name: string; value: number }[];
  categories: { name: string; value: number }[];
  recent: { id: string; number: string; type: string; status: string; customer: string; category: string; receivedAt: string; isRepeat: boolean }[];
};

export function useDashboard(company?: string) {
  return useApiQuery<DashboardResponse>(["analytics", "dashboard", company ?? "all"], `/api/analytics/dashboard${buildQuery({ company })}`);
}

export type TatResponse = {
  stages: {
    stage: string;
    label: string;
    total: number;
    completed: number;
    onTime: number;
    late: number;
    overdueOpen: number;
    dueSoon: number;
    compliancePercent: number;
  }[];
  trend: { month: string; completed: number; onTime: number; compliancePercent: number }[];
  pareto: { name: string; value: number; cumulativePercent: number }[];
  drilldown: { stage: string; stageLabel: string; complaintId: string; number: string; customer: string; category: string; explanation: string }[];
  config: Record<string, number>;
};

export function useTatAnalytics(company?: string) {
  return useApiQuery<TatResponse>(["analytics", "tat", company ?? "all"], `/api/analytics/tat${buildQuery({ company })}`);
}

export type CapaAnalyticsResponse = {
  kpis: Record<string, number>;
  statusDistribution: { name: string; value: number }[];
  typeDistribution: { name: string; value: number }[];
  effectivenessDistribution: { name: string; value: number }[];
  evidenceReviewDistribution: { name: string; value: number }[];
  personWise: {
    owner: string;
    assigned: number;
    open: number;
    closed: number;
    overdue: number;
    effective: number;
    notEffective: number;
    closurePercent: number;
  }[];
  trend: { month: string; assigned: number; closed: number }[];
};

export function useCapaAnalytics(company?: string) {
  return useApiQuery<CapaAnalyticsResponse>(["analytics", "capa", company ?? "all"], `/api/analytics/capa${buildQuery({ company })}`);
}

export type RepeatResponse = {
  windowDays: number;
  total: number;
  byCustomer: { name: string; value: number }[];
  byCategory: { name: string; value: number }[];
  byProduct: { name: string; value: number }[];
  items: {
    id: string;
    number: string;
    companyCode: string;
    type: string;
    status: string;
    receivedAt: string;
    customer: string;
    product: string;
    category: string;
    rootCause: string;
    rootCauseCategory: string;
    responsibleDept: string;
    owner: string;
    basis: string;
    shortestIntervalDays: number | null;
    originals: { id: string; number: string; receivedAt: string | null; status: string; basis: string[]; intervalDays: number | null }[];
  }[];
};

export function useRepeatAnalytics(company?: string) {
  return useApiQuery<RepeatResponse>(["analytics", "repeat", company ?? "all"], `/api/analytics/repeat${buildQuery({ company })}`);
}

/* ------------------------------------------------------------------ complaints */

export type Paginated<T> = { items: T[]; page: number; pageSize: number; total: number; totalPages: number };

export type ComplaintListItem = {
  _id: string;
  number: string;
  type: "External" | "Internal";
  status: string;
  receivedAt: string;
  closedAt: string | null;
  customer?: string;
  product?: string;
  category?: string;
  isRepeat?: boolean;
  company?: { _id: string; name: string; code: string } | null;
  priority?: { _id: string; name: string; color: string } | null;
  owner?: { _id: string; name: string } | null;
  responsibleDept?: { _id: string; name: string } | null;
};

export function useComplaints(params: Record<string, QueryValue>) {
  return useApiQuery<Paginated<ComplaintListItem>>(["complaints", params], `/api/complaints${buildQuery(params)}`, { placeholderData: (previous) => previous });
}

export type SignatureSnapshot = {
  user?: string;
  name?: string;
  designation?: string;
  department?: string;
  email?: string;
  at?: string;
  notes?: string;
} | null;

export type ComplaintDetail = {
  _id: string;
  number: string;
  type: "External" | "Internal";
  status: string;
  receivedAt: string;
  closedAt: string | null;
  closureRemarks?: string;
  reopenReason?: string;
  description: string;
  source?: string;
  reportedBy?: string;
  customer?: string;
  customerContact?: string;
  customerLocation?: string;
  project?: string;
  customerPO?: string;
  product?: string;
  batch?: string;
  category?: string;
  subCategory?: string;
  isRepeat?: boolean;
  repeatBasis?: string;
  repeatOf?: { complaint: string; number?: string; basis?: string[] }[];
  company?: string;
  priority?: string;
  owner?: string;
  responsibleDept?: string;
  internalDept?: string;
  againstDept?: string;
  containmentNotes?: string;
  acknowledgedAt?: string | null;
  containmentAt?: string | null;
  rcaAt?: string | null;
  capaAssignedAt?: string | null;
  ackDelayReason?: { category?: string; explanation?: string } | null;
  contDelayReason?: { category?: string; explanation?: string } | null;
  rcaDelayReason?: { category?: string; explanation?: string } | null;
  capaDelayReason?: { category?: string; explanation?: string } | null;
  d0?: string;
  d1Team?: { employee?: string; name?: string; dept?: string; designation?: string; email?: string; role?: string }[];
  d2?: Record<string, string>;
  d3Actions?: ActionRow[];
  d4QcTools?: string[];
  d4Occurrence?: string;
  d4Escape?: string;
  d4Systemic?: string;
  rootCauseCategory?: string;
  fiveWhy?: { occurrence?: string[]; escape?: string[]; systemic?: string[]; singleChain?: string[] };
  fishbone?: Record<string, string[]>;
  d5Occurrence?: ActionRow[];