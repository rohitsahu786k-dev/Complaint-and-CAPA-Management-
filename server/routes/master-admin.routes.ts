import { Router } from "express";
import { z } from "zod";
import { listQuerySchema, paginate } from "@shared/schemas/common";
import { companyCreateSchema, departmentCreateSchema, employeeCreateSchema, permissionKeySchema } from "@shared/schemas/master-data";
import { connectDB } from "../config/db";
import { requirePermission, requireUser } from "../middleware/auth";
import { getAppUrl } from "../lib/app-url";
import { AuditLog } from "../models/AuditLog";
import { Capa } from "../models/Capa";
import { Company } from "../models/Company";
import { Complaint } from "../models/Complaint";
import { Department } from "../models/Department";
import { Employee } from "../models/Employee";
import { Role } from "../models/Role";
import { User } from "../models/User";
import { hashPassword } from "../services/auth.service";
import { writeAudit } from "../services/audit.service";
import { assertDeletable } from "../services/master-delete.service";
import { sendTemplatedEmail } from "../services/email.service";
import { asyncHandler } from "../utils/async-handler";
import { randomToken, sha256 } from "../utils/crypto";
import { httpError, ok } from "../utils/http";

/** Administration endpoints that back the master data screens. */
export const masterAdminRouter = Router();

masterAdminRouter.use(requireUser);

function escapeRegex(term: string) {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createTemporaryPassword() {
  return `OnePWS${randomToken(4)}A1`;
}

masterAdminRouter.get(
  "/employees",
  requirePermission("view.company"),
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.extend({ company: z.string().optional(), active: z.coerce.boolean().optional() }).parse(req.query);
    await connectDB();
    const filter: Record<string, unknown> = {};
    if (query.company) filter.company = query.company;
    if (typeof query.active === "boolean") filter.active = query.active;
    if (query.search) {
      const regex = new RegExp(escapeRegex(query.search), "i");
      filter.$or = [{ name: regex }, { employeeCode: regex }, { email: regex }, { designation: regex }];
    }
    const [rows, total] = await Promise.all([
      Employee.find(filter)
        .populate("company", "name code")
        .populate("department", "name")
        .sort({ name: 1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean(),
      Employee.countDocuments(filter)
    ]);
    return ok(res, paginate(rows, total, query));
  })
);

masterAdminRouter.patch(
  "/employees/:id",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = employeeCreateSchema.partial().parse(req.body);
    await connectDB();
    const before = await Employee.findById(req.params.id).lean();
    if (!before) throw httpError(404, "Employee not found");
    const employee = await Employee.findByIdAndUpdate(req.params.id, input, { new: true });
    await writeAudit({ actor: req.user, action: "MASTER_DATA_CHANGE", entity: "Employee", entityId: req.params.id, before, after: input });
    return ok(res, { employee });
  })
);

masterAdminRouter.post(
  "/employees/bulk",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = z.object({ employees: z.array(employeeCreateSchema).max(1000) }).parse(req.body);
    await connectDB();
    let created = 0;
    let updated = 0;
    for (const employee of input.employees) {
      const existing = await Employee.findOne({ employeeCode: employee.employeeCode });
      if (existing) {
        await Employee.updateOne({ _id: existing._id }, employee);
        updated += 1;
      } else {
        await Employee.create(employee);
        created += 1;
      }
    }
    await writeAudit({ actor: req.user, action: "IMPORT", entity: "Employee", metadata: { created, updated } });
    return ok(res, { created, updated }, 201);
  })
);

masterAdminRouter.get(
  "/companies",
  requirePermission("view.company"),
  asyncHandler(async (_req, res) => {
    await connectDB();
    return ok(res, { companies: await Company.find().sort({ name: 1 }).lean() });
  })
);

masterAdminRouter.patch(
  "/companies/:id",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = companyCreateSchema.partial().parse(req.body);
    await connectDB();
    const before = await Company.findById(req.params.id).lean();
    if (!before) throw httpError(404, "Company not found");
    const company = await Company.findByIdAndUpdate(req.params.id, input, { new: true });
    await writeAudit({ actor: req.user, action: "MASTER_DATA_CHANGE", entity: "Company", entityId: req.params.id, before, after: input });
    return ok(res, { company });
  })
);

masterAdminRouter.patch(
  "/departments/:id",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = departmentCreateSchema.partial().parse(req.body);
    await connectDB();
    const before = await Department.findById(req.params.id).lean();
    if (!before) throw httpError(404, "Department not found");
    const department = await Department.findByIdAndUpdate(req.params.id, input, { new: true });
    await writeAudit({ actor: req.user, action: "MASTER_DATA_CHANGE", entity: "Department", entityId: req.params.id, before, after: input });
    return ok(res, { department });
  })
);

masterAdminRouter.patch(
  "/roles/:id",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = z.object({ permissions: z.array(permissionKeySchema).min(1), active: z.boolean().optional() }).parse(req.body);
    await connectDB();
    const before = await Role.findById(req.params.id).lean();
    if (!before) throw httpError(404, "Role not found");
    const role = await Role.findByIdAndUpdate(req.params.id, input, { new: true });
    await writeAudit({ actor: req.user, action: "MASTER_DATA_CHANGE", entity: "Role", entityId: req.params.id, before, after: input });
    return ok(res, { role });
  })
);

