import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { Tx } from '../db/tenant-db.js';

@Injectable()
export class AuditService {
  /** Writes inside the caller's transaction so the audit entry commits or rolls back with the action. */
  record(
    tx: Tx,
    tenantId: string,
    entry: {
      actorUserId?: string | null;
      action: string;
      entityType: string;
      entityId?: string;
      before?: object;
      after?: object;
      req?: Request;
    },
  ) {
    return tx.auditLog.create({
      data: {
        tenantId,
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before,
        after: entry.after,
        ip: entry.req?.ip,
      },
    });
  }
}
