// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { pageRows } from '../../src/console/render/frame';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import type { Adapters, ReplayRow, ReplaysMore } from '../../src/console/state';
import { mountShell } from './shell';

/**
 * CX-11 (the owner, 2026-10-12, playing the console at 1080p: "settings page needs to be able to scroll"): a list taller
 * than the stage -- the Options category's rollers, Browse rooms' table, the replays list -- scrolls inside the stage.
 * The list is the scroll container (`data-scroll`, `src/console/console.css`); the panel keeps its frame and the stage's
 * fit is unchanged; in pad mode (the pad, and the development build's keyboard map) the focused row is kept in view by
 * moving that list's scrollTop only; in pointer mode the list keeps the scroll the wheel gave it; a re-render patches in
 * place and keeps scrollTop. A browser adaptation with no original (the project's own launcher page, OT.R28).
 *
 * jsdom has no layout: the geometry is stubbed -- the list's box is 100..400 px, row i sits at 100 + 60 i - scrollTop
 * and is 56 px tall -- so seven rows (416 px) overflow the 300 px box, as the owner's Options list overflows the stage.
 * The replays list's end line (`[data-more]`, RV-4) sits where one more row would.
 */
const BOX_TOP = 100;
const BOX_H = 300;
const PITCH = 60;
const ROW_H = 56;

let page: ConsolePage | null = null;
beforeEach(() => {
  mountShell(document);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const rect = (top: number, h: number): DOMRect => ({ top, bottom: top + h, height: h, left: 0, right: 800, width: 800, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    if (this.hasAttribute('data-scroll')) return rect(BOX_TOP, BOX_H);
    const box = this.closest('[data-scroll]');
    const i = this.hasAttribute('data-more') && box ? box.querySelectorAll('.cx-room').length : Number((this as HTMLElement).dataset?.i);
    if (box && Number.isFinite(i)) return rect(BOX_TOP + PITCH * i - box.scrollTop, ROW_H);
    return rect(0, 0);
  });
});
afterEach(() => { page?.dispose(); page = null; vi.restoreAllMocks(); });

const list = (sel: string): HTMLElement => {
  const el = document.querySelector<HTMLElement>(`#stage ${sel}`);
  if (!el) throw new Error(`no ${sel}`);
  return el;
};
/** The focused row lies inside the list's box. */
const inView = (box: HTMLElement): boolean => {
  const f = box.querySelector('.is-focused')!;
  const r = f.getBoundingClientRect();
  return r.top >= BOX_TOP && r.bottom <= BOX_TOP + BOX_H;
};

