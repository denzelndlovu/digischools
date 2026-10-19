import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import pg from 'pg';
import { adminPrisma, seedWorld, type World } from './test/helpers.js';

/** Tables without tenant-scoped rows. Anything else with a tenant_id column must have RLS. */
const PLATFORM_TABLES = new Set(['tenant', 'tenant_domain']);

let app: pg.Client;
let admin: pg.Client;
let world: World;
let tenantTables: string[];

async function asTenant<T>(tenantId: string | null, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  await app.query('BEGIN');
  try {
    if (tenantId) await app.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    return await fn(app);
  } finally {
    await app.query('ROLLBACK');
  }
}

beforeAll(async () => {
  const prisma = adminPrisma();
  world = await seedWorld(prisma);
  await prisma.$disconnect();
  const { appUrl, adminUrl } = inject('dbUrls');
  app = new pg.Client({ connectionString: appUrl });
  admin = new pg.Client({ connectionString: adminUrl });
  await Promise.all([app.connect(), admin.connect()]);
  const r = await admin.query(
    `SELECT table_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = 'tenant_id' ORDER BY table_name`,
  );
  tenantTables = r.rows.map((x) => x.table_name).filter((t) => !PLATFORM_TABLES.has(t));
});

afterAll(async () => {
  await Promise.all([app.end(), admin.end()]);
});

describe('row-level security', () => {
  it('finds the expected tenant tables', () => {
    expect(tenantTables).toEqual(
      expect.arrayContaining([
        'user',
        'guardian_link',
        'refresh_token',
        'otp_code',
        'audit_log',
        'term',
      ]),
    );
  });

  it('every tenant table has RLS enabled, forced, with a tenant policy', async () => {
    for (const t of tenantTables) {
      const r = await admin.query(
        `SELECT c.relrowsecurity, c.relforcerowsecurity,
                (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS policies
         FROM pg_class c WHERE c.relname = $1 AND c.relnamespace = 'public'::regnamespace`,
        [t],
      );
      expect(r.rows[0], t).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
      expect(Number(r.rows[0].policies), t).toBe(1);
    }
  });

  it('the application role cannot bypass RLS', async () => {
    const r = await admin.query(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'digischools_app'`,
    );
    expect(r.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('without a tenant context no tenant table returns rows', async () => {
    for (const t of tenantTables) {
      const r = await asTenant(null, (c) => c.query(`SELECT count(*)::int AS n FROM "${t}"`));
      expect(r.rows[0].n, t).toBe(0);
    }
  });

  it('each tenant sees exactly its own rows in every table', async () => {
    for (const t of tenantTables) {
      for (const tenant of [world.alpha, world.beta]) {
        const expected = await admin.query(
          `SELECT count(*)::int AS n FROM "${t}" WHERE tenant_id = $1`,
          [tenant.id],
        );
        const seen = await asTenant(tenant.id, (c) =>
          c.query(
            `SELECT count(*)::int AS n, count(*) FILTER (WHERE tenant_id <> $1)::int AS foreign_rows FROM "${t}"`,
            [tenant.id],
          ),
        );
        expect(seen.rows[0].n, `${t}/${tenant.code}`).toBe(expected.rows[0].n);
        expect(seen.rows[0].foreign_rows, `${t}/${tenant.code}`).toBe(0);
      }
    }
  });

  it("a tenant cannot update or delete another tenant's rows", async () => {
    for (const t of tenantTables.filter((x) => x !== 'audit_log')) {
      const upd = await asTenant(world.alpha.id, (c) =>
        c.query(`UPDATE "${t}" SET tenant_id = tenant_id WHERE tenant_id = $1`, [world.beta.id]),
      );
      expect(upd.rowCount, `update ${t}`).toBe(0);
      const del = await asTenant(world.alpha.id, (c) =>
        c.query(`DELETE FROM "${t}" WHERE tenant_id = $1`, [world.beta.id]),
      );
      expect(del.rowCount, `delete ${t}`).toBe(0);
    }
  });

  it('a tenant cannot insert rows for another tenant', async () => {
    await expect(
      asTenant(world.alpha.id, (c) =>
        c.query(
          `INSERT INTO "audit_log" (id, tenant_id, action, entity_type) VALUES (gen_random_uuid(), $1, 'x', 'x')`,
          [world.beta.id],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asTenant(null, (c) =>
        c.query(
          `INSERT INTO "audit_log" (id, tenant_id, action, entity_type) VALUES (gen_random_uuid(), $1, 'x', 'x')`,
          [world.alpha.id],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('composite foreign keys stop links across tenants', async () => {
    await expect(
      asTenant(world.alpha.id, (c) =>
        c.query(
          `INSERT INTO guardian_link (id, tenant_id, parent_user_id, student_user_id)
           SELECT gen_random_uuid(), $1, (SELECT id FROM "user" WHERE role = 'PARENT' LIMIT 1), $2`,
          [world.alpha.id, world.ids.betaStudent],
        ),
      ),
    ).rejects.toThrow(/foreign key|violates/);
  });

  it('audit_log is append-only for the application role', async () => {
    await expect(
      asTenant(world.alpha.id, (c) => c.query(`UPDATE audit_log SET action = 'tampered'`)),
    ).rejects.toThrow(/permission denied/);
    await expect(asTenant(world.alpha.id, (c) => c.query(`DELETE FROM audit_log`))).rejects.toThrow(
      /permission denied/,
    );
  });

  it('platform tables are read-only for the application role', async () => {
    await expect(
      asTenant(world.alpha.id, (c) => c.query(`UPDATE tenant SET name = 'hijack'`)),
    ).rejects.toThrow(/permission denied/);
  });
});
