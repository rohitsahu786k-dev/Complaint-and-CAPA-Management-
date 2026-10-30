import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const lean = (value: unknown) => ({ lean: async () => value, select: () => ({ lean: async () => value }) });

const CD = "6aa7936cf0bc33d38305b551";
const CD_QUALITY = "6aab81826c6ecf2813436a66";
const CCR = "6aa79372f0bc33d38305b569";
const CCR_QUALITY = "6aab8299adfec553f8981140";
const departments: Row[] = [
  { _id: CD, name: "CD", managementEmails: "cd.board@onepws.com" },
  { _id: CD_QUALITY, name: "CD Quality" },
  { _id: CCR, name: "CCR", managementEmails: "ccr.board@onepws.com" },
  { _id: CCR_QUALITY, name: "CCR Quality" }
];

const managementUsers: Row[] = [
  { _id: "u-ankit", email: "ankit@onepws.com" },
  { _id: "u-mukesh", email: "mukesh@onepws.com" },
  { _id: "u-director", email: "director@onepws.com" }
];
const employees: Row[] = [
  { _id: "e1", email: "ankit@onepws.com", department: CD, managerEmail: "ritik@onepws.com", hodEmail: "puneet@onepws.com" },
  { _id: "e2", email: "mukesh@onepws.com", department: CCR, managerEmail: "sourabh@onepws.com", hodEmail: "mukesh@onepws.com" },
  { _id: "e3", email: "amit@onepws.com", department: CD, managerEmail: "ritik@onepws.com", hodEmail: "ankit@onepws.com" },
  { _id: "e4", email: "krishna@onepws.com", department: CCR, managerEmail: "sourabh@onepws.com", hodEmail: "mukesh@onepws.com" }
];

let complaint: Row = {};

type Filter = { department?: { $in?: string[] } | string };
vi.mock("../config/db", () => ({ connectDB: async () => undefined }));
vi.mock("../models/Complaint", () => ({ Complaint: { findById: () => lean(complaint) } }));
vi.mock("../models/Capa", () => ({ Capa: { findById: () => lean(null) } }));
vi.mock("../models/User", () => ({ User: { findOne: () => lean(null), find: () => lean(managementUsers) } }));
vi.mock("../models/Role", () => ({ Role: { find: () => lean([{ _id: "r1" }]), findOne: () => lean(null) } }));
vi.mock("../models/Employee", () => ({
  Employee: {
    findOne: () => lean(null),
    find: (filter: Filter & { $or?: unknown[] }) => {
      if (filter.department) {
        const ids = (typeof filter.department === "string" ? [filter.department] : (filter.department.$in ?? [])).map(String);
        return lean(employees.filter((employee) => ids.includes(String(employee.department))));
      }
      // limitToDepartment: directory records of the users being filtered
      return lean(employees);
    }
  }
}));
vi.mock("../models/Department", () => ({
  Department: {
    findById: (id: unknown) => lean(departments.find((department) => department._id === String(id)) ?? null),
    find: (filter: { _id?: { $in: string[] } }) =>
      lean(filter._id ? departments.filter((department) => filter._id!.$in.map(String).includes(department._id as string)) : departments)
  }
}));

const { Types } = await import("mongoose");
const { resolveRecipients } = await import("./email-recipient.service");

const complaintId = new Types.ObjectId();
const forDepartment = (responsibleDept: string, roles: string[]) => {
  complaint = { _id: complaintId, responsibleDept, company: "c1" };
  return resolveRecipients({ complaintId, targetRoles: roles });
};

beforeEach(() => {
  complaint = {};
});

describe("a complaint only involves its own department's people", () => {
  it("copies only CD managers and HODs on a CD complaint", async () => {
    const cc = await forDepartment(CD, ["Manager", "Department Head"]);
    expect(cc.sort()).toEqual(["ankit@onepws.com", "puneet@onepws.com", "ritik@onepws.com"]);
  });

  it("copies only CCR managers and HODs on a CCR complaint", async () => {
    const cc = await forDepartment(CCR, ["Manager", "Department Head"]);
    expect(cc.sort()).toEqual(["mukesh@onepws.com", "sourabh@onepws.com"]);
  });

  it("treats CD Quality as CD and CCR Quality as CCR", async () => {
    expect((await forDepartment(CD_QUALITY, ["Manager", "Department Head"])).sort()).toEqual(["ankit@onepws.com", "puneet@onepws.com", "ritik@onepws.com"]);
    expect((await forDepartment(CCR_QUALITY, ["Manager", "Department Head"])).sort()).toEqual(["mukesh@onepws.com", "sourabh@onepws.com"]);
  });

  it("does not copy the other department's Management users, but keeps one with no directory record", async () => {
    expect((await forDepartment(CD, ["Management"])).sort()).toEqual(["ankit@onepws.com", "director@onepws.com"]);
    expect((await forDepartment(CCR, ["Management"])).sort()).toEqual(["director@onepws.com", "mukesh@onepws.com"]);
  });

  it("uses only the department's own Management addresses", async () => {
    expect(await forDepartment(CD_QUALITY, ["Department Management"])).toEqual(["cd.board@onepws.com"]);
    expect(await forDepartment(CCR, ["Department Management"])).toEqual(["ccr.board@onepws.com"]);
  });
});
