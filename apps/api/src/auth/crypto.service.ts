import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import type { Role, StaffType } from '@digischools/domain';
import { ENV, type Env } from '../config/env.js';

export interface AccessClaims {
  sub: string;
  tid: string;
  role: Role;
  st: StaffType | null;
}

@Injectable()
export class CryptoService {
  private readonly key: Uint8Array;
  // Valid argon2id hash used to equalise timing when the user does not exist.
  private dummyHash?: Promise<string>;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.key = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
  }

  hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verifyPassword(hash: string | null, password: string): Promise<boolean> {
    if (!hash) {
      this.dummyHash ??= argon2.hash('dummy-password', { type: argon2.argon2id });
      await argon2.verify(await this.dummyHash, password);
      return false;
    }
    return argon2.verify(hash, password);
  }

  async signAccess(claims: AccessClaims): Promise<string> {
    return new SignJWT({ tid: claims.tid, role: claims.role, st: claims.st })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuer('digischools')
      .setIssuedAt()
      .setExpirationTime(`${this.env.JWT_ACCESS_TTL_SECONDS}s`)
      .sign(this.key);
  }

  async verifyAccess(token: string): Promise<AccessClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        issuer: 'digischools',
      });
      if (!payload.sub || typeof payload.tid !== 'string') return null;
      return {
        sub: payload.sub,
        tid: payload.tid,
        role: payload.role as Role,
        st: (payload.st as StaffType | null) ?? null,
      };
    } catch {
      return null;
    }
  }

  newRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hashToken(token) };
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  newOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  hashOtp(challengeId: string, code: string): string {
    return createHmac('sha256', this.key).update(`${challengeId}:${code}`).digest('hex');
  }

  safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    return ab.length === bb.length && timingSafeEqual(ab, bb);
  }
}
