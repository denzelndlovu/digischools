# DigiSchools Data Model

Conventions

- Every tenant-owned table has `tenant_id uuid not null` (indexed, RLS policy, composite FKs `(tenant_id, id)`).
- Primary keys: UUIDv7 (client-generatable for offline writes).
- Timestamps: `created_at`, `updated_at`, `deleted_at` (soft delete where sync tombstones are needed).
- Money: `amount_minor bigint` + `currency char(3)`.
- Append-only tables are marked (A): no UPDATE/DELETE grants for the app role.
- Table names below are logical; Prisma models use PascalCase.

## Platform (not tenant-scoped, except where noted)

| Entity          | Key fields                                                    | Relations            |
| --------------- | ------------------------------------------------------------- | -------------------- |
| `tenant`        | id, code (unique), name, status, config jsonb, config_version | 1-N everything below |
| `tenant_domain` | tenant_id, host (unique globally), is_custom, verified_at     | N-1 tenant           |

## Identity and access

| Entity                   | Key fields                                                                                                                                            | Relations                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `user`                   | tenant_id, email?, phone?, password_hash, role (ADMIN/STAFF/STUDENT/PARENT), status (active/blocked/deactivated), display_name, locale, last_login_at | 1-1 staff_profile / student_profile / parent_profile |
| `staff_profile`          | user_id, staff_type, employee_no, department                                                                                                          | N-1 user                                             |
| `student_profile`        | user_id, admission_no, form_id, class_id, dob?, status                                                                                                | N-1 user, form, class                                |
| `parent_profile`         | user_id, consent_version, consented_at                                                                                                                |                                                      |
| `guardian_link`          | parent_user_id, student_user_id, relationship, is_primary                                                                                             | N-N parent to student                                |
| `role_assignment`        | user_id, permission_set (for custom admin sub-roles)                                                                                                  | optional                                             |
| `credential_otp` (A-ish) | user_id, purpose, code_hash, expires_at, attempts                                                                                                     |                                                      |
| `refresh_token`          | user_id, device_id, token_hash, expires_at, revoked_at                                                                                                |                                                      |
| `consent_record` (A)     | user_id, subject_user_id?, kind, version, granted_at, revoked_at                                                                                      | parental consent                                     |
| `csv_import`             | uploaded_by, kind, status, row_count, error_report_key                                                                                                | 1-N csv_import_row                                   |
| `audit_log` (A)          | actor_user_id?, actor_device_id?, action, entity_type, entity_id, before jsonb, after jsonb, ip, at                                                   |                                                      |

## Key cards and attendance

| Entity                 | Key fields                                                                                                                                    | Relations                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `key_card`             | uid_hash, holder_user_id, status (active/blocked/lost/replaced), issued_at, replaced_by_id                                                    | N-1 user                      |
| `reader_device`        | name, location_kind (gate/classroom/sports-field/tuckshop), location_label, token_hash, last_seen_at, status                                  |                               |
| `attendance_event` (A) | person_user_id, card_id, device_id, local_seq, tapped_at_device, received_at, kind (tap/override/clock_in/clock_out), reason?, actor_user_id? | unique (device_id, local_seq) |
| `attendance_record`    | person_user_id, date, status (present/late/absent/excused), first_in_at, last_out_at, source_event_id                                         | derived per person/day        |
| `attendance_rule`      | effective_from, school_start, late_after_minutes (snapshotted from config)                                                                    |                               |
| `staff_clock_record`   | staff_user_id, date, in_at, out_at, source                                                                                                    | derived from events           |

## Academics

| Entity              | Key fields                                                                                                        | Relations                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `term`              | name, start, end, academic_year                                                                                   |                                          |
| `form`              | name, ordinal                                                                                                     |                                          |
| `class`             | form_id, label, term_id/year, form_teacher_id?                                                                    | N-1 form                                 |
| `subject`           | name, code                                                                                                        |                                          |
| `class_subject`     | class_id, subject_id, teacher_user_id                                                                             | teaching assignment                      |
| `enrolment`         | student_user_id, class_id, year                                                                                   |                                          |
| `timetable_slot`    | class_subject_id, weekday, start_time, end_time, room                                                             |                                          |
| `assignment`        | class_subject_id, title, instructions, due_at, max_mark, status (draft/open/closed), release_state                |                                          |
| `submission`        | assignment_id, student_user_id, file_key, text_content?, file_hash, submitted_at, receipt_code, client_uuid       | unique (assignment, student) per attempt |
| `similarity_report` | submission_id, provider, score_pct, matches jsonb, status, computed_at                                            | 1-1 submission                           |
| `submission_grade`  | submission_id, mark, feedback, graded_by, released_at                                                             | release gate                             |
| `corpus_document`   | submission_id, text_hash, shingles                                                                                | similarity index (in-house)              |
| `report_card`       | student_user_id, term_id, status (draft/in_review/published), published_at, published_by, snapshot jsonb, pdf_key |                                          |
| `report_mark`       | report_card_id, subject_id, mark, grade, comment, entered_by                                                      | missing-mark check query                 |

## Billing

