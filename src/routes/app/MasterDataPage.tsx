import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  CircleOff,
  Clock3,
  FileKey2,
  KeyRound,
  ListChecks,
  Plus,
  RefreshCw,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  UserCheck,
  UserPlus,
  Users
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/Cards";
import { Field, Select, Spinner } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/toast-context";
import { api, ApiError } from "@/lib/api";
import { useConfiguration, useMasterBootstrap, usePermissions, useSystemUsers } from "@/services/queries";

type MasterTab =
  | "companies"
  | "departments"
  | "employees"
  | "users"
  | "roles"
  | "categories"
  | "priorities"
  | "tat"
  | "delay"
  | "rootCause"
  | "escalation"
  | "numbering";

type EditableConfiguration = {
  tat: Record<string, number>;
  escalation: { levels: { level: number; name: string; triggerHoursOverdue: number }[]; reminderPercentages: number[]; active?: boolean };
  numbering?: {
    prefix?: string;
    sequencePadding?: number;
    capaSequencePadding?: number;
    resetOnFinancialYear?: boolean;
    active?: boolean;
  } | null;
  delayReasons: string[];
  delayReasonItems?: { _id: string; name: string; order?: number; active?: boolean }[];
  categories: { _id: string; name: string; complaintType: "External" | "Internal"; parent: string | null; order?: number; active?: boolean }[];
  priorities: { _id: string; name: string; color: string; tatMultiplier: number; order?: number; active?: boolean }[];
  rootCauseCategories: { _id: string; name: string; order?: number; active?: boolean }[];
};

type TatForm = {
  ackHours: number;
  containmentDays: number;
  rcaDays: number;
  capaDays: number;
  d3ContainmentDays: number;
  d5CorrectiveActionDays: number;
  d6VerificationDays: number;
  d7ShortTermDays: number;
  d7LongTermDays: number;
  repeatWindowDays: number;
  dueSoonHours: number;
};

const DEFAULT_TAT: TatForm = {
  ackHours: 24,
  containmentDays: 2,
  rcaDays: 7,
  capaDays: 14,
  d3ContainmentDays: 2,
  d5CorrectiveActionDays: 14,
  d6VerificationDays: 7,
  d7ShortTermDays: 60,
  d7LongTermDays: 90,
  repeatWindowDays: 60,
  dueSoonHours: 24
};

const TABS: { key: MasterTab; label: string; icon: typeof Building2 }[] = [
  { key: "companies", label: "Companies", icon: Building2 },
  { key: "departments", label: "Departments", icon: Users },
  { key: "employees", label: "Employees", icon: UserCheck },
  { key: "users", label: "System Users", icon: KeyRound },
  { key: "roles", label: "Roles & RBAC", icon: ShieldCheck },
  { key: "categories", label: "Categories", icon: Tags },
  { key: "priorities", label: "Priorities", icon: SlidersHorizontal },
  { key: "tat", label: "TAT", icon: Clock3 },
  { key: "delay", label: "Delay Reasons", icon: ListChecks },
  { key: "rootCause", label: "Root Cause", icon: Route },
  { key: "escalation", label: "Escalation", icon: ShieldCheck },
  { key: "numbering", label: "Numbering", icon: FileKey2 }
];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}