describe('CX-11: the Options list scrolls within the stage', () => {
  const openDisplay = (): void => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: false });
    page.ctl.S.screen = 'options';
    page.ctl.S.opt = { cat: 0, row: 0, zone: 'rows' };
    page.ctl.S.input = 'pad';
    page.render();
  };

  it('the rollers\' list is the scroll container; the stylesheet makes it one under the page\'s mark', () => {
    openDisplay();
    const rows = list('.cx-rows');
    expect(rows.hasAttribute('data-scroll')).toBe(true);
    expect(rows.querySelectorAll('[data-act="optrow"]')).toHaveLength(7);              // LR-5: LR-1's rows, the grammar's act
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/console/console.css'), 'utf-8');
    const rule = /:root\[data-console\] \[data-scroll\]\s*\{([^}]*)\}/.exec(css);
    expect(rule, 'a [data-scroll] rule under :root[data-console]').not.toBeNull();
    expect(rule![1]).toMatch(/overflow-y:\s*auto/);
    expect(rule![1]).toMatch(/min-height:\s*0/);
    // The pad's focus ring (components.css: var(--s2u-focus-w) wide at outline-offset 3px) is drawn inside the box.
    expect(rule![1]).toMatch(/padding:\s*calc\(var\(--s2u-focus-w\) \+ 3px\)/);
    expect(rule![1]).toMatch(/margin:\s*calc\(-1 \* \(var\(--s2u-focus-w\) \+ 3px\)\)/);
    // The rollers keep the design's width: .cx-rows' flex-basis is 57.5rem plus the room on both sides, in a rule
    // outside the s2u.base layer (inside it, the component's `.cx-rows { flex: 0 1 57.5rem }` would win), above the
    // phone rule.
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');                     // the comments out: no brace of theirs counts
    const start = bare.indexOf('@layer s2u.base {');
    expect(start).toBeGreaterThanOrEqual(0);
    let depth = 0;
    let end = -1;
    for (let i = bare.indexOf('{', start); i < bare.length; i++) {
      if (bare[i] === '{') depth++;
      else if (bare[i] === '}' && --depth === 0) { end = i; break; }
    }
    expect(end).toBeGreaterThan(start);
    const basis = /@media \(width > 760px\) \{\s*:root\[data-console\] \.cx-rows\[data-scroll\] \{ flex-basis: calc\(57\.5rem \+ 2 \* \(var\(--s2u-focus-w\) \+ 3px\)\); \}\s*\}/;
    expect(bare.slice(start, end + 1)).not.toMatch(/\.cx-rows\[data-scroll\]/);
    expect(bare.slice(end + 1), 'the flex-basis rule, unlayered, after the s2u.base block').toMatch(basis);
  });

  it('each category has its own scroll box (data-key): a scrolled Display leaves Audio opened at its top', () => {
    openDisplay();
    const display = list('.cx-rows');
    for (let k = 0; k < 6; k++) page!.ctl.press('down');
    expect(display.scrollTop).toBeGreaterThan(0);
    page!.ctl.press('r1');                                               // the next category
    expect(page!.ctl.S.opt.cat).toBe(1);
    const audio = list('.cx-rows');
    expect(audio).not.toBe(display);
    expect(audio.getAttribute('data-key')).toBe('rows-audio');
    expect(audio.scrollTop).toBe(0);
    expect(inView(audio)).toBe(true);
  });

  it('Interface size: a step that rescales the page (host.fit) keeps the focused row in view though the focus did not move', () => {
    openDisplay();
    const rows = list('.cx-rows');
    for (let k = 0; k < 5; k++) page!.ctl.press('down');
    expect(page!.ctl.S.opt.row).toBe(5);
    expect(page!.ctl.A.options.categories()[0]!.rows[5]!.id).toBe('uiscale');
    rows.scrollTop = 0;                                                  // the wheel took the row out of view (400..456)
    page!.render();
    expect(rows.scrollTop).toBe(0);                                      // the same focus at the same scale: kept
    const before = document.documentElement.style.fontSize;
    page!.ctl.press('right');                                            // 100% -> 115%: optStep -> host.fit()
    expect(document.documentElement.style.fontSize).not.toBe(before);
    expect(inView(rows)).toBe(true);
    expect(rows.scrollTop).toBe(PITCH * 5 + ROW_H - BOX_H);
  });

  it('walking down to the last row (pad) scrolls it into view; walking back up scrolls back', () => {
    openDisplay();
    const rows = list('.cx-rows');
    for (let k = 0; k < 6; k++) page!.ctl.press('down');
    expect(page!.ctl.S.opt.row).toBe(6);
    expect(list('.cx-rows')).toBe(rows);                                 // patched in place
    expect(rows.scrollTop).toBe(PITCH * 6 + ROW_H - BOX_H);             // the last row's bottom on the box's bottom
    expect(inView(rows)).toBe(true);
    for (let k = 0; k < 6; k++) page!.ctl.press('up');
    expect(rows.scrollTop).toBe(0);
    expect(inView(rows)).toBe(true);
  });

  it('a re-render keeps scrollTop: in pad mode with the focused row in view, and in pointer mode after the wheel', () => {
    openDisplay();
    const rows = list('.cx-rows');
    for (let k = 0; k < 6; k++) page!.ctl.press('down');
    const st = rows.scrollTop;
    expect(st).toBeGreaterThan(0);
    page!.render();
    expect(list('.cx-rows')).toBe(rows);
    expect(rows.scrollTop).toBe(st);
    // Pad mode, then the wheel (no pointerdown: the mode stays pad) scrolls the focused row away: a re-render keeps it.
    rows.scrollTop = 20;
    page!.render();
    expect(rows.scrollTop).toBe(20);
    // Pointer mode: the wheel scrolled the list to the top; hovering a row moves focus and re-renders, never scrolls.
    page!.ctl.S.input = 'pointer';
    rows.scrollTop = 0;
    rows.querySelectorAll<HTMLElement>('[data-act="optrow"]')[3]!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(page!.ctl.S.opt.row).toBe(3);
    expect(list('.cx-rows')).toBe(rows);
    expect(rows.scrollTop).toBe(0);
    rows.scrollTop = 40;
    page!.render();
    expect(rows.scrollTop).toBe(40);
    // Back to the pad: the first press brings the focused row into view again (row 4 at 340..396, inside 100..400).
    page!.ctl.S.input = 'pad';
    rows.scrollTop = 0;
    page!.ctl.press('down');
    expect(page!.ctl.S.opt.row).toBe(4);
    expect(inView(rows)).toBe(true);
    page!.ctl.press('down');
    page!.ctl.press('down');
    expect(page!.ctl.S.opt.row).toBe(6);
    rows.scrollTop = 0;                                                  // the wheel took row 6 out of view (460..516)
    expect(inView(rows)).toBe(false);
    page!.ctl.S.input = 'pointer';
    page!.render();
    page!.ctl.S.input = 'pad';
    page!.render();                                                      // the first pad render after the pointer
    expect(inView(rows)).toBe(true);
  });
});

