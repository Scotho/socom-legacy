// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { rootFontPx } from '../../src/console/fit';
import { legendHtml, prompts } from '../../src/console/render/legend';
import { roomsHtml } from '../../src/console/render/rooms';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { createState, type Adapters, type Room } from '../../src/console/state';
import { declsOf, fontSizeOf, rem, ruleApplies, side, TIERS, words, type At, type MediaEnv } from './cascade';

/**
 * LR-45 (the launcher plan; the box run 7 side-by-side, `agent-mail/evidence/review-lr-close7-2ed58d9c7-side-by-side.md`):
 * - N5: at 1280x720 Browse rooms' MAP and MODE columns overlapped (`<m>online-rooms-1280x720`: the head "MAPMODE", the map
 *   drawn over the mode, "Fish Hook" on two lines). The cx layer's columns need 45rem; beside LR-37 (9)'s left column and
 *   the drawer's fixed 35rem the table had 39.5rem (1280x720) and 19.5rem (1024x768), the map's free track 0.
 * - N6: at 844x390, the pad's prompts drawn, Settings' legend cut its last prompt mid-chip (R1 half drawn, "Category"
 *   lost; `<m>settings-rested-844x390`).
 *
 * jsdom has no layout, so the rules are read as `./lr19Legend.test.ts` reads them (`./cascade`'s tiers, a height-,
 * pointer- and input-aware media reading) and the room summed from them. Words are bounded by an advance per character
 * read off run 7's frames (below); the box's rested frames (LR-45's spec cases) are the rendered check. A browser
 * adaptation: the launcher's layout, nothing of the game.
 */

interface Env extends MediaEnv { w: number; h: number; pointer: 'fine' | 'coarse'; input: 'pointer' | 'pad' }

function part(prop: string, name: string, v: string): string | null {
  if (name === prop) return v;
  const box = /^(margin|padding)-(top|right|bottom|left)$/.exec(prop);
  if (box && name === box[1]) return side(v, (['top', 'right', 'bottom', 'left'] as const).indexOf(box[2] as 'top') as 0 | 1 | 2 | 3);
  if (box && name === `${box[1]}-inline` && (box[2] === 'left' || box[2] === 'right')) { const w = words(v); return box[2] === 'left' ? w[0]! : (w[1] ?? w[0]!); }
  if ((prop === 'row-gap' || prop === 'column-gap') && name === 'gap') { const w = words(v); return prop === 'row-gap' ? w[0]! : (w[1] ?? w[0]!); }
  if (prop === 'flex-shrink' && name === 'flex') {
    const w = words(v);
    return v === 'none' ? '0' : v === 'auto' ? '1' : w.length >= 2 && !/[a-z%]/.test(w[1]!) ? w[1]! : '1';
  }
  if (prop === 'font-size' && name === 'font') return fontSizeOf(v);   // LR-46: a calc() size too (was: a bare rem only)
  return null;
}
/** `prop` on the element `sels` names (most specific first) at `env`, as `./lr19Legend.test.ts` `decl` reads it. */
function decl(sels: string[], prop: string, env: Env): string | null {
  for (const tier of TIERS) {
    for (const sel of sels) {
      const pads = [`:root[data-console][data-input="pad"] ${sel}`, `:root[data-input="pad"] ${sel}`];
      let plain: string | null = null;
      let padded: string | null = null;
      for (const r of tier) {
        if (!ruleApplies(r, env)) continue;
        const isPlain = r.sel.includes(sel);
        const isPad = env.input === 'pad' && pads.some((p) => r.sel.includes(p));
        if (!isPlain && !isPad) continue;
        for (const [n, v] of declsOf(r.body)) {
          const p = part(prop, n, v);
          if (p == null) continue;
          if (isPad) padded = p; else plain = p;
        }
      }
      if (padded ?? plain) return padded ?? plain;
    }
  }
  return null;
}
const need = (sels: string[], prop: string, env: Env): string => {
  const v = decl(sels, prop, env);
  if (v == null) throw new Error(`no ${prop} for ${sels.join(' / ')} at ${env.w}x${env.h}`);
  return v;
};
const atOf = (w: number, h: number): At => ({ w, h, ui: 0, px: rootFontPx(w, h, 0), bar: 0 });

