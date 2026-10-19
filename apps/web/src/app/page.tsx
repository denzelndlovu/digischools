import { getTenant } from '../lib/tenant';

export default async function Home() {
  const tenant = await getTenant();
  if (!tenant) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-semibold">School not found</h1>
        <p className="mt-2 text-text-muted">
          This address is not linked to a school. Check the link or contact your school office.
        </p>
      </main>
    );
  }
  const enabled = Object.entries(tenant.modules).filter(([, on]) => on);
  return (
    <>
      <header className="bg-primary text-on-primary">
        <div className="mx-auto flex max-w-3xl items-baseline gap-3 p-4">
          <strong className="text-lg">{tenant.school.name}</strong>
          <span>{tenant.school.motto}</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-text-muted">Sign-in screens arrive in Phase 1.</p>
        <section className="rounded-theme border border-border bg-surface p-4">
          <h2 className="font-medium">Modules enabled</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {enabled.map(([key]) => (
              <li
                key={key}
                className="rounded-full bg-primary-subtle px-3 py-1 text-on-primary-subtle"
              >
                {key}
              </li>
            ))}
          </ul>
        </section>
        <button className="min-h-11 rounded-theme bg-accent px-4 text-on-accent">
          Accent action
        </button>
      </main>
    </>
  );
}
