import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { can, type Permission, type ModuleKey } from '@digischools/domain';
import { TenantDb } from '../db/tenant-db.js';
import type { ResolvedTenant } from '../tenancy/tenant.service.js';
import { CryptoService } from './crypto.service.js';
import { IS_PUBLIC, REQUIRED_MODULE, REQUIRED_PERMISSION } from './decorators.js';

export const CurrentTenant = createParamDecorator(
  (_d: unknown, ctx: ExecutionContext): ResolvedTenant => {
    const tenant = ctx.switchToHttp().getRequest<Request>().tenant;
    if (!tenant) throw new NotFoundException('Unknown school');
    return tenant;
  },
);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(CryptoService) private readonly crypto: CryptoService,
    @Inject(TenantDb) private readonly db: TenantDb,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.tenant) throw new NotFoundException('Unknown school');

    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const claims = token ? await this.crypto.verifyAccess(token) : null;
    if (!claims) throw new UnauthorizedException();
    // A token issued by one school is never valid at another.
    if (claims.tid !== req.tenant.id) throw new UnauthorizedException();

    const user = await this.db.run(req.tenant.id, (tx) =>
      tx.user.findUnique({
        where: { tenantId_id: { tenantId: req.tenant!.id, id: claims.sub } },
        include: { staffProfile: true },
      }),
    );
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException();

    req.user = {
      id: user.id,
      tenantId: user.tenantId,
      role: user.role,
      staffType: user.staffProfile?.staffType ?? null,
      displayName: user.displayName,
    };
    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(
      REQUIRED_PERMISSION,
      targets,
    );
    const module = this.reflector.getAllAndOverride<ModuleKey | undefined>(
      REQUIRED_MODULE,
      targets,
    );
    if (!permission && !module) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const user = req.user;
    const tenant = req.tenant;
    if (!user || !tenant) throw new ForbiddenException();

    const modules = tenant.config.modules;
    if (module && modules[module] !== true) throw new ForbiddenException('Module is not enabled');
    if (permission && !can(user, permission, modules)) throw new ForbiddenException();
    return true;
  }
}
