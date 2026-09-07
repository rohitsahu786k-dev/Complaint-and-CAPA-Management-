import type { PermissionKey, RoleName } from "../constants/permissions";

export type ApiRole = { id: string; name: RoleName; permissions: PermissionKey[] };

export type ApiUser = {
  id: string;
  name: string;
  username: string;
  email?: string;
  role?: ApiRole;
  companyIds: string[];
  department?: string;
  employee?: string;
  active: boolean;
  forcePasswordChange: boolean;
};

export type ApiEnvelope<T> = {
  data: T;
};

export type ApiError = {
  message: string;
  issues?: unknown;
};