/* ---------- N5: Browse rooms' columns ---------- */

const ROOMS = '.cx-screen[data-key="rooms"]';

/** A flex item's grow, shrink and basis (rem; `auto` / a bare number's basis 0, `none` the item's width). */
function flexOf(sels: string[], env: Env, a: At): { grow: number; shrink: number; basis: number } {
  const f = decl(sels, 'flex', env) ?? '0 1 auto';
  const width = (): number => rem(need(sels, 'width', env), a);
  if (f === 'none') return { grow: 0, shrink: 0, basis: width() };
  const w = words(f);
  if (w.length === 1) return { grow: Number(w[0]), shrink: 1, basis: 0 };
  const basis = w[2] === undefined || w[2] === 'auto' ? width() : rem(w[2], a);
  return { grow: Number(w[0]), shrink: Number(w[1]), basis };
}

/** The table's and the drawer's widths (rem) beside the left column, flex's grow and its scaled shrink, each at its min-width. */
function body(w: number, h: number): { table: number; drawer: number; tableMin: number } {
  const env: Env = { w, h, pointer: 'fine', input: 'pointer' };
  const a = atOf(w, h);
  const len = (v: string): number => rem(v, a);
  const frame = w / a.px - len(need(['.cx-app'], 'padding-left', env)) - len(need(['.cx-app'], 'padding-right', env));
  const gap = len(need([`${ROOMS} .cx-screen__body`, '.cx-screen__body'], 'column-gap', env));
  const kinds = flexOf([`${ROOMS} .cx-kinds`], env, a).basis;
  const avail = frame - kinds - 2 * gap;
  const items = [
    { ...flexOf([`${ROOMS} .cx-rooms`, '.cx-rooms'], env, a), min: len(decl([`${ROOMS} .cx-rooms`, '.cx-rooms'], 'min-width', env) ?? '0') },
    { ...flexOf([`${ROOMS} .cx-drawer`, '.cx-drawer'], env, a), min: len(decl([`${ROOMS} .cx-drawer`, '.cx-drawer'], 'min-width', env) ?? '0') },
  ];
  const free = avail - items[0]!.basis - items[1]!.basis;
  let size: number[];
  if (free >= 0) {
    const g = items[0]!.grow + items[1]!.grow;
    size = items.map((it) => it.basis + (g ? (free * it.grow) / g : 0));
  } else {
    const weight = (it: typeof items[number]): number => it.shrink * it.basis;
    const ws = weight(items[0]!) + weight(items[1]!);
    size = items.map((it) => Math.max(it.min, it.basis + (ws ? (free * weight(it)) / ws : 0)));
  }
  return { table: size[0]!, drawer: size[1]!, tableMin: items[0]!.basis };
}

