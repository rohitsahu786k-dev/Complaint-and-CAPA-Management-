import { beforeEach, describe, expect, it, vi } from "vitest";

type Mail = { to: string[]; cc?: string[]; bcc?: string[] };
const sendMail = vi.fn(async (_mail: Mail) => ({ messageId: "m1" }));
const writeEmailLog = vi.fn(async (entry: Record<string, unknown>) => ({ _id: "log1", ...entry }));
const resolveDepartmentCc = vi.fn(async (_ref: { excludeManagement?: boolean }) => [] as string[]);
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

const base = { triggerEvent: "COMPLAINT_CLOSED", data: { complaintNumber: "PWS-1" }, relatedComplaintId: "6ae076b3a20125450b25cdb0" } as const;
const COMMON = ["service@onepws.com", "jatin.chouhan@onepws.com", "process@onepws.com"];

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
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: ["owner@onepws.com"], cc: ["boss@onepws.com", ...COMMON] }));
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
    expect(mail.cc).toEqual(["manager@onepws.com", ...COMMON]);
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
    expect(sendMail.mock.calls[0][0].cc).toEqual([...COMMON, "hod@onepws.com", "chain@onepws.com"]);
  });

  it("always copies the three common mailboxes on a complaint or CAPA email, whoever sent it", async () => {
    for (const trigger of ["COMPLAINT_CREATED", "TAT_DELAY_DAILY", "TAT_REMINDER", "CAPA_OVERDUE", "EFFECTIVENESS_REVIEW_DUE", "COMPLAINT_CLOSED"]) {
      sendMail.mockClear();
      await sendTemplatedEmail({ ...base, triggerEvent: trigger, recipients: ["owner@onepws.com"] });
      expect(sendMail.mock.calls[0][0].cc, trigger).toEqual(expect.arrayContaining(COMMON));
    }
    sendMail.mockClear();
    await sendTemplatedEmail({ triggerEvent: "CAPA_ASSIGNED", data: {}, relatedCapaId: "6ae076b3a20125450b25cdb1", recipients: ["owner@onepws.com"] });
    expect(sendMail.mock.calls[0][0].cc).toEqual(expect.arrayContaining(COMMON));
  });

  it("does not move a common mailbox to CC when it is already a recipient", async () => {
    await sendTemplatedEmail({ ...base, recipients: ["service@onepws.com"] });
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toEqual(["service@onepws.com"]);
    expect(mail.cc).toEqual(["jatin.chouhan@onepws.com", "process@onepws.com"]);
  });

  it("does not copy anyone on account emails that have no complaint or CAPA behind them", async () => {
    await sendTemplatedEmail({ triggerEvent: "PASSWORD_CHANGED", data: {}, recipients: ["user@onepws.com"] });
    expect(sendMail.mock.calls[0][0].cc).toBeUndefined();
  });

  it("leaves Management out of reminders about delay unless the sender says it is over 10 days", async () => {
    for (const trigger of ["TAT_REMINDER", "TAT_DUE_SOON", "CAPA_DUE_REMINDER", "TAT_DELAY_DAILY", "CAPA_OVERDUE", "EFFECTIVENESS_REVIEW_DUE"]) {
      resolveDepartmentCc.mockClear();
      await sendTemplatedEmail({ ...base, triggerEvent: trigger, recipients: ["owner@onepws.com"] });
      expect(resolveDepartmentCc.mock.calls[0][0].excludeManagement, trigger).toBe(true);
    }
    resolveDepartmentCc.mockClear();
    await sendTemplatedEmail({ ...base, triggerEvent: "TAT_DELAY_DAILY", recipients: ["owner@onepws.com"], excludeManagement: false });
    expect(resolveDepartmentCc.mock.calls[0][0].excludeManagement).toBe(false);
  });

  it("keeps Management in the CC of every other complaint and CAPA email", async () => {
    for (const trigger of ["COMPLAINT_CREATED", "COMPLAINT_CLOSED", "COMPLAINT_REOPENED", "CAPA_ASSIGNED", "COMPLAINT_ACKNOWLEDGED"]) {
      resolveDepartmentCc.mockClear();
      await sendTemplatedEmail({ ...base, triggerEvent: trigger, recipients: ["owner@onepws.com"] });
      expect(resolveDepartmentCc.mock.calls[0][0].excludeManagement, trigger).toBe(false);
    }
  });

  it("does not let a look-alike domain through", async () => {
    const result = await sendTemplatedEmail({ ...base, recipients: ["x@onepws.com.evil.com", "y@notonepws.com"] });
    expect(result.status).toBe("skipped");
    expect(sendMail).not.toHaveBeenCalled();
  });
});
