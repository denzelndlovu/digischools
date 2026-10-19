import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  ConfigValidationError,
  loadSchoolConfig,
  type TenantConfig,
} from '@digischools/config-schema';
import {
  ThemeContrastError,
  UnknownTokenError,
  generateTheme,
  renderPreviewHtml,
  type Theme,
} from '@digischools/ui-tokens';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const schoolsDir = path.join(root, 'config/schools');
const envFile = path.join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const USAGE = `Usage:
  pnpm school:theme <school-code> [--out <file.html>]
  pnpm school:create <school-code> --admin-email <email> [--admin-name <name>] [--admin-password <pw>]
                     [--no-sample] [--sample-password <pw>]

<school-code> is the name of config/schools/<school-code>.json ("_template" for the template).`;

function fail(message: string, code = 1): never {
  console.error(message);
  process.exit(code);
}

function buildTheme(cfg: TenantConfig): Theme {
  const { primary, accent, overrides } = cfg.branding.colors;
  try {
    return generateTheme({ primary, accent, overrides });
  } catch (e) {
    if (e instanceof ThemeContrastError || e instanceof UnknownTokenError) fail(e.message);
    throw e;
  }
}

function load(code: string): TenantConfig {
  try {
    return loadSchoolConfig(code, schoolsDir);
  } catch (e) {
    if (e instanceof ConfigValidationError) fail(e.message);
    throw e;
  }
}

function themeCommand(code: string, out?: string) {
  const cfg = load(code);
  const theme = buildTheme(cfg);
  const file = path.resolve(out ?? path.join(root, '.theme-preview', `${code}.html`));
  mkdirSync(path.dirname(file), { recursive: true });
  const opts = { cornerRadius: cfg.branding.cornerRadius, fonts: cfg.branding.fonts };
  writeFileSync(file, renderPreviewHtml(cfg.school.name, cfg.school.motto, theme, opts));
  const failing = theme.report.filter((r) => !r.pass).length;
  console.log(
    `Theme for ${cfg.school.name}: ${theme.report.length} contrast checks, ${failing} failing.`,
  );
  for (const a of theme.adjustments) console.log(`  adjusted: ${a}`);
  console.log(`Preview written to ${file}`);
}

async function createCommand(
  code: string,
  o: {
    adminEmail?: string;
    adminName?: string;
    adminPassword?: string;
    noSample: boolean;
    samplePassword?: string;
  },
) {
  if (code === '_template') fail('Copy the template to config/schools/<school-code>.json first.');
  if (!o.adminEmail) fail('--admin-email is required.\n\n' + USAGE);
  const cfg = load(code);
  buildTheme(cfg); // refuses to create a tenant with an unusable theme

  const adminUrl = process.env.DATABASE_URL_ADMIN;
  if (!adminUrl) fail('DATABASE_URL_ADMIN is not set (see .env.example).');

  // Loaded lazily so `school:theme` works without a built API or database.
  const { createAdminClient, provisionTenant } = await import('@digischools/api/provisioning');
  const prisma = createAdminClient(adminUrl);
  try {
    const r = await provisionTenant(prisma, cfg, {
      adminEmail: o.adminEmail,
      adminName: o.adminName,
      adminPassword: o.adminPassword,
      sampleData: !o.noSample,
      samplePassword: o.samplePassword,
    });
    console.log(
      `${r.created ? 'Created' : 'Updated'} tenant "${cfg.school.code}" (${r.tenantId}).`,
    );
    console.log(`Hosts: ${r.hosts.join(', ')}`);
    if (r.credentials.length) {
      console.log('\nCredentials (shown once, change them after first login):');
      for (const c of r.credentials) console.log(`  ${c.role.padEnd(8)} ${c.email}  ${c.password}`);
    } else {
      console.log('No new users were created.');
    }
    // TODO: upload logo, favicon and app icon to object storage and store the keys (needs storage adapter).
  } finally {
    await prisma.$disconnect();
  }
}

const [command, ...rest] = process.argv.slice(2);
const { values, positionals } = parseArgs({
  args: rest,
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    'admin-email': { type: 'string' },
    'admin-name': { type: 'string' },
    'admin-password': { type: 'string' },
    'no-sample': { type: 'boolean', default: false },
    'sample-password': { type: 'string' },
  },
});
const code = positionals[0];
if (!code) fail(USAGE);

if (command === 'theme') {
  themeCommand(code, values.out);
} else if (command === 'create') {
  await createCommand(code, {
    adminEmail: values['admin-email'],
    adminName: values['admin-name'],
    adminPassword: values['admin-password'],
    noSample: values['no-sample'] ?? false,
    samplePassword: values['sample-password'],
  });
} else {
  fail(USAGE);
}