/**
 * Resets a user's access without the administrator ever seeing or choosing their existing password.
 * A hashed, one-hour reset token is issued and delivered through the central templated email service.
 */
masterAdminRouter.post(
  "/users/:id/reset-access",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    await connectDB();
    const user = await User.findById(req.params.id).select("+passwordHash +passwordResetTokenHash +passwordResetExpires +failedLoginCount +lockedUntil");
    if (!user) throw httpError(404, "User not found");

    const token = randomToken();
    const temporaryPassword = createTemporaryPassword();
    user.passwordHash = await hashPassword(temporaryPassword);
    user.passwordResetTokenHash = sha256(token);
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    user.forcePasswordChange = true;
    user.failedLoginCount = 0;
    user.lockedUntil = undefined;
    await user.save();

    let emailed = false;
    let emailStatus: "sent" | "failed" | "skipped" = "skipped";
    if (user.email) {
      const resetUrl = new URL(`/reset-password?token=${token}`, getAppUrl()).toString();
      const result = await sendTemplatedEmail({
        triggerEvent: "PASSWORD_RESET_REQUESTED",
        recipients: [user.email],
        data: { recipientName: user.name, username: user.username, tempPassword: temporaryPassword, resetUrl, expiresInHours: "1" },
        sentBySystem: false
      });
      emailStatus = result.status;
      emailed = result.status === "sent";
    }

    await writeAudit({ actor: req.user, action: "UPDATE", entity: "User", entityId: req.params.id, after: { accessReset: true, emailStatus } });
    return ok(res, { reset: true, emailed, emailStatus, hasEmail: Boolean(user.email) });
  })
);
/* ------------------------------------------------------------------ deletion of master records */

masterAdminRouter.delete(
  "/companies/:id",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    await connectDB();
    const company = await Company.findById(req.params.id).lean();
    if (!company) throw httpError(404, "Company not found");
    await assertDeletable("This company", [
      { label: "complaints", count: Complaint.countDocuments({ company: company._id }) },
      { label: "CAPA actions", count: Capa.countDocuments({ company: company._id }) },
      { label: "employees", count: Employee.countDocuments({ company: company._id }) },
      { label: "users", count: User.countDocuments({ companyIds: company._id }) }
    ]);
    await Company.deleteOne({ _id: company._id });
    await writeAudit({ actor: req.user, action: "DELETE", entity: "Company", entityId: req.params.id, before: company });
    return ok(res, { deleted: true });
  })
);

masterAdminRouter.delete(
  "/departments/:id",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    await connectDB();
    const department = await Department.findById(req.params.id).lean();
    if (!department) throw httpError(404, "Department not found");
    await assertDeletable("This department", [
      {
        label: "complaints",
        count: Complaint.countDocuments({
          $or: [{ responsibleDept: department._id }, { internalDept: department._id }, { againstDept: department._id }]
        })
      },
      { label: "CAPA actions", count: Capa.countDocuments({ department: department._id }) },
      { label: "employees", count: Employee.countDocuments({ department: department._id }) },
      { label: "users", count: User.countDocuments({ department: department._id }) }
    ]);
    await Department.deleteOne({ _id: department._id });
    await writeAudit({ actor: req.user, action: "DELETE", entity: "Department", entityId: req.params.id, before: department });
    return ok(res, { deleted: true });
  })
);

masterAdminRouter.delete(
  "/employees/:id",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    await connectDB();
    const employee = await Employee.findById(req.params.id).lean();
    if (!employee) throw httpError(404, "Employee not found");
    await assertDeletable("This employee", [
      { label: "portal users", count: User.countDocuments({ employee: employee._id }) },
      { label: "complaints", count: Complaint.countDocuments({ respEmployee: employee._id }) }
    ]);
    await Employee.deleteOne({ _id: employee._id });
    await writeAudit({ actor: req.user, action: "DELETE", entity: "Employee", entityId: req.params.id, before: employee });
    return ok(res, { deleted: true });
  })
);

/**
 * A user is never deleted once they have touched a record: the audit trail, every
 * workflow entry and every ownership field names them, and a signature that resolves
 * to nothing is worse than a deactivated account.
 */
masterAdminRouter.delete(
  "/users/:id",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    await connectDB();
    const user = await User.findById(req.params.id).lean();
    if (!user) throw httpError(404, "User not found");
    if (String(user._id) === req.user?.id) throw httpError(422, "You cannot delete the account you are signed in with.");
    await assertDeletable("This user", [
      { label: "complaints they own or raised", count: Complaint.countDocuments({ $or: [{ owner: user._id }, { createdBy: user._id }] }) },
      { label: "CAPA actions they own", count: Capa.countDocuments({ owner: user._id }) },
      { label: "audit entries", count: AuditLog.countDocuments({ actor: user._id }) },
      { label: "employee records", count: Employee.countDocuments({ linkedUser: user._id }) }
    ]);
    await User.deleteOne({ _id: user._id });
    await writeAudit({ actor: req.user, action: "DELETE", entity: "User", entityId: req.params.id, before: { username: user.username, name: user.name } });
    return ok(res, { deleted: true });
  })
);
