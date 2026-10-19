import { Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { ALL_PERMISSIONS, can } from '@digischools/domain';
import { TenantDb } from '../db/tenant-db.js';
import type { ResolvedTenant } from '../tenancy/tenant.service.js';
import { CurrentUser, type AuthUser } from '../auth/decorators.js';
import { CurrentTenant } from '../auth/guards.js';

const studentSelect = {
  id: true,
  displayName: true,
  studentProfile: { select: { admissionNo: true, formName: true, classLabel: true } },
} as const;

@Controller('v1')
export class MeController {
  constructor(@Inject(TenantDb) private readonly db: TenantDb) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser, @CurrentTenant() tenant: ResolvedTenant) {
    return {
      id: user.id,
      displayName: user.displayName,
      role: user.role,
      staffType: user.staffType,
      permissions: ALL_PERMISSIONS.filter((p) => can(user, p, tenant.config.modules)),
      modules: tenant.config.modules,
    };
  }

  /** Parents see only the children they are linked to. */
  @Get('me/children')
  children(@CurrentUser() user: AuthUser) {
    if (user.role !== 'PARENT') throw new ForbiddenException();
    return this.db.run(user.tenantId, async (tx) => {
      const links = await tx.guardianLink.findMany({
        where: { tenantId: user.tenantId, parentUserId: user.id },
        include: { student: { select: studentSelect } },
      });
      return links.map((l) => l.student);
    });
  }

  /** Visibility: admin and staff see all students; a student sees self; a parent sees linked children. */
  @Get('students/:id')
  async student(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const row = await this.db.run(user.tenantId, async (tx) => {
      let allowed = false;
      if (user.role === 'ADMIN' || user.role === 'STAFF') allowed = true;
      else if (user.role === 'STUDENT') allowed = user.id === id;
      else if (user.role === 'PARENT') {
        allowed =
          (await tx.guardianLink.count({
            where: { tenantId: user.tenantId, parentUserId: user.id, studentUserId: id },
          })) > 0;
      }
      if (!allowed) return null;
      return tx.user.findFirst({
        where: { id, tenantId: user.tenantId, role: 'STUDENT' },
        select: studentSelect,
      });
    });
    if (!row) throw new NotFoundException();
    return row;
  }
}
