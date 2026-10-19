import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe.js';
import type { ResolvedTenant } from '../tenancy/tenant.service.js';
import { AuthService } from './auth.service.js';
import { Public } from './decorators.js';
import { CurrentTenant } from './guards.js';

const loginBody = z.object({
  identifier: z.string().min(3).max(200),
  password: z.string().min(1).max(200),
});
const otpBody = z.object({
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
  deviceName: z.string().max(100).optional(),
});
const refreshBody = z.object({ refreshToken: z.string().min(20).max(200) });

@Controller('v1/auth')
@Public()
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(
    @CurrentTenant() tenant: ResolvedTenant,
    @Body(new ZodPipe(loginBody)) body: z.infer<typeof loginBody>,
  ) {
    return this.auth.login(tenant, body.identifier, body.password);
  }

  @Post('verify-otp')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verify(
    @CurrentTenant() tenant: ResolvedTenant,
    @Body(new ZodPipe(otpBody)) body: z.infer<typeof otpBody>,
    @Req() req: Request,
  ) {
    return this.auth.verifyOtp(tenant, body.challengeId, body.code, body.deviceName, req);
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  refresh(
    @CurrentTenant() tenant: ResolvedTenant,
    @Body(new ZodPipe(refreshBody)) body: z.infer<typeof refreshBody>,
  ) {
    return this.auth.refresh(tenant, body.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentTenant() tenant: ResolvedTenant,
    @Body(new ZodPipe(refreshBody)) body: z.infer<typeof refreshBody>,
  ) {
    await this.auth.logout(tenant, body.refreshToken);
  }
}
