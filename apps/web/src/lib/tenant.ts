import { headers } from 'next/headers';
import type { PublicTenantConfig } from '@digischools/config-schema';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

/** Resolves the school from the request host (or DEV_SCHOOL_CODE locally) via the API. */
export async function getTenant(): Promise<PublicTenantConfig | null> {
  const h = await headers();
  const devCode = process.env.DEV_SCHOOL_CODE;
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  try {
    const res = await fetch(`${API_URL}/v1/public/config`, {
      headers: devCode ? { 'x-school-code': devCode } : { 'x-forwarded-host': host },
      next: { revalidate: 60 },
    });
    return res.ok ? ((await res.json()) as PublicTenantConfig) : null;
  } catch {
    return null;
  }
}
