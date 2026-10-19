import { z } from 'zod';

export const MODULE_KEYS = [
  'keyCardAttendance',
  'fees',
  'tuckshopWallet',
  'assignments',
  'reportCards',
  'sportsAndClubs',
  'newslettersAndMagazines',
  'helpDesk',
  'staffLeave',
  'library',
  'transport',
  'sickBay',
  'boarding',
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const LANGUAGES = ['en', 'sn', 'nd'] as const;
export const READER_KINDS = ['gate', 'classroom', 'sports-field', 'tuckshop'] as const;
export const STAFF_TYPES_DEFAULT = [
  'Teacher',
  'PE and sports coach',
  'Clubs coordinator',
  'Support staff',
] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a 6-digit hex color like #1B7A4B');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM (24h)');
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase letters, digits and dashes');
const hostname = z
  .string()
  .regex(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i, 'must be a valid hostname without scheme or path');
const overrideMap = z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), hex);

const moduleShape = Object.fromEntries(MODULE_KEYS.map((k) => [k, z.boolean()])) as Record<
  ModuleKey,
  z.ZodBoolean
>;

export const tenantConfigSchema = z
  .object({
    school: z.object({
      code: slug.min(2).max(40),
      name: z.string().min(1),
      shortName: z.string().min(1),
      motto: z.string(),
      country: z.string().length(2),
      timezone: z.string().refine((tz) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      }, 'must be a valid IANA timezone'),
      domain: hostname,
      customDomain: hostname.nullable(),
      contact: z.object({ email: z.string().email(), phone: z.string().regex(/^\+\d{6,15}$/) }),
    }),
    branding: z.object({
      logo: z.string().min(1),
      favicon: z.string().min(1),
      appIcon: z.string().min(1),
      colors: z.object({
        primary: hex,
        accent: hex,
        overrides: z.object({ light: overrideMap, dark: overrideMap }),
      }),
      fonts: z.object({ heading: z.string().min(1), body: z.string().min(1) }),
      cornerRadius: z.enum(['none', 'sm', 'md', 'lg', 'full']),
      mobile: z.object({
        brandedBuild: z.boolean(),
        bundleId: z.string().regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/i),
      }),
    }),
    locale: z.object({
      languages: z.array(z.enum(LANGUAGES)).min(1),
      defaultLanguage: z.enum(LANGUAGES),
      currency: z.string().regex(/^[A-Z]{3}$/),
      dateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']),
    }),
    academics: z.object({
      formNames: z.array(z.string().min(1)).min(1),
      classLabels: z.array(z.string().min(1)).min(1),
      terms: z.array(z.object({ name: z.string().min(1), start: isoDate, end: isoDate })).min(1),
      gradingScale: z
        .array(z.object({ grade: z.string().min(1), min: z.number().min(0).max(100) }))
        .min(1),
      similarityWarningThreshold: z.number().min(0).max(100),
    }),
    attendance: z.object({
      schoolStart: time,
      lateAfterMinutes: z.number().int().min(0).max(240),
      readers: z.array(z.enum(READER_KINDS)),
      notifyParentOnTap: z.boolean(),
    }),
    billing: z.object({
      perStudentTermFee: z.number().nonnegative().nullable(),
      parentSubscription: z.object({
        enabled: z.boolean(),
        price: z.number().nonnegative().nullable(),
        period: z.enum(['term', 'year']),
      }),
      paymentProviders: z.array(z.string().min(1)).min(1),
      receiptFooter: z.string(),
    }),
    wallet: z.object({
      enabled: z.boolean(),
      dailyLimitOptions: z.array(z.number().positive()).min(1),
      defaultDailyLimit: z.number().positive(),
      topUpAmounts: z.array(z.number().positive()).min(1),
    }),
    modules: z.object(moduleShape),
    staffTypes: z
      .array(z.string().min(1))
      .length(
        4,
        'labels for: teacher, PE and sports coach, clubs coordinator, support staff (in that order)',
      ),
    notifications: z.object({ push: z.boolean(), sms: z.boolean(), email: z.boolean() }),
    legal: z.object({ privacyPolicyUrl: z.string(), termsUrl: z.string() }),
  })
  .superRefine((cfg, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });

    if (!cfg.locale.languages.includes(cfg.locale.defaultLanguage)) {
      issue(['locale', 'defaultLanguage'], 'must be one of locale.languages');
    }

    const terms = cfg.academics.terms;
    terms.forEach((t, i) => {
      if (t.end < t.start) issue(['academics', 'terms', i, 'end'], 'must not be before start');
      const prev = terms[i - 1];
      if (prev && t.start <= prev.end) {
        issue(['academics', 'terms', i, 'start'], 'overlaps or precedes the previous term');
      }
    });

    const scale = cfg.academics.gradingScale;
    if (!scale.some((g) => g.min === 0)) {
      issue(['academics', 'gradingScale'], 'must include a grade with min 0');
    }
    scale.forEach((g, i) => {
      const prev = scale[i - 1];
      if (prev && g.min >= prev.min) {
        issue(['academics', 'gradingScale', i, 'min'], 'must be strictly descending');
      }
    });

    if (!cfg.wallet.dailyLimitOptions.includes(cfg.wallet.defaultDailyLimit)) {
      issue(['wallet', 'defaultDailyLimit'], 'must be one of wallet.dailyLimitOptions');
    }
    if (cfg.modules.tuckshopWallet && !cfg.wallet.enabled) {
      issue(['wallet', 'enabled'], 'must be true when modules.tuckshopWallet is on');
    }
    if (cfg.modules.tuckshopWallet && !cfg.modules.fees) {
      issue(['modules', 'tuckshopWallet'], 'requires modules.fees (top-ups use payments)');
    }
  });

export type TenantConfig = z.infer<typeof tenantConfigSchema>;

export type PublicTenantConfig = Pick<TenantConfig, 'branding' | 'locale' | 'modules'> & {
  school: Pick<TenantConfig['school'], 'code' | 'name' | 'shortName' | 'motto' | 'timezone'>;
  academics: Pick<TenantConfig['academics'], 'formNames' | 'classLabels'>;
  legal: TenantConfig['legal'];
};

/** Subset safe to expose without authentication. Excludes billing, contact and notification settings. */
export function toPublicConfig(cfg: TenantConfig): PublicTenantConfig {
  const { code, name, shortName, motto, timezone } = cfg.school;
  return {
    school: { code, name, shortName, motto, timezone },
    branding: cfg.branding,
    locale: cfg.locale,
    modules: cfg.modules,
    academics: { formNames: cfg.academics.formNames, classLabels: cfg.academics.classLabels },
    legal: cfg.legal,
  };
}

export function isModuleEnabled(cfg: Pick<TenantConfig, 'modules'>, key: ModuleKey): boolean {
  return cfg.modules[key] === true;
}
