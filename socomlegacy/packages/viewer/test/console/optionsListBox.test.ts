// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { declIn, mediaAt, PAGE_RULES, type Rule } from './cascade';
import { mountShell } from './shell';

/**
 * LR-5's rows on the box (consoleAside.spec, the seat box's run on d88e98b5a): at 1920x1080 the Options rows' list drew
 * 629.5 px wide and the aside 694.5 px, where CX-ASIDE keeps the design's 57.5rem rows and leaves the aside its 25.25rem
 * (`console.css`, CX-11 and CX-ASIDE). Since LR-5 the list carries LR-1's `.cx-rlist` beside `.cx-rows`, so LR-3's rule
 * for a screen's row list (`.cx-screen__body > .cx-rlist { flex: 1 1 0 }`, the lobby screens' and Server information's)
 * caught it too, and -- as specific as CX-11's `.cx-rows[data-scroll]` and later -- took the list's flex basis to 0.
 * jsdom has no layout: the page's rules that match the drawn list are resolved here as the cascade does (unlayered page
 * rules, media at 1920 px, the more specific then the later winning). The row inside it is width 100%, border-box, with no
 * horizontal margin (a pin: a row never sits wider than its list at rest). A browser adaptation: the launcher's look.
 */
let page: ConsolePage | null = null;
beforeEach(() => { localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); });

/** A selector's specificity as [ids, classes / attributes / pseudo-classes, types]; :not / :is count their argument. */
function specificity(sel: string): [number, number, number] {
  const s = sel.replace(/::[\w-]+(\([^)]*\))?/g, '').replace(/:(not|is|where)\(/g, ' ').replace(/\)/g, ' ').replace(/\[[^\]]*\]/g, ' .a ');
  const ids = (s.match(/#[\w-]+/g) ?? []).length;
  const cls = (s.match(/\.[\w-]+/g) ?? []).length + (s.match(/:[\w-]+/g) ?? []).length;
  const types = (s.replace(/[.#:][\w-]+/g, ' ').match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return [ids, cls, types];
}
const cmp = (a: [number, number, number], b: [number, number, number]): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** The winning value of `prop` (or of the shorthand's part `fromShorthand` reads) on `el` among the page's unlayered rules at `w`. */
function winning(el: Element, w: number, read: (body: string) => string | null): { value: string; sel: string } | null {
  let best: { value: string; sel: string; spec: [number, number, number]; order: number } | null = null;
  PAGE_RULES.forEach((r: Rule, order) => {
    if (r.layered || !r.media.every((m) => mediaAt(m, w))) return;
    const v = read(r.body);
    if (v === null) return;
    for (const sel of r.sel) {
      let hit = false;
      try { hit = el.matches(`:root[data-console] ${sel}`); } catch { hit = false; }
      if (!hit) continue;
      const spec = specificity(`:root[data-console] ${sel}`);
      if (!best || cmp(spec, best.spec) > 0 || (cmp(spec, best.spec) === 0 && order >= best.order)) best = { value: v, sel, spec, order };
    }
  });
  return best ? { value: (best as { value: string }).value, sel: (best as { sel: string }).sel } : null;
}
/** A flex basis from a rule body: `flex-basis`, or the `flex` shorthand's third part (one number: a basis of 0). */
const basisOf = (body: string): string | null => {
  const b = declIn(body, 'flex-basis');
  const f = declIn(body, 'flex');
  if (f === null) return b;
  const parts = f.trim().split(/\s+(?![^(]*\))/);
  return parts.length >= 3 ? parts.slice(2).join(' ') : /^[\d.]+$/.test(parts[0]!) ? '0' : parts[0]!;
};

describe('LR-5: the Options rows\' list keeps CX-ASIDE\'s box', () => {
  it('at 1920 px its flex basis is CX-11\'s 57.5rem plus the focus-ring room, not a row list\'s 0', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    page.ctl.doAct('opt:display');
    page.render();
    const list = document.querySelector('#stage [data-key="options"] .cx-rows')!;
    expect(list.classList.contains('cx-rlist')).toBe(true);
    const won = winning(list, 1920, basisOf);
    expect(won?.value, `won by ${won?.sel}`).toBe('calc(57.5rem + 2 * (var(--s2u-focus-w) + 3px))');
  });

  it('a row is the list\'s width: 100 %, border-box, no horizontal margin', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    page.ctl.doAct('opt:display');
    page.render();
    const row = document.querySelector('#stage [data-key="options"] .cx-rows [data-act="optrow"]')!;
    expect(winning(row, 1920, (b) => declIn(b, 'width'))?.value).toBe('100%');
    expect(winning(row, 1920, (b) => declIn(b, 'box-sizing'))?.value).toBe('border-box');
    expect(winning(row, 1920, (b) => declIn(b, 'margin') ?? declIn(b, 'margin-left') ?? declIn(b, 'margin-right'))).toBeNull();
  });
});
