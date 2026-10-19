import type { Theme, TokenMap, TokenName } from './palette.js';

export type CornerRadius = 'none' | 'sm' | 'md' | 'lg' | 'full';

export const RADIUS_PX: Record<CornerRadius, number> = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 16,
  full: 9999,
};

export interface ThemeOptions {
  cornerRadius?: CornerRadius;
  fonts?: { heading: string; body: string };
  /** CSS variable prefix for colors: `--<prefix>-<token>`. Defaults to `color`. */
  varPrefix?: string;
}

const cssBlock = (selector: string, tokens: TokenMap, prefix: string) =>
  `${selector} {\n${(Object.entries(tokens) as [TokenName, string][])
    .map(([k, v]) => `  --${prefix}-${k}: ${v};`)
    .join('\n')}\n}`;

const sanitizeFont = (f: string) => f.replace(/[^A-Za-z0-9 _-]/g, '');

/** CSS variables for web. Dark applies via [data-theme='dark'] or the OS preference unless [data-theme='light']. */
export function toCss(theme: Theme, opts: ThemeOptions = {}): string {
  const radius = RADIUS_PX[opts.cornerRadius ?? 'md'];
  const extra: string[] = [`  --radius: ${radius}px;`];
  if (opts.fonts) {
    extra.push(`  --font-heading: '${sanitizeFont(opts.fonts.heading)}', system-ui, sans-serif;`);
    extra.push(`  --font-body: '${sanitizeFont(opts.fonts.body)}', system-ui, sans-serif;`);
  }
  const prefix = opts.varPrefix ?? 'color';
  const lightBlock = cssBlock(':root', theme.light, prefix).replace(
    /\n}$/,
    `\n${extra.join('\n')}\n}`,
  );
  return [
    lightBlock,
    cssBlock(":root[data-theme='dark']", theme.dark, prefix),
    `@media (prefers-color-scheme: dark) {\n${cssBlock(
      ":root:not([data-theme='light'])",
      theme.dark,
      prefix,
    )
      .split('\n')
      .map((l) => '  ' + l)
      .join('\n')}\n}`,
  ].join('\n\n');
}

const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

export interface MobileTheme {
  light: Record<string, string>;
  dark: Record<string, string>;
  radius: number;
  fonts?: { heading: string; body: string };
}

/** Theme object for React Native, with camelCase token names. */
export function toMobileTheme(theme: Theme, opts: ThemeOptions = {}): MobileTheme {
  const conv = (t: TokenMap) =>
    Object.fromEntries(Object.entries(t).map(([k, v]) => [camel(k), v]));
  return {
    light: conv(theme.light),
    dark: conv(theme.dark),
    radius: RADIUS_PX[opts.cornerRadius ?? 'md'],
    fonts: opts.fonts,
  };
}
