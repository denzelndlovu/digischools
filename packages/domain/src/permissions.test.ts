import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, can, permissionsFor, type EnabledModules } from './index.js';

const all: EnabledModules = new Proxy({}, { get: () => true }) as EnabledModules;
const none: EnabledModules = {};

describe('permission matrix', () => {
  it('admin can manage but never acts as student or parent', () => {
    const admin = { role: 'ADMIN' } as const;
    expect(can(admin, 'users:write', none)).toBe(true);
    expect(can(admin, 'reports:publish', all)).toBe(true);
    expect(can(admin, 'assignments:submit', all)).toBe(false);
    expect(can(admin, 'wallet:topup-child', all)).toBe(false);
  });

  it('staff abilities depend on staff type', () => {
    const teacher = { role: 'STAFF', staffType: 'TEACHER' } as const;
    const coach = { role: 'STAFF', staffType: 'PE_COACH' } as const;
    const support = { role: 'STAFF', staffType: 'SUPPORT_STAFF' } as const;
    expect(can(teacher, 'assignments:manage', all)).toBe(true);
    expect(can(coach, 'assignments:manage', all)).toBe(false);
    expect(can(coach, 'sports:manage', all)).toBe(true);
    expect(can(support, 'tickets:queue', all)).toBe(true);
    expect(can(teacher, 'tickets:queue', all)).toBe(false);
    expect(can(teacher, 'users:write', all)).toBe(false);
    for (const s of [teacher, coach, support]) {
      expect(can(s, 'clock:self', all)).toBe(true);
      expect(can(s, 'leave:request', all)).toBe(true);
    }
  });

  it('staff without a type get only common permissions', () => {
    expect(can({ role: 'STAFF' }, 'assignments:manage', all)).toBe(false);
    expect(can({ role: 'STAFF' }, 'news:write', all)).toBe(true);
  });

  it('students and parents only get own/child scoped permissions', () => {
    const student = { role: 'STUDENT' } as const;
    const parent = { role: 'PARENT' } as const;
    expect(can(student, 'attendance:read-own', all)).toBe(true);
    expect(can(student, 'attendance:read-all', all)).toBe(false);
    expect(can(parent, 'attendance:read-child', all)).toBe(true);
    expect(can(parent, 'attendance:read-own', all)).toBe(false);
    expect(can(parent, 'wallet:topup-child', all)).toBe(true);
    expect(can(student, 'wallet:topup-child', all)).toBe(false);
  });

  it('a disabled module denies every permission tied to it', () => {
    const modules: EnabledModules = { fees: false };
    expect(can({ role: 'PARENT' }, 'fees:read-child', modules)).toBe(false);
    expect(can({ role: 'PARENT' }, 'fees:read-child', { fees: true })).toBe(true);
    expect(can({ role: 'ADMIN' }, 'users:read', modules)).toBe(true);
  });

  it('only permissions in the catalogue are granted', () => {
    const cat = new Set(ALL_PERMISSIONS);
    for (const p of [
      { role: 'ADMIN' },
      { role: 'STUDENT' },
      { role: 'PARENT' },
      { role: 'STAFF', staffType: 'TEACHER' },
    ] as const) {
      for (const perm of permissionsFor(p)) expect(cat.has(perm)).toBe(true);
    }
  });
});
