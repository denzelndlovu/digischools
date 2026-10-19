import type { Theme, TokenMap } from './palette.js';
import { RADIUS_PX, type ThemeOptions } from './emit.js';

const scoped = (selector: string, tokens: TokenMap) =>
  `${selector}{${Object.entries(tokens)
    .map(([k, v]) => `--color-${k}:${v};`)
    .join('')}}`;

const fontVars = (opts: ThemeOptions) =>
  opts.fonts
    ? `--font-heading:'${opts.fonts.heading.replace(/[^A-Za-z0-9 _-]/g, '')}',system-ui,sans-serif;--font-body:'${opts.fonts.body.replace(/[^A-Za-z0-9 _-]/g, '')}',system-ui,sans-serif;`
    : '';

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const screens = (name: string, motto: string) => `
<header class="bar"><strong>${esc(name)}</strong><span class="muted">${esc(motto)}</span></header>
<main>
  <h2>Welcome back</h2>
  <div class="row">
    <button class="btn primary">Primary action</button>
    <button class="btn accent">Accent action</button>
    <button class="btn subtle-p">Subtle primary</button>
    <button class="btn subtle-a">Subtle accent</button>
    <a href="#" class="link">A text link</a>
  </div>
  <div class="cards">
    <section class="card"><h3>Attendance today</h3><p class="big">94%</p><p class="muted">12 late arrivals</p></section>
    <section class="card"><h3>Wallet balance</h3><p class="big">$7.50</p><p class="muted">Daily limit $5</p></section>
  </div>
  <label>Student name<input class="input" value="Tariro Moyo" /></label>
  <div class="row">
    <span class="chip s">Paid</span><span class="chip w">Due soon</span>
    <span class="chip d">Overdue</span><span class="chip i">New</span>
  </div>
</main>`;

/** Static HTML showing sample screens in light and dark, plus the contrast report. All colors come from tokens. */
export function renderPreviewHtml(
  schoolName: string,
  motto: string,
  theme: Theme,
  opts: ThemeOptions = {},
): string {
  const rows = theme.report
    .map(
      (r) =>
        `<tr class="${r.pass ? 'ok' : 'bad'}"><td>${r.mode}</td><td>${r.fg}</td><td>${r.bg}</td><td>${r.ratio.toFixed(2)}</td><td>${r.min}</td><td>${r.pass ? 'pass' : 'FAIL'}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(schoolName)} theme preview</title>
<style>
${scoped('.pane.light', theme.light)}
${scoped('.pane.dark', theme.dark)}
:root{--radius:${RADIUS_PX[opts.cornerRadius ?? 'md']}px;${fontVars(opts)}}
*{box-sizing:border-box}
body{margin:0;font-family:var(--font-body,system-ui,sans-serif);background:#888;display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px}
.pane{background:var(--color-bg);color:var(--color-text);border-radius:var(--radius);overflow:hidden;border:1px solid var(--color-border)}
.bar{display:flex;gap:12px;align-items:center;padding:12px 16px;background:var(--color-primary);color:var(--color-on-primary)}
.bar .muted{color:var(--color-on-primary);opacity:.85}
main{padding:16px;display:grid;gap:12px}
h2,h3{font-family:var(--font-heading,inherit);margin:0}
.muted{color:var(--color-text-muted)}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.btn{border:0;padding:10px 16px;min-height:44px;border-radius:var(--radius);font:inherit;cursor:pointer}
.btn:focus-visible,.input:focus-visible{outline:3px solid var(--color-focus-ring);outline-offset:2px}
.primary{background:var(--color-primary);color:var(--color-on-primary)}
.primary:hover{background:var(--color-primary-hover)}
.accent{background:var(--color-accent);color:var(--color-on-accent)}
.accent:hover{background:var(--color-accent-hover)}
.subtle-p{background:var(--color-primary-subtle);color:var(--color-on-primary-subtle)}
.subtle-a{background:var(--color-accent-subtle);color:var(--color-on-accent-subtle)}
.link{color:var(--color-link)}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.card{background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius);padding:12px}
.big{font-size:28px;margin:4px 0}
.input{display:block;margin-top:4px;width:100%;padding:10px;min-height:44px;border-radius:var(--radius);border:1px solid var(--color-border-strong);background:var(--color-surface);color:var(--color-text);font:inherit}
.chip{padding:4px 10px;border-radius:999px;font-size:14px}
.s{background:var(--color-success);color:var(--color-on-success)}
.w{background:var(--color-warning);color:var(--color-on-warning)}
.d{background:var(--color-danger);color:var(--color-on-danger)}
.i{background:var(--color-info);color:var(--color-on-info)}
.report{grid-column:1/-1;background:#fff;color:#111;padding:12px;border-radius:8px;font:13px system-ui}
.report table{border-collapse:collapse;width:100%}.report td,.report th{border:1px solid #ccc;padding:3px 6px;text-align:left}
.bad{background:#fdd}
</style></head><body>
<div class="pane light">${screens(schoolName, motto)}</div>
<div class="pane dark">${screens(schoolName, motto)}</div>
<section class="report"><h3>Contrast report (WCAG AA)</h3>
${theme.adjustments.length ? `<p>Auto-adjustments: ${theme.adjustments.map(esc).join('; ')}</p>` : ''}
<table><tr><th>Mode</th><th>Foreground</th><th>Background</th><th>Ratio</th><th>Min</th><th>Result</th></tr>${rows}</table></section>
</body></html>`;
}
