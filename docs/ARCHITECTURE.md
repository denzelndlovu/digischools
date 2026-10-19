# DigiSchools Architecture

Status: proposal, awaiting approval. No code written yet.

> Note: `docs/prototype/digischools-demo-v4.html` was not present when this plan was written. Screens and flows below come from the brief only. Reconcile against the prototype once it is added.

## 1. Goals and constraints

- One codebase serves many private high schools (white-label, multi-tenant).
- A new school is launched by editing `config/schools/<code>.json` and running `pnpm school:create`.
- Unreliable internet and power, low-end Android, expensive data: offline-first, small bundles.
- Parent features gated by subscription status. Per-student term fee collected with tuition.

## 2. Repository layout

```
apps/
  api/        NestJS REST + OpenAPI, Prisma, BullMQ workers
  web/        Next.js App Router, Tailwind, PWA
  mobile/     Expo + expo-router, one build for all schools (+ optional branded builds)
packages/
  config-schema/  zod tenant config schema + loader + validation
  ui-tokens/      palette generator, WCAG checks, CSS vars + mobile theme emitters
  domain/         shared types, permission matrix, rules (late rules, ledger rules)
  api-client/     generated from OpenAPI (typed fetch client + offline queue helpers)
tools/
  cli/        school:create, school:theme
config/schools/   _template.json and per-school configs (fictional demo schools only)
docs/
infra/            docker-compose, backup scripts, CI helpers
```

Tooling: pnpm workspaces, Turborepo, TypeScript strict, ESLint, Prettier, Vitest (unit and API integration via Testcontainers or compose Postgres), Playwright (web), Maestro (mobile), GitHub Actions.

## 3. Multi-tenancy

### Isolation

- Every tenant-owned table has `tenant_id uuid not null`, indexed, and a composite FK strategy so child rows cannot reference a parent in another tenant (`(tenant_id, id)` unique + composite FKs).
- PostgreSQL RLS on every tenant table: `USING (tenant_id = current_setting('app.tenant_id')::uuid)` and the same `WITH CHECK`. `FORCE ROW LEVEL SECURITY` enabled.
- The API connects as a non-owner, non-superuser role without `BYPASSRLS`. A separate migration/admin role is used only for migrations and the CLI.
- Per request, a Prisma transaction runs `SET LOCAL app.tenant_id = ...` (via `set_config(..., true)`) before queries. Implemented as a Prisma client extension plus a Nest interceptor, so no handler can forget it.
- Background jobs carry `tenantId` in the payload and use the same wrapper.
- Test: a suite that seeds two tenants and, for every tenant table (enumerated from the schema so new tables are automatically covered), proves cross-tenant select, update, delete and insert fail.

### Tenant resolution

- Web: subdomain or `customDomain` mapped via the `tenant_domain` table (cached in Redis, short TTL). Middleware in Next.js and a Nest guard resolve it; the API also accepts `X-Tenant` only from trusted internal callers.
- Mobile: school code entered at first launch calls `GET /public/tenants/:code/config`, stored in secure storage, sent as `X-School-Code` and validated against the JWT's tenant claim. A JWT for tenant A is rejected on tenant B.
- Branded builds: EAS profiles read `config/schools/<code>.json` via `app.config.ts`, pre-seeding the school code and skipping the entry screen.

### Tenant config

- Source of truth at runtime is the DB (`tenant.config` jsonb, validated with zod on write). JSON files in `config/schools/` are the authoring format; `school:create` and a `school:sync` command validate and upsert them.
- Public config endpoint returns only the branding/locale/modules subset (no secrets, no billing prices unless intended).
- Feature flags: `modules.*` read by a `@RequireModule('fees')` decorator and guard returning 403; UI hides nav and routes using the same flag from config.
- Open item: the template has `branding.logo` as a file path. Assets are uploaded to S3-compatible storage by the CLI and the config stores the resulting key/URL.

## 4. Theming pipeline (`packages/ui-tokens`)

