# DigiSchools Backlog

Each phase ends with: all tests green, docs updated, small conventional commits, summary, wait for approval.

## Phase 0: Foundation

- [ ] P0.1 Monorepo: pnpm workspaces, Turborepo, strict TS, ESLint, Prettier, commit hooks.
  - AC: `pnpm install && pnpm turbo run lint typecheck test build` passes on a clean clone.
- [ ] P0.2 Docker Compose: Postgres, Redis, MinIO, Mailpit; `.env.example`.
  - AC: `docker compose up` yields healthy services; no secrets committed.
- [ ] P0.3 CI (GitHub Actions): lint, typecheck, unit, integration with services, secret scan.
  - AC: pipeline green on a PR.
- [ ] P0.4 `config-schema`: zod schema for the template, loader, helpful errors; template saved at `config/schools/_template.json`.
  - AC: template validates; invalid samples (bad hex, unknown module, bad dates, overlapping terms, default language not in languages) are rejected with path-specific messages.
- [ ] P0.5 `ui-tokens`: palette derivation from primary and accent, light and dark, AA check with auto-adjust, override validation, CSS vars and mobile theme emitters.
  - AC: property tests over many random color pairs yield only AA-passing token pairs; overrides that fail are rejected; green and gold default snapshot-tested.
- [ ] P0.6 Prisma schema for tenancy and identity; raw SQL migrations for RLS (enabled and forced), non-owner app role.
  - AC: test enumerates all tenant tables and asserts a policy exists.
- [ ] P0.7 Tenant context: Prisma extension setting `app.tenant_id` per transaction; tenant resolution by host and by school code.
  - AC: request with unknown host returns 404; queries without tenant context return zero rows.
- [ ] P0.8 Auth: argon2id, OTP via notification adapter (console/Mailpit in dev), JWT plus rotating refresh, rate limits.
  - AC: tokens from tenant A rejected on tenant B; refresh reuse detected and revoked; OTP attempt limit enforced.
- [ ] P0.9 Roles and permissions: matrix in `domain`, API guard, `@RequireModule` flag guard returning 403.
  - AC: matrix tests per role and staff type; disabled module returns 403.
- [ ] P0.10 Tenant isolation tests.
  - AC: with two seeded tenants, cross-tenant read, update, delete and insert fail on every table; parent A cannot read child of parent B within the same tenant.
- [ ] P0.11 CLI `pnpm school:theme <code>`: HTML preview of sample screens, light and dark, plus contrast report.
  - AC: exits non-zero if a pair fails and cannot be fixed.
- [ ] P0.12 CLI `pnpm school:create <code>`: validates config, creates tenant, domain, roles, first admin (one-time password flow), sample term calendar, fictional sample data (`--no-sample` flag).
  - AC: idempotent re-run; secrets printed once, never stored in plain text.
- [ ] P0.13 Skeleton apps (api health, web shell with theming, mobile shell with school-code entry stub).
- [ ] P0.14 Docs: README, ARCHITECTURE update, data-protection review note.

## Phase 1: Users, key cards, attendance

- [ ] P1.1 User CRUD (single create, deactivate, reactivate); parent-student links.
- [ ] P1.2 CSV import with dry-run, row errors report, idempotent re-import.
  - AC: 1,000-row import completes via background job; bad rows reported without aborting valid ones.
- [ ] P1.3 Key cards: issue, block, reissue (old card invalidated), audit entries.
- [ ] P1.4 Reader devices: register, device token (shown once, stored hashed), rotate, revoke; simulator tool for tests.
- [ ] P1.5 Tap ingestion: idempotent on `(device, local_seq)`, late rules from config, derived daily records, clock skew flagging.
- [ ] P1.6 Offline reader queue and batch sync endpoint.
  - AC: 500 queued taps replay in order with no duplicates and correct late status by device time.
- [ ] P1.7 Staff clock-in via key card.
- [ ] P1.8 Parent alerts on tap (respects `notifyParentOnTap`, channel config, subscription gate hook).
- [ ] P1.9 Manual override with reason and audit; history never edited.
- [ ] P1.10 UI: Admin Users and Overview (web and mobile as per prototype); student and parent attendance views.
- [ ] P1.11 Tests: late-rule boundaries, duplicate taps, cross-family access, flag-off 403.

## Phase 2: Academics

- [ ] P2.1 Classes, subjects, class-subject teaching assignments, timetable.
- [ ] P2.2 Assignment portal: create, publish, submit with receipt (file hash and code), resubmission policy.
  - AC: receipt verifiable; late flag computed.
- [ ] P2.3 Similarity adapter plus in-house service; async job; threshold warning from config.
  - AC: identical text scores near 100; unrelated near 0; adapter swappable via DI in tests.
