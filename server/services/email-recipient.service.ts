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
  targetRoles?: string[]; // e.g. ["Complaint Owner", "Coordinator", "Department Head", "Quality Head", "Management", "CAPA Owner"]
  explicitEmails?: string[];
  excludeEmails?: string[];
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  return EMAIL_REGEX.test(trimmed) ? trimmed : null;
}

export async function resolveRecipients(options: RecipientResolutionOptions): Promise<string[]> {
  await connectDB();
  const recipientSet = new Set<string>();

  // 1. Add explicitly provided emails
  if (options.explicitEmails) {
    for (const raw of options.explicitEmails) {
      const email = normalizeEmail(raw);
      if (email) recipientSet.add(email);
    }
  }

  // Hydrate complaint if provided
  let complaintDoc = null;
  if (options.complaintId && Types.ObjectId.isValid(options.complaintId)) {
    complaintDoc = await Complaint.findById(options.complaintId).lean();
  }

  // Hydrate CAPA if provided
  let capaDoc = null;
  if (options.capaId && Types.ObjectId.isValid(options.capaId)) {
    capaDoc = await Capa.findById(options.capaId).lean();
  }

  const effectiveCompanyId =
    options.companyId || complaintDoc?.company || capaDoc?.company;

  const effectiveDepartmentId =
    options.departmentId || complaintDoc?.responsibleDept || capaDoc?.department;

  const effectiveOwnerId =
    options.ownerId || complaintDoc?.owner || capaDoc?.owner;

  const effectiveCoordinatorId =
    options.coordinatorId || (complaintDoc as { coordinator?: Types.ObjectId })?.coordinator;


  const roles = options.targetRoles || [];

  // 2. Resolve Complaint Owner
  if (roles.includes("Complaint Owner") && effectiveOwnerId) {
    const ownerUser = await User.findOne({ _id: effectiveOwnerId, active: true }).lean();
    const email = normalizeEmail(ownerUser?.email);
    if (email) recipientSet.add(email);
  }

  // 3. Resolve Complaint Coordinator
  if (roles.includes("Coordinator") && effectiveCoordinatorId) {
    const coordUser = await User.findOne({ _id: effectiveCoordinatorId, active: true }).lean();
    const email = normalizeEmail(coordUser?.email);
    if (email) recipientSet.add(email);
  }

  // 4. Resolve CAPA Owner
  if (roles.includes("CAPA Owner") && capaDoc?.owner) {
    const capaOwner = await User.findOne({ _id: capaDoc.owner, active: true }).lean();
    const email = normalizeEmail(capaOwner?.email);
    if (email) recipientSet.add(email);
  }

  // 5. Resolve Department Head & Manager via Employee records
  if ((roles.includes("Department Head") || roles.includes("Manager")) && effectiveDepartmentId) {
    const query: Record<string, unknown> = {
      department: effectiveDepartmentId,
      active: true
    };
    if (effectiveCompanyId) {
      query.company = effectiveCompanyId;
    }
    const employees = await Employee.find(query).lean();
    for (const emp of employees) {
      const hod = normalizeEmail(emp.hodEmail);
      if (hod && roles.includes("Department Head")) recipientSet.add(hod);
      const mgr = normalizeEmail(emp.managerEmail);
      if (mgr && (roles.includes("Manager") || roles.includes("Department Head"))) recipientSet.add(mgr);
    }
  }

  // 6. Resolve Quality Head
  if (roles.includes("Quality Head")) {
    const qualityRoles = await Role.find({
      $or: [
        { name: /quality/i },
        { permissions: "complaint.approve" },
        { permissions: "capa.review_evidence" }
      ],
      active: true
    }).select("_id").lean();

    const roleIds = qualityRoles.map((r) => r._id);
    if (roleIds.length > 0) {
      const userQuery: Record<string, unknown> = {
        role: { $in: roleIds },
        active: true
      };
      if (effectiveCompanyId) {
        userQuery.$or = [{ companyIds: effectiveCompanyId }, { companyIds: { $size: 0 } }];
      }
      const qualityUsers = await User.find(userQuery).select("email").lean();
      for (const u of qualityUsers) {
        const email = normalizeEmail(u.email);
        if (email) recipientSet.add(email);
      }
    }
  }

  // 7. Resolve Management
  if (roles.includes("Management")) {
    const mgmtRoles = await Role.find({
      name: { $in: ["Management", "Director", "Managing Director", "Plant Head"] },
      active: true
    }).select("_id").lean();

    const roleIds = mgmtRoles.map((r) => r._id);
    if (roleIds.length > 0) {
      const userQuery: Record<string, unknown> = {
        role: { $in: roleIds },
        active: true
      };
      if (effectiveCompanyId) {
        userQuery.$or = [{ companyIds: effectiveCompanyId }, { companyIds: { $size: 0 } }];
      }
      const mgmtUsers = await User.find(userQuery).select("email").lean();
      for (const u of mgmtUsers) {
        const email = normalizeEmail(u.email);
        if (email) recipientSet.add(email);
      }
    }
  }

  // 8. Resolve Master Admin
  if (roles.includes("Master Admin")) {
    const adminRole = await Role.findOne({ name: "Master Admin" }).select("_id").lean();
    if (adminRole) {
      const admins = await User.find({ role: adminRole._id, active: true }).select("email").lean();
      for (const admin of admins) {
        const email = normalizeEmail(admin.email);
        if (email) recipientSet.add(email);
      }
    }
  }

  // 9. Exclude requested addresses (e.g. actor themselves if self-notification is discouraged)
  if (options.excludeEmails) {
    for (const raw of options.excludeEmails) {
      const email = normalizeEmail(raw);
      if (email) recipientSet.delete(email);
    }
  }

  return Array.from(recipientSet);
}
