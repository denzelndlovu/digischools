import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { ENV, type Env } from '../config/env.js';

export type Tx = Prisma.TransactionClient;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The only place tenant-scoped queries are issued. Every call runs in a transaction that sets
 * `app.tenant_id`, which the PostgreSQL row-level security policies read.
 */
@Injectable()
export class TenantDb implements OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(ENV) env: Env) {
    this.client = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  }

  run<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (!UUID.test(tenantId)) throw new Error('tenantId must be a UUID');
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