1. Input: `primary`, `accent`, optional `overrides.light|dark`.
2. Convert to OKLCH. Generate a 11-step tonal scale for primary, accent, and a neutral tinted from primary. Fixed semantic colors for success, warning, danger, info, harmonized to the brand hue but kept distinguishable.
3. Map scales to semantic tokens for light and dark: `bg`, `surface`, `surface-raised`, `border`, `text`, `text-muted`, `primary`, `on-primary`, `accent`, `on-accent`, `focus-ring`, status tokens, etc.
4. WCAG AA check on every declared foreground/background pair (4.5:1 text, 3:1 large text and UI components). Failing pairs are auto-adjusted by shifting lightness in OKLCH until passing; if impossible, or if an override fails, config validation errors with the pair named.
5. Emit: CSS variables (`:root` and `[data-theme=dark]`) for web consumed by Tailwind via `var(--...)`; a typed theme object for mobile. Lint rule bans hex/rgb literals in app code.
6. `pnpm school:theme <code>` renders a static HTML preview of sample screens (light and dark) plus a contrast report.

## 5. Auth, roles, permissions

- Password (argon2id) plus one-time code (email or SMS via notification adapter). OTP stored hashed, short expiry, attempt-limited.
- Short-lived access JWT (about 15 min) with rotating refresh tokens stored hashed, per-device, revocable. Claims: `sub`, `tenantId`, `roles`, `staffType`.
- Roles: `ADMIN`, `STAFF`, `STUDENT`, `PARENT`. Staff capabilities depend on `staff_type` (Teacher, PE and sports coach, Clubs coordinator, Support staff). Staff types come from tenant config.
- Permissions: a permission matrix in `packages/domain` (`resource:action`), used by the API guard and exported to the UI so both match.
- Row-scope rules beyond RBAC: parents only see linked children (via `guardian_link`); students only see their own data; teachers only see their classes. Enforced in the service layer with policy functions and tested.
- Rate limiting (Nest throttler on Redis), login lockout/backoff, audit log on sensitive actions.
- Reader devices: separate credential type, opaque device token (hashed in DB), scoped to one tenant and reader location, can only call the tap/sync endpoints.

## 6. API design (NestJS)

- Modules per domain: identity, attendance, academics, billing, wallet, sports-clubs, communication, helpdesk, staff-admin, admin, tenancy, notifications, files.
- REST, versioned `/v1`, OpenAPI generated from decorators and zod/class-validator DTOs; `packages/api-client` generated from the spec in CI (fail on drift).
- Idempotency keys on payment, top-up, wallet spend and tap endpoints. Cursor pagination. Consistent problem+json errors.
- Offline sync: clients send queued writes with client-generated UUIDs and `clientCreatedAt`; the server is idempotent on those. Reads use `updatedSince` deltas with tombstones. Conflict policy per entity (documented in the backlog; default last-write-wins except ledger and attendance, which are append-only).
- Background jobs (BullMQ): notifications, reminders, similarity checks, report PDF generation, CSV import, backups trigger.

## 7. Key adapters (all behind interfaces in `apps/api/src/adapters`)

