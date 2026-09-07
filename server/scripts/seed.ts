import {
  DEFAULT_DELAY_REASONS,
  DEFAULT_DEPARTMENTS,
  DEFAULT_ESCALATION_LEVELS,
  DEFAULT_EXTERNAL_CATEGORIES,
  DEFAULT_INTERNAL_CATEGORIES,
  DEFAULT_PRIORITIES,
  DEFAULT_REMINDER_PERCENTAGES,
  DEFAULT_TAT_CONFIG,
  ROOT_CAUSE_CATEGORIES
} from "@shared/constants/domain";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from "@shared/constants/permissions";
import { connectDB } from "../config/db";
import { EscalationConfiguration, TATConfiguration } from "../models/configuration";
import { Category, DelayReason, Priority, RootCauseCategory } from "../models/masters";
import { Department } from "../models/Department";
import { Permission } from "../models/Permission";
import { Role } from "../models/Role";
import { User } from "../models/User";
import { hashPassword } from "../services/auth.service";

/**
 * Idempotent bootstrap for a fresh database. Credentials are read from the
 * environment only; nothing is ever hardcoded or printed.
 */
async function seed() {
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

  await Department.bulkWrite(
    DEFAULT_DEPARTMENTS.map((name) => ({
      updateOne: { filter: { name }, update: { $setOnInsert: { name, active: true } }, upsert: true }
    }))
  );

  await Priority.bulkWrite(
    DEFAULT_PRIORITIES.map((priority) => ({
      updateOne: { filter: { name: priority.name }, update: { $setOnInsert: { ...priority, active: true } }, upsert: true }
    }))
  );

  await DelayReason.bulkWrite(
    DEFAULT_DELAY_REASONS.map((name, index) => ({
      updateOne: { filter: { name }, update: { $setOnInsert: { name, order: index, active: true } }, upsert: true }
    }))
  );

  await RootCauseCategory.bulkWrite(
    ROOT_CAUSE_CATEGORIES.map((name, index) => ({
      updateOne: { filter: { name }, update: { $setOnInsert: { name, order: index, active: true } }, upsert: true }
    }))
  );

  await Category.bulkWrite([
    ...DEFAULT_EXTERNAL_CATEGORIES.map((name, index) => ({
      updateOne: {
        filter: { name, complaintType: "External" as const, parent: null },
        update: { $setOnInsert: { name, complaintType: "External" as const, parent: null, order: index, active: true } },
        upsert: true
      }
    })),
    ...DEFAULT_INTERNAL_CATEGORIES.map((name, index) => ({
      updateOne: {
        filter: { name, complaintType: "Internal" as const, parent: null },
        update: { $setOnInsert: { name, complaintType: "Internal" as const, parent: null, order: index, active: true } },
        upsert: true
      }
    }))
  ]);

  await TATConfiguration.findOneAndUpdate({ company: null }, { $setOnInsert: { company: null, ...DEFAULT_TAT_CONFIG } }, { upsert: true });
  await EscalationConfiguration.findOneAndUpdate(
    { company: null },
    {
      $setOnInsert: {
        company: null,
        levels: DEFAULT_ESCALATION_LEVELS.map((entry) => ({ ...entry })),
        reminderPercentages: [...DEFAULT_REMINDER_PERCENTAGES],
        active: true
      }
    },
    { upsert: true }
  );

  const username = process.env.SEED_ADMIN_USERNAME;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const email = process.env.SEED_ADMIN_EMAIL;
  const name = process.env.SEED_ADMIN_NAME || "Master Admin";

  if (!username || !password) {
    process.stdout.write("Master data seeded. Set SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD to also create the first admin.\n");
    return;
  }
  if (password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters");
  }

  const adminRole = await Role.findOne({ name: "Master Admin" });
  if (!adminRole) throw new Error("Master Admin role was not created");

  const existing = await User.findOne({ username: username.toLowerCase() });
  if (existing) {
    process.stdout.write("Master data seeded. The admin account already exists and was left untouched.\n");
    return;
  }

  await User.create({
    name,
    username: username.toLowerCase(),
    email,
    passwordHash: await hashPassword(password),
    role: adminRole._id,
    companyIds: [],
    active: true,
    forcePasswordChange: true,
    passwordChangedAt: new Date()
  });

  process.stdout.write("Master data seeded and the first Master Admin was created. Change the password after the first sign in.\n");
}

seed()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    process.stderr.write(`Seed failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exit(1);
  });
