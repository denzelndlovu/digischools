import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PASSWORD,
  adminPrisma,
  as,
  asTenant,
  createTestApp,
  login,
  makeConfig,
  seedWorld,
  type TestApp,
  type World,
} from './test/helpers.js';
import { provisionTenant } from './provisioning/provision.js';

let t: TestApp;
let world: World;
const admin = adminPrisma();

const startLogin = (identifier: string, password = PASSWORD, school = 'alpha-high') =>
  t.http.post('/v1/auth/login').set('x-school-code', school).send({ identifier, password });

beforeAll(async () => {
  world = await seedWorld(admin);
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
  await admin.$disconnect();
});

describe('login and one-time code', () => {
  it('rejects a wrong password and an unknown user with the same response', async () => {
    const a = await startLogin('admin@alpha.example.org', 'wrong-password');
    const b = await startLogin('ghost@alpha.example.org');
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.message).toBe(b.body.message);
  });

  it('sends a 6 digit code to the masked destination and returns no tokens before it is verified', async () => {
    const r = await startLogin('admin@alpha.example.org');
    expect(r.status).toBe(200);
    expect(r.body.accessToken).toBeUndefined();
    expect(r.body.destination).toMatch(/\*\*\*/);
    expect(t.otp.last().code).toMatch(/^\d{6}$/);
  });

  it('rejects a wrong code and locks the challenge after 5 attempts, even for the right code', async () => {
    const r = await startLogin('admin@alpha.example.org');
    const right = t.otp.last().code;
    const wrong = right === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const bad = await t.http
        .post('/v1/auth/verify-otp')
        .set('x-school-code', 'alpha-high')
        .send({ challengeId: r.body.challengeId, code: wrong });
      expect(bad.status).toBe(401);
    }
    const late = await t.http
      .post('/v1/auth/verify-otp')
      .set('x-school-code', 'alpha-high')
      .send({ challengeId: r.body.challengeId, code: right });
    expect(late.status).toBe(401);
  });

  it('a code works once only', async () => {
    const r = await startLogin('admin@alpha.example.org');
    const code = t.otp.last().code;
    const ok = await t.http
      .post('/v1/auth/verify-otp')
      .set('x-school-code', 'alpha-high')
      .send({ challengeId: r.body.challengeId, code });
    expect(ok.status).toBe(200);
    const again = await t.http
      .post('/v1/auth/verify-otp')
      .set('x-school-code', 'alpha-high')
      .send({ challengeId: r.body.challengeId, code });
    expect(again.status).toBe(401);
  });

  it('an expired code is rejected', async () => {
    const r = await startLogin('admin@alpha.example.org');
    const code = t.otp.last().code;
    await asTenant(admin, world.alpha.id, (tx) =>
      tx.otpCode.update({
        where: { tenantId_id: { tenantId: world.alpha.id, id: r.body.challengeId } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      }),
    );
    const res = await t.http
      .post('/v1/auth/verify-otp')
      .set('x-school-code', 'alpha-high')
      .send({ challengeId: r.body.challengeId, code });
    expect(res.status).toBe(401);
  });

  it('blocked or deactivated users cannot log in', async () => {
    await asTenant(admin, world.alpha.id, (tx) =>
      tx.user.update({
        where: { tenantId_email: { tenantId: world.alpha.id, email: 'parent.two@example.org' } },
        data: { status: 'BLOCKED' },
      }),
    );
    expect((await startLogin('parent.two@example.org')).status).toBe(401);
    await asTenant(admin, world.alpha.id, (tx) =>
      tx.user.update({
        where: { tenantId_email: { tenantId: world.alpha.id, email: 'parent.two@example.org' } },
        data: { status: 'ACTIVE' },
      }),
    );
  });

  it('login writes an audit entry', async () => {
    await login(t, 'alpha-high', 'admin@alpha.example.org');
    const rows = await asTenant(admin, world.alpha.id, (tx) =>
      tx.auditLog.count({ where: { tenantId: world.alpha.id, action: 'auth.login' } }),
    );
    expect(rows).toBeGreaterThan(0);
  });

  it('stores only hashes of passwords, codes and refresh tokens', async () => {
    const tokens = await login(t, 'alpha-high', 'admin@alpha.example.org');
    const [user, rt, otp] = await asTenant(admin, world.alpha.id, (tx) =>
      Promise.all([
        tx.user.findUnique({
          where: { tenantId_email: { tenantId: world.alpha.id, email: 'admin@alpha.example.org' } },
        }),
        tx.refreshToken.findMany({ where: { tenantId: world.alpha.id } }),
        tx.otpCode.findMany({ where: { tenantId: world.alpha.id } }),
      ]),
    );
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(rt.some((r: any) => r.tokenHash === tokens.refreshToken)).toBe(false);
    expect(otp.some((o: any) => o.codeHash === t.otp.last().code)).toBe(false);
  });
});