describe('CX-11: Browse rooms\' table and the replays list scroll within the stage', () => {
  it('Browse rooms: the rows sit in the scroll container, the head and the foot outside it; the last row is kept in view', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: false });
    page.ctl.S.screen = 'rooms';
    page.ctl.S.rooms.row = 0;
    page.ctl.S.input = 'pad';
    page.render();
    const box = list('.cx-rooms [data-scroll]');
    expect(box.querySelectorAll('.cx-room')).toHaveLength(6);
    expect(box.querySelector('.cx-rooms__head, .cx-rooms__foot')).toBeNull();
    expect(list('.cx-rooms > .cx-rooms__head')).toBeTruthy();
    expect(list('.cx-rooms > .cx-rooms__foot')).toBeTruthy();
    for (let k = 0; k < 5; k++) page.ctl.press('down');
    expect(page.ctl.S.rooms.row).toBe(5);
    expect(list('.cx-rooms [data-scroll]')).toBe(box);
    expect(box.scrollTop).toBe(PITCH * 5 + ROW_H - BOX_H);
    expect(inView(box)).toBe(true);
  });

  it('the replays list: its rows sit in the scroll container and the last is kept in view', () => {
    const a: Adapters = sampleAdapters();
    const entries: ReplayRow[] = Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, map: 'Crossroads', rules: 'Suppression', when: '2026-10-11 20:00', length: '12:00', players: 8, names: 'A, B' }));
    a.replays.view = () => ({ kind: 'ok', entries });
    page = bootConsole(document, window, a, { keymap: false });
    page.ctl.S.screen = 'replays';
    page.ctl.S.rp.row = 0;
    page.ctl.S.input = 'pad';
    page.render();
    const box = list('.cx-rooms [data-scroll]');
    expect(box.querySelectorAll('.cx-room')).toHaveLength(8);
    for (let k = 0; k < 7; k++) page.ctl.press('down');
    expect(page.ctl.S.rp.row).toBe(7);
    expect(box.scrollTop).toBe(PITCH * 7 + ROW_H - BOX_H);
    expect(inView(box)).toBe(true);
  });

  it("RV-4 (the sprint 39 close, round 2): on the last row the list's end line is kept in view too, and its state's change scrolls again", () => {
    const a: Adapters = sampleAdapters();
    const entries: ReplayRow[] = Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, map: 'Crossroads', rules: 'Suppression', when: '2026-10-11 20:00', length: '12:00', players: 8, names: 'A, B' }));
    let more: ReplaysMore = { kind: 'idle' };
    a.replays.view = () => ({ kind: 'ok', entries, more });
    page = bootConsole(document, window, a, { keymap: false });
    page.ctl.S.screen = 'replays';
    page.ctl.S.rp.row = 0;
    page.ctl.S.input = 'pad';
    page.render();
    const box = list('.cx-rooms [data-scroll]');
    const end = (): HTMLElement => box.querySelector<HTMLElement>('[data-more]')!;
    const endInView = (): boolean => { const r = end().getBoundingClientRect(); return r.top >= BOX_TOP && r.bottom <= BOX_TOP + BOX_H; };
    for (let k = 0; k < 7; k++) page.ctl.press('down');
    expect(page.ctl.S.rp.row).toBe(7);
    expect(end().previousElementSibling).toBe(box.querySelector('.cx-room.is-focused'));
    expect(box.scrollTop).toBe(PITCH * 8 + ROW_H - BOX_H);               // the end line's bottom on the box's bottom
    expect(endInView()).toBe(true);
    expect(inView(box)).toBe(true);
    // The same focus and state: a re-render keeps the scroll the wheel gave it.
    box.scrollTop = 0;
    page.render();
    expect(box.scrollTop).toBe(0);
    // The state changes (idle -> loading -> failed): each re-scrolls the end line into view, the row with it.
    for (const next of [{ kind: 'loading' }, { kind: 'failed', title: 'Server unreachable', words: 'The match server did not answer. Check the connection and try again.' }] as ReplaysMore[]) {
      more = next;
      box.scrollTop = 0;
      page.render();
      expect(end().dataset['more']).toBe(next.kind);
      expect(endInView(), `${next.kind}: the end line in view`).toBe(true);
      expect(inView(box)).toBe(true);
    }
  });
});