/** The row's tracks (rem) in a table `table` rem wide: fixed lengths, then `minmax(min, Nfr)` sharing what is left. */
function tracks(w: number, h: number, table: number): number[] {
  const env: Env = { w, h, pointer: 'fine', input: 'pointer' };
  const a = atOf(w, h);
  const row = [`${ROOMS} .cx-room`, '.cx-room'];
  const cols = words(need(row, 'grid-template-columns', env));
  const gap = rem(need(row, 'column-gap', env), a);
  const inner = table - rem(need(row, 'padding-left', env), a) - rem(need(row, 'padding-right', env), a) - (cols.length - 1) * gap;
  const spec = cols.map((c) => {
    const mm = /^minmax\(([^,]+),\s*([\d.]+)fr\)$/.exec(c);
    if (mm) return { min: rem(mm[1]!, a), fr: Number(mm[2]) };
    const fr = /^([\d.]+)fr$/.exec(c);
    if (fr) return { min: 0, fr: Number(fr[1]) };
    return { min: rem(c, a), fr: 0 };
  });
  const out = spec.map((s) => (s.fr ? 0 : s.min));
  const frozen = spec.map((s) => !s.fr);
  for (;;) {
    const left = inner - out.reduce((t, x, i) => t + (frozen[i] ? x : 0), 0);
    const frs = spec.reduce((t, s, i) => t + (frozen[i] ? 0 : s.fr), 0);
    if (!frs) break;
    const unit = Math.max(0, left / frs);
    const low = spec.findIndex((s, i) => !frozen[i] && s.fr * unit < s.min);
    if (low < 0) { spec.forEach((s, i) => { if (!frozen[i]) out[i] = s.fr * unit; }); break; }
    out[low] = spec[low]!.min;
    frozen[low] = true;
  }
  return out;
}

/**
 * The advance of a character in em, read off run 7's 1280x720 frame (`<m>online-rooms-1280x720`, the row's 1.375rem face
 * at 17.6px): "Suppression" 78px (0.40em a character), "FOXTROT" 75px (0.61em, its capitals and the name's 0.06em
 * spacing); the count's and the head's mono at 0.6em. Each bound sits above its measure.
 */
const ADV_ROW = 0.45;
const ADV_NAME = 0.66;
const ADV_MONO = 0.6;

/** The sizes the table is drawn at above the phone rule (LR.R12's desktop sizes, the run's 1440x900 and the short landscape). */
const WIDE: readonly (readonly [number, number])[] = [[1920, 1080], [1600, 900], [1440, 900], [1366, 768], [1280, 720], [1024, 768], [844, 390]];

