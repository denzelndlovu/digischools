export interface Oklch {
  l: number;
  c: number;
  h: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function parseHex(hex: string): [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`Invalid hex color: ${hex}`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

export function toHex(rgb: [number, number, number]): string {
  return (
    '#' +
    rgb
      .map((v) =>
        Math.round(Math.min(255, Math.max(0, v)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
      .toUpperCase()
  );
}

const toLinear = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const fromLinear = (v: number) => {
  const x = clamp01(v);
  return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
};

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = parseHex(hex).map(toLinear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(a, bb);
  const h = c < 1e-4 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = Math.pow(l + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m_ = Math.pow(l - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s_ = Math.pow(l - 0.0894841775 * a - 1.291485548 * b, 3);
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);

/** Converts to hex, reducing chroma until the color fits in sRGB. */
export function oklchToHex(color: Oklch): string {
  const l = clamp01(color.l);
  let lo = 0;
  let hi = color.c;
  let lin = oklchToLinear({ l, c: hi, h: color.h });
  if (!inGamut(lin)) {
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear({ l, c: mid, h: color.h }))) lo = mid;
      else hi = mid;
    }
    lin = oklchToLinear({ l, c: lo, h: color.h });
  }
  return toHex(lin.map(fromLinear) as [number, number, number]);
}

export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(toLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Moves lightness of `fg` away from the backgrounds until all reach `min`. Returns null if impossible. */
export function ensureContrast(fg: string, bgs: string[], min: number): string | null {
  const ok = (c: string) => bgs.every((bg) => contrastRatio(c, bg) >= min);
  if (ok(fg)) return fg;
  const start = hexToOklch(fg);
  const avgBgL = bgs.reduce((s, b) => s + hexToOklch(b).l, 0) / bgs.length;
  const dir = start.l >= avgBgL ? 1 : -1;
  for (const d of [dir, -dir]) {
    for (let step = 1; step <= 100; step++) {
      const cand = oklchToHex({ ...start, l: start.l + (d * step) / 100 });
      if (ok(cand)) return cand;
      const l = start.l + (d * step) / 100;
      if (l < 0 || l > 1) break;
    }
  }
  return null;
}
