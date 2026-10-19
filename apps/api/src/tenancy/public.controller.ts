import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
import { toPublicConfig } from '@digischools/config-schema';
import { Public } from '../auth/decorators.js';
import { CurrentTenant } from '../auth/guards.js';
import { TenantService, type ResolvedTenant } from './tenant.service.js';

@Controller('v1/public')
@Public()
export class PublicController {
  constructor(@Inject(TenantService) private readonly tenants: TenantService) {}

  /** Web: tenant resolved from the Host / X-Forwarded-Host header or X-School-Code. */
  @Get('config')
  hostConfig(@CurrentTenant() tenant: ResolvedTenant) {
    return toPublicConfig(tenant.config);
  }

  /** Mobile first launch: school code in, branding and module flags out. */
  @Get('tenants/:code/config')
  async config(@Param('code') code: string) {
    const tenant = await this.tenants.byCode(code);
    if (!tenant) throw new NotFoundException('Unknown school');
    return toPublicConfig(tenant.config);
  }
}
