import { z } from "zod";
import { PERMISSIONS, ROLE_NAMES } from "../constants/permissions";
import { passwordSchema } from "./auth";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
const optionalObjectId = objectId.optional();

export const permissionKeySchema = z.union([z.enum(PERMISSIONS), z.literal("*")]);

export const roleCreateSchema = z.object({
  name: z.enum(ROLE_NAMES),
  permissions: z.array(permissionKeySchema).min(1),
  active: z.boolean().default(true)
});

export const companyCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  code: z.string().trim().min(2).max(24).toUpperCase(),
  logo: z
    .object({
      secureUrl: z.string().url(),
      publicId: z.string().min(1)
    })
    .optional(),
  documentNumber: z.string().trim().max(80).optional().default(""),
  revision: z.string().trim().max(24).optional().default(""),
  effectiveDate: z.coerce.date().optional(),
  complaintNumberingPrefix: z.string().trim().min(2).max(40),
  active: z.boolean().default(true)
});

export const departmentCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().max(24).optional().default(""),
  company: optionalObjectId,
  active: z.boolean().default(true)
});

export const employeeCreateSchema = z.object({
  employeeCode: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().optional().or(z.literal("")),
  designation: z.string().trim().max(120).optional().default(""),
  department: objectId,
  company: objectId,
  managerName: z.string().trim().max(160).optional().default(""),
  managerEmail: z.string().trim().email().optional().or(z.literal("")),
  hodName: z.string().trim().max(160).optional().default(""),
  hodEmail: z.string().trim().email().optional().or(z.literal("")),
  linkedUser: optionalObjectId,
  active: z.boolean().default(true)
});

export const userCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  username: z.string().trim().min(3).max(80).toLowerCase(),
  email: z.string().trim().email().optional().or(z.literal("")),
  password: passwordSchema,
  role: objectId,
  companyIds: z.array(objectId).default([]),
  department: optionalObjectId,
  employee: optionalObjectId,
  active: z.boolean().default(true),
  forcePasswordChange: z.boolean().default(true)
});

/** Administrative profile edits never accept a password. Use the reset-access workflow instead. */
export const userUpdateSchema = userCreateSchema.partial().omit({ password: true });

export type CompanyInput = z.infer<typeof companyCreateSchema>;
export type DepartmentInput = z.infer<typeof departmentCreateSchema>;
export type EmployeeInput = z.infer<typeof employeeCreateSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
