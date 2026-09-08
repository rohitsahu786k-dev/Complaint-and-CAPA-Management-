import { Router } from "express";
import { z } from "zod";
import { listQuerySchema, paginate } from "@shared/schemas/common";
import { companyCreateSchema, departmentCreateSchema, employeeCreateSchema, permissionKeySchema } from "@shared/schemas/master-data";
import { connectDB } from "../config/db";
import { getEnv } from "../config/env";
import { requirePermission, requireUser } from "../middleware/auth";
import { Company } from "../models/Company";
import { Department } from "../models/Department";
import { Employee } from "../models/Employee";
import { Role } from "../models/Role";
import { User } from "../models/User";
import { writeAudit } from "../services/audit.service";
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
    const user = await User.findById(req.params.id).select("+passwordResetTokenHash +passwordResetExpires +failedLoginCount +lockedUntil");
    if (!user) throw httpError(404, "User not found");

    const token = randomToken();
    user.passwordResetTokenHash = sha256(token);
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    user.forcePasswordChange = true;
    user.failedLoginCount = 0;
    user.lockedUntil = undefined;
    await user.save();

    let emailed = false;
    let emailStatus: "sent" | "failed" | "skipped" = "skipped";
    if (user.email) {
      const baseUrl = getEnv().APP_BASE_URL || `${req.protocol}://${req.get("host") || "localhost:5173"}`;
      const resetUrl = new URL(`/reset-password?token=${token}`, baseUrl).toString();
      const result = await sendTemplatedEmail({
        triggerEvent: "PASSWORD_RESET_REQUESTED",
        recipients: [user.email],
        data: { recipientName: user.name, resetUrl, expiresInHours: "1" },
        sentBySystem: false
      });
      emailStatus = result.status;
      emailed = result.status === "sent";
    }

    await writeAudit({ actor: req.user, action: "UPDATE", entity: "User", entityId: req.params.id, after: { accessReset: true, emailStatus } });
    return ok(res, { reset: true, emailed, emailStatus, hasEmail: Boolean(user.email) });
  })
);
