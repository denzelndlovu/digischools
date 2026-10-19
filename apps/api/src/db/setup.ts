// Usage: pnpm --filter @digischools/api db:setup  (run after `db:migrate`)
import { setAppRolePassword } from './migrate.js';

const admin = process.env.DATABASE_URL_ADMIN;
const password = process.env.APP_DB_PASSWORD;
if (!admin || !password) {
  console.error('DATABASE_URL_ADMIN and APP_DB_PASSWORD are required');
  process.exit(1);
}
await setAppRolePassword(admin, password);
console.log('Application role password set.');
