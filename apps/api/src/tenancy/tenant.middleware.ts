import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { TenantService } from './tenant.service.js';

/** Resolves the tenant from the X-School-Code header (mobile) or the Host header (web). Never fails; guards decide. */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(@Inject(TenantService) private readonly tenants: TenantService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    try {
      const code = req.header('x-school-code');
      const forwarded = req.header('x-forwarded-host')?.split(',')[0]?.trim();
      const host = forwarded || req.headers.host;
      const tenant = code
        ? await this.tenants.byCode(code)
        : host
          ? await this.tenants.byHost(host)
          : null;
      if (tenant) req.tenant = tenant;
      next();
    } catch (e) {
      next(e);
    }
  }
}