describe('LR-45 N5: Browse rooms\' columns hold their words above the phone rule', () => {
  const A = sampleAdapters() as Adapters;
  const rooms = A.rooms.list();
  const longest = (xs: string[]): number => Math.max(...xs.map((x) => x.length));
  // LR-46's review fold (F1, F2): the faces read through the cascade, the launcher's type token in them (was: the cx
  // layer's 1.375rem row, 1.25rem count, 1rem ping word and the head's 0.6875rem written here).
  const TV: Env = { w: 1920, h: 1080, pointer: 'fine', input: 'pointer' };
  const size = (sels: string[]): number => rem(need(sels, 'font-size', TV), atOf(1920, 1080));
  const fontRem = size(['.cx-room']);
  const needs = {
    name: longest(rooms.map((r) => r.name)) * ADV_NAME * fontRem,
    map: longest(rooms.map((r) => r.map)) * ADV_ROW * fontRem,
    mode: longest(rooms.map((r) => r.mode ?? '')) * ADV_ROW * fontRem,
    count: longest(rooms.map((r) => (r.cap === null ? String(r.n) : `${r.n}/${r.cap}`))) * ADV_MONO * size(['.cx-room__count']),
    // The ping cell: its three bars (1.125rem), the cx layer's 0.5rem gap, the longest band word in the label face (its
    // `.cx-ping` size) with its 0.1em spacing.
    ping: 1.125 + 0.5 + 4 * (ADV_MONO + 0.1) * size(['.cx-ping']),
    head: 'Players'.length * (ADV_MONO + 0.18) * size(['.cx-rooms__head']),   // the head's mono capitals, 0.18em spaced
  };
  it('the faces are the token\'s: the row 1.375rem, the count 1.25rem, the ping 1rem, the head 0.6875rem, each times --cx-text-scale', () => {
    expect(fontRem).toBeCloseTo(1.375 * 1.08, 6);
    expect(size(['.cx-room__count'])).toBeCloseTo(1.25 * 1.08, 6);
    expect(size(['.cx-ping'])).toBeCloseTo(1.08, 6);
    expect(size(['.cx-rooms__head'])).toBeCloseTo(0.6875 * 1.08, 6);
  });
  it('the sample\'s rooms are the frame\'s (the words the bound reads)', () => {
    expect(rooms.map((r) => r.map)).toContain('Fish Hook');
    expect(rooms.map((r) => r.mode)).toContain('Suppression');
  });

  for (const [w, h] of WIDE) {
    it(`${w}x${h}: no text track is squeezed under its words, the table keeps its least width`, () => {
      const b = body(w, h);
      const t = tracks(w, h, b.table);
      expect(t.length, 'five columns: room, map, mode, players, ping').toBe(5);
      const [name, map, mode, count, ping] = t as [number, number, number, number, number];
      const at = `${w}x${h}, table ${b.table.toFixed(2)}rem, tracks ${t.map((x) => x.toFixed(2)).join(' / ')}rem`;
      expect.soft(name, `the room's name: ${at}`).toBeGreaterThanOrEqual(needs.name);
      expect.soft(map, `the map ("Fish Hook" wrapped): ${at}`).toBeGreaterThanOrEqual(needs.map);
      expect.soft(mode, `the mode (drawn over the map): ${at}`).toBeGreaterThanOrEqual(needs.mode);
      expect.soft(count, `the players: ${at}`).toBeGreaterThanOrEqual(Math.max(needs.count, needs.head));
      expect.soft(ping, `the ping: ${at}`).toBeGreaterThanOrEqual(needs.ping);
      expect.soft(b.table + 1e-9, `the table under its least width: ${at}`).toBeGreaterThanOrEqual(b.tableMin);
    });
  }

  for (const [w, h] of [[1920, 1080], [1366, 768], [1280, 720], [1024, 768]] as const) {
    it(`${w}x${h}: the drawer keeps its side tiles' names whole`, () => {
      const env: Env = { w, h, pointer: 'fine', input: 'pointer' };
      const a = atOf(w, h);
      const { drawer } = body(w, h);
      const pad = rem(need(['.cx-drawer__body'], 'padding-left', env), a) + rem(need(['.cx-drawer__body'], 'padding-right', env), a);
      const tile = (drawer - pad - rem(need(['.cx-sides'], 'column-gap', env), a)) / 2 - 2;   // the tile's 1rem side padding
      // "TERRORISTS" in the label face, 0.18em spaced: 86px at 12.8px in the frame at 1rem (6.7rem); bound 0.6 + 0.18em, at
      // the side name's size (LR-46: 1rem times the token; was 1rem).
      const face = rem(need(['.cx-side__name'], 'font-size', env), a);
      expect(tile, `the tile's room at ${w}x${h} (drawer ${drawer.toFixed(2)}rem)`).toBeGreaterThanOrEqual('TERRORISTS'.length * (0.6 + 0.18) * face);
    });
  }

  // LR-46's fold: the band's left column narrowed to give the drawer room; its longest word still stands whole.
  for (const [w, h] of [[1024, 768], [844, 390]] as const) {
    it(`${w}x${h}: the left column holds "Classic" at its scaled face`, () => {
      const env: Env = { w, h, pointer: 'fine', input: 'pointer' };
      const a = atOf(w, h);
      const kinds = flexOf([`${ROOMS} .cx-kinds`], env, a).basis;
      const K = ['.cx-kind'];
      const face = rem(need(K, 'font-size', env), a);
      const pad = rem(need(K, 'padding-left', env), a) + rem(need(K, 'padding-right', env), a) + 2 / a.px;   // its 2px left edge
      expect(kinds, `the column ${kinds}rem`).toBeGreaterThanOrEqual('Classic'.length * (0.5 + 0.04) * face + pad);
    });
  }

  it('every cell is one line and clips past its track, never over the next (head and rows)', () => {
    for (const [w, h] of [[1280, 720], [390, 844]] as const) {
      const env: Env = { w, h, pointer: 'fine', input: 'pointer' };
      for (const sel of [`${ROOMS} .cx-room > *`, `${ROOMS} .cx-rooms__head > *`]) {
        expect.soft(decl([sel], 'white-space', env), `${sel} at ${w}x${h}`).toBe('nowrap');
        expect.soft(decl([sel], 'overflow', env)).toBe('hidden');
        expect.soft(decl([sel], 'text-overflow', env)).toBe('ellipsis');
        expect.soft(decl([sel], 'min-width', env)).toBe('0');
      }
    }
  });

  it('the phone rule keeps the cx layer\'s two columns (the rule is above the phone rule only)', () => {
    const env: Env = { w: 390, h: 844, pointer: 'coarse', input: 'pointer' };
    expect(decl([`${ROOMS} .cx-room`], 'grid-template-columns', env)).toBeNull();
    expect(decl(['.cx-room'], 'grid-template-columns', env)).toBe('minmax(0, 1fr) auto');
  });
});

