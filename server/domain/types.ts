import type {
  CapaEffectiveness,
  CapaStatus,
  CapaType,
  ComplaintStatus,
  ComplaintType,
  D6DocumentStatus,
  D6DocumentType,
  D7LongTermResult,
  EvidenceReviewStatus,
  FishboneCategory,
  SignatureRole,
  TatConfigValues
} from "@shared/constants/domain";
import type { PermissionKey } from "@shared/constants/permissions";

/** Minimal actor shape the pure domain rules need. Mirrors the sanitized API user. */
export type DomainActor = {
  id: string;
  name: string;
  email?: string;
  roleName?: string;
  permissions: (PermissionKey | string)[];
  companyIds: string[];
  department?: string;
};

export type ActionRow = {
  action?: string;
  resp?: string;
  target?: string;
  status?: string;
  targetAuto?: boolean;
  remarks?: string;
};

export type D6DocumentRow = {
  docType: D6DocumentType;
  status: D6DocumentStatus;
  attachment?: string | null;
  revision?: string;
  revDate?: string;
  approver?: string;
  naJustification?: string;
};

export type SignatureRecord = {
  userId: string;
  name: string;
  designation: string;
  department: string;
  email: string;
  at: string;
  notes: string;
};

export type DelayRecord = {
  category: string;
  explanation: string;
  recovery?: string;
  recordedAt: string;
};

export type DomainComplaint = {
  id: string;
  number: string;
  companyId: string;
  type: ComplaintType;
  status: ComplaintStatus;
  receivedAt: string;
  priorityMultiplier: number;
  ownerId?: string;
  responsibleDept?: string;
  customer?: string;
  product?: string;
  category?: string;

  acknowledgedAt?: string | null;
  containmentAt?: string | null;
  rcaAt?: string | null;
  capaAssignedAt?: string | null;
  closedAt?: string | null;

  ackDelayReason?: DelayRecord | null;
  contDelayReason?: DelayRecord | null;
  rcaDelayReason?: DelayRecord | null;
  capaDelayReason?: DelayRecord | null;

  d0?: string;
  d1Team?: { name?: string; dept?: string; designation?: string; role?: string }[];
  d2?: { what?: string; where?: string; when?: string; who?: string; involved?: string; howMany?: string; how?: string };
  d3Actions?: ActionRow[];
  d4QcTools?: string[];
  d4Occurrence?: string;
  d4Escape?: string;
  d4Systemic?: string;
  rootCauseCategory?: string;
  fiveWhy?: { occurrence?: string[]; escape?: string[]; systemic?: string[]; singleChain?: string[] };
  fishbone?: Partial<Record<FishboneCategory, string[]>>;
  d5Occurrence?: ActionRow[];
  d5Escape?: ActionRow[];
  d5Systemic?: ActionRow[];
  d6Verify?: ActionRow[];
  d6DocsList?: D6DocumentRow[];
  d7ShortTermDate?: string;
  d7RepeatObserved?: boolean;
  d7LongTermDate?: string;
  d7LongTermRepeatObserved?: boolean;
  d7LongTermResult?: D7LongTermResult | "";
  d7NoRepeatConfirmed?: boolean;

  signatures?: Partial<Record<SignatureRole, SignatureRecord | null>>;
};

export type DomainCapa = {
  id: string;
  number: string;
  complaintId: string;
  companyId: string;
  type: CapaType;
  action: string;
  ownerId?: string;
  department?: string;
  dueDate?: string;
  completedAt?: string | null;
  status: CapaStatus;
  evidence?: string;
  effectiveness?: CapaEffectiveness | null;
  evidenceReview?: { status: EvidenceReviewStatus; remarks?: string } | null;
};

export type TatConfig = TatConfigValues;