export function MasterDataPage() {
  const toast = useToast();
  const permissions = usePermissions();
  const master = useMasterBootstrap();
  const usersQuery = useSystemUsers(permissions.isMasterAdmin);
  const [activeTab, setActiveTab] = useState<MasterTab>("companies");
  const [selectedCompany, setSelectedCompany] = useState("");
  const configurationQuery = useConfiguration(selectedCompany || undefined);
  const configuration = configurationQuery.data as EditableConfiguration | undefined;

  const [companyModal, setCompanyModal] = useState(false);
  const [departmentModal, setDepartmentModal] = useState(false);
  const [employeeModal, setEmployeeModal] = useState(false);
  const [userModal, setUserModal] = useState(false);

  const [companyForm, setCompanyForm] = useState({ name: "", code: "", complaintNumberingPrefix: "" });
  const [departmentForm, setDepartmentForm] = useState({ name: "", code: "", company: "" });
  const [employeeForm, setEmployeeForm] = useState({
    employeeCode: "",
    name: "",
    email: "",
    designation: "",
    department: "",
    company: "",
    managerName: "",
    managerEmail: "",
    hodName: "",
    hodEmail: ""
  });
  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    username: "",
    password: "",
    role: "",
    companyIds: [] as string[],
    department: "",
    forcePasswordChange: true
  });
  const [categoryForm, setCategoryForm] = useState({ name: "", complaintType: "External" as "External" | "Internal", order: 0 });
  const [priorityForm, setPriorityForm] = useState({ name: "", color: "#64748B", tatMultiplier: 1, order: 0 });
  const [delayReasonName, setDelayReasonName] = useState("");
  const [rootCauseName, setRootCauseName] = useState("");
  const [tatForm, setTatForm] = useState<TatForm>(DEFAULT_TAT);
  const [reminderPercentages, setReminderPercentages] = useState("50,75,90");
  const [escalationLevels, setEscalationLevels] = useState([
    { level: 1, name: "Owner", triggerHoursOverdue: 0 },
    { level: 2, name: "Department Head", triggerHoursOverdue: 24 },
    { level: 3, name: "Quality Head", triggerHoursOverdue: 72 },
    { level: 4, name: "Management", triggerHoursOverdue: 168 }
  ]);
  const [numberingForm, setNumberingForm] = useState({ prefix: "CMP", sequencePadding: 5, capaSequencePadding: 2, resetOnFinancialYear: true });
  const [saving, setSaving] = useState(false);

  const companies = master.data?.companies ?? [];
  const departments = master.data?.departments ?? [];
  const roles = master.data?.roles ?? [];
  const employees = master.data?.employees ?? [];
  const permissionsList = master.data?.permissions ?? [];
  const systemUsers = usersQuery.data?.users ?? [];

  useEffect(() => {
    if (!selectedCompany && companies.length) setSelectedCompany(companies[0]._id);
  }, [companies, selectedCompany]);

  useEffect(() => {
    if (!configuration) return;
    const tat = configuration.tat || {};
    setTatForm({
      ackHours: Number(tat.ackHours ?? DEFAULT_TAT.ackHours),
      containmentDays: Number(tat.containmentDays ?? DEFAULT_TAT.containmentDays),
      rcaDays: Number(tat.rcaDays ?? DEFAULT_TAT.rcaDays),
      capaDays: Number(tat.capaDays ?? DEFAULT_TAT.capaDays),
      d3ContainmentDays: Number(tat.d3ContainmentDays ?? DEFAULT_TAT.d3ContainmentDays),
      d5CorrectiveActionDays: Number(tat.d5CorrectiveActionDays ?? DEFAULT_TAT.d5CorrectiveActionDays),
      d6VerificationDays: Number(tat.d6VerificationDays ?? DEFAULT_TAT.d6VerificationDays),
      d7ShortTermDays: Number(tat.d7ShortTermDays ?? DEFAULT_TAT.d7ShortTermDays),
      d7LongTermDays: Number(tat.d7LongTermDays ?? DEFAULT_TAT.d7LongTermDays),
      repeatWindowDays: Number(tat.repeatWindowDays ?? DEFAULT_TAT.repeatWindowDays),
      dueSoonHours: Number(tat.dueSoonHours ?? DEFAULT_TAT.dueSoonHours)
    });
    if (configuration.escalation?.levels?.length) setEscalationLevels(configuration.escalation.levels);
    if (configuration.escalation?.reminderPercentages?.length) setReminderPercentages(configuration.escalation.reminderPercentages.join(","));
    if (configuration.numbering) {
      setNumberingForm({
        prefix: configuration.numbering.prefix || "CMP",
        sequencePadding: Number(configuration.numbering.sequencePadding ?? 5),
        capaSequencePadding: Number(configuration.numbering.capaSequencePadding ?? 2),
        resetOnFinancialYear: configuration.numbering.resetOnFinancialYear !== false
      });
    } else {
      const company = companies.find((item) => item._id === selectedCompany);
      setNumberingForm({ prefix: company?.complaintNumberingPrefix || "CMP", sequencePadding: 5, capaSequencePadding: 2, resetOnFinancialYear: true });
    }
  }, [configuration, companies, selectedCompany]);

  const permissionGroups = useMemo(() => {
    const groups = new Map<string, typeof permissionsList>();
    permissionsList.forEach((item) => groups.set(item.group, [...(groups.get(item.group) || []), item]));
    return [...groups.entries()];
  }, [permissionsList]);

  async function run<T>(work: () => Promise<T>, success: string, after?: () => void) {
    setSaving(true);
    try {
      await work();
      toast.success(success);
      after?.();
    } catch (error) {
      toast.error(errorMessage(error, "The requested change could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  async function refreshMaster() {
    await Promise.all([master.refetch(), usersQuery.refetch()]);
  }

  async function handleCompanySubmit() {
    if (!companyForm.name || !companyForm.code || companyForm.complaintNumberingPrefix.length < 2) {
      toast.error("Company name, code and a numbering prefix are required.");
      return;
    }
    await run(
      () => api("/api/master/companies", { method: "POST", body: JSON.stringify({ ...companyForm, active: true }) }),
      "Company created",
      () => {
        setCompanyModal(false);
        setCompanyForm({ name: "", code: "", complaintNumberingPrefix: "" });
        void refreshMaster();
      }
    );
  }

  async function handleDepartmentSubmit() {
    if (!departmentForm.name) return toast.error("Department name is required.");
    const body = { name: departmentForm.name, code: departmentForm.code, active: true, ...(departmentForm.company ? { company: departmentForm.company } : {}) };
    await run(() => api("/api/master/departments", { method: "POST", body: JSON.stringify(body) }), "Department created", () => {
      setDepartmentModal(false);
      setDepartmentForm({ name: "", code: "", company: "" });
      void refreshMaster();
    });
  }

  async function handleEmployeeSubmit() {
    if (!employeeForm.employeeCode || !employeeForm.name || !employeeForm.department || !employeeForm.company) {
      return toast.error("Employee code, name, company and department are required.");
    }
    await run(() => api("/api/master/employees", { method: "POST", body: JSON.stringify({ ...employeeForm, active: true }) }), "Employee created", () => {
      setEmployeeModal(false);
      setEmployeeForm({ employeeCode: "", name: "", email: "", designation: "", department: "", company: "", managerName: "", managerEmail: "", hodName: "", hodEmail: "" });
      void refreshMaster();
    });
  }

  async function handleUserSubmit() {
    if (!userForm.name || !userForm.username || !userForm.password || !userForm.role) return toast.error("Name, username, temporary password and role are required.");
    if (userForm.password.length < 8) return toast.error("Temporary password must contain at least 8 characters.");
    const body = {
      ...userForm,
      companyIds: userForm.companyIds,
      active: true,
      forcePasswordChange: true,
      ...(userForm.department ? { department: userForm.department } : {})
    };
    await run(() => api("/api/master/users", { method: "POST", body: JSON.stringify(body) }), "User account created", () => {
      setUserModal(false);
      setUserForm({ name: "", email: "", username: "", password: "", role: "", companyIds: [], department: "", forcePasswordChange: true });
      void refreshMaster();
    });
  }

  async function handleResetAccess(userId: string, userName: string) {
    await run(
      () => api<{ reset: boolean; emailed: boolean }>(`/api/master/users/${userId}/reset-access`, { method: "POST" }),
      `Secure reset initiated for ${userName}`,
      () => void usersQuery.refetch()
    );
  }

  async function toggleMasterRecord(kind: "companies" | "departments" | "employees", id: string, active: boolean) {
    await run(() => api(`/api/master/${kind}/${id}`, { method: "PATCH", body: JSON.stringify({ active }) }), active ? "Record activated" : "Record deactivated", () => void refreshMaster());
  }

  async function toggleUser(userId: string, active: boolean) {
    await run(() => api(`/api/master/users/${userId}`, { method: "PATCH", body: JSON.stringify({ active }) }), active ? "User activated" : "User deactivated", () => void usersQuery.refetch());
  }

  async function toggleRolePermission(roleId: string, current: string[], permission: string) {
    const next = current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission];
    if (!next.length) return toast.error("A role must retain at least one permission.");
    await run(() => api(`/api/master/roles/${roleId}`, { method: "PATCH", body: JSON.stringify({ permissions: next }) }), "Role permissions updated", () => void master.refetch());
  }

  async function saveTat() {
    await run(() => api("/api/configuration/tat", { method: "PUT", body: JSON.stringify({ company: selectedCompany || null, ...tatForm }) }), "TAT configuration saved", () => void configurationQuery.refetch());
  }

  async function saveEscalation() {
    const percentages = reminderPercentages.split(",").map((item) => Number(item.trim())).filter((item) => Number.isInteger(item) && item > 0 && item <= 100);
    if (!percentages.length) return toast.error("Enter at least one valid reminder percentage from 1 to 100.");
    await run(() => api("/api/configuration/escalation", { method: "PUT", body: JSON.stringify({ company: selectedCompany || null, levels: escalationLevels, reminderPercentages: percentages, active: true }) }), "Escalation configuration saved", () => void configurationQuery.refetch());
  }

  async function saveNumbering() {
    if (!selectedCompany) return toast.error("Select a company first.");
    await run(() => api("/api/configuration/numbering", { method: "PUT", body: JSON.stringify({ company: selectedCompany, ...numberingForm, active: true }) }), "Numbering configuration saved", () => void configurationQuery.refetch());
  }

  async function addCategory() {
    if (!categoryForm.name.trim()) return toast.error("Category name is required.");
    await run(() => api("/api/configuration/categories", { method: "POST", body: JSON.stringify({ ...categoryForm, parent: null, active: true }) }), "Category added", () => {
      setCategoryForm({ name: "", complaintType: "External", order: 0 });
      void configurationQuery.refetch();
    });
  }

  async function addPriority() {
    if (!priorityForm.name.trim()) return toast.error("Priority name is required.");
    await run(() => api("/api/configuration/priorities", { method: "POST", body: JSON.stringify({ ...priorityForm, active: true }) }), "Priority added", () => {
      setPriorityForm({ name: "", color: "#64748B", tatMultiplier: 1, order: 0 });
      void configurationQuery.refetch();
    });
  }

  async function addSimpleList(list: "delay-reasons" | "root-cause-categories", name: string, clear: () => void) {
    if (!name.trim()) return toast.error("A name is required.");
    await run(() => api(`/api/configuration/lists/${list}`, { method: "POST", body: JSON.stringify({ name: name.trim(), order: 0, active: true }) }), "Configuration item added", () => {
      clear();
      void configurationQuery.refetch();
    });
  }

  async function deactivateConfig(path: string) {
    await run(() => api(path, { method: "PATCH", body: JSON.stringify({ active: false }) }), "Item deactivated", () => void configurationQuery.refetch());
  }

  if (!permissions.isMasterAdmin) {
    return (
      <main className="space-y-6 pb-12">
        <PageHeader title="Master Data & Governance" description="Administration access is restricted to Master Admin." />
        <div className="px-4 sm:px-6"><div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">You do not have permission to modify master data.</div></div>
      </main>
    );
  }

  return (
    <main className="space-y-6 pb-12">
      <PageHeader title="Master Data & Governance" description="Database-backed administration for organization, users, workflow masters, SLA targets, escalation and numbering." />
      <div className="space-y-6 px-4 sm:px-6">
        <div className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.key} type="button" className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${activeTab === tab.key ? "bg-brand-red text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`} onClick={() => setActiveTab(tab.key)}>
                <Icon className="h-4 w-4" /><span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {(master.isLoading || (selectedCompany && configurationQuery.isLoading)) && <Spinner label="Loading governance data..." />}

        {activeTab === "companies" && (
          <SectionCard title="Operating Companies" description="Company scope, document ownership and complaint-number prefix." actions={<Button type="button" onClick={() => setCompanyModal(true)}><Plus className="h-4 w-4" />Add Company</Button>}>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {companies.map((co) => <div key={co._id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-slate-500">{co.code}</p><h3 className="mt-1 font-bold text-slate-900">{co.name}</h3><p className="mt-2 text-xs text-slate-500">Complaint prefix: {co.complaintNumberingPrefix || "Not configured"}</p></div><StatusBadge tone={co.active ? "green" : "neutral"}>{co.active ? "Active" : "Inactive"}</StatusBadge></div><Button type="button" variant="ghost" className="mt-3 h-8 text-xs" onClick={() => toggleMasterRecord("companies", co._id, !co.active)}>{co.active ? <CircleOff className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}{co.active ? "Deactivate" : "Activate"}</Button></div>)}
            </div>
          </SectionCard>
        )}

        {activeTab === "departments" && (
          <SectionCard title="Departments" description="Organizational ownership used by complaints, CAPAs and escalation." actions={<Button type="button" onClick={() => setDepartmentModal(true)}><Plus className="h-4 w-4" />Add Department</Button>}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{departments.map((dept) => <div key={dept._id} className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex justify-between gap-2"><p className="font-semibold text-slate-900">{dept.name}</p><StatusBadge tone={dept.active ? "green" : "neutral"}>{dept.active ? "Active" : "Inactive"}</StatusBadge></div><Button type="button" variant="ghost" className="mt-2 h-7 text-xs" onClick={() => toggleMasterRecord("departments", dept._id, !dept.active)}>{dept.active ? "Deactivate" : "Activate"}</Button></div>)}</div>
          </SectionCard>
        )}

        {activeTab === "employees" && (
          <SectionCard title="Employee Directory" description="Source directory for 8D teams, ownership, sign-off snapshots, Manager and HOD routing." actions={<Button type="button" onClick={() => setEmployeeModal(true)}><Plus className="h-4 w-4" />Add Employee</Button>}>
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="border-b border-slate-200 text-slate-500"><th className="p-3">Employee</th><th>Code</th><th>Designation</th><th>Email</th><th>Department</th><th className="text-right">Action</th></tr></thead><tbody>{employees.map((employee) => <tr key={employee._id} className="border-b border-slate-100"><td className="p-3 font-semibold text-slate-900">{employee.name}</td><td className="font-mono">{employee.employeeCode}</td><td>{employee.designation || "—"}</td><td>{employee.email || "—"}</td><td>{departments.find((d) => d._id === employee.department)?.name || "—"}</td><td className="text-right"><Button type="button" variant="ghost" className="h-7 text-xs" onClick={() => toggleMasterRecord("employees", employee._id, false)}>Deactivate</Button></td></tr>)}</tbody></table></div>
          </SectionCard>
        )}

        {activeTab === "users" && (
          <SectionCard title="System Users" description="Authenticated portal accounts. Existing passwords are never displayed." actions={<Button type="button" onClick={() => setUserModal(true)}><UserPlus className="h-4 w-4" />New User</Button>}>
            {usersQuery.isLoading ? <Spinner label="Loading users..." /> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="border-b border-slate-200 text-slate-500"><th className="p-3">User</th><th>Username</th><th>Role</th><th>Status</th><th>Password</th><th className="text-right">Actions</th></tr></thead><tbody>{systemUsers.map((user) => <tr key={user.id} className="border-b border-slate-100"><td className="p-3"><p className="font-semibold text-slate-900">{user.name}</p><p className="text-slate-500">{user.email || "No email"}</p></td><td className="font-mono">{user.username}</td><td>{user.role?.name || "—"}</td><td><StatusBadge tone={user.active ? "green" : "neutral"}>{user.active ? "Active" : "Inactive"}</StatusBadge></td><td>{user.forcePasswordChange ? <span className="font-semibold text-amber-700">Change required</span> : <span className="text-slate-500">Protected</span>}</td><td className="text-right"><div className="flex justify-end gap-1"><Button type="button" variant="ghost" className="h-7 text-xs" onClick={() => handleResetAccess(user.id, user.name)}><RefreshCw className="h-3 w-3" />Reset access</Button><Button type="button" variant="ghost" className="h-7 text-xs" onClick={() => toggleUser(user.id, !user.active)}>{user.active ? "Deactivate" : "Activate"}</Button></div></td></tr>)}</tbody></table></div>}
          </SectionCard>
        )}

        {activeTab === "roles" && (
          <SectionCard title="Roles & Permissions" description="Server-enforced permission matrix. Changes are written to MongoDB and audited.">
            <div className="space-y-5">{roles.map((role) => <div key={role._id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold text-slate-900">{role.name}</h3><p className="text-xs text-slate-500">{role.permissions.length} permissions</p></div><StatusBadge tone={role.active ? "green" : "neutral"}>{role.active ? "Active" : "Inactive"}</StatusBadge></div>{role.permissions.includes("*") ? <p className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-brand-red">Full system permission is assigned to this role.</p> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{permissionGroups.map(([group, items]) => <div key={group}><p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">{group}</p><div className="space-y-2">{items.map((permission) => <label key={permission.key} className="flex cursor-pointer items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={role.permissions.includes(permission.key)} onChange={() => void toggleRolePermission(role._id, role.permissions, permission.key)} className="mt-0.5"/><span>{permission.label || permission.key}<span className="block font-mono text-[10px] text-slate-400">{permission.key}</span></span></label>)}</div></div>)}</div>}</div>)}</div>
          </SectionCard>
        )}

        {activeTab === "categories" && (
          <SectionCard title="Complaint Categories" description="Database-driven External and Internal complaint categories."><div className="mb-5 grid gap-3 sm:grid-cols-[1fr_180px_100px_auto]"><Input placeholder="Category name" value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}/><Select value={categoryForm.complaintType} onChange={(e) => setCategoryForm({ ...categoryForm, complaintType: e.target.value as "External" | "Internal" })}><option>External</option><option>Internal</option></Select><Input type="number" value={categoryForm.order} onChange={(e) => setCategoryForm({ ...categoryForm, order: Number(e.target.value) })}/><Button type="button" onClick={addCategory}><Plus className="h-4 w-4" />Add</Button></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{configuration?.categories.map((item) => <div key={item._id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3"><div><p className="text-sm font-semibold">{item.name}</p><p className="text-xs text-slate-500">{item.complaintType}</p></div><Button type="button" variant="ghost" className="h-7 text-xs" onClick={() => deactivateConfig(`/api/configuration/categories/${item._id}`)}>Deactivate</Button></div>)}</div></SectionCard>
        )}

        {activeTab === "priorities" && (
          <SectionCard title="Priorities" description="Priority labels, visual indicator and TAT multiplier."><div className="mb-5 grid gap-3 sm:grid-cols-[1fr_120px_130px_90px_auto]"><Input placeholder="Priority name" value={priorityForm.name} onChange={(e) => setPriorityForm({ ...priorityForm, name: e.target.value })}/><Input type="color" value={priorityForm.color} onChange={(e) => setPriorityForm({ ...priorityForm, color: e.target.value })}/><Input type="number" step="0.05" value={priorityForm.tatMultiplier} onChange={(e) => setPriorityForm({ ...priorityForm, tatMultiplier: Number(e.target.value) })}/><Input type="number" value={priorityForm.order} onChange={(e) => setPriorityForm({ ...priorityForm, order: Number(e.target.value) })}/><Button type="button" onClick={addPriority}><Plus className="h-4 w-4" />Add</Button></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{configuration?.priorities.map((item) => <div key={item._id} className="rounded-lg border border-slate-200 p-3"><div className="flex items-center justify-between"><span className="font-semibold">{item.name}</span><span className="h-4 w-4 rounded-full border" style={{ backgroundColor: item.color }}/></div><p className="mt-1 text-xs text-slate-500">TAT multiplier: {item.tatMultiplier}x</p><Button type="button" variant="ghost" className="mt-2 h-7 text-xs" onClick={() => deactivateConfig(`/api/configuration/priorities/${item._id}`)}>Deactivate</Button></div>)}</div></SectionCard>
        )}

        {activeTab === "tat" && (
          <SectionCard title="TAT & Workflow Targets" description="All workflow and effectiveness windows are persisted in TATConfiguration."><CompanySelector companies={companies} selected={selectedCompany} onChange={setSelectedCompany}/><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{([
            ["Acknowledgement (hours)", "ackHours"], ["Containment (days)", "containmentDays"], ["RCA (days)", "rcaDays"], ["CAPA Assignment (days)", "capaDays"], ["D3 Containment (days)", "d3ContainmentDays"], ["D5 Corrective Action (days)", "d5CorrectiveActionDays"], ["D6 Verification (days)", "d6VerificationDays"], ["D7 Short Term (days)", "d7ShortTermDays"], ["D7 Long Term (days)", "d7LongTermDays"], ["Repeat Window (days)", "repeatWindowDays"], ["Due Soon (hours)", "dueSoonHours"]
          ] as [string, keyof TatForm][]).map(([label, key]) => <Field key={key} label={label}><Input type="number" min={1} value={tatForm[key]} onChange={(e) => setTatForm({ ...tatForm, [key]: Number(e.target.value) })}/></Field>)}</div><Button type="button" className="mt-5" onClick={saveTat} disabled={saving}><CheckCircle2 className="h-4 w-4" />Save TAT Configuration</Button></SectionCard>
        )}

        {activeTab === "delay" && (
          <SectionCard title="Delay Reasons" description="Controlled reasons required when overdue stages are completed."><div className="mb-4 flex max-w-xl gap-2"><Input placeholder="New delay reason" value={delayReasonName} onChange={(e) => setDelayReasonName(e.target.value)}/><Button type="button" onClick={() => addSimpleList("delay-reasons", delayReasonName, () => setDelayReasonName(""))}><Plus className="h-4 w-4" />Add</Button></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{configuration?.delayReasonItems?.map((item) => <div key={item._id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm"><span>{item.name}</span><Button type="button" variant="ghost" className="h-7 text-xs" onClick={() => deactivateConfig(`/api/configuration/lists/delay-reasons/${item._id}`)}>Deactivate</Button></div>)}</div></SectionCard>
        )}

        {activeTab === "rootCause" && (
          <SectionCard title="Root Cause Categories" description="Standard 6M+2 and additional governance classifications used in RCA analytics."><div className="mb-4 flex max-w-xl gap-2"><Input placeholder="New root cause category" value={rootCauseName} onChange={(e) => setRootCauseName(e.target.value)}/><Button type="button" onClick={() => addSimpleList("root-cause-categories", rootCauseName, () => setRootCauseName(""))}><Plus className="h-4 w-4" />Add</Button></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{configuration?.rootCauseCategories.map((item) => <div key={item._id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm"><span>{item.name}</span><Button type="button" variant="ghost" className="h-7 text-xs" onClick={() => deactivateConfig(`/api/configuration/lists/root-cause-categories/${item._id}`)}>Deactivate</Button></div>)}</div></SectionCard>
        )}

        {activeTab === "escalation" && (
          <SectionCard title="Reminder & Escalation" description="Single source of truth for pre-due reminders and overdue escalation recipients."><CompanySelector companies={companies} selected={selectedCompany} onChange={setSelectedCompany}/><div className="mt-5 max-w-md"><Field label="Reminder percentages (comma separated)"><Input value={reminderPercentages} onChange={(e) => setReminderPercentages(e.target.value)} placeholder="50,75,90"/></Field></div><div className="mt-4 space-y-3">{escalationLevels.map((level, index) => <div key={level.level} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[90px_1fr_180px]"><Field label="Level"><Input type="number" value={level.level} onChange={(e) => setEscalationLevels((rows) => rows.map((row, i) => i === index ? { ...row, level: Number(e.target.value) } : row))}/></Field><Field label="Recipient / Role"><Input value={level.name} onChange={(e) => setEscalationLevels((rows) => rows.map((row, i) => i === index ? { ...row, name: e.target.value } : row))}/></Field><Field label="Hours overdue"><Input type="number" min={0} value={level.triggerHoursOverdue} onChange={(e) => setEscalationLevels((rows) => rows.map((row, i) => i === index ? { ...row, triggerHoursOverdue: Number(e.target.value) } : row))}/></Field></div>)}</div><Button type="button" className="mt-5" onClick={saveEscalation} disabled={saving}><CheckCircle2 className="h-4 w-4" />Save Escalation</Button></SectionCard>
        )}

        {activeTab === "numbering" && (
          <SectionCard title="Complaint & CAPA Numbering" description="Company-specific prefix and concurrency-safe sequence formatting."><CompanySelector companies={companies} selected={selectedCompany} onChange={setSelectedCompany}/><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="Complaint Prefix"><Input value={numberingForm.prefix} onChange={(e) => setNumberingForm({ ...numberingForm, prefix: e.target.value.toUpperCase() })}/></Field><Field label="Complaint Padding"><Input type="number" min={3} max={10} value={numberingForm.sequencePadding} onChange={(e) => setNumberingForm({ ...numberingForm, sequencePadding: Number(e.target.value) })}/></Field><Field label="CAPA Padding"><Input type="number" min={2} max={6} value={numberingForm.capaSequencePadding} onChange={(e) => setNumberingForm({ ...numberingForm, capaSequencePadding: Number(e.target.value) })}/></Field><label className="flex items-center gap-2 pt-7 text-sm font-semibold text-slate-700"><input type="checkbox" checked={numberingForm.resetOnFinancialYear} onChange={(e) => setNumberingForm({ ...numberingForm, resetOnFinancialYear: e.target.checked })}/>Reset each financial year</label></div><Button type="button" className="mt-5" onClick={saveNumbering} disabled={saving}><CheckCircle2 className="h-4 w-4" />Save Numbering</Button></SectionCard>
        )}
      </div>

      <Modal open={companyModal} onOpenChange={setCompanyModal} title="Add Operating Company"><div className="space-y-4"><Field label="Company Legal Name" required><Input value={companyForm.name} onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}/></Field><Field label="Company Code" required><Input value={companyForm.code} onChange={(e) => setCompanyForm({ ...companyForm, code: e.target.value.toUpperCase() })}/></Field><Field label="Complaint Number Prefix" required><Input value={companyForm.complaintNumberingPrefix} onChange={(e) => setCompanyForm({ ...companyForm, complaintNumberingPrefix: e.target.value.toUpperCase() })}/></Field><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setCompanyModal(false)}>Cancel</Button><Button type="button" onClick={handleCompanySubmit} disabled={saving}>Create Company</Button></div></div></Modal>

      <Modal open={departmentModal} onOpenChange={setDepartmentModal} title="Add Department"><div className="space-y-4"><Field label="Department Name" required><Input value={departmentForm.name} onChange={(e) => setDepartmentForm({ ...departmentForm, name: e.target.value })}/></Field><Field label="Department Code"><Input value={departmentForm.code} onChange={(e) => setDepartmentForm({ ...departmentForm, code: e.target.value.toUpperCase() })}/></Field><Field label="Company"><Select value={departmentForm.company} onChange={(e) => setDepartmentForm({ ...departmentForm, company: e.target.value })}><option value="">Shared / All</option>{companies.filter((c) => c.active).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</Select></Field><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setDepartmentModal(false)}>Cancel</Button><Button type="button" onClick={handleDepartmentSubmit} disabled={saving}>Create Department</Button></div></div></Modal>

      <Modal open={employeeModal} onOpenChange={setEmployeeModal} title="Add Employee"><div className="grid gap-4 sm:grid-cols-2"><Field label="Employee Code" required><Input value={employeeForm.employeeCode} onChange={(e) => setEmployeeForm({ ...employeeForm, employeeCode: e.target.value })}/></Field><Field label="Full Name" required><Input value={employeeForm.name} onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })}/></Field><Field label="Email"><Input type="email" value={employeeForm.email} onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}/></Field><Field label="Designation"><Input value={employeeForm.designation} onChange={(e) => setEmployeeForm({ ...employeeForm, designation: e.target.value })}/></Field><Field label="Company" required><Select value={employeeForm.company} onChange={(e) => setEmployeeForm({ ...employeeForm, company: e.target.value })}><option value="">Select company</option>{companies.filter((c) => c.active).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</Select></Field><Field label="Department" required><Select value={employeeForm.department} onChange={(e) => setEmployeeForm({ ...employeeForm, department: e.target.value })}><option value="">Select department</option>{departments.filter((d) => d.active).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</Select></Field><Field label="Manager Name"><Input value={employeeForm.managerName} onChange={(e) => setEmployeeForm({ ...employeeForm, managerName: e.target.value })}/></Field><Field label="Manager Email"><Input type="email" value={employeeForm.managerEmail} onChange={(e) => setEmployeeForm({ ...employeeForm, managerEmail: e.target.value })}/></Field><Field label="HOD Name"><Input value={employeeForm.hodName} onChange={(e) => setEmployeeForm({ ...employeeForm, hodName: e.target.value })}/></Field><Field label="HOD Email"><Input type="email" value={employeeForm.hodEmail} onChange={(e) => setEmployeeForm({ ...employeeForm, hodEmail: e.target.value })}/></Field></div><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEmployeeModal(false)}>Cancel</Button><Button type="button" onClick={handleEmployeeSubmit} disabled={saving}>Create Employee</Button></div></Modal>

      <Modal open={userModal} onOpenChange={setUserModal} title="Create System User"><div className="space-y-4"><Field label="Full Name" required><Input value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}/></Field><Field label="Email"><Input type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}/></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Username" required><Input value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value.toLowerCase() })}/></Field><Field label="Temporary Password" required><Input type="password" autoComplete="new-password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}/></Field></div><p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">The temporary password is never retrievable after account creation. The user will be forced to change it before accessing the portal.</p><Field label="Role" required><Select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}><option value="">Select role</option>{roles.filter((r) => r.active).map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}</Select></Field><Field label="Department"><Select value={userForm.department} onChange={(e) => setUserForm({ ...userForm, department: e.target.value })}><option value="">No department</option>{departments.filter((d) => d.active).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</Select></Field><Field label="Company Access"><div className="grid gap-2 sm:grid-cols-2">{companies.filter((c) => c.active).map((c) => <label key={c._id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-xs"><input type="checkbox" checked={userForm.companyIds.includes(c._id)} onChange={(e) => setUserForm((current) => ({ ...current, companyIds: e.target.checked ? [...current.companyIds, c._id] : current.companyIds.filter((id) => id !== c._id) }))}/>{c.name}</label>)}</div></Field><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setUserModal(false)}>Cancel</Button><Button type="button" onClick={handleUserSubmit} disabled={saving}>Create User</Button></div></div></Modal>
    </main>
  );
}

function CompanySelector({ companies, selected, onChange }: { companies: { _id: string; name: string; active: boolean }[]; selected: string; onChange: (value: string) => void }) {
  return <div className="max-w-md"><Field label="Company"><Select value={selected} onChange={(e) => onChange(e.target.value)}><option value="">Global defaults</option>{companies.filter((c) => c.active).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</Select></Field></div>;
}

export default MasterDataPage;
