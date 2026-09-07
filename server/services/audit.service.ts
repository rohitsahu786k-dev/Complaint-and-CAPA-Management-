import { AuditLog } from "../models/AuditLog";

export async function writeAudit(input: {
  actor?: Express.UserContext;
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}) {
  return AuditLog.create({
    actor: input.actor?.id,
    actorName: input.actor?.name || "System",
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    before: input.before,
    after: input.after,
    metadata: input.metadata
  });
}
