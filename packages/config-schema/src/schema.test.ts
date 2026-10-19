import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ConfigValidationError,
  loadSchoolConfig,
  parseTenantConfig,
  toPublicConfig,
  type TenantConfig,
} from './index.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../config/schools');
const base = (): TenantConfig => structuredClone(loadSchoolConfig('_template', dir));

function problems(mutate: (c: any) => void): string[] {
  const c: any = base();
  mutate(c);
  try {
    parseTenantConfig(c);
    return [];
  } catch (e) {
    return (e as ConfigValidationError).problems;
  }
}

describe('tenant config schema', () => {
  it('accepts the template', () => {
    expect(base().school.code).toBe('sample-high');
  });

  it.each([
    ['bad hex', (c: any) => (c.branding.colors.primary = 'green'), 'branding.colors.primary'],
    ['unknown timezone', (c: any) => (c.school.timezone = 'Mars/Base'), 'school.timezone'],
    [
      'bad date',
      (c: any) => (c.academics.terms[0].start = '12/01/2027'),
      'academics.terms.0.start',
    ],
    [
      'overlapping terms',
      (c: any) => (c.academics.terms[1].start = '2027-04-01'),
      'academics.terms.1.start',
    ],
    ['end before start', (c: any) => (c.academics.terms[0].end = '2027-01-01'), 'terms.0.end'],
    ['default language missing', (c: any) => (c.locale.defaultLanguage = 'sn'), 'defaultLanguage'],
    ['unknown module', (c: any) => (c.modules.fees = 'yes'), 'modules.fees'],
    ['missing module', (c: any) => delete c.modules.helpDesk, 'modules.helpDesk'],
    ['no zero grade', (c: any) => (c.academics.gradingScale.pop(), 0), 'gradingScale'],
    ['unsorted scale', (c: any) => (c.academics.gradingScale[1].min = 80), 'gradingScale.1.min'],
    [
      'default limit not in options',
      (c: any) => (c.wallet.defaultDailyLimit = 4),
      'defaultDailyLimit',
    ],
    ['url as domain', (c: any) => (c.school.domain = 'https://x.com/a'), 'school.domain'],
    ['bad override', (c: any) => (c.branding.colors.overrides.light.primary = 'red'), 'overrides'],
  ])('rejects %s', (_n, mutate, where) => {
    expect(problems(mutate).join('\n')).toContain(where);
  });

  it('wallet module requires fees module', () => {
    expect(problems((c) => (c.modules.fees = false)).join()).toContain('modules.tuckshopWallet');
  });

  it('public config omits billing, contact and notifications', () => {
    const pub = toPublicConfig(base()) as Record<string, unknown>;
    expect(pub).not.toHaveProperty('billing');
    expect(pub).not.toHaveProperty('notifications');
    expect(JSON.stringify(pub)).not.toContain('office@example.org');
  });

  it('rejects mismatched code and file name', () => {
    expect(() => loadSchoolConfig('../etc', dir)).toThrow(ConfigValidationError);
  });
});
