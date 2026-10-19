import { contrastRatio, ensureContrast, hexToOklch, oklchToHex, type Oklch } from './color.js';

export const TOKEN_NAMES = [
  'bg',
  'surface',
  'surface-raised',
  'border',
  'border-strong',
  'text',
  'text-muted',
  'link',
  'primary',
  'primary-hover',
  'on-primary',
  'primary-subtle',
  'on-primary-subtle',
  'accent',
  'accent-hover',
  'on-accent',
  'accent-subtle',
  'on-accent-subtle',
  'focus-ring',
  'success',
  'on-success',
  'warning',
  'on-warning',
  'danger',
  'on-danger',
  'info',
  'on-info',
] as const;
export type TokenName = (typeof TOKEN_NAMES)[number];
export type TokenMap = Record<TokenName, string>;
export type Mode = 'light' | 'dark';

/** [foreground, background, minimum ratio]. 4.5 for text, 3 for UI boundaries (WCAG 2.x AA). */
export const REQUIRED_PAIRS: ReadonlyArray<readonly [TokenName, TokenName, number]> = [
  ['text', 'bg', 4.5],
  ['text', 'surface', 4.5],
  ['text', 'surface-raised', 4.5],
  ['text-muted', 'bg', 4.5],
  ['text-muted', 'surface', 4.5],
  ['text-muted', 'surface-raised', 4.5],
  ['link', 'bg', 4.5],
  ['link', 'surface', 4.5],
  ['link', 'surface-raised', 4.5],
  ['on-primary', 'primary', 4.5],
  ['on-primary', 'primary-hover', 4.5],
  ['primary', 'bg', 3],
  ['on-primary-subtle', 'primary-subtle', 4.5],
  ['on-accent', 'accent', 4.5],
  ['on-accent', 'accent-hover', 4.5],
  ['on-accent-subtle', 'accent-subtle', 4.5],
  ['focus-ring', 'bg', 3],
  ['focus-ring', 'surface', 3],
  ['border-strong', 'bg', 3],
  ['border-strong', 'surface', 3],
  ['on-success', 'success', 4.5],
  ['on-warning', 'warning', 4.5],
  ['on-danger', 'danger', 4.5],
  ['on-info', 'info', 4.5],
];

export interface ContrastRow {
  mode: Mode;
  fg: TokenName;
  bg: TokenName;
  ratio: number;
  min: number;
  pass: boolean;
}

export interface Theme {
  light: TokenMap;
  dark: TokenMap;
  adjustments: string[];
  report: ContrastRow[];
}

export interface ThemeInput {
  primary: string;
  accent: string;
  overrides?: { light?: Record<string, string>; dark?: Record<string, string> };
}

export class ThemeContrastError extends Error {
  constructor(public readonly failures: ContrastRow[]) {
    super(
      'Theme fails WCAG AA contrast:\n' +
        failures
          .map((f) => `  - ${f.mode}: ${f.fg} on ${f.bg} = ${f.ratio.toFixed(2)} (needs ${f.min})`)
          .join('\n'),
    );
  }
}

export class UnknownTokenError extends Error {}

const WHITE = '#FFFFFF';
const BLACK = '#0B0D0C';

const bestOn = (bg: string) =>
  contrastRatio(WHITE, bg) >= contrastRatio(BLACK, bg) ? WHITE : BLACK;
const lch = (l: number, c: number, h: number): string => oklchToHex({ l, c, h });

function brandTokens(
  prefix: 'primary' | 'accent',
  base: string,
  mode: Mode,
  bgs: string[],
  adjustments: string[],
): Partial<TokenMap> {
  const o = hexToOklch(base);
  let fill = base;
  if (prefix === 'accent') {
    // Accent is only used as a fill with a label, so the school's exact colour is kept.
  } else if (mode === 'dark') {
    // Keep fills visible on dark surfaces.
    const lifted = ensureContrast(fill, bgs, 3);
    if (lifted && lifted !== fill) {
      adjustments.push(`${mode}: ${prefix} lightened to ${lifted} for visibility on dark surfaces`);
      fill = lifted;
    }
  } else {
    const darkened = ensureContrast(fill, bgs, 3);
    if (darkened && darkened !== fill) {
      adjustments.push(
        `${mode}: ${prefix} darkened to ${darkened} to reach 3:1 on the page background`,
      );
      fill = darkened;
    }
  }
  let on = bestOn(fill);
  if (contrastRatio(on, fill) < 4.55) {
    const nudged = ensureContrast(fill, [on], 4.55);
    if (nudged) {
      adjustments.push(`${mode}: ${prefix} adjusted to ${nudged} so label text reaches AA`);
      fill = nudged;
      on = bestOn(fill);
    }
  }
  const fo = hexToOklch(fill);
  let hover = lch(mode === 'light' ? fo.l - 0.06 : fo.l + 0.06, fo.c, fo.h);
  if (contrastRatio(on, hover) < 4.5) hover = fill;
  const subtle =
    mode === 'light' ? lch(0.95, Math.min(o.c, 0.04), o.h) : lch(0.27, Math.min(o.c, 0.05), o.h);
  const onSubtleStart =
    mode === 'light' ? lch(0.35, Math.min(o.c, 0.1), o.h) : lch(0.92, Math.min(o.c, 0.04), o.h);
  const onSubtle = ensureContrast(onSubtleStart, [subtle], 4.5) ?? bestOn(subtle);
  return {
    [prefix]: fill,
    [`${prefix}-hover`]: hover,
    [`on-${prefix}`]: on,
    [`${prefix}-subtle`]: subtle,
    [`on-${prefix}-subtle`]: onSubtle,
  } as Partial<TokenMap>;
}

