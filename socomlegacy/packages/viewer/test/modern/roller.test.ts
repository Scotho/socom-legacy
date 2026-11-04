// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { rollerStep } from '../../src/modern/roller';
import { mountShell } from '../console/shell';

/**
 * MU2-8 (MU2-4's review F2; MU.R19: a general pattern is the design system's, never forked): the settings' rollers (and
 * the loadout editor's, until CX-LOADOUTS retired it to the console's own rollers) are the design system's
 * `.cx-roller` -- part G's anatomy (the label, the step marks either side of the value pill, the gold bar on the focused
 * row) over a native select, `.cx-roller--select` (shared/ds components.css part H) -- with step marks a pointer can
 * press and the select still the row's one stop. The modules' local stand-ins (a select between two CSS chevrons) are
 * gone; the console's own rollers are unchanged. CX-25 retired the modern Settings section (`settings/index.ts`, mounted
 * by the retired shell alone) with its sheet, so the case of its rows and of its sheet's stand-in went with it. CX-26
 * retired the roller itself (`asRoller`, `rollerControl`, `stepRoller`), made by these tests alone since, its anatomy
 * cases named in CX-26's commit and the console plan's Log; `rollerStep` (the setup page walker's) and part H stay.
 */
const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string): string => readFileSync(resolve(here, p), 'utf-8');
const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

/** A bare select of `values`, then `disabled` ones (a card value off the original's values). */
function select(values: string[], disabled: string[] = []): HTMLSelectElement {
  const s = document.createElement('select');
  for (const v of [...values, ...disabled]) { const o = document.createElement('option'); o.value = v; o.textContent = v; o.disabled = disabled.includes(v); s.append(o); }
  document.body.append(s);
  return s;
}

describe('rollerStep (src/modern/roller.ts): the walker\'s step over a select', () => {
  it('on a value of the list, its neighbour, the ends kept', () => {
    const s = select(['0', '1', '2']);
    s.value = '1';
    expect(rollerStep(s, 1)?.value).toBe('2');
    expect(rollerStep(s, -1)?.value).toBe('0');
    s.value = '2';
    expect(rollerStep(s, 1)?.value).toBe('2');
  });
  it('from a value held in a disabled option, the nearest value that way (by number), else the nearest at all', () => {
    const s = select(['0', '50', '100'], ['300']);
    s.value = '300';
    expect(rollerStep(s, -1)?.value).toBe('100');
    expect(rollerStep(s, 1)?.value).toBe('100');
  });
});

// ----- the design system's part H, and the console untouched

describe('shared/ds: part H extends part G\'s .cx-roller; the console\'s rollers are unchanged', () => {
  const components = read('../../../../../shared/ds/components.css');
  const G = components.indexOf('/* ---- part G');
  const H = components.indexOf('/* ---- part H');
  it('part H sits after part F and before part G (so part G stays the export\'s bytes), and styles the select-backed roller', () => {
    expect(H).toBeGreaterThan(components.indexOf('/* ---- part F'));
    expect(H).toBeLessThan(G);
    // Part H alone: it ends at part I's mark (1.8.0, the extraction popover, placed after it; DX-2's review F6), else at G.
    const I = components.indexOf('/* ---- part I');
    const h = strip(components.slice(H, I > H && I < G ? I : G));
    for (const sel of ['.cx-roller.cx-roller--select', '.cx-roller--select .cx-roller__value', '.cx-roller__step', '.cx-roller--select .cx-roller__value:disabled']) {
      expect(h, sel).toContain(`${sel} {`);
    }
    expect(h).not.toMatch(/opacity/);                                         // MU-8c: a disabled value dim, readable
    expect(strip(components.slice(G))).not.toMatch(/cx-roller--select|cx-roller__step/);
  });
  // LR-5 (the launcher redesign plan, the row "Settings"): the Options rows are LR-1's row kinds now, not part G's
  // rollers; the same facts held -- no native select and no part H class on them, and every row with values keeps the
  // pointer's step marks (`optstep`): a select's or a slider's two either side of its value, a toggle's pill toward the
  // other value.
  it('the console\'s Options rows: no select, no part H class; the pointer\'s step marks around the value (LR-5: LR-1\'s rows)', () => {
    let page: ConsolePage | null = null;
    mountShell(document);
    page = bootConsole(document, window, sampleAdapters(), { keymap: false });
    page.ctl.S.screen = 'options';
    page.ctl.S.opt = { cat: 0, row: 0, zone: 'rows' };
    page.render();
    const rows = [...document.querySelectorAll<HTMLElement>('#stage [data-key="options"] [data-act="optrow"]')];
    expect(rows.length).toBeGreaterThan(0);
    expect(document.querySelector('#stage [data-key="options"] .cx-roller')).toBeNull();
    for (const r of rows) {
      expect(r.classList.contains('cx-r')).toBe(true);
      expect(r.classList.contains('cx-roller--select')).toBe(false);
      expect(r.querySelector('select, .cx-roller__step')).toBeNull();
      if (r.classList.contains('is-action') || r.classList.contains('is-locked') || r.classList.contains('cx-r--info')) continue;
      const marks = [...r.querySelectorAll<HTMLElement>('[data-act="optstep"]')].map((e) => e.dataset['d']);
      if (r.classList.contains('cx-r--toggle')) expect(marks).toEqual([r.getAttribute('aria-checked') === 'true' ? '-1' : '1']);
      else expect(marks, r.outerHTML).toEqual(['-1', '1']);
    }
    page.dispose();
  });
});
