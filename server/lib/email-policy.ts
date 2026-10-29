/**
 * Portal emails are internal. Complaint and CAPA emails carry customer names, defects and
 * corrective actions, so they must never reach a customer or any outside address.
 *
 * Only addresses on a company domain may receive mail. The list defaults to onepws.com and can
 * be widened with EMAIL_ALLOWED_DOMAINS (comma-separated) if another company domain is added.
 */
const DEFAULT_ALLOWED_DOMAINS = ["onepws.com"];

export function allowedEmailDomains(): string[] {
  const configured = (process.env.EMAIL_ALLOWED_DOMAINS ?? "")
    .split(/[,;\s]+/)
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_ALLOWED_DOMAINS;
}

/** True only for a plain address whose domain is exactly an allowed company domain. */
export function isInternalAddress(email: string): boolean {
  const address = email.trim().toLowerCase();
  // One "@", no spaces, no list separators or angle brackets that could smuggle in a second address.
  if (!/^[^\s@<>,;"']+@[^\s@<>,;"']+$/.test(address)) return false;
  return allowedEmailDomains().includes(address.slice(address.lastIndexOf("@") + 1));
}

export function splitByEmailPolicy(addresses: string[] | undefined): { allowed: string[]; blocked: string[] } {
  const allowed: string[] = [];
  const blocked: string[] = [];
  for (const address of addresses ?? []) {
    if (!address || !address.trim()) continue;
    (isInternalAddress(address) ? allowed : blocked).push(address);
  }
  return { allowed, blocked };
}

export const EXTERNAL_ADDRESS_MESSAGE = () =>
  `Only company addresses (${allowedEmailDomains().map((domain) => `@${domain}`).join(", ")}) can receive portal emails`;
