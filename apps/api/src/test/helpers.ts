import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Test, type TestingModule } from '@nestjs/testing';
import { Controller, Get, type INestApplication, type Type } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import request from 'supertest';
import { inject } from 'vitest';
import { loadSchoolConfig, parseTenantConfig, type TenantConfig } from '@digischools/config-schema';
import { AppModule } from '../app.module.js';
import { OTP_SENDER, OtpSender } from '../auth/otp-sender.js';
import { RequireModule } from '../auth/decorators.js';
import { TENANT_CACHE_TTL_MS } from '../tenancy/tenant.service.js';
import { provisionTenant } from '../provisioning/provision.js';

export const PASSWORD = 'correct-horse-battery-1';
const schoolsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../config/schools',
);

export class CapturingOtpSender extends OtpSender {
  sent: Array<{ channel: string; destination: string; code: string }> = [];
  async send(channel: string, destination: string, code: string) {
    this.sent.push({ channel, destination, code });
  }
  last() {
    return this.sent[this.sent.length - 1]!;
  }
}

export function makeConfig(code: string, patch: (c: any) => void = () => {}): TenantConfig {
  const c: any = structuredClone(loadSchoolConfig('_template', schoolsDir));
  c.school.code = code;
  c.school.name = `${code} school`;
  c.school.domain = `${code}.digischools.test`;
  patch(c);
  return parseTenantConfig(c, code);
}

export function adminPrisma(): PrismaClient {
  return new PrismaClient({ datasourceUrl: inject('dbUrls').adminUrl });
}

/** Runs `fn` as the owner role with the tenant context set, like the provisioning CLI does. */
export async function asTenant<T>(
  admin: PrismaClient,
  tenantId: string,
  fn: (tx: any) => Promise<T>,
): Promise<T> {
  return admin.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}

export interface World {
  alpha: { id: string; code: string };
  beta: { id: string; code: string };
  /** Second family in alpha, not linked to the sample parent. */
  alphaOther: { parentEmail: string; studentId: string };
  ids: Record<string, string>;
}

/** Two tenants with sample users, plus a second unrelated family in the first. Idempotent. */
export async function seedWorld(admin: PrismaClient): Promise<World> {
  const alphaCfg = makeConfig('alpha-high');
  const betaCfg = makeConfig('beta-high');
  const a = await provisionTenant(admin, alphaCfg, {
    adminEmail: 'admin@alpha.example.org',
    adminPassword: PASSWORD,
    sampleData: true,
    samplePassword: PASSWORD,
  });
  const b = await provisionTenant(admin, betaCfg, {
    adminEmail: 'admin@beta.example.org',
    adminPassword: PASSWORD,
    sampleData: true,
    samplePassword: PASSWORD,
  });

  const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  const ids: Record<string, string> = {};
  await asTenant(admin, a.tenantId, async (tx) => {
    const other = await tx.user.findUnique({
      where: { tenantId_email: { tenantId: a.tenantId, email: 'parent.two@example.org' } },
    });
    if (!other) {
      const parentId = randomUUID();
      const studentId = randomUUID();
      await tx.user.create({
        data: {
          id: parentId,
          tenantId: a.tenantId,
          email: 'parent.two@example.org',
          passwordHash: hash,
          role: 'PARENT',
          displayName: 'Second Parent',
        },
      });
      await tx.user.create({
        data: {
          id: studentId,
          tenantId: a.tenantId,
          email: 'student.two@example.org',
          passwordHash: hash,
          role: 'STUDENT',
          displayName: 'Second Student',
        },
      });
      await tx.studentProfile.create({
        data: {
          tenantId: a.tenantId,
          userId: studentId,
          admissionNo: 'S-0002',
          formName: 'Form 2',
        },
      });
      await tx.guardianLink.create({
        data: { tenantId: a.tenantId, parentUserId: parentId, studentUserId: studentId },
      });
    }
    const s2 = await tx.user.findUnique({
      where: { tenantId_email: { tenantId: a.tenantId, email: 'student.two@example.org' } },
    });
    ids.alphaStudent2 = s2.id;
    const s1 = await tx.user.findUnique({
      where: { tenantId_email: { tenantId: a.tenantId, email: 'student.sample@example.org' } },
    });
    ids.alphaStudent1 = s1.id;
  });
  await asTenant(admin, b.tenantId, async (tx) => {
    const s = await tx.user.findUnique({
      where: { tenantId_email: { tenantId: b.tenantId, email: 'student.sample@example.org' } },
    });
    ids.betaStudent = s.id;
  });

  return {
    alpha: { id: a.tenantId, code: alphaCfg.school.code },
    beta: { id: b.tenantId, code: betaCfg.school.code },
    alphaOther: { parentEmail: 'parent.two@example.org', studentId: ids.alphaStudent2! },
    ids,
  };
}

export interface TestApp {
  app: INestApplication;
  http: ReturnType<typeof request>;
  otp: CapturingOtpSender;
  close(): Promise<void>;
}

@Controller('v1/_probe')
export class ProbeController {
  @Get('fees')
  @RequireModule('fees')
  fees() {
    return { ok: true };
  }
}

export async function createTestApp(
  extraControllers: Type<unknown>[] = [ProbeController],
): Promise<TestApp> {
  const { appUrl } = inject('dbUrls');
  process.env.DATABASE_URL = appUrl;
  process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret-123';
  process.env.NODE_ENV = 'test';
  process.env.THROTTLE_DISABLED = '1';

  const otp = new CapturingOtpSender();
  const mod: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
    controllers: extraControllers,
  })
    .overrideProvider(OTP_SENDER)
    .useValue(otp)
    .overrideProvider(TENANT_CACHE_TTL_MS)
    .useValue(0)
    .compile();
  const app = mod.createNestApplication();
  await app.init();
  return { app, http: request(app.getHttpServer()), otp, close: () => app.close() };
}

export async function login(
  t: TestApp,
  schoolCode: string,
  identifier: string,
  password = PASSWORD,
) {
  const step1 = await t.http
    .post('/v1/auth/login')
    .set('x-school-code', schoolCode)
    .send({ identifier, password });
  if (step1.status !== 200)
    throw new Error(`login failed: ${step1.status} ${JSON.stringify(step1.body)}`);
  const step2 = await t.http
    .post('/v1/auth/verify-otp')
    .set('x-school-code', schoolCode)
    .send({ challengeId: step1.body.challengeId, code: t.otp.last().code });
  if (step2.status !== 200) throw new Error(`otp failed: ${step2.status}`);
  return step2.body as { accessToken: string; refreshToken: string };
}

export const as = (t: TestApp, schoolCode: string, token: string) => ({
  get: (url: string) =>
    t.http.get(url).set('x-school-code', schoolCode).set('authorization', `Bearer ${token}`),
});
