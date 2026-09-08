import { Router } from "express";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from "@shared/constants/permissions";
import {
  companyCreateSchema,
  departmentCreateSchema,
  employeeCreateSchema,
  userCreateSchema,
  userUpdateSchema
} from "@shared/schemas/master-data";
import { connectDB } from "../config/db";
import { requirePermission, requireUser } from "../middleware/auth";
import { Company } from "../models/Company";
import { Department } from "../models/Department";
import { Employee } from "../models/Employee";
import { Permission } from "../models/Permission";
import { Role } from "../models/Role";
import { User } from "../models/User";
import { hashPassword, sanitizeUser } from "../services/auth.service";
import { writeAudit } from "../services/audit.service";
import { sendTemplatedEmail } from "../services/email.service";
import { asyncHandler } from "../utils/async-handler";
import { httpError, ok } from "../utils/http";

export const masterRouter = Router();
masterRouter.use(requireUser);

masterRouter.get(
  "/bootstrap",
  requirePermission("view.company"),
  asyncHandler(async (_req, res) => {
    await connectDB();
    const [companies, departments, roles, permissions, employees] = await Promise.all([
      Company.find().sort({ name: 1 }).lean(),
      Department.find().sort({ name: 1 }).lean(),
      Role.find().sort({ name: 1 }).lean(),
      Permission.find().sort({ key: 1 }).lean(),
      Employee.find().sort({ name: 1 }).limit(500).lean()
    ]);
    return ok(res, { companies, departments, roles, permissions, employees });
  })
);

masterRouter.post(
  "/seed-permissions",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    await connectDB();
    await Permission.bulkWrite(
      PERMISSIONS.map((key) => ({
        updateOne: {
          filter: { key },
          update: { $setOnInsert: { key, label: key, group: key.split(".")[0], active: true } },
          upsert: true
        }
      }))
    );
    await Role.bulkWrite(
      Object.entries(DEFAULT_ROLE_PERMISSIONS).map(([name, permissions]) => ({
        updateOne: { filter: { name }, update: { $setOnInsert: { name, permissions, active: true } }, upsert: true }
      }))
    );
    await writeAudit({ actor: req.user, action: "UPSERT_DEFAULTS", entity: "Permission" });
    return ok(res, { seeded: true });
  })
);

masterRouter.get(
  "/users",
  requirePermission("view.all"),
  asyncHandler(async (_req, res) => {
    await connectDB();
    const users = await User.find().populate("role").sort({ createdAt: -1 }).lean();
    return ok(res, { users: users.map((user) => sanitizeUser(user)) });
  })
);

masterRouter.post(
  "/users",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = userCreateSchema.parse(req.body);
    await connectDB();
    const passwordHash = await hashPassword(input.password);
    const user = await User.create({ ...input, password: undefined, passwordHash, passwordChangedAt: new Date() });
    await writeAudit({ actor: req.user, action: "CREATE", entity: "User", entityId: String(user._id), after: { username: user.username } });

    if (user.email) {
      await sendTemplatedEmail({
        triggerEvent: "USER_CREATED",
        recipients: [user.email],
        data: { recipientName: user.name, username: user.username },
        sentBySystem: true
      });
    }

    const populated = await user.populate("role");
    return ok(res, { user: sanitizeUser(populated) }, 201);
  })
);

masterRouter.patch(
  "/users/:id",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = userUpdateSchema.omit({ password: true }).parse(req.body);
    await connectDB();
    const before = await User.findById(req.params.id).lean();
    if (!before) throw httpError(404, "User not found");
    const user = await User.findByIdAndUpdate(req.params.id, input, { new: true }).populate("role");
    if (!user) throw httpError(404, "User not found");
    await writeAudit({
      actor: req.user,
      action: "UPDATE",
      entity: "User",
      entityId: req.params.id,
      before: { name: before.name, username: before.username, email: before.email, active: before.active, role: before.role },
      after: { name: user.name, username: user.username, email: user.email, active: user.active, role: user.role }
    });
    return ok(res, { user: sanitizeUser(user) });
  })
);

masterRouter.post(
  "/companies",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = companyCreateSchema.parse(req.body);
    await connectDB();
    const company = await Company.create(input);
    await writeAudit({ actor: req.user, action: "CREATE", entity: "Company", entityId: String(company._id), after: input });
    return ok(res, { company }, 201);
  })
);

masterRouter.post(
  "/departments",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = departmentCreateSchema.parse(req.body);
    await connectDB();
    const department = await Department.create(input);
    await writeAudit({ actor: req.user, action: "CREATE", entity: "Department", entityId: String(department._id), after: input });
    return ok(res, { department }, 201);
  })
);

masterRouter.post(
  "/employees",
  requirePermission("*"),
  asyncHandler(async (req, res) => {
    const input = employeeCreateSchema.parse(req.body);
    await connectDB();
    const employee = await Employee.create(input);
    await writeAudit({ actor: req.user, action: "CREATE", entity: "Employee", entityId: String(employee._id), after: input });
    return ok(res, { employee }, 201);
  })
);
