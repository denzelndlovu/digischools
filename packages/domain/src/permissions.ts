export const ROLES = ['ADMIN', 'STAFF', 'STUDENT', 'PARENT'] as const;
export type Role = (typeof ROLES)[number];

/** Config `staffTypes` supplies display labels in this order. */
export const STAFF_TYPES = ['TEACHER', 'PE_COACH', 'CLUB_COORDINATOR', 'SUPPORT_STAFF'] as const;
export type StaffType = (typeof STAFF_TYPES)[number];

export type ModuleKey =
  | 'keyCardAttendance'
  | 'fees'
  | 'tuckshopWallet'
  | 'assignments'
  | 'reportCards'
  | 'sportsAndClubs'
  | 'newslettersAndMagazines'
  | 'helpDesk'
  | 'staffLeave'
  | 'library'
  | 'transport'
  | 'sickBay'
  | 'boarding';

/** Permission catalogue: `resource:action`. `module` null means always available. */
export const PERMISSIONS = {
  // Core
  'users:read': null,
  'users:write': null,
  'users:import': null,
  'users:link-guardian': null,
  'audit:read': null,
  'modules:manage': null,
  'theme:manage': null,
  'data:export': null,
  'announcements:read': 'newslettersAndMagazines',
  'announcements:write': 'newslettersAndMagazines',
  'news:read': 'newslettersAndMagazines',
  'news:write': 'newslettersAndMagazines',
  'magazine:submit': 'newslettersAndMagazines',
  'magazine:review': 'newslettersAndMagazines',
  // Key cards and attendance
  'cards:manage': 'keyCardAttendance',
  'readers:manage': 'keyCardAttendance',
  'attendance:read-all': 'keyCardAttendance',
  'attendance:read-class': 'keyCardAttendance',
  'attendance:read-own': 'keyCardAttendance',
  'attendance:read-child': 'keyCardAttendance',
  'attendance:override': 'keyCardAttendance',
  'clock:self': 'keyCardAttendance',
  // Academics
  'classes:read': null,
  'classes:write': null,
  'timetable:read-own': null,
  'assignments:manage': 'assignments',
  'assignments:submit': 'assignments',
  'assignments:read-own': 'assignments',
  'assignments:read-child': 'assignments',
  'reports:enter-marks': 'reportCards',
  'reports:publish': 'reportCards',
  'reports:read-own': 'reportCards',
  'reports:read-child': 'reportCards',
  // Fees and wallet
  'fees:manage': 'fees',
  'fees:read-child': 'fees',
  'wallet:read-own': 'tuckshopWallet',
  'wallet:read-child': 'tuckshopWallet',
  'wallet:topup-child': 'tuckshopWallet',
  'wallet:set-limit': 'tuckshopWallet',
  'wallet:pos': 'tuckshopWallet',
  'wallet:refund': 'tuckshopWallet',
  'wallet:reports': 'tuckshopWallet',
  // Sports and clubs
  'sports:manage': 'sportsAndClubs',
  'sports:read': 'sportsAndClubs',
  'clubs:manage': 'sportsAndClubs',
  'clubs:join': 'sportsAndClubs',
  // Help desk
  'tickets:create': 'helpDesk',
  'tickets:read-own': 'helpDesk',
  'tickets:queue': 'helpDesk',
  // Staff admin
  'leave:request': 'staffLeave',
  'leave:approve': 'staffLeave',
} as const satisfies Record<string, ModuleKey | null>;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function moduleFor(permission: Permission): ModuleKey | null {
  return PERMISSIONS[permission];
}

const ADMIN: Permission[] = ALL_PERMISSIONS.filter(
  (p) =>
    !p.endsWith(':read-own') &&
    !p.endsWith(':read-child') &&
    ![
      'assignments:submit',
      'wallet:topup-child',
      'wallet:set-limit',
      'wallet:pos',
      'clubs:join',
    ].includes(p) &&
    ![
      'clock:self',
      'attendance:read-class',
      'leave:request',
      'magazine:submit',
      'tickets:create',
    ].includes(p),
);

const STAFF_COMMON: Permission[] = [
  'users:read',
  'classes:read',
  'timetable:read-own',
  'clock:self',
  'leave:request',
  'announcements:read',
  'announcements:write',
  'news:read',
  'news:write',
  'tickets:create',
  'tickets:read-own',
  'sports:read',
];

export const STAFF_TYPE_PERMISSIONS: Record<StaffType, Permission[]> = {
  TEACHER: [
    'attendance:read-class',
    'assignments:manage',
    'reports:enter-marks',
    'magazine:review',
  ],
  PE_COACH: ['sports:manage'],
  CLUB_COORDINATOR: ['clubs:manage'],
  SUPPORT_STAFF: ['tickets:queue', 'wallet:pos'],
};

export const ROLE_PERMISSIONS: Record<Exclude<Role, 'STAFF'>, Permission[]> = {
  ADMIN,
  STUDENT: [
    'classes:read',
    'timetable:read-own',
    'attendance:read-own',
    'assignments:submit',
    'assignments:read-own',
    'reports:read-own',
    'wallet:read-own',
    'clubs:join',
    'sports:read',
    'news:read',
    'announcements:read',
    'magazine:submit',
    'tickets:create',
    'tickets:read-own',
  ],
  PARENT: [
    'attendance:read-child',
    'assignments:read-child',
    'reports:read-child',
    'fees:read-child',
    'wallet:read-child',
    'wallet:topup-child',
    'wallet:set-limit',
    'news:read',
    'announcements:read',
    'sports:read',
    'tickets:create',
    'tickets:read-own',
  ],
};

export interface Principal {
  role: Role;
  staffType?: StaffType | null;
}

/** Permissions granted by role and staff type, before module flags are applied. */
export function permissionsFor(p: Principal): ReadonlySet<Permission> {
  if (p.role === 'STAFF') {
    const extra = p.staffType ? STAFF_TYPE_PERMISSIONS[p.staffType] : [];
    return new Set([...STAFF_COMMON, ...extra]);
  }
  return new Set(ROLE_PERMISSIONS[p.role]);
}

export type EnabledModules = Partial<Record<ModuleKey, boolean>>;

export function isModuleOn(modules: EnabledModules, module: ModuleKey | null): boolean {
  return module === null || modules[module] === true;
}

export function can(p: Principal, permission: Permission, modules: EnabledModules): boolean {
  return permissionsFor(p).has(permission) && isModuleOn(modules, moduleFor(permission));
}
