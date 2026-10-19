import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PASSWORD,
  adminPrisma,
  as,
  createTestApp,
  login,
  seedWorld,
  type TestApp,
  type World,
} from './test/helpers.js';

let t: TestApp;
let world: World;

beforeAll(async () => {
  const prisma = adminPrisma();
  world = await seedWorld(prisma);
  await prisma.$disconnect();
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

describe('tenant isolation over HTTP', () => {
  it('unknown school returns 404', async () => {
    const r = await t.http
      .post('/v1/auth/login')
      .set('x-school-code', 'nope')
      .send({ identifier: 'a@b.co', password: 'x' });
    expect(r.status).toBe(404);
  });

  it('credentials from one school do not work at another', async () => {
    const r = await t.http
      .post('/v1/auth/login')
      .set('x-school-code', world.beta.code)
      .send({ identifier: 'admin@alpha.example.org', password: PASSWORD });
    expect(r.status).toBe(401);
  });

  it('a token issued by one school is rejected by another', async () => {
    const alphaAdmin = await login(t, world.alpha.code, 'admin@alpha.example.org');
    expect((await as(t, world.alpha.code, alphaAdmin.accessToken).get('/v1/me')).status).toBe(200);
    expect((await as(t, world.beta.code, alphaAdmin.accessToken).get('/v1/me')).status).toBe(401);
  });

  it('an admin cannot read a student that belongs to another school', async () => {
    const alphaAdmin = await login(t, world.alpha.code, 'admin@alpha.example.org');
    const own = await as(t, world.alpha.code, alphaAdmin.accessToken).get(
      `/v1/students/${world.ids.alphaStudent1}`,
    );
    expect(own.status).toBe(200);
    const foreign = await as(t, world.alpha.code, alphaAdmin.accessToken).get(
      `/v1/students/${world.ids.betaStudent}`,
    );
    expect(foreign.status).toBe(404);
  });

  it('the tenant is resolved from the Host header when no school code is sent', async () => {
    const r = await t.http.get('/v1/me').set('host', 'beta-high.digischools.test');
    expect(r.status).toBe(401); // tenant found, no token
    const unknown = await t.http.get('/v1/me').set('host', 'nobody.digischools.test');
    expect(unknown.status).toBe(404);
  });

  it('public config exposes branding and modules but no billing or contact data', async () => {
    const r = await t.http.get(`/v1/public/tenants/${world.alpha.code}/config`);
    expect(r.status).toBe(200);
    expect(r.body.modules.fees).toBe(true);
    expect(r.body).not.toHaveProperty('billing');
    expect(JSON.stringify(r.body)).not.toContain('office@example.org');
  });

  it('serves the same public config for the web via the forwarded host', async () => {
    const r = await t.http
      .get('/v1/public/config')
      .set('x-forwarded-host', 'alpha-high.digischools.test');
    expect(r.status).toBe(200);
    expect(r.body.school.code).toBe(world.alpha.code);
  });
});

describe('family isolation', () => {
  it('a parent sees only their linked children', async () => {
    const p1 = await login(t, world.alpha.code, 'parent.sample@example.org');
    const r = await as(t, world.alpha.code, p1.accessToken).get('/v1/me/children');
    expect(r.status).toBe(200);
    expect(r.body.map((c: any) => c.id)).toEqual([world.ids.alphaStudent1]);
  });

  it("a parent cannot read another family's child", async () => {
    const p1 = await login(t, world.alpha.code, 'parent.sample@example.org');
    const mine = await as(t, world.alpha.code, p1.accessToken).get(
      `/v1/students/${world.ids.alphaStudent1}`,
    );
    expect(mine.status).toBe(200);
    const theirs = await as(t, world.alpha.code, p1.accessToken).get(
      `/v1/students/${world.alphaOther.studentId}`,
    );
    expect(theirs.status).toBe(404);

    const p2 = await login(t, world.alpha.code, world.alphaOther.parentEmail);
    expect(
      (await as(t, world.alpha.code, p2.accessToken).get(`/v1/students/${world.ids.alphaStudent1}`))
        .status,
    ).toBe(404);
    expect(
      (
        await as(t, world.alpha.code, p2.accessToken).get(
          `/v1/students/${world.alphaOther.studentId}`,
        )
      ).status,
    ).toBe(200);
  });

  it('a student can read only themselves and cannot use parent endpoints', async () => {
    const s = await login(t, world.alpha.code, 'student.sample@example.org');
    const api = as(t, world.alpha.code, s.accessToken);
    expect((await api.get(`/v1/students/${world.ids.alphaStudent1}`)).status).toBe(200);
    expect((await api.get(`/v1/students/${world.alphaOther.studentId}`)).status).toBe(404);
    expect((await api.get('/v1/me/children')).status).toBe(403);
  });
});