/**
 * CX-12: L2 / R2 page a list taller than its pane. The page is the pane's height in rows, measured on the page
 * (`pageRows`: the scroll box's height less its padding, over the row pitch); null when the list fits. The legend shows
 * "Page" on L2 R2 only while the focused list overflows, and never where L2 / R2 are the screen's own (Browse rooms'
 * filter). The stubbed geometry above: a 300 px box, rows 60 px apart, so five rows a page; the box's content height is
 * its rows' (`scrollHeight`), and `fits` makes the box tall enough for all of them.
 */
describe('CX-12: L2 / R2 page a list taller than its pane', () => {
  let fits = false;
  beforeEach(() => {
    fits = false;
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute('data-scroll') ? (fits ? 10_000 : BOX_H) : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute('data-scroll') ? this.children.length * PITCH : 0;
    });
  });
  const openDisplay = (): ConsolePage => {
    const p = bootConsole(document, window, sampleAdapters(), { keymap: false });
    p.ctl.S.screen = 'options';
    p.ctl.S.opt = { cat: 0, row: 0, zone: 'rows' };
    p.ctl.S.input = 'pad';
    p.render();
    return p;
  };
  const legend = (): string[] => [...document.querySelectorAll('#legend .cx-prompt .cx-label')].map((e) => e.textContent!.trim());

  it('pageRows: the pane\'s height in rows while the focused row\'s list overflows; null when it fits or nothing is focused', () => {
    page = openDisplay();
    expect(pageRows(document)).toBe(Math.floor(BOX_H / PITCH));
    fits = true;
    expect(pageRows(document)).toBeNull();
    fits = false;
    page.ctl.S.opt.zone = 'cats';
    page.render();
    expect(pageRows(document)).toBeNull();                                // the focused tab is in no scroll box
  });

  it('Options: R2 pages the rollers down and keeps the row in view, L2 back up; the legend says Page on L2 R2', () => {
    page = openDisplay();
    const rows = list('.cx-rows');
    expect(legend()).toContain('Page');
    page.ctl.padPress('r2');
    expect(page.ctl.S.opt.row).toBe(5);
    expect(inView(rows)).toBe(true);
    expect(rows.scrollTop).toBe(PITCH * 5 + ROW_H - BOX_H);
    page.ctl.padPress('r2');
    expect(page.ctl.S.opt.row).toBe(6);
    page.ctl.padPress('l2');
    expect(page.ctl.S.opt.row).toBe(1);
    expect(inView(rows)).toBe(true);
    const prompt = [...document.querySelectorAll<HTMLElement>('#legend .cx-prompt')].find((e) => e.textContent!.includes('Page'))!;
    expect(prompt.dataset['b']).toBe('r2');                              // its click pages down, as Filter's presses R2
    prompt.click();
    expect(page.ctl.S.opt.row).toBe(6);
  });

  it('a list that fits: no Page on the legend, and L2 / R2 move nothing', () => {
    fits = true;
    page = openDisplay();
    expect(legend()).not.toContain('Page');
    page.ctl.padPress('r2');
    expect(page.ctl.S.opt.row).toBe(0);
  });

  it('Browse rooms: an overflowing table keeps L2 R2 for its filter and shows no Page', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: false });
    page.ctl.S.screen = 'rooms';
    page.ctl.S.input = 'pad';
    page.render();
    expect(pageRows(document)).not.toBeNull();
    expect(legend()).toContain('Filter');
    expect(legend()).not.toContain('Page');
    page.ctl.padPress('r2');
    expect(page.ctl.S.rooms.filter).toBe(1);
  });
});
