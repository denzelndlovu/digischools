import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ModuleKey, Permission, Role, StaffType } from '@digischools/domain';

export interface AuthUser {
  id: string;
  tenantId: string;
  role: Role;
  staffType: StaffType | null;
  displayName: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      tenant?: import('../tenancy/tenant.service.js').ResolvedTenant;
    }
  }
}

export const IS_PUBLIC = 'isPublic';
export const REQUIRED_PERMISSION = 'requiredPermission';
export const REQUIRED_MODULE = 'requiredModule';

export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Requires the permission (and, through the catalogue, its module flag). */
export const Require = (permission: Permission) => SetMetadata(REQUIRED_PERMISSION, permission);
/** Requires a module flag without a specific permission. Returns 403 when off. */
export const RequireModule = (module: ModuleKey) => SetMetadata(REQUIRED_MODULE, module);

export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
