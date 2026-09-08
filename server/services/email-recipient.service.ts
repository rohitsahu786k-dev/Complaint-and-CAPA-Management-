import { Types } from "mongoose";
import { connectDB } from "../config/db";
import { User } from "../models/User";
import { Role } from "../models/Role";
import { Employee } from "../models/Employee";
import { Complaint } from "../models/Complaint";
import { Capa } from "../models/Capa";

export type RecipientResolutionOptions = {
  complaintId?: string | Types.ObjectId;
  capaId?: string | Types.ObjectId;
  companyId?: string | Types.ObjectId;
  departmentId?: string | Types.ObjectId;
  ownerId?: string | Types.ObjectId;
  coordinatorId?: string | Types.ObjectId;
  targetRoles?: string[];
  explicitEmails?: string[];
  excludeEmails?: string[];
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  return EMAIL_REGEX.test(trimmed) ? trimmed : null;
}

async function addUserEmail(recipientSet: Set<string>, userId: string | Types.ObjectId | undefined | null) {
  if (!userId) return;
  const user = await User.findOne({ _id: userId, active: true }).select("email").lean();
  const email = normalizeEmail(user?.email);
  if (email) recipientSet.add(email);
}

export async function resolveRecipients(options: RecipientResolutionOptions): Promise<string[]> {
  await connectDB();
  const recipientSet = new Set<string>();
  for (const raw of options.explicitEmails ?? []) {
    const email = normalizeEmail(raw);
    if (email) recipientSet.add(email);
  }

  const complaintDoc = options.complaintId && Types.ObjectId.isValid(String(options.complaintId))
    ? await Complaint.findById(options.complaintId).lean()
    : null;
  const capaDoc = options.capaId && Types.ObjectId.isValid(String(options.capaId)) ? await Capa.findById(options.capaId).lean() : null;

  const effectiveCompanyId = options.companyId || complaintDoc?.company || capaDoc?.company;
  const effectiveDepartmentId = options.departmentId || complaintDoc?.responsibleDept || capaDoc?.department;
  const effectiveOwnerId = options.ownerId || complaintDoc?.owner;
  const effectiveCoordinatorId = options.coordinatorId || (complaintDoc as { coordinator?: Types.ObjectId } | null)?.coordinator;
  const roles = [...new Set(options.targetRoles ?? [])];

  if (roles.includes("Complaint Owner")) await addUserEmail(recipientSet, effectiveOwnerId);
  if (roles.includes("CAPA Owner")) await addUserEmail(recipientSet, capaDoc?.owner);
  if (roles.includes("Coordinator") && effectiveCoordinatorId) await addUserEmail(recipientSet, effectiveCoordinatorId);

  if ((roles.includes("Department Head") || roles.includes("Manager")) && effectiveDepartmentId) {
    const employeeQuery: Record<string, unknown> = { department: effectiveDepartmentId, active: true };
    if (effectiveCompanyId) employeeQuery.company = effectiveCompanyId;
    const employees = await Employee.find(employeeQuery).select("hodEmail managerEmail").lean();
    for (const employee of employees) {
      if (roles.includes("Department Head")) {
        const hod = normalizeEmail(employee.hodEmail);
        if (hod) recipientSet.add(hod);
      }
      const manager = normalizeEmail(employee.managerEmail);
      if (manager && (roles.includes("Manager") || roles.includes("Department Head"))) recipientSet.add(manager);
    }
  }

  const roleAliases = roles
    .filter((role) => !["Complaint Owner", "CAPA Owner", "Manager"].includes(role))
    .map((role) => (role === "Coordinator" ? "Complaint Coordinator" : role));

  if (roleAliases.length > 0) {
    const roleDocs = await Role.find({ name: { $in: roleAliases }, active: true }).select("_id name").lean();
    if (roleDocs.length > 0) {
      const userQuery: Record<string, unknown> = { role: { $in: roleDocs.map((role) => role._id) }, active: true };
      if (effectiveCompanyId) userQuery.$or = [{ companyIds: effectiveCompanyId }, { companyIds: { $size: 0 } }];
      if (effectiveDepartmentId && roles.includes("Department Head")) {
        userQuery.$and = [{ $or: [{ department: effectiveDepartmentId }, { department: { $exists: false } }] }];
      }
      const users = await User.find(userQuery).select("email").lean();
      for (const user of users) {
        const email = normalizeEmail(user.email);
        if (email) recipientSet.add(email);
      }
    }
  }

  for (const raw of options.excludeEmails ?? []) {
    const email = normalizeEmail(raw);
    if (email) recipientSet.delete(email);
  }

  return [...recipientSet];
}
