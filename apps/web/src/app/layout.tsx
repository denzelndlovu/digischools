import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { generateTheme, toCss } from '@digischools/ui-tokens';
import { getTenant } from '../lib/tenant';
import './globals.css';

const FALLBACK = { primary: '#1B7A4B', accent: '#C9A227' };

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenant();
  return { title: tenant?.school.name ?? 'DigiSchools', description: tenant?.school.motto };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const tenant = await getTenant();
  const colors = tenant?.branding.colors ?? { ...FALLBACK, overrides: { light: {}, dark: {} } };
  // Colors are validated hex values and font names are sanitised by the emitter.
  const css = toCss(
    generateTheme({
      primary: colors.primary,
      accent: colors.accent,
      overrides: 'overrides' in colors ? colors.overrides : undefined,
    }),
    {
      varPrefix: 'ds',
      cornerRadius: tenant?.branding.cornerRadius,
      fonts: tenant?.branding.fonts,
    },
  );
  return (
    <html lang={tenant?.locale.defaultLanguage ?? 'en'}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