describe('access tokens', () => {
  it('requires a bearer token', async () => {
    expect((await t.http.get('/v1/me').set('x-school-code', 'alpha-high')).status).toBe(401);
    expect((await as(t, 'alpha-high', 'garbage').get('/v1/me')).status).toBe(401);
  });

  it('rejects tokens signed with another key or with alg none', async () => {
    const forged = await new SignJWT({ tid: world.alpha.id, role: 'ADMIN', st: null })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(world.ids.alphaStudent1!)
      .setIssuer('digischools')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('some-other-secret-some-other-secret-1'));
    expect((await as(t, 'alpha-high', forged).get('/v1/me')).status).toBe(401);
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(
      JSON.stringify({
        sub: world.ids.alphaStudent1,
        tid: world.alpha.id,
        role: 'ADMIN',
        iss: 'digischools',
      }),
    ).toString('base64url')}.`;
    expect((await as(t, 'alpha-high', none).get('/v1/me')).status).toBe(401);
  });

  it('role in the token is not trusted: the database role applies', async () => {
    const s = await login(t, 'alpha-high', 'student.sample@example.org');
    const me = await as(t, 'alpha-high', s.accessToken).get('/v1/me');
    expect(me.body.role).toBe('STUDENT');
  });
});

describe('refresh tokens', () => {
  it('rotates, and reuse of an old token revokes the whole family', async () => {
    const first = await login(t, 'alpha-high', 'admin@alpha.example.org');
    const rotate = await t.http
      .post('/v1/auth/refresh')
      .set('x-school-code', 'alpha-high')
      .send({ refreshToken: first.refreshToken });
    expect(rotate.status).toBe(200);
    expect(rotate.body.refreshToken).not.toBe(first.refreshToken);

    const replay = await t.http
      .post('/v1/auth/refresh')
      .set('x-school-code', 'alpha-high')
      .send({ refreshToken: first.refreshToken });
    expect(replay.status).toBe(401);
    const afterTheft = await t.http
      .post('/v1/auth/refresh')
      .set('x-school-code', 'alpha-high')
      .send({ refreshToken: rotate.body.refreshToken });
    expect(afterTheft.status).toBe(401);
  });

  it('logout revokes the token', async () => {
    const tokens = await login(t, 'alpha-high', 'admin@alpha.example.org');
    const out = await t.http
      .post('/v1/auth/logout')
      .set('x-school-code', 'alpha-high')
      .send({ refreshToken: tokens.refreshToken });
    expect(out.status).toBe(204);
    const r = await t.http
      .post('/v1/auth/refresh')
      .set('x-school-code', 'alpha-high')
      .send({ refreshToken: tokens.refreshToken });
    expect(r.status).toBe(401);
  });

  it('a refresh token from one school is useless at another', async () => {
    const tokens = await login(t, 'alpha-high', 'admin@alpha.example.org');
    const r = await t.http
      .post('/v1/auth/refresh')
      .set('x-school-code', 'beta-high')
      .send({ refreshToken: tokens.refreshToken });
    expect(r.status).toBe(401);
  });
});

describe('roles, permissions and modules', () => {
  it('exposes permissions matching the role and staff type', async () => {
    const teacher = await login(t, 'alpha-high', 'teacher.sample@example.org');
    const me = await as(t, 'alpha-high', teacher.accessToken).get('/v1/me');
    expect(me.body.staffType).toBe('TEACHER');
    expect(me.body.permissions).toContain('assignments:manage');
    expect(me.body.permissions).not.toContain('users:write');
    expect(me.body.permissions).not.toContain('tickets:queue');
  });

  it('returns 403 for a module that is switched off, and allows it when on', async () => {
    const offCfg = makeConfig('gamma-high', (c) => {
      c.modules.fees = false;
      c.modules.tuckshopWallet = false;
      c.wallet.enabled = false;
    });
    await provisionTenant(admin, offCfg, {
      adminEmail: 'admin@gamma.example.org',
      adminPassword: PASSWORD,
    });
    const gamma = await login(t, 'gamma-high', 'admin@gamma.example.org');
    expect((await as(t, 'gamma-high', gamma.accessToken).get('/v1/_probe/fees')).status).toBe(403);

    const alpha = await login(t, 'alpha-high', 'admin@alpha.example.org');
    expect((await as(t, 'alpha-high', alpha.accessToken).get('/v1/_probe/fees')).status).toBe(200);
  });
});

describe('rate limiting', () => {
  it('throttles repeated login attempts', async () => {
    process.env.THROTTLE_DISABLED = '0';
    try {
      const codes: number[] = [];
      for (let i = 0; i < 14; i++) codes.push((await startLogin('ghost@alpha.example.org')).status);
      expect(codes).toContain(429);
    } finally {
      process.env.THROTTLE_DISABLED = '1';
    }
  });
});
