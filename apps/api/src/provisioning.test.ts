import { afterAll, describe, expect, it } from 'vitest';
import { PASSWORD, adminPrisma, asTenant, makeConfig } from './test/helpers.js';
import { provisionTenant } from './provisioning/provision.js';

const admin = adminPrisma();
afterAll(() => admin.$disconnect());

describe('provisionTenant', () => {
  const cfg = makeConfig('delta-high');

  it('creates tenant, domain, admin, terms and fictional sample data', async () => {
    const r = await provisionTenant(admin, cfg, {
      adminEmail: 'Admin@Delta.example.org',
      sampleData: true,
    });
    expect(r.created).toBe(true);
    expect(r.hosts).toEqual(['delta-high.digischools.test']);
    expect(r.credentials.map((c) => c.role).sort()).toEqual([
      'ADMIN',
      'PARENT',
      'STAFF',
      'STUDENT',
    ]);
    expect(new Set(r.credentials.map((c) => c.password)).size).toBe(4);

    await asTenant(admin, r.tenantId, async (tx) => {
      expect(await tx.term.count({ where: { tenantId: r.tenantId } })).toBe(3);
      expect(await tx.guardianLink.count({ where: { tenantId: r.tenantId } })).toBe(1);
      const adminUser = await tx.user.findUnique({
        where: { tenantId_email: { tenantId: r.tenantId, email: 'admin@delta.example.org' } },
      });
      expect(adminUser.role).toBe('ADMIN');
      expect(adminUser.passwordHash).not.toContain(r.credentials[0]!.password);
    });
  });

  it('is idempotent and never reissues passwords for existing users', async () => {
    const again = await provisionTenant(admin, cfg, {
      adminEmail: 'admin@delta.example.org',
      sampleData: true,
    });
    expect(again.created).toBe(false);
    expect(again.credentials).toEqual([]);
    await asTenant(admin, again.tenantId, async (tx) => {
      expect(await tx.user.count({ where: { tenantId: again.tenantId } })).toBe(4);
      expect(await tx.term.count({ where: { tenantId: again.tenantId } })).toBe(3);
    });
  });

  it('can skip sample data and honours a supplied admin password', async () => {
    const r = await provisionTenant(admin, makeConfig('epsilon-high'), {
      adminEmail: 'admin@epsilon.example.org',
      adminPassword: PASSWORD,
      sampleData: false,
    });
    expect(r.credentials).toEqual([
      { role: 'ADMIN', email: 'admin@epsilon.example.org', password: PASSWORD },
    ]);
  });
});