/* ---------- N6: Settings' legend at 844x390 ---------- */

/** The body face's advance, read off `<m>settings-rested-844x390` (0.875rem at 11.2px): "Change" 32px, "Back" 24px, "Reset to default" 70px -- 0.43em a character over the three; the bound 0.5. */
const ADV_BODY = 0.5;
/** START's capitals in the label face, 0.1em spaced: "START GAME" 113px at 19.2px in the frame (0.59em); the bound 0.62. */
const ADV_START = 0.62;

describe('LR-45 N6: at 844x390 Settings\' legend holds its prompts whole beside the cluster (the pad)', () => {
  for (const [w, h] of [[844, 390], [915, 412]] as const) {
    // LR-46: Settings' cluster is Home's three marks and START (was: the two device cues, the disc chip and START).
    it(`${w}x${h}: Change, Back, Reset to default, L1 R1 Category, L2 R2 Page, Home's three marks and START in one bar`, () => {
      const env: Env = { w, h, pointer: 'fine', input: 'pad' };
      const a = atOf(w, h);
      const px = a.px;
      const len = (v: string): number => rem(v, a) * px;
      const A = sampleAdapters() as Adapters;
      const S = createState(A);
      S.screen = 'options';
      S.input = 'pad';
      S.opt = { cat: 0, row: 0, zone: 'rows' };
      // LR-45's review fold (box run 8, `lr45-settings-3e480d606-legend-844x390.png`): the Display list overflows its pane at
      // this height, so the frame draws the paged legend (`render/frame.ts`: `legendHtml(s, a, pageList(...) && pageRows(...))`)
      // -- a fifth prompt, L2 R2 Page, which lost its word under the cluster's edge while this test modelled four.
      const said = prompts(S, A, true);
      expect(said.map((p) => p.label), 'the frame\'s prompts (Display, its first row, the list paged)').toEqual(['Change', 'Back', 'Reset to default', 'Category', 'Page']);
      const host = document.createElement('div');
      host.innerHTML = legendHtml(S, A, true);
      const text = (sel: string): string => host.querySelector(sel)?.textContent?.trim() ?? '';

      const bar = w - len(need(['.cx-app'], 'padding-left', env)) - len(need(['.cx-app'], 'padding-right', env));
      // The prompts: each its pill's padding, its gap, its glyph and its word; their gaps; the box's own padding (the fade).
      const P = ['.cx-legend .cx-prompts', '.cx-prompts'];
      expect(need(P, 'display', env), 'the pad\'s prompts are drawn').not.toBe('none');
      const font = len(need(['.cx-legend .cx-prompt', '.cx-prompt'], 'font-size', env));
      const PR = ['.cx-legend .cx-prompt', '.cx-prompt'];
      const pill = len(side(need(PR, 'padding', env), 1)) + len(side(need(PR, 'padding', env), 3)) + len(need(['.cx-legend .cx-prompt', '.cx-prompt'], 'column-gap', env));
      const glyph = (k: string): number => (/^(cross|circle|square|triangle)$/.test(k) ? len(need(['.cx-btn'], 'width', env))
        : /^dpad/.test(k) ? len(need(['.cx-dpad'], 'width', env))
        : k.split(' ').length * len(need(['.cx-legend .cx-shoulder', '.cx-shoulder'], 'min-width', env)) + (k.split(' ').length - 1) * len(need(['.cx-legend .cx-shoulders', '.cx-shoulders'], 'column-gap', env)));
      // A prompt's list item is its margin box: the pill's negative left margin (part G's -0.375rem, LR-19's fold) is
      // taken off each, as the prompts' box's own negative left margin is off the box (the run-8 frame: Change's word ends
      // at x 77, Back's glyph starts at 101 -- the gap and the pill's right padding, its left padding given back).
      const itemMargin = len(need(['.cx-legend .cx-prompt', '.cx-prompt'], 'margin-left', env));
      const each = said.map((p) => pill + itemMargin + glyph(p.k) + p.label.length * ADV_BODY * font);
      const prompts_ = each.reduce((t, x) => t + x, 0) + (said.length - 1) * len(need(P, 'column-gap', env))
        + len(need(P, 'padding-left', env)) + len(need(P, 'padding-right', env)) + len(need(P, 'margin-left', env));

      // The cluster (LR-46): Home's three marks (render/legend.ts; was: the two device cues and the disc chip, its word kept),
      // their gaps, then START; on a short landscape screen the cluster steps aside (`display: contents`), so the bar's items
      // are the marks, the prompts and START, the legend's gap between each.
      const C = ['.cx-legend .cx-cluster--start', '.cx-legend .cx-cluster', '.cx-cluster'];
      expect(need(C, 'display', env), 'Settings\' cluster steps aside: the marks first, START last').toBe('contents');
      expect([...host.querySelectorAll('.cx-marks .cx-mark')].map((m) => m.getAttribute('data-mark'))).toEqual(['disc', 'pad', 'mic']);
      expect(host.querySelector('.cx-chip, .cx-devices'), 'no chip, no device cues').toBeNull();
      const marks = 3 * len(need(['.cx-legend .cx-mark'], 'width', env)) + 2 * len(need(['.cx-legend .cx-cluster--start > .cx-marks', '.cx-legend .cx-marks'], 'column-gap', env));
      const ST = ['.cx-legend .cx-start', '.cx-start'];
      const startWords = text('.cx-start').replace(/\s+/g, ' ');
      expect(startWords.toUpperCase()).toBe('START GAME');
      const startText = len(side(need(ST, 'padding', env), 1)) + len(side(need(ST, 'padding', env), 3)) + len(need(['.cx-start .cx-play'], 'width', env))
        + len(need(ST, 'column-gap', env)) + startWords.length * ADV_START * len(need(ST, 'font-size', env));
      const start = Math.max(len(need(ST, 'min-width', env)), startText);
      const row = marks + prompts_ + start + 2 * len(need(['.cx-legend'], 'column-gap', env));
      expect(row, `the bar at ${w}x${h}: marks ${marks.toFixed(0)}px, prompts ${prompts_.toFixed(0)}px, START ${start.toFixed(0)}px, room ${bar.toFixed(0)}px`)
        .toBeLessThanOrEqual(bar);
      // LR-19's give-way rule stands: past the room the last prompt's word gives way first.
      expect(decl(['.cx-legend .cx-prompts > li:last-child'], 'flex-shrink', env)).toBe('1');
      for (const sel of ['.cx-legend .cx-cluster--start > .cx-marks', '.cx-legend .cx-cluster--start > .cx-start']) expect(decl([sel, sel.replace(' .cx-cluster--start >', '')], 'flex-shrink', env), sel).toBe('0');
    });
  }
});