| Adapter               | v1 implementation                                      | Notes                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PaymentProvider`     | `MockProvider`                                         | initiate, webhook verify, status, refund. Local mobile-money providers: TODO verify which have public merchant APIs, fees, and settlement terms before choosing. Not assumed. |
| `SimilarityService`   | in-house shingling + Jaccard/cosine over tenant corpus | Replaceable. Reports score and matched sources. Must be described to users as similarity within DigiSchools, not a Turnitin result.                                           |
| `NotificationChannel` | push (Expo push), email (SMTP), SMS                    | TODO: choose SMS gateway usable in Zimbabwe; confirm sender ID rules and cost. SMS off by default per template.                                                               |
| `ObjectStorage`       | S3-compatible (MinIO locally)                          | signed URLs, tenant-prefixed keys.                                                                                                                                            |
| `PdfRenderer`         | server-side HTML to PDF                                | report cards, receipts.                                                                                                                                                       |
| `CardReaderProtocol`  | HTTPS JSON from reader firmware                        | TODO: confirm actual reader hardware and protocol with the school/vendor.                                                                                                     |

## 8. Domain behaviours worth specifying up front

- Attendance: tap creates an immutable `attendance_event`; a derived `attendance_record` per person/day computes status using `schoolStart` + `lateAfterMinutes`. Manual override creates an event of type `override` with reason and audit entry; never edits history. Offline readers queue events with device timestamps, synced later; server stores both device time and receive time, flags large clock skew, de-duplicates by `(device_id, local_seq)`.
- Wallet: double-entry ledger. Accounts per student wallet plus system accounts (top-up clearing, tuckshop revenue, refunds). Entries are append-only, each transaction balances to zero, balance is derived (with a cached balance row updated in the same transaction under row lock). Daily limit checked in the spend transaction using school-timezone day. Refunds are reversing transactions linked to the original. Money stored as integer minor units plus currency.
- Billing: fee structure per term and form; invoice lines include the per-student term fee and the parent subscription as separate lines. `parent_subscription` status (active/grace/expired) gates parent features through a `SubscriptionGuard` and UI entitlements. Grace period is a config value, to be confirmed with the product owner.
- Report cards: marks entry, missing-mark check per class/subject, review, admin publish (immutable snapshot), PDF export. Students and parents see only published cards.
- Assignments: submission creates a receipt (hash of file, timestamp); similarity job runs async; teacher marks, writes feedback, then releases; students and parents see grades only after release.
- Help desk: statuses (open, assigned, in progress, waiting, resolved, closed), SLA timers (first response, resolution), assignment, internal notes.

## 9. Frontend architecture

- Web: Next.js App Router, Server Components where useful, Tailwind on semantic tokens, accessible primitives (Radix UI or React Aria; decision in Phase 0), role-based route groups, service worker (Workbox) with runtime caching and a background-sync queue for writes. i18n via `next-intl` with message catalogs per language (`en` now; `sn`, `nd` scaffolded).
- Mobile: Expo + expo-router, TanStack Query with persisted cache (MMKV or SQLite), a write-queue with retry and idempotency keys, i18n via `i18next`, theme provider fed from the tenant config. NFC via `react-native-nfc-manager` behind a capability check (needs a dev client, not Expo Go). Key card payment at the POS is initiated from the staff POS screen; phone NFC is optional.
- Shared: `domain` types and permissions, `api-client`, `ui-tokens`.
- Performance budgets (set in Phase 6, measured in CI): web first-load JS per route under an agreed budget (proposed 150 KB gzip), Lighthouse PWA/perf thresholds on a throttled profile, Android APK/AAB size target, cold start target on a low-end device class.

## 10. Security and privacy

- Argon2id, TLS only, Postgres encryption at rest via managed disk/volume encryption (TODO: confirm in hosting choice), field-level encryption for sensitive fields where justified (e.g. national ID if collected; collect minimal data).
- Audit log (append-only): who, what, entity, before/after, IP, tenant.
- Parental consent flows stored with version and timestamp; privacy and terms URLs from tenant config.
- Uploads: type and size limits, virus scan hook (TODO), no public buckets.
- Docs will state: data-protection obligations in Zimbabwe must be reviewed with a qualified person. No legal requirement is asserted.
- Secrets only via env; `.env.example` provided; secret scanning in CI.

## 11. Observability and operations

- Structured JSON logs (pino) with request id and tenant id; Sentry (or self-hosted equivalent) for web, mobile and API; health/readiness endpoints; basic metrics.
- Automated Postgres backups (pg_dump or WAL archiving) to object storage with a documented restore drill. Hosting choice is open (see questions).
- Docker Compose for local: Postgres, Redis, MinIO, Mailpit, API, web.
- CI: install, lint, typecheck, unit, integration (with Postgres/Redis services), OpenAPI drift check, web build, Playwright; Maestro on a schedule or manual.

## 12. Key decisions and deviations from the brief

1. Tenant data in a shared schema with RLS (as specified), not schema-per-tenant. Simpler to operate for many small schools.
2. Prisma does not natively express RLS; policies live in raw SQL migrations, with a test that every table with `tenant_id` has a policy.
3. Config in JSON files is authoring input; the DB copy is runtime truth so config changes do not need redeploys (supports the in-app theme editor in Phase 5).
4. "Similarity score" is internal-corpus only. Do not market it as plagiarism detection on the open web.
5. Library, transport, sick bay and boarding: flags and empty module stubs only.

## 13. Risks

- Key card hardware variety: mitigated by the reader protocol adapter and device simulator for tests.
- Mobile-money integration unknowns: mitigated by the provider interface and mock-first approach.
- Low-end Android performance: budgets and real-device testing in Phase 6.
- Offline conflicts on shared records: append-only design for money and attendance.
- Data protection: legal review before any real student data is loaded.

## 14. Open questions

Approved. Answers recorded:

1. Prototype: not available. Screens follow the brief; reconcile if it appears later.
2. Hosting: both cloud and local/on-premise must be supported. Keep the deployment container-based and provider-neutral (S3-compatible storage, plain Postgres/Redis).
3. Reader hardware: not yet available. Build against a simulated reader and the `CardReaderProtocol` adapter.
4. Accessible component library: Radix UI.
5. Subscription grace period: none. Expired subscription gates parent features immediately (the `grace` state is removed from the design).