| Entity                | Key fields                                                                                                       | Relations             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------- |
| `fee_structure`       | term_id, form_id?, name, status                                                                                  | 1-N fee_item          |
| `fee_item`            | fee_structure_id, label, amount_minor, kind (tuition/platform_term_fee/other)                                    |                       |
| `invoice`             | student_user_id, payer_user_id?, term_id, number, status (draft/issued/part_paid/paid/void), total_minor, due_at | 1-N invoice_line      |
| `invoice_line`        | invoice_id, label, amount_minor, kind                                                                            |                       |
| `payment`             | invoice_id?, provider, provider_ref, amount_minor, status, idempotency_key, raw jsonb                            |                       |
| `receipt`             | payment_id, number, pdf_key                                                                                      |                       |
| `parent_subscription` | parent_user_id, term_id, status (active/grace/expired/cancelled), starts_at, ends_at, invoice_id                 | gates parent features |
| `reminder`            | invoice_id, channel, sent_at, template                                                                           |                       |

## Tuckshop wallet

| Entity                   | Key fields                                                                                                   | Relations                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `wallet`                 | student_user_id (unique), account_id, daily_limit_minor, limit_set_by_parent_id, balance_cache_minor, status | 1-1 student                     |
| `ledger_account`         | kind (student_wallet/topup_clearing/tuckshop_revenue/refund_clearing), owner_ref                             |                                 |
| `ledger_transaction` (A) | kind (topup/purchase/refund/adjustment), idempotency_key, reverses_id?, created_by, occurred_at              |                                 |
| `ledger_entry` (A)       | transaction_id, account_id, direction (debit/credit), amount_minor                                           | transaction entries sum to zero |
| `catalogue_item`         | name, price_minor, category, active                                                                          |                                 |
| `pos_sale`               | transaction_id, cashier_user_id, device_id?, paid_by (wallet/card)                                           | 1-N pos_sale_line               |
| `pos_sale_line`          | pos_sale_id, item_id, qty, unit_price_minor                                                                  |                                 |
| `topup`                  | wallet_id, parent_user_id, payment_id, status                                                                |                                 |

## Sports and clubs

| Entity                | Key fields                                        |
| --------------------- | ------------------------------------------------- |
| `sport_team`          | name, sport, coach_user_id, form_range            |
| `fixture`             | team_id, opponent, venue, starts_at, status       |
| `fixture_result`      | fixture_id, home_score, away_score, notes         |
| `team_sheet`          | fixture_id, student_user_id, position, is_starter |
| `training_session`    | team_id, starts_at, location                      |
| `training_attendance` | session_id, student_user_id, status               |
| `club`                | name, coordinator_user_id, description            |
| `club_membership`     | club_id, student_user_id, joined_at, left_at      |
| `club_notice`         | club_id, title, body, posted_by                   |

## Communication

| Entity                     | Key fields                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `announcement`             | title, body, audience jsonb (roles, forms, classes, clubs), channels, publish_at, created_by                                      |
| `news_post`                | title, body, author_user_id, status                                                                                               |
| `newsletter`               | title, body/blocks, status, sent_at                                                                                               |
| `magazine_issue`           | title, term_id, status                                                                                                            |
| `magazine_article`         | issue_id?, author_user_id, title, body, status (draft/submitted/in_review/changes_requested/approved/published), reviewer_user_id |
| `article_review_event` (A) | article_id, actor, from_status, to_status, comment                                                                                |
| `notification`             | user_id, channel, template, payload, status, sent_at, error                                                                       |
| `device_push_token`        | user_id, platform, token                                                                                                          |

## Help desk

| Entity             | Key fields                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `ticket_category`  | name, default_assignee_id?, first_response_minutes, resolution_minutes                                                   |
| `ticket`           | requester_user_id, category_id, subject, status, priority, assignee_user_id, first_responded_at, resolved_at, sla_due_at |
| `ticket_message`   | ticket_id, author_user_id, body, is_internal                                                                             |
| `ticket_event` (A) | ticket_id, kind, from, to, actor                                                                                         |

## Staff admin

| Entity          | Key fields                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| `leave_type`    | name, annual_allowance_days                                                                                          |
| `leave_request` | staff_user_id, leave_type_id, from, to, reason, status (pending/approved/rejected/cancelled), decided_by, decided_at |

## Admin and scaffolds

| Entity           | Notes                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `module_setting` | module key, enabled, updated_by (mirrors config, editable in Phase 5)                                                                         |
| `data_export`    | requested_by, kind, status, file_key, expires_at                                                                                              |
| `file_object`    | key, owner_ref, mime, size, sha256                                                                                                            |
| Scaffolded only  | `library_*`, `transport_*`, `sick_bay_*`, `boarding_*`: empty module folders and flags in Phase 0-5; no tables until enabled in a later phase |

## Key relations (summary)

```mermaid
erDiagram
  tenant ||--o{ user : has
  user ||--o| student_profile : is
  user ||--o| staff_profile : is
  user }o--o{ user : guardian_link
  student_profile }o--|| class : in
  class ||--o{ class_subject : teaches
  class_subject ||--o{ assignment : sets
  assignment ||--o{ submission : receives
  submission ||--o| similarity_report : scored
  student_profile ||--|| wallet : owns
  wallet ||--o{ ledger_entry : posts
  ledger_transaction ||--|{ ledger_entry : balances
  student_profile ||--o{ invoice : billed
  invoice ||--o{ payment : settled
  user ||--o{ key_card : holds
  key_card ||--o{ attendance_event : tapped
  reader_device ||--o{ attendance_event : records
  user ||--o{ ticket : raises
```

## RLS and integrity checks (tested)

- Every table with `tenant_id` has RLS enabled and forced, with matching `USING` and `WITH CHECK` policies.
- Composite FKs prevent cross-tenant references.
- Ledger: DB constraint trigger verifies each transaction's entries sum to zero.
- Append-only tables: app role has INSERT/SELECT only.
- Parent/student scoping is enforced in service policies and covered by cross-family tests.