/* ---------- LR-45's review fold (2): a clipped row's words stay readable ---------- */

/**
 * N5's one-line cells (`console.css`, LR-45) clip a long cell with an ellipsis on the rooms screen, where the signed-in
 * lobby's rows are drawn too: a game's name cell is "name · progress · spectators · lock · clan" (`render/rooms.ts`
 * `gameNamed`), the first cell to clip. Every row's name cell carries its whole text as its `title`, so a pointer reads
 * what the ellipsis cut (the row's `aria-label` already says it all to a reader).
 */
describe('LR-45 fold: every Browse rooms name cell carries its whole text as its title', () => {
  const nameTitles = (rows: Room[] | null): { text: string; title: string | null }[] => {
    const A = sampleAdapters() as Adapters;
    if (rows) A.rooms.list = () => rows;
    const S = createState(A);
    const host = document.createElement('div');
    host.innerHTML = roomsHtml(S, A);
    return [...host.querySelectorAll('.cx-room .cx-room__name')].map((el) => ({ text: el.textContent ?? '', title: el.getAttribute('title') }));
  };

  it('the signed-in lobby: a game\'s long name, its round, spectators, lock and clan; a briefing room and its lock', () => {
    const game: Room = { id: 'g1', kind: 'game', name: 'Night Ops Ladder Match', map: 'Frostfire', n: 6, cap: 8, progress: 'In progress', spectators: { n: 1, cap: 4 }, lock: 'Password', clan: 'Clan game', pingMs: 40 } as Room;
    const room: Room = { id: 'r1', kind: 'room', name: 'Briefing Room Seven', map: '', n: 12, cap: 32, games: 3, lock: 'Private' } as Room;
    const cells = nameTitles([room, game]);
    expect(cells.length).toBe(2);
    for (const c of cells) expect.soft(c.title, `the cell "${c.text}"`).toBe(c.text);
    expect(cells[1]!.text).toBe('Night Ops Ladder Match · In progress · 1/4 spectators · Password · Clan game');
  });

  it('a name with quotes, angle brackets and an ampersand: the title is the text, no attribute leaks (classic, lobby, custom rows)', () => {
    const NAME = 'A "B" <C> & D';
    const A = sampleAdapters() as Adapters;
    const classic: Room = { id: 'c1', name: NAME, map: 'Frostfire', mode: 'Suppression', n: 2, cap: 8, pingMs: 40 } as Room;
    const game: Room = { id: 'g1', kind: 'game', name: NAME, map: 'Frostfire', n: 2, cap: 8, pingMs: 40 } as Room;
    const room: Room = { id: 'r1', kind: 'room', name: NAME, map: '', n: 2, cap: 32, games: 1 } as Room;
    const custom = { kind: 'ok', rows: [{ id: 'm1', name: NAME, map: 'Frostfire', players: 2, max: 8, locked: true, inMatch: false }] };
    for (const rows of [[classic], [room, game]]) {
      A.rooms.list = () => rows;
      (A as unknown as { custom: { view: () => unknown } }).custom = { ...(A.custom ?? {}), view: () => custom } as never;
      const S = createState(A);
      const host = document.createElement('div');
      host.innerHTML = roomsHtml(S, A);
      const cells = [...host.querySelectorAll('.cx-room .cx-room__name')];
      expect(cells.length, 'the rows and the custom match').toBe(rows.length + 1);
      for (const el of cells) {
        expect.soft(el.getAttribute('title'), `title of "${el.textContent}"`).toBe(el.textContent);
        expect.soft(el.textContent!.startsWith(NAME), 'the text keeps the name whole').toBe(true);
        expect.soft([...el.attributes].map((x) => x.name).sort(), 'no attribute leaked out of the title').toEqual(['class', 'title']);
        expect.soft(el.children.length, 'no element leaked into the cell').toBe(0);
      }
    }
  });

  it('the classic rooms (the sample\'s): each name cell titled with its text', () => {
    const cells = nameTitles(null);
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) expect.soft(c.title, `the cell "${c.text}"`).toBe(c.text);
  });
});
