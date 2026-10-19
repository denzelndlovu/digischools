import { describe, expect, it } from 'vitest';
import {
  ThemeContrastError,
  UnknownTokenError,
  contrastRatio,
  generateTheme,
  hexToOklch,
  oklchToHex,
  renderPreviewHtml,
  toCss,
  toMobileTheme,
  TOKEN_NAMES,
  REQUIRED_PAIRS,
} from './index.js';

describe('color math', () => {
  it('computes known contrast ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1);
  });
  it('round-trips through OKLCH', () => {
    for (const hex of ['#1B7A4B', '#C9A227', '#336699', '#FF0000']) {
      expect(oklchToHex(hexToOklch(hex))).toBe(hex);
    }
  });
});

describe('generateTheme', () => {
  const green = { primary: '#1B7A4B', accent: '#C9A227' };

  it('produces every token for light and dark and passes AA', () => {
    const t = generateTheme(green);
    for (const mode of ['light', 'dark'] as const) {
      for (const n of TOKEN_NAMES) expect(t[mode][n]).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(t.report.every((r) => r.pass)).toBe(true);
  });

  it('keeps the school primary unchanged in light mode when it already passes', () => {
    expect(generateTheme(green).light.primary).toBe('#1B7A4B');
  });

  it('is deterministic', () => {
    expect(generateTheme(green)).toEqual(generateTheme(green));
  });

  it(
    'always yields AA-passing pairs over many pseudo-random brand colors',
    { timeout: 30000 },
    () => {
      let seed = 42;
      const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
      const color = () =>
        '#' +
        [0, 0, 0]
          .map(() =>
            Math.floor(rnd() * 256)
              .toString(16)
              .padStart(2, '0'),
          )
          .join('');
      for (let i = 0; i < 300; i++) {
        const input = { primary: color(), accent: color() };
        const t = generateTheme(input);
        for (const mode of ['light', 'dark'] as const) {
          for (const [fg, bg, min] of REQUIRED_PAIRS) {
            expect(contrastRatio(t[mode][fg], t[mode][bg])).toBeGreaterThanOrEqual(min);
          }
        }
      }
    },
  );

  it('handles extreme colors (white, black, yellow)', () => {
    for (const primary of ['#FFFFFF', '#000000', '#FFFF00']) {
      expect(() => generateTheme({ primary, accent: '#C9A227' })).not.toThrow();
    }
  });

  it('accepts a passing override and applies it', () => {
    const t = generateTheme({ ...green, overrides: { light: { primary: '#0B4F2D' } } });
    expect(t.light.primary).toBe('#0B4F2D');
  });

  it('rejects an override that breaks contrast', () => {
    expect(() =>
      generateTheme({ ...green, overrides: { light: { 'text-muted': '#DDDDDD' } } }),
    ).toThrow(ThemeContrastError);
  });

  it('rejects unknown override tokens', () => {
    expect(() => generateTheme({ ...green, overrides: { dark: { nope: '#000000' } } })).toThrow(
      UnknownTokenError,
    );
  });
});

describe('emitters', () => {
  const theme = generateTheme({ primary: '#1B7A4B', accent: '#C9A227' });
  it('emits CSS variables for light and dark', () => {
    const css = toCss(theme, { cornerRadius: 'md', fonts: { heading: 'Inter', body: "In'ter" } });
    expect(css).toContain('--color-primary: #1B7A4B;');
    expect(css).toContain("[data-theme='dark']");
    expect(css).toContain('--radius: 8px;');
    expect(css).not.toContain("In'ter");
  });
  it('emits a camelCase mobile theme', () => {
    const m = toMobileTheme(theme);
    expect(m.light.onPrimary).toBe(theme.light['on-primary']);
    expect(m.dark.surfaceRaised).toBe(theme.dark['surface-raised']);
  });
  it('renders a preview that escapes school text and hard-codes no brand colors', () => {
    const html = renderPreviewHtml('<b>X</b>', 'm', theme);
    expect(html).not.toContain('<b>X</b>');
    expect(html).toContain('&lt;b&gt;');
  });
});
