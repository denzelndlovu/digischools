import { randomBytes } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import type { TenantConfig } from '@digischools/config-schema';

export interface ProvisionOptions {
  adminEmail: string;
  adminName?: string;
  /** Generated when omitted; returned once so the CLI can print it. */
  adminPassword?: string;
  sampleData?: boolean;
  /** Password for the sample users. Random per user when omitted. */
  samplePassword?: string;
}

export interface ProvisionResult {
  tenantId: string;
  created: boolean;
  credentials: Array<{ role: string; email: string; password: string }>;
  hosts: string[];
}

const randomPassword = () => randomBytes(12).toString('base64url');
const hash = (p: string) => argon2.hash(p, { type: argon2.argon2id });

/** Owner-role client for provisioning. Not for request handling. */
export const createAdminClient = (url: string) => new PrismaClient({ datasourceUrl: url });

/**
 * Creates or updates a tenant from a validated config. Idempotent: existing users are never modified
 * and their passwords are not reissued. Pass an owner-role client (it still sets the tenant context).
 */
export async function provisionTenant(
  prisma: PrismaClient,
  config: TenantConfig,
  opts: ProvisionOptions,
): Promise<ProvisionResult> {
  const existing = await prisma.tenant.findUnique({ where: { code: config.school.code } });
  const configJson = config as unknown as Prisma.InputJsonValue;
  const tenant = existing
    ? await prisma.tenant.update({
        where: { id: existing.id },
        data: { name: config.school.name, config: configJson, configVersion: { increment: 1 } },
      })
    : await prisma.tenant.create({
        data: { code: config.school.code, name: config.school.name, config: configJson },
      });

  const hosts = [config.school.domain, config.school.customDomain]
    .filter((h): h is string => !!h)
    .map((h) => h.toLowerCase());
  for (const host of hosts) {
    await prisma.tenantDomain.upsert({
      where: { host },
      update: {},
      create: {
        tenantId: tenant.id,
        host,
        isCustom: host === config.school.customDomain?.toLowerCase(),
      },
    });
  }

  const credentials: ProvisionResult['credentials'] = [];

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;

      const ensureUser = async (
        role: 'ADMIN' | 'STAFF' | 'STUDENT' | 'PARENT',
        email: string,
        displayName: string,
        password?: string,
      ) => {
        const found = await tx.user.findUnique({
          where: { tenantId_email: { tenantId: tenant.id, email } },
        });
        if (found) return { user: found, isNew: false };
        const pw = password ?? randomPassword();
        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email,
            displayName,
            role,
            passwordHash: await hash(pw),
            locale: config.locale.defaultLanguage,
          },
        });
        credentials.push({ role, email, password: pw });
        return { user, isNew: true };
      };

      await ensureUser(
        'ADMIN',
        opts.adminEmail.toLowerCase(),
        opts.adminName ?? 'School Administrator',
        opts.adminPassword,
      );

      for (const t of config.academics.terms) {
        await tx.term.upsert({
          where: {
            tenantId_academicYear_name: {
              tenantId: tenant.id,
              academicYear: Number(t.start.slice(0, 4)),
              name: t.name,
            },
          },
          update: { startDate: new Date(t.start), endDate: new Date(t.end) },
          create: {
            tenantId: tenant.id,
            name: t.name,
            academicYear: Number(t.start.slice(0, 4)),
            startDate: new Date(t.start),
            endDate: new Date(t.end),
          },
        });
      }

      if (opts.sampleData) {
        // All names are fictional. Addresses use the reserved example.org domain.
        const teacher = await ensureUser(
          'STAFF',
          'teacher.sample@example.org',
          'Sample Teacher',
          opts.samplePassword,
        );
        if (teacher.isNew) {
          await tx.staffProfile.create({
            data: {
              tenantId: tenant.id,
              userId: teacher.user.id,
              staffType: 'TEACHER',
              employeeNo: 'T-0001',
            },
          });
        }
        const student = await ensureUser(
          'STUDENT',
          'student.sample@example.org',
          'Sample Student',
          opts.samplePassword,
        );
        if (student.isNew) {
          await tx.studentProfile.create({
            data: {
              tenantId: tenant.id,
              userId: student.user.id,
              admissionNo: 'S-0001',
              formName: config.academics.formNames[0]!,
              classLabel: config.academics.classLabels[0],
            },
          });
        }
        const parent = await ensureUser(
          'PARENT',
          'parent.sample@example.org',
          'Sample Parent',
          opts.samplePassword,
        );
        if (parent.isNew || student.isNew) {
          await tx.guardianLink.upsert({
            where: {
              tenantId_parentUserId_studentUserId: {
                tenantId: tenant.id,
                parentUserId: parent.user.id,
                studentUserId: student.user.id,
              },
            },
            update: {},
            create: {
              tenantId: tenant.id,
              parentUserId: parent.user.id,
              studentUserId: student.user.id,
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          action: existing ? 'tenant.updated' : 'tenant.created',
          entityType: 'tenant',
          entityId: tenant.id,
        },
      });
    },
    { timeout: 60_000 },
  );

  return { tenantId: tenant.id, created: !existing, credentials, hosts };
}
