import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const lean = (value: unknown) => ({ lean: async () => value, select: () => ({ lean: async () => value }) });

let complaint: Row | null = null;
let users: Record<string, Row> = {};
let employees: Record<string, Row> = {};

vi.mock("../config/db", () => ({ connectDB: async () => undefined }));
vi.mock("../models/Complaint", () => ({ Complaint: { findById: () => lean(complaint) } }));
vi.mock("../models/Capa", () => ({ Capa: { findById: () => lean(null) } }));
vi.mock("../models/User", () => ({ User: { findOne: (filter: { _id: string }) => lean(users[filter._id] ?? null), find: () => lean([]) } }));
vi.mock("../models/Employee", () => ({
  Employee: { findOne: (filter: { _id: string }) => lean(employees[filter._id] ?? null), find: () => lean([]) }
}));
vi.mock("../models/Role", () => ({ Role: { find: () => lean([]), findOne: () => lean(null) } }));
vi.mock("../models/Department", () => ({ Department: { findById: () => lean(null), find: () => lean([]) } }));

const { Types } = await import("mongoose");
const { resolveRecipients } = await import("./email-recipient.service");

const complaintId = new Types.ObjectId();
const resolve = (roles: string[]) => resolveRecipients({ complaintId, targetRoles: roles });

beforeEach(() => {
  users = { creator: { email: "creator@onepws.com" } };
  employees = { emp1: { email: "Employee.Owner@onepws.com" } };
  complaint = { _id: complaintId, owner: "creator", company: "c1" };
});

describe("Complaint Owner recipients", () => {
  it("is the portal user who owns the complaint", async () => {
    expect(await resolve(["Complaint Owner"])).toEqual(["creator@onepws.com"]);
  });

  it("also reaches the directory employee the complaint is shown against", async () => {
    complaint = { ...complaint, ownerEmployee: "emp1" };
    expect(await resolve(["Complaint Owner"])).toEqual(["creator@onepws.com", "employee.owner@onepws.com"]);
  });

  it("does not duplicate an address when both owners share it", async () => {
    users.creator = { email: "same@onepws.com" };
    employees.emp1 = { email: "SAME@onepws.com" };
    complaint = { ...complaint, ownerEmployee: "emp1" };
    expect(await resolve(["Complaint Owner"])).toEqual(["same@onepws.com"]);
  });

  it("ignores an employee owner who has no email, and an inactive portal user", async () => {
    employees.emp1 = {};
    users.creator = { email: "creator@onepws.com" };
    complaint = { ...complaint, ownerEmployee: "emp1", owner: "gone" };
    expect(await resolve(["Complaint Owner"])).toEqual([]);
  });

  it("is not added unless the role was asked for", async () => {
    complaint = { ...complaint, ownerEmployee: "emp1" };
    expect(await resolve(["Quality Head"])).toEqual([]);
  });
});
