import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { applyMigrations, setAppRolePassword } from '../db/migrate.js';

export interface TestDbUrls {
  adminUrl: string;
  appUrl: string;
}

declare module 'vitest' {
  export interface ProvidedContext {
    dbUrls: TestDbUrls;
  }
}

const APP_PASSWORD = 'app-test-password';

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });

async function resetSchema(adminUrl: string) {
  const c = new pg.Client({ connectionString: adminUrl });
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await c.end();
}

/** Uses TEST_DATABASE_URL when set (CI); otherwise starts a throwaway embedded PostgreSQL. */
export default async function setup(project: TestProject) {
  let adminUrl = process.env.TEST_DATABASE_URL;
  let stop: (() => Promise<void>) | undefined;

  if (!adminUrl) {
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    const dir = mkdtempSync(path.join(tmpdir(), 'digischools-pg-'));
    const port = await freePort();
    const server = new EmbeddedPostgres({
      databaseDir: dir,
      user: 'postgres',
      password: 'postgres',
      port,
      persistent: false,
      onLog: () => {},
      onError: () => {},
    });
    await server.initialise();
    await server.start();
    await server.createDatabase('digischools_test');
    adminUrl = `postgresql://postgres:postgres@localhost:${port}/digischools_test`;
    stop = async () => {
      await server.stop();
      rmSync(dir, { recursive: true, force: true });
    };
  }

  await resetSchema(adminUrl);
  await applyMigrations(adminUrl);
  await setAppRolePassword(adminUrl, APP_PASSWORD);

  const u = new URL(adminUrl);
  u.username = 'digischools_app';
  u.password = APP_PASSWORD;
  project.provide('dbUrls', { adminUrl, appUrl: u.toString() });

  return async () => {
    await stop?.();
  };
}
