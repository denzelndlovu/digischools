import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../prisma/migrations',
);

export const APP_ROLE = 'digischools_app';

/** Applies migration.sql files in order to an empty database. Used by tests; deployments use `prisma migrate deploy`. */
export async function applyMigrations(adminUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const dirs = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const dir of dirs) {
      await client.query(readFileSync(path.join(migrationsDir, dir, 'migration.sql'), 'utf8'));
    }
  } finally {
    await client.end();
  }
}

export async function setAppRolePassword(adminUrl: string, password: string): Promise<void> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const literal = await client.query('SELECT quote_literal($1) AS v', [password]);
    await client.query(`ALTER ROLE ${APP_ROLE} LOGIN PASSWORD ${literal.rows[0].v}`);
  } finally {
    await client.end();
  }
}
