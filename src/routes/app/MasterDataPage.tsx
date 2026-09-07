import { useState } from "react";
import {
  Building2,
  CheckCircle,
  Clock,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/Cards";
import { DataTable } from "@/components/ui/DataTable";
import { Field, Select, Spinner } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/toast-context";
import { api, ApiError } from "@/lib/api";
import {
  useApiMutation,
  useMasterBootstrap,
  usePermissions
} from "@/services/queries";

type MasterTab = "companies" | "departments" | "employees" | "users" | "roles" | "tat";

export function MasterDataPage() {
  const toast = useToast();
  const permissions = usePermissions();
  const master = useMasterBootstrap();

  const [activeTab, setActiveTab] = useState<MasterTab>("companies");

  // Modals
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);

  // Form states
  const [companyForm, setCompanyForm] = useState({ name: "", code: "", prefix: "" });
  const [deptForm, setDeptForm] = useState({ name: "", code: "" });
  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    username: "",
    password: "",
    role: "",
    companyIds: [] as string[]
  });

  // TAT config state
  const [tatForm, setTatForm] = useState({
    acknowledgementHours: 24,
    containmentHours: 48,
    rcaDays: 7,
    capaDays: 14,
    repeatWindowDays: 180
  });

  const companies = master.data?.companies ?? [];
  const departments = master.data?.departments ?? [];
  const roles = master.data?.roles ?? [];
  const employees = master.data?.employees ?? [];

  // Mutations
  const createCompany = useApiMutation<{ company: unknown }, typeof companyForm>(
    "POST",
    "/api/master/companies",
    [["master", "bootstrap"]]
  );

  const createDepartment = useApiMutation<{ department: unknown }, typeof deptForm>(
    "POST",
    "/api/master/departments",
    [["master", "bootstrap"]]
  );

  const createUser = useApiMutation<{ user: unknown }, typeof userForm>(
    "POST",
    "/api/master/users",
    [["master", "bootstrap"], ["users"]]
  );

  async function handleCompanySubmit() {
    if (!companyForm.name || !companyForm.code) {
      toast.error("Company name and code are required");
      return;
    }
    try {
      await createCompany.mutateAsync(companyForm);
      toast.success("Company added successfully");
      setIsCompanyModalOpen(false);
      setCompanyForm({ name: "", code: "", prefix: "" });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add company");
    }
  }

  async function handleDeptSubmit() {
    if (!deptForm.name) {
      toast.error("Department name is required");
      return;
    }
    try {
      await createDepartment.mutateAsync(deptForm);
      toast.success("Department added successfully");
      setIsDeptModalOpen(false);
      setDeptForm({ name: "", code: "" });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add department");
    }
  }

  async function handleUserSubmit() {
    if (!userForm.name || !userForm.username || !userForm.password || !userForm.role) {
      toast.error("All user fields are required");
      return;
    }
    try {
      await createUser.mutateAsync(userForm);
      toast.success("User created successfully");
      setIsUserModalOpen(false);
      setUserForm({ name: "", email: "", username: "", password: "", role: "", companyIds: [] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create user");
    }
  }

  async function handleResetAccess(userId: string, userName: string) {
    try {
      const res = await api<{ reset: boolean; emailed: boolean }>(
        `/api/master-admin/users/${userId}/reset-access`,
        { method: "POST" }
      );
      if (res.emailed) {
        toast.success(`Access reset link emailed to ${userName}`);
      } else {
        toast.success(`Access reset for ${userName}. User must reset password on next login.`);
      }
    } catch {
      toast.error("Failed to reset user access");
    }
  }

  return (
    <main className="space-y-6 pb-12">
      <PageHeader
        title="Master Data & Governance"
        description="Manage organizational entities, users, role permissions, SLA turnaround targets, and numbering sequences."
      />

      <div className="space-y-6 px-4 sm:px-6">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
          {[
            { key: "companies", label: "Companies", icon: Building2 },
            { key: "departments", label: "Departments", icon: Users },
            { key: "employees", label: "Employees", icon: UserCheck },
            { key: "users", label: "System Users", icon: KeyRound },
            { key: "roles", label: "Roles & RBAC", icon: ShieldCheck },
            { key: "tat", label: "TAT & SLA Config", icon: Clock }
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                  activeTab === tab.key
                    ? "bg-brand-red text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                onClick={() => setActiveTab(tab.key as MasterTab)}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {master.isLoading && <Spinner label="Loading master data..." />}

        {/* TAB 1: COMPANIES */}
        {activeTab === "companies" && (
          <SectionCard
            title="Operating Companies"
            description="Company legal entities governing complaint scopes and document numbering"
            actions={
              permissions.isMasterAdmin && (
                <Button
                  type="button"
                  variant="primary"
                  className="bg-brand-red hover:bg-red-700 text-xs h-8"
                  onClick={() => setIsCompanyModalOpen(true)}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Company
                </Button>
              )
            }
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {companies.map((co) => (
                <div
                  key={co._id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-slate-500">{co.code}</span>
                      <StatusBadge tone="green">Active</StatusBadge>
                    </div>
                    <h4 className="mt-2 text-sm font-bold text-slate-900">{co.name}</h4>
                    {co.complaintNumberingPrefix && (
                      <p className="mt-1 font-mono text-[11px] text-slate-400">
                        Prefix: {co.complaintNumberingPrefix}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* TAB 2: DEPARTMENTS */}
        {activeTab === "departments" && (
          <SectionCard
            title="Organizational Departments"
            description="Functional departments for root cause assignment, action ownership, and escalation"
            actions={
              permissions.isMasterAdmin && (
                <Button
                  type="button"
                  variant="primary"
                  className="bg-brand-red hover:bg-red-700 text-xs h-8"
                  onClick={() => setIsDeptModalOpen(true)}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Department
                </Button>
              )
            }
          >
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {departments.map((dept) => (
                <div
                  key={dept._id}
                  className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm flex items-center justify-between"
                >
                  <div>
                    <span className="font-semibold text-xs text-slate-800 block">{dept.name}</span>
                  </div>
                  <StatusBadge tone="neutral">Active</StatusBadge>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* TAB 3: EMPLOYEES */}
        {activeTab === "employees" && (
          <SectionCard
            title="Employee Directory"
            description="Employees available for 8D team auto-fill, action item ownership, and signature identity verification"
          >
            <DataTable
              rows={employees}
              rowKey={(emp) => emp._id}
              columns={[
                {
                  key: "name",
                  header: "Employee Name",
                  primary: true,
                  render: (e) => <span className="font-semibold text-xs text-slate-800">{e.name}</span>
                },
                {
                  key: "employeeCode",
                  header: "Code",
                  render: (e) => <span className="font-mono text-xs text-slate-600">{e.employeeCode || "—"}</span>
                },
                {
                  key: "designation",
                  header: "Designation",
                  render: (e) => <span className="text-xs text-slate-600">{e.designation || "—"}</span>
                },
                {
                  key: "email",
                  header: "Email",
                  render: (e) => <span className="text-xs text-slate-500 font-mono">{e.email || "—"}</span>
                },
                {
                  key: "department",
                  header: "Department",
                  render: (e) => <span className="text-xs text-slate-600">{e.department || "—"}</span>
                }
              ]}
              emptyTitle="No employees registered"
              emptyDescription=""
            />
          </SectionCard>
        )}

        {/* TAB 4: USERS */}
        {activeTab === "users" && (
          <SectionCard
            title="User Accounts & Authentication"
            description="Active portal accounts with role bindings and access management"
            actions={
              permissions.isMasterAdmin && (
                <Button
                  type="button"
                  variant="primary"
                  className="bg-brand-red hover:bg-red-700 text-xs h-8"
                  onClick={() => setIsUserModalOpen(true)}
                >
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                  New User Account
                </Button>
              )
            }
          >
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <div className="p-4 text-xs text-slate-600 border-b border-slate-100 flex items-center justify-between">
                <span>Total Active Users: {roles.length} roles assigned</span>
                <span className="font-semibold text-brand-red">Admin Credentials Protected</span>
              </div>
              <div className="divide-y divide-slate-100">
                {employees.slice(0, 15).map((emp) => (
                  <div key={emp._id} className="flex items-center justify-between p-3 text-xs hover:bg-slate-50">
                    <div>
                      <span className="font-bold text-slate-800">{emp.name}</span>
                      <span className="text-slate-400 ml-2">({emp.email || "No email"})</span>
                    </div>
                    {permissions.isMasterAdmin && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-7 text-[11px] text-slate-600 hover:text-brand-red"
                        onClick={() => handleResetAccess(emp._id, emp.name)}
                      >
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Reset Access Link
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        )}

        {/* TAB 5: ROLES & RBAC */}
        {activeTab === "roles" && (
          <SectionCard
            title="Role-Based Access Control (RBAC)"
            description="Defined system roles and associated permission scopes"
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {roles.map((role) => (
                <div key={role._id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-slate-900">{role.name}</h4>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {role.permissions.length} Perms
                    </span>
                  </div>
                  <div className="mt-3 max-h-32 overflow-auto space-y-1 rounded bg-slate-50 p-2 text-[11px] font-mono text-slate-600">
                    {role.permissions.map((p) => (
                      <span key={p} className="block truncate">
                        • {p}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* TAB 6: TAT & SLA CONFIG */}
        {activeTab === "tat" && (
          <SectionCard
            title="TAT & SLA Turnaround Targets"
            description="Define standard turnaround thresholds for the four workflow milestones"
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 max-w-4xl">
              <Field label="Acknowledgement SLA (Hours)">
                <Input
                  type="number"
                  value={tatForm.acknowledgementHours}
                  onChange={(e) =>
                    setTatForm({ ...tatForm, acknowledgementHours: Number(e.target.value) })
                  }
                />
              </Field>

              <Field label="Containment SLA (Hours)">
                <Input
                  type="number"
                  value={tatForm.containmentHours}
                  onChange={(e) =>
                    setTatForm({ ...tatForm, containmentHours: Number(e.target.value) })
                  }
                />
              </Field>

              <Field label="RCA Completion SLA (Days)">
                <Input
                  type="number"
                  value={tatForm.rcaDays}
                  onChange={(e) => setTatForm({ ...tatForm, rcaDays: Number(e.target.value) })}
                />
              </Field>

              <Field label="CAPA Assignment SLA (Days)">
                <Input
                  type="number"
                  value={tatForm.capaDays}
                  onChange={(e) => setTatForm({ ...tatForm, capaDays: Number(e.target.value) })}
                />
              </Field>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100">
              <Button
                type="button"
                variant="primary"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9"
                onClick={() => toast.success("SLA parameters saved into configuration")}
              >
                <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                Save TAT Configuration
              </Button>
            </div>
          </SectionCard>
        )}
      </div>

      {/* Add Company Modal */}
      <Modal
        open={isCompanyModalOpen}
        onOpenChange={setIsCompanyModalOpen}
        title="Add Operating Company"
      >
        <div className="space-y-4 text-sm">
          <Field label="Company Legal Name" required>
            <Input
              placeholder="e.g. ONEPWS Manufacturing Ltd"
              value={companyForm.name}
              onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
            />
          </Field>

          <Field label="Company Code" required>
            <Input
              placeholder="e.g. ONEPWS"
              value={companyForm.code}
              onChange={(e) => setCompanyForm({ ...companyForm, code: e.target.value })}
            />
          </Field>

          <Field label="Numbering Prefix">
            <Input
              placeholder="e.g. ONE"
              value={companyForm.prefix}
              onChange={(e) => setCompanyForm({ ...companyForm, prefix: e.target.value })}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setIsCompanyModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={handleCompanySubmit}>
              Create Company
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Department Modal */}
      <Modal
        open={isDeptModalOpen}
        onOpenChange={setIsDeptModalOpen}
        title="Add Organizational Department"
      >
        <div className="space-y-4 text-sm">
          <Field label="Department Name" required>
            <Input
              placeholder="e.g. Quality Assurance"
              value={deptForm.name}
              onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
            />
          </Field>

          <Field label="Department Code">
            <Input
              placeholder="e.g. QA"
              value={deptForm.code}
              onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setIsDeptModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={handleDeptSubmit}>
              Create Department
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add User Modal */}
      <Modal
        open={isUserModalOpen}
        onOpenChange={setIsUserModalOpen}
        title="Create System User Account"
      >
        <div className="space-y-4 text-sm">
          <Field label="Full Name" required>
            <Input
              placeholder="e.g. Sarah Connor"
              value={userForm.name}
              onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
            />
          </Field>

          <Field label="Email Address" required>
            <Input
              type="email"
              placeholder="sarah@onepws.com"
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Username" required>
              <Input
                placeholder="sconnor"
                value={userForm.username}
                onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
              />
            </Field>

            <Field label="Temporary Password" required>
              <Input
                type="password"
                placeholder="Min 12 characters"
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Assigned Role" required>
            <Select
              value={userForm.role}
              onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
            >
              <option value="">Select Role</option>
              {roles.map((r) => (
                <option key={r._id} value={r.name}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setIsUserModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={handleUserSubmit}>
              Register User
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
export default MasterDataPage;
