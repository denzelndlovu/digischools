import { readFileSync } from 'node:fs';
import path from 'node:path';
import { tenantConfigSchema, type TenantConfig } from './schema.js';

export class ConfigValidationError extends Error {
  constructor(
    public readonly source: string,
    public readonly problems: string[],
  ) {
    super(`Invalid tenant config (${source}):\n` + problems.map((p) => `  - ${p}`).join('\n'));
  }
}

export function parseTenantConfig(input: unknown, source = 'input'): TenantConfig {
  const result = tenantConfigSchema.safeParse(input);
  if (!result.success) {
    throw new ConfigValidationError(
      source,
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  return result.data;
}

export function loadTenantConfigFile(file: string): TenantConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new ConfigValidationError(file, [`cannot read or parse JSON: ${(e as Error).message}`]);
  }
  return parseTenantConfig(raw, file);
}

/** Loads config/schools/<code>.json; `_template` loads the template. */
export function loadSchoolConfig(code: string, schoolsDir: string): TenantConfig {
  if (!/^_?[a-z0-9-]+$/.test(code)) {
    throw new ConfigValidationError(code, [
      'school code must be lowercase letters, digits, dashes',
    ]);
  }
  const cfg = loadTenantConfigFile(path.join(schoolsDir, `${code}.json`));
  if (code !== '_template' && cfg.school.code !== code) {
    throw new ConfigValidationError(code, [
      `school.code "${cfg.school.code}" does not match the file name "${code}.json"`,
    ]);
  }
  return cfg;
}
