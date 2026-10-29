import { beforeEach, describe, expect, it, vi } from "vitest";

type Mail = { to: string[]; cc?: string[]; bcc?: string[] };
const sendMail = vi.fn(async (_mail: Mail) => ({ messageId: "m1" }));
const writeEmailLog = vi.fn(async (entry: Record<string, unknown>) => ({ _id: "log1", ...entry }));
const resolveDepartmentCc = vi.fn(async () => [] as string[]);
const resolveRecipientChainCc = vi.fn(async () => [] as string[]);

vi.mock("../lib/mailer", () => ({
  createTransporter: () => ({ sendMail }),
  fromAddress: () => "portal@onepws.com",
  isSmtpConfigured: () => true
}));
vi.mock("../lib/app-url", () => ({ getAppUrl: () => "https://care.onepws.com" }));
vi.mock("./email-template.service", () => ({
  getActiveTemplateByTrigger: async () => ({
    templateKey: "t",
    templateName: "T",
    subject: "Complaint {{complaintNumber}}",
    htmlBody: "<p>{{complaintNumber}}</p>",
    textBody: "{{complaintNumber}}",
    supportedVariables: []
  })
}));
vi.mock("./email-log.service", () => ({
  hasDedupeKeyBeenSent: async () => false,
  writeEmailLog,
  getEmailLogById: async () => null
}));
vi.mock("./email-recipient.service", () => ({ resolveDepartmentCc, resolveRecipientChainCc }));
vi.mock("../models/EmailLog", () => ({ EmailLog: { findByIdAndUpdate: async () => null } }));

const { sendTemplatedEmail } = await import("./email.service");

const base = { triggerEvent: "TAT_ESCALATION", data: { complaintNumber: "PWS-1" }, relatedComplaintId: "6ae076b3a20125450b25cdb0" } as const;

beforeEach(() => {
  sendMail.mockClear();
  writeEmailLog.mockClear();
  resolveDepartmentCc.mockResolvedValue([]);
  resolveRecipientChainCc.mockResolvedValue([]);
});

describe("portal emails never leave the company", () => {
  it("sends to company addresses", async () => {
    const result = await sendTemplatedEmail({ ...base, recipients: ["owner@onepws.com"], cc: ["boss@onepws.com"] });
    expect(result.status).toBe("sent");
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: ["owner@onepws.com"], cc: ["boss@onepws.com"] }));
  });

  it("drops a customer address from To, CC and BCC and still sends to the company people", async () => {
    await sendTemplatedEmail({
      ...base,
      recipients: ["owner@onepws.com", "buyer@customer.com"],
      cc: ["manager@onepws.com", "ceo@customer.com"],
      bcc: ["audit@gmail.com"]
    });
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toEqual(["owner@onepws.com"]);
    expect(mail.cc).toEqual(["manager@onepws.com"]);
    expect(mail.bcc).toBeUndefined();
    const everyAddress = [...mail.to, ...(mail.cc ?? []), ...(mail.bcc ?? [])];
    expect(everyAddress.every((address) => address.endsWith("@onepws.com"))).toBe(true);
  });

  it("sends nothing when the only recipient is a customer, and logs the refusal", async () => {
    const result = await sendTemplatedEmail({ ...base, recipients: ["buyer@customer.com"] });
    expect(result.status).toBe("skipped");
    expect(sendMail).not.toHaveBeenCalled();
    expect(writeEmailLog).toHaveBeenCalledWith(expect.objectContaining({ status: "skipped", recipients: ["buyer@customer.com"] }));
  });

  it("also filters the Manager/HOD/Management CCs that come from the directory", async () => {
    resolveDepartmentCc.mockResolvedValue(["hod@onepws.com", "typo-entered@customer.com"]);
    resolveRecipientChainCc.mockResolvedValue(["chain@onepws.com", "external-manager@gmail.com"]);
    await sendTemplatedEmail({ ...base, recipients: ["owner@onepws.com"] });
    expect(sendMail.mock.calls[0][0].cc).toEqual(["hod@onepws.com", "chain@onepws.com"]);
  });

  it("does not let a look-alike domain through", async () => {
    const result = await sendTemplatedEmail({ ...base, recipients: ["x@onepws.com.evil.com", "y@notonepws.com"] });
    expect(result.status).toBe("skipped");
    expect(sendMail).not.toHaveBeenCalled();
  });
});