function buildMode(input: ThemeInput, mode: Mode, adjustments: string[]): TokenMap {
  const p = hexToOklch(input.primary);
  const nh = p.h;
  const light = mode === 'light';
  const bg = lch(light ? 0.985 : 0.17, 0.005, nh);
  const surface = lch(light ? 1 : 0.21, light ? 0 : 0.008, nh);
  const raised = lch(light ? 0.965 : 0.25, 0.008, nh);
  const surfaces = [bg, surface, raised];

  const text =
    ensureContrast(lch(light ? 0.2 : 0.95, 0.01, nh), surfaces, 7) ?? (light ? BLACK : WHITE);
  const muted = ensureContrast(lch(light ? 0.45 : 0.72, 0.012, nh), surfaces, 4.5) ?? text;
  const border = lch(light ? 0.88 : 0.32, 0.01, nh);
  const borderStrong = ensureContrast(lch(light ? 0.6 : 0.55, 0.012, nh), [bg, surface], 3) ?? text;

  const primaryParts = brandTokens('primary', input.primary, mode, [bg, surface], adjustments);
  const accentParts = brandTokens('accent', input.accent, mode, [bg, surface], adjustments);

  const link = ensureContrast(primaryParts.primary!, surfaces, 4.5) ?? text;
  const focus = ensureContrast(lch(light ? 0.5 : 0.75, 0.15, 250), [bg, surface], 3) ?? text;

  const status = (hue: number) => {
    const fill = lch(light ? 0.5 : 0.74, 0.16, hue);
    return { fill, on: bestOn(fill) };
  };
  const s = status(150);
  const w = status(80);
  const d = status(25);
  const i = status(250);

  return {
    bg,
    surface,
    'surface-raised': raised,
    border,
    'border-strong': borderStrong,
    text,
    'text-muted': muted,
    link,
    ...primaryParts,
    ...accentParts,
    'focus-ring': focus,
    success: s.fill,
    'on-success': s.on,
    warning: w.fill,
    'on-warning': w.on,
    danger: d.fill,
    'on-danger': d.on,
    info: i.fill,
    'on-info': i.on,
  } as TokenMap;
}

export function checkContrast(mode: Mode, tokens: TokenMap): ContrastRow[] {
  return REQUIRED_PAIRS.map(([fg, bg, min]) => {
    const ratio = contrastRatio(tokens[fg], tokens[bg]);
    return { mode, fg, bg, ratio, min, pass: ratio >= min };
  });
}

function applyOverrides(
  tokens: TokenMap,
  overrides: Record<string, string> | undefined,
  mode: Mode,
) {
  if (!overrides) return;
  const names = new Set<string>(TOKEN_NAMES);
  for (const [k, v] of Object.entries(overrides)) {
    if (!names.has(k)) throw new UnknownTokenError(`Unknown token "${k}" in ${mode} overrides`);
    tokens[k as TokenName] = v.toUpperCase();
  }
  // If a fill is overridden without its "on" color, pick a readable one.
  for (const fill of ['primary', 'accent', 'success', 'warning', 'danger', 'info'] as const) {
    const on = `on-${fill}` as TokenName;
    if (fill in overrides && !(on in overrides)) tokens[on] = bestOn(tokens[fill]);
  }
}

/** Derives a complete light and dark theme. Derived colors are auto-adjusted; overrides that fail AA are rejected. */
export function generateTheme(input: ThemeInput): Theme {
  const adjustments: string[] = [];
  const light = buildMode(input, 'light', adjustments);
  const dark = buildMode(input, 'dark', adjustments);

  const derivedFailures = [...checkContrast('light', light), ...checkContrast('dark', dark)].filter(
    (r) => !r.pass,
  );
  if (derivedFailures.length) throw new ThemeContrastError(derivedFailures);

  applyOverrides(light, input.overrides?.light, 'light');
  applyOverrides(dark, input.overrides?.dark, 'dark');

  const report = [...checkContrast('light', light), ...checkContrast('dark', dark)];
  const failures = report.filter((r) => !r.pass);
  if (failures.length) throw new ThemeContrastError(failures);

  return { light, dark, adjustments, report };
}

export type { Oklch };
