import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ENV, type Env } from '../config/env.js';
import { TenantDb, type Tx } from '../db/tenant-db.js';
import { AuditService } from '../audit/audit.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.service.js';
import { CryptoService } from './crypto.service.js';
import { OTP_SENDER, OtpSender, type OtpChannel } from './otp-sender.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const maskDestination = (channel: OtpChannel, dest: string) =>
  channel === 'email'
    ? dest.replace(/^(.).*(@.*)$/, '$1***$2')
    : dest.replace(/^(\+?\d{3}).*(\d{2})$/, '$1***$2');

const invalid = () => new UnauthorizedException('Invalid credentials');

@Injectable()
export class AuthService {
  constructor(
    @Inject(TenantDb) private readonly db: TenantDb,
    @Inject(CryptoService) private readonly crypto: CryptoService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OTP_SENDER) private readonly sender: OtpSender,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Step 1: check the password, then send a one-time code. */
  async login(tenant: ResolvedTenant, identifier: string, password: string) {
    const ident = identifier.trim();
    const where = ident.includes('@')
      ? { tenantId_email: { tenantId: tenant.id, email: ident.toLowerCase() } }
      : { tenantId_phone: { tenantId: tenant.id, phone: ident } };

    const user = await this.db.run(tenant.id, (tx) => tx.user.findUnique({ where }));
    const passwordOk = await this.crypto.verifyPassword(user?.passwordHash ?? null, password);
    if (!user || !passwordOk || user.status !== 'ACTIVE') throw invalid();

    const n = tenant.config.notifications;
    const channel: OtpChannel | null =
      n.email && user.email ? 'email' : n.sms && user.phone ? 'sms' : null;
    if (!channel) {
      throw new UnprocessableEntityException(
        'No one-time code channel is available for this account',
      );
    }
    const destination = (channel === 'email' ? user.email : user.phone)!;

    const challengeId = randomUUID();
    const code = this.crypto.newOtp();
    await this.db.run(tenant.id, (tx) =>
      tx.otpCode.create({
        data: {
          id: challengeId,
          tenantId: tenant.id,
          userId: user.id,
          purpose: 'LOGIN',
          codeHash: this.crypto.hashOtp(challengeId, code),
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
        },
      }),
    );
    await this.sender.send(channel, destination, code, tenant.name);
    return { challengeId, channel, destination: maskDestination(channel, destination) };
  }

  /** Step 2: exchange the code for tokens. Failed attempts are committed before the error is thrown. */
  async verifyOtp(
    tenant: ResolvedTenant,
    challengeId: string,
    code: string,
    deviceName: string | undefined,
    req?: Request,
  ): Promise<TokenPair> {
    const outcome = await this.db.run(tenant.id, async (tx) => {
      const otp = await tx.otpCode.findUnique({
        where: { tenantId_id: { tenantId: tenant.id, id: challengeId } },
      });
      if (
        !otp ||
        otp.consumedAt ||
        otp.expiresAt < new Date() ||
        otp.attempts >= OTP_MAX_ATTEMPTS
      ) {
        return null;
      }
      // Count the attempt first; only one concurrent request can win a given attempt slot.
      const bumped = await tx.otpCode.updateMany({
        where: { tenantId: tenant.id, id: otp.id, attempts: otp.attempts, consumedAt: null },
        data: { attempts: { increment: 1 } },
      });
      if (bumped.count !== 1) return null;
      if (!this.crypto.safeEqual(otp.codeHash, this.crypto.hashOtp(otp.id, code))) return null;

      await tx.otpCode.update({
        where: { tenantId_id: { tenantId: tenant.id, id: otp.id } },
        data: { consumedAt: new Date() },
      });
      const user = await tx.user.findUnique({
        where: { tenantId_id: { tenantId: tenant.id, id: otp.userId } },
        include: { staffProfile: true },
      });
      if (!user || user.status !== 'ACTIVE') return null;
      await tx.user.update({
        where: { tenantId_id: { tenantId: tenant.id, id: user.id } },
        data: { lastLoginAt: new Date() },
      });
      await this.audit.record(tx, tenant.id, {
        actorUserId: user.id,
        action: 'auth.login',
        entityType: 'user',
        entityId: user.id,
        req,
      });
      const tokens = await this.issue(tx, tenant.id, user, randomUUID(), deviceName);
      return tokens;
    });
    if (!outcome) throw invalid();
    return outcome;
  }

  async refresh(tenant: ResolvedTenant, refreshToken: string): Promise<TokenPair> {
    const hash = this.crypto.hashToken(refreshToken);
    const outcome = await this.db.run(tenant.id, async (tx) => {
      const row = await tx.refreshToken.findUnique({ where: { tokenHash: hash } });
      if (!row) return null;
      if (row.usedAt || row.revokedAt) {
        // Reuse of a rotated token suggests theft: revoke the whole family.
        await tx.refreshToken.updateMany({
          where: { tenantId: tenant.id, familyId: row.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return null;
      }
      if (row.expiresAt < new Date()) return null;
      const claimed = await tx.refreshToken.updateMany({
        where: { tenantId: tenant.id, id: row.id, usedAt: null, revokedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) return null;
      const user = await tx.user.findUnique({
        where: { tenantId_id: { tenantId: tenant.id, id: row.userId } },
        include: { staffProfile: true },
      });
      if (!user || user.status !== 'ACTIVE') return null;
      return this.issue(tx, tenant.id, user, row.familyId, row.deviceName ?? undefined);
    });
    if (!outcome) throw new UnauthorizedException('Invalid refresh token');
    return outcome;
  }

  async logout(tenant: ResolvedTenant, refreshToken: string): Promise<void> {
    const hash = this.crypto.hashToken(refreshToken);
    await this.db.run(tenant.id, async (tx) => {
      const row = await tx.refreshToken.findUnique({ where: { tokenHash: hash } });
      if (!row) return;
      await tx.refreshToken.updateMany({
        where: { tenantId: tenant.id, familyId: row.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  private async issue(
    tx: Tx,
    tenantId: string,
    user: { id: string; role: any; staffProfile: { staffType: any } | null },
    familyId: string,
    deviceName?: string,
  ): Promise<TokenPair> {
    const rt = this.crypto.newRefreshToken();
    await tx.refreshToken.create({
      data: {
        tenantId,
        userId: user.id,
        familyId,
        tokenHash: rt.hash,
        expiresAt: new Date(Date.now() + this.env.REFRESH_TTL_DAYS * 86_400_000),
        deviceName,
      },
    });
    const accessToken = await this.crypto.signAccess({
      sub: user.id,
      tid: tenantId,
      role: user.role,
      st: user.staffProfile?.staffType ?? null,
    });
    return { accessToken, refreshToken: rt.token, expiresIn: this.env.JWT_ACCESS_TTL_SECONDS };
  }
}