- [ ] P2.4 Marking, feedback, release gate.
  - AC: students and parents see nothing until released.
- [ ] P2.5 Report cards: marks entry, missing-mark check, review, admin publish (immutable snapshot), PDF export.
  - AC: publish blocked with missing marks unless admin overrides with reason (audited).
- [ ] P2.6 UI: Teacher, Student, Parent screens (web and mobile).
- [ ] P2.7 Tests: teacher sees only own classes; parent sees only linked child; unpublished report invisible.

## Phase 3: Fees and tuckshop wallet

- [ ] P3.1 Fee structures per term and form; invoice generation including per-student term fee line.
- [ ] P3.2 Payment provider adapter and mock provider; webhook verification; idempotency.
  - TODO: research real local mobile-money providers before any integration.
- [ ] P3.3 Receipts (PDF), reminders (jobs), fee reports.
- [ ] P3.4 Parent subscription lifecycle and `SubscriptionGuard` gating parent features; grace period.
- [ ] P3.5 Wallet ledger: double-entry, append-only, balance cache under lock.
  - AC: property test, any sequence of operations keeps ledger sum zero and balance equals derived sum; concurrent spends cannot overdraw.
- [ ] P3.6 Parent top-ups and daily limits (school-timezone day, options from config).
- [ ] P3.7 Catalogue and POS screen (offline-tolerant queue); key card payment.
- [ ] P3.8 Refunds as reversing transactions; sales reports.
- [ ] P3.9 UI: Admin fees, Parent fees and wallet, tuckshop staff POS, student wallet view.
- [ ] P3.10 Tests: ledger correctness, limit boundaries at midnight, idempotent retries, cross-tenant and cross-family.

## Phase 4: Sports, clubs, communication, help desk, staff admin

- [ ] P4.1 Teams, fixtures, results, team sheets, training sessions and attendance.
- [ ] P4.2 Clubs: rosters, join and leave, notices.
- [ ] P4.3 Announcements by audience; newsletters; channel fan-out via adapters.
  - AC: audience targeting tested (role, form, class, club).
- [ ] P4.4 Magazines: article submission, review workflow with state machine and history.
- [ ] P4.5 Help desk: categories, statuses, assignment, SLA timers, internal notes.
- [ ] P4.6 Staff leave requests and approvals; clock-in records view.
- [ ] P4.7 UI: PE and sports coach, Club coordinator, Support staff, Student and Parent views.
- [ ] P4.8 Tests: state machine transitions, SLA calculations, audience resolution, flag-off 403.

## Phase 5: Admin tools and white-label

- [ ] P5.1 Module switches (DB-backed, audited), UI hides and API 403s immediately.
- [ ] P5.2 Audit log viewer with filters; data export (CSV/JSON) via job and expiring link.
- [ ] P5.3 Theme editor: live preview on sample screens, AA enforcement, save to tenant config.
- [ ] P5.4 Mobile school-code flow: fetch config at runtime, cache, switch school.
- [ ] P5.5 EAS build profiles reading `config/schools/<code>.json` for branded builds.
  - TODO: confirm Apple/Google developer account and bundle id ownership per school.
- [ ] P5.6 Two extra fictional demo tenants with different colors and module sets.
  - AC: all three tenants render correctly with no code changes; tests prove isolation and flag differences.
- [ ] P5.7 Tests.

## Phase 6: Hardening and launch

- [ ] P6.1 Offline sync completion on mobile and PWA (queues, conflict policy, UI state).
  - AC: airplane-mode scenario test: queued writes sync once connectivity returns, no duplicates.
- [ ] P6.2 i18n scaffolding for Shona and Ndebele (catalogs, fallback to English, no hard-coded strings lint).
  - TODO: native-speaker review of any translations.
- [ ] P6.3 Accessibility pass: keyboard, screen readers, contrast, touch targets; axe in Playwright.
- [ ] P6.4 Playwright (web) and Maestro (mobile) E2E for main flows per role.
- [ ] P6.5 Performance budgets enforced in CI; error tracking; structured logging.
- [ ] P6.6 Automated backups plus tested restore.
- [ ] P6.7 Security review checklist (OWASP Top 10 mapped), dependency audit, pen-test scope notes.
- [ ] P6.8 Deployment and school onboarding docs; legal review note.

## Cross-cutting definition of done

- Tests for every feature, including negative permission cases.
- Feature behind its module flag (UI hidden, API 403).
- Semantic tokens only, no hard-coded colors.
- Audit entries for sensitive actions.
- OpenAPI updated and `api-client` regenerated.
- Fictional seed data only; no real school names or crests.
