// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MU-8c of the modern-UI plan (`docs/plans/2026-10-09-modern-ui-parallel.md`; `briefs/modern-ui-inspiration.md` C1, C2,
 * C3, C8, C10 under MU.R13): one adaptation label per view, the caption sizes, one "needs disc" chip per settings panel
 * and the pad's prompts. All of it a browser adaptation (MU.R1). Changed deliberately for MU.R16 and MU.R20 (LU-1): the
 * Setup / Lobby strip, the rail and its gliding bar and the shell's hint bar are retired for the launcher's frame
 * (`test/modern/launcher.test.ts` holds the shelf and its ink), so the one label per view is the top bar's badge on
 * every tile, the disc control is the action bar's under every tile, and the hint bar's bindings are the action bar's
 * prompts. CX-9b (CX.R8): those three -- C1, C2 and C10 -- went with the launcher's frame (`src/modern/launcher.ts`, the
 * old layout); C3 and C8, the modern sections' own, stay. CX-25: C8's settings panels (the one "needs disc" chip per
 * panel) went with the modern Settings section (`settings/index.ts`, only the retired shell mounted it); the console's
 * Options say "Needs disc" per row (`test/console/adapters/options.test.ts`). The design system's select roller stays.
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../src');
const html = readFileSync(resolve(here, '../../setup/index.html'), 'utf8').replace(/\r\n/g, '\n');
const body = (): string => html.slice(html.indexOf('<body'), html.indexOf('</body>')).replace(/^<body[^>]*>/, '').replace(/<script[\s\S]*?<\/script>/g, '');
const css = (rel: string): string => readFileSync(resolve(src, rel), 'utf8');
const page = (): HTMLElement => document.getElementById('disc-page')!;

let sheets: HTMLStyleElement[] = [];
function addStyles(...files: string[]): void {
  for (const f of files) { const s = document.createElement('style'); s.textContent = css(f); document.head.append(s); sheets.push(s); }
}
beforeEach(() => { document.body.className = ''; document.body.innerHTML = body(); page().hidden = false; });
afterEach(() => { sheets.forEach((s) => s.remove()); sheets = []; vi.restoreAllMocks(); document.body.innerHTML = ''; });

/** Drawn: no ancestor is `hidden` or computes `display: none`. */
const shown = (el: Element | null): boolean => {
  for (let e = el; e; e = e.parentElement) if ((e as HTMLElement).hidden || getComputedStyle(e).display === 'none') return false;
  return true;
};
const rules = (text: string): { sel: string; body: string }[] =>
  [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! }));
const cssFiles = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : [];
});

describe('captions (C3: the system\'s floor -- captions 12px, text-dim 13px)', () => {
  const tokens = css('modern/tokens.css');
  const size = (name: string): number => Number(tokens.match(new RegExp(`${name}\\s*:\\s*\\d+\\s+(\\d+)px`))?.[1] ?? NaN);
  it('the caption token is 12px, the dim caption 13px, the mono readout the system\'s 13px readout', () => {
    expect(size('--mu-type-caption')).toBe(12);
    expect(size('--mu-type-caption-dim')).toBe(13);
    expect(tokens).toMatch(/--mu-type-mono\s*:\s*var\(--s2u-type-readout\)/);
  });
  it('no rule of the modern UI sets a 12px caption in text-dim, and none uses the 11px system captions directly', () => {
    for (const file of cssFiles(resolve(src, 'modern'))) {
      const text = readFileSync(file, 'utf8');
      expect(text, relative(src, file)).not.toMatch(/font\s*:\s*var\(--s2u-type-(stat-caption|readout-caption)\)/);
      for (const r of rules(text)) {
        if (/font\s*:\s*var\(--mu-type-caption\)/.test(r.body)) expect(r.body, `${relative(src, file)} ${r.sel}`).not.toMatch(/(^|[;\s])color\s*:\s*var\(--mu-text-dim\)/);
      }
    }
  });
});

describe('the design system\'s select roller (part H; MU2-6, MU2-8)', () => {
  it('a disabled roller (a choice, MU2-6) keeps its value readable: dim text, no opacity over the control', () => {
    // MU2-8 (MU2-4's review F2, MU.R19): the roller is the design system's `.cx-roller--select` now (shared/ds part H);
    // the rule moved there with it, the sheet's stand-in gone.
    const ds = readFileSync(resolve(here, '../../../../../shared/ds/components.css'), 'utf8');
    const r = rules(ds.slice(ds.indexOf('/* ---- part H'), ds.indexOf('/* ---- part G')));
    const off = r.find((x) => x.sel === '.cx-roller--select .cx-roller__value:disabled')!;
    expect(off.body).not.toMatch(/opacity/);
    expect(off.body).toMatch(/color\s*:\s*var\(--s2u-text-dim\)/);
    expect(r.find((x) => x.sel === '.cx-roller--select .cx-roller__value')!.body).toMatch(/font\s*:\s*var\(--s2u-type-tab\)/);
  });
});
