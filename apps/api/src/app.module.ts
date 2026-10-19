import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditService } from './audit/audit.service.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { CryptoService } from './auth/crypto.service.js';
import { AuthGuard, PermissionsGuard } from './auth/guards.js';
import { ConsoleOtpSender, OTP_SENDER } from './auth/otp-sender.js';
import { ENV, loadEnv } from './config/env.js';
import { TenantDb } from './db/tenant-db.js';
import { HealthController } from './health.controller.js';
import { PublicController } from './tenancy/public.controller.js';
import { TENANT_CACHE_TTL_MS, TenantService } from './tenancy/tenant.service.js';
import { TenantMiddleware } from './tenancy/tenant.middleware.js';
import { MeController } from './users/me.controller.js';

@Module({
  imports: [
    // TODO(phase 6): back the throttler with Redis so limits hold across API instances.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
      skipIf: () => process.env.THROTTLE_DISABLED === '1',
    }),
  ],
  controllers: [HealthController, PublicController, AuthController, MeController],
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    { provide: TENANT_CACHE_TTL_MS, useValue: 30_000 },
    { provide: OTP_SENDER, useClass: ConsoleOtpSender },
    TenantDb,
    TenantService,
    CryptoService,
    AuditService,
    AuthService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
