import { Inject, Injectable } from '@nestjs/common';
import { parseTenantConfig, type TenantConfig } from '@digischools/config-schema';
import { TenantDb } from '../db/tenant-db.js';

export interface ResolvedTenant {
  id: string;
  code: string;
  name: string;
  config: TenantConfig;
}

export const TENANT_CACHE_TTL_MS = Symbol('TENANT_CACHE_TTL_MS');

@Injectable()
export class TenantService {
  private cache = new Map<string, { at: number; tenant: ResolvedTenant | null }>();

  constructor(
    @Inject(TenantDb) private readonly db: TenantDb,
    @Inject(TENANT_CACHE_TTL_MS) private readonly ttlMs: number,
  ) {}

  private async cached(key: string, load: () => Promise<ResolvedTenant | null>) {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.tenant;
    const tenant = await load();
    this.cache.set(key, { at: Date.now(), tenant });
    return tenant;
  }

  private toResolved(row: {
    id: string;
    code: string;
    name: string;
    config: unknown;
    status: string;
  }) {
    if (row.status !== 'ACTIVE') return null;
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      config: parseTenantConfig(row.config, row.code),
    };
  }

  byCode(code: string): Promise<ResolvedTenant | null> {
    const key = `code:${code.toLowerCase()}`;
    return this.cached(key, async () => {
      const row = await this.db.client.tenant.findUnique({ where: { code: code.toLowerCase() } });
      return row ? this.toResolved(row) : null;
    });
  }

  byHost(host: string): Promise<ResolvedTenant | null> {
    const h = host.toLowerCase().replace(/:\d+$/, '');
    return this.cached(`host:${h}`, async () => {
      const row = await this.db.client.tenantDomain.findUnique({
        where: { host: h },
        include: { tenant: true },
      });
      return row ? this.toResolved(row.tenant) : null;
    });
  }

  invalidate() {
    this.cache.clear();
  }
}
