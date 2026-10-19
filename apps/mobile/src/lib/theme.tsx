import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import type { PublicTenantConfig } from '@digischools/config-schema';
import { generateTheme, toMobileTheme } from '@digischools/ui-tokens';

const FALLBACK = { primary: '#1B7A4B', accent: '#C9A227' };

export type Colors = Record<string, string>;
export interface AppTheme {
  colors: Colors;
  radius: number;
  school: PublicTenantConfig | null;
}

const ThemeContext = createContext<AppTheme | null>(null);

export function ThemeProvider({
  school,
  children,
}: {
  school: PublicTenantConfig | null;
  children: ReactNode;
}) {
  const scheme = useColorScheme();
  const value = useMemo<AppTheme>(() => {
    const c = school?.branding.colors ?? { ...FALLBACK, overrides: { light: {}, dark: {} } };
    const theme = generateTheme({
      primary: c.primary,
      accent: c.accent,
      overrides: 'overrides' in c ? c.overrides : undefined,
    });
    const mobile = toMobileTheme(theme, { cornerRadius: school?.branding.cornerRadius });
    return {
      colors: scheme === 'dark' ? mobile.dark : mobile.light,
      radius: mobile.radius,
      school,
    };
  }, [school, scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): AppTheme {
  const t = useContext(ThemeContext);
  if (!t) throw new Error('useTheme must be used inside ThemeProvider');
  return t;
}
