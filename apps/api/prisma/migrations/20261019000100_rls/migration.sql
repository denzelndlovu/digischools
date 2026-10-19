-- Row-level security for every tenant-owned table.
-- Platform tables (tenant, tenant_domain) are read-only for the application role.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'digischools_app') THEN
    CREATE ROLE digischools_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO digischools_app;
GRANT SELECT ON "tenant", "tenant_domain" TO digischools_app;

CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

-- Call this in every future migration that adds a table with a tenant_id column.
CREATE OR REPLACE FUNCTION app_enable_tenant_rls(tbl regclass, append_only boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', tbl);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())',
    tbl
  );
  IF append_only THEN
    EXECUTE format('REVOKE ALL ON %s FROM digischools_app', tbl);
    EXECUTE format('GRANT SELECT, INSERT ON %s TO digischools_app', tbl);
  ELSE
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO digischools_app', tbl);
  END IF;
END;
$$;

SELECT app_enable_tenant_rls('"user"');
SELECT app_enable_tenant_rls('"staff_profile"');
SELECT app_enable_tenant_rls('"student_profile"');
SELECT app_enable_tenant_rls('"guardian_link"');
SELECT app_enable_tenant_rls('"otp_code"');
SELECT app_enable_tenant_rls('"refresh_token"');
SELECT app_enable_tenant_rls('"term"');
SELECT app_enable_tenant_rls('"audit_log"', true);
