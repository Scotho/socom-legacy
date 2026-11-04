import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { buildDialogScreen, UiVarManager, ValveStore, type UiDrawItem } from '../../src/index';
import { LISTBOX_REBUILD_CONTENT_PASS_READING, ListboxWidget, WidgetSet, LISTBOX_WRAPPED_LINE_SCALE_READING, listboxCellScale } from '../../src/widgets/index';
import { textFace } from '../text/fixtures';
import { RecordingHost, design, nodeCmd, r, rec } from './fixtures';

/**
 * ONL-01 (web research 144 §3): a LISTBOX whose `UIVAR` holds an **array** follows it as its items -- the var
 * watcher at +0x80 (vtable 0x4076e0, read in the ELF: +0xc the thunk at 0x37d060 `j 0x3754d0`, a0 -= 0x80) runs
 * `FUN_003754d0` (D:L270744-270828) when the var is attached (`FUN_00375e20` D:L271185-271186) and on every change
 * (`FUN_003869f0`): every item removed (`FUN_00375c70`), then one appended per element (`FUN_0036bbc0` D:L265829-265908:
 * a string element a one-cell text item; an array element a column item, `FUN_0037ae10` D:L273903-274067, one cell
 * a column from the element's sub-elements, each printed as a var prints), the focus to the last with `AUTOSCROLL`
 * (D:L270789-270793), then the list's `EVENT ON_UPDATE_UIVAR` bindings run (D:L270808-270822).
 * This corrects research 117 §13.1 ("not its items"): a string var is still the image's texture. LOGIN's `COMBOLIST`
 * and `HWLIST` both follow `NETCNF_DB`, whose rows `NetCnfOpen` writes as [int, string, string].
 */

const list = (name: string, ...more: (string | RdrNode)[]) => rec(name, 'LISTBOX', 100, 50, r(
  'XSIZE', '200', 'YSIZE', '100', 'SPACING', '20', 'SCALE', '1', 'TOP_MARGIN', '10', 'LEFT_MARGIN', '5',
  'NORMAL_COLOR', ['128', '128', '128'], 'ACTIVE_COLOR', ['91', '72', '36'], 'PRESSED_COLOR', ['102', '87', '38'],
  'UIVAR', r('NAME', 'ROWS', 'VALUE', [] as unknown as RdrNode),
  ...more,
));
const columns = r('COLUMNS', [r('POSITION', '0'), r('POSITION', '40'), r('POSITION', '700')]);

function make(...more: (string | RdrNode)[]) {
  const d = design([list('L', ...more)]);
  const face = textFace();
  const uiVars = new UiVarManager();
  const set = WidgetSet.build(d, buildDialogScreen(d), { face: () => face, valves: new ValveStore(), uiVars });
  return { set, l: set.get('L') as ListboxWidget, uiVars };
}
const row = (n: number, ...s: string[]) => ({ type: 'array' as const, value: [{ type: 'int' as const, value: n }, ...s.map((v) => ({ type: 'string' as const, value: v }))] });

describe('LISTBOX: an array UIVAR is its items (FUN_003754d0)', () => {
  it('a string var is the image\'s texture only (research 117 §13.1): no items', () => {
    const { l, uiVars } = make();
    uiVars.set('ROWS', { type: 'string', value: 'other.tif' });
    expect(l.count).toBe(0);
  });

  it('an array of arrays: one item an element, one cell a column from its sub-elements, an int printed as a var prints', () => {
    const { l, uiVars } = make(...columns);
    uiVars.set('ROWS', { type: 'array', value: [row(1, 'Setting 1', 'SCE/Ethernet (Network Adaptor)'), row(2, 'Setting 2', 'PPP')] });
    expect(l.count).toBe(2);
    expect(l.items.map((it) => it.captions)).toEqual([['1', 'Setting 1', 'SCE/Ethernet (Network Adaptor)'], ['2', 'Setting 2', 'PPP']]);
    expect(l.items.every((it) => it.selectable && it.binding.animation === null)).toBe(true);
  });

  it('an array of strings: one one-cell item an element; a later change replaces every item; an empty array leaves none', () => {
    const { l, uiVars } = make();
    uiVars.set('ROWS', { type: 'array', value: [{ type: 'string', value: 'A' }, { type: 'string', value: 'B' }] });
    expect(l.items.map((it) => it.captions)).toEqual([['A'], ['B']]);
    uiVars.set('ROWS', { type: 'array', value: [{ type: 'string', value: 'C' }] });
    expect(l.items.map((it) => it.captions)).toEqual([['C']]);
    uiVars.set('ROWS', { type: 'array', value: [] });
    expect(l.count).toBe(0);
  });

  it('with AUTOSCROLL the focus goes to the last item (D:L270789-270793); without it the focus stays', () => {
    const rows = { type: 'array' as const, value: [row(1, 'a'), row(2, 'b'), row(3, 'c')] };
    const a = make(...columns, 'AUTOSCROLL', '1');
    a.uiVars.set('ROWS', rows);
    expect([a.l.focus, a.l.top]).toEqual([2, 0]);
    const b = make(...columns);
    b.uiVars.set('ROWS', rows);
    expect(b.l.focus).toBe(0);
  });

  it('after the rebuild the list\'s EVENT ON_UPDATE_UIVAR bindings run, each with its own ARGUMENT or none (D:L270808-270822)', () => {
    const host = new RecordingHost(new Set(['Gone']));
    const d = design([list('L', ...columns, 'ANIMATIONS', [
      r('EVENT', 'ON_UPDATE_UIVAR', 'ANIMATION', 'OnRows'), r('EVENT', 'ON_UPDATE_UIVAR', 'ANIMATION', 'OnRowsArg', 'ARGUMENT', 'x'),
      r('EVENT', 'ON_UPDATE_UIVAR', 'ANIMATION', 'Gone'), r('EVENT', 'ONFOCUS', 'ANIMATION', 'OnFoc'),
    ])]);
    const uiVars = new UiVarManager();
    // The merged API (2026-10-03): the bindings start through `WidgetContext.animation`, a lookup-and-start by name; the host records them.
    const set = WidgetSet.build(d, buildDialogScreen(d), { face: () => textFace(), valves: new ValveStore(), uiVars, animation: (name, argument) => host.animation(name, argument) });
    const l = set.get('L') as ListboxWidget;
    const fired = ['anim OnRows', 'anim OnRowsArg(x)', 'missing Gone'];   // the binding's argument, never the item's; ONFOCUS not run
    expect(host.take()).toEqual(fired);                               // the attach's fire (FUN_00375e20 D:L271185-271186): VALUE [] is an array
    uiVars.set('ROWS', { type: 'array', value: [row(1, 'a')] });
    expect(l.count).toBe(1);
    expect(host.take()).toEqual(fired);
    uiVars.set('ROWS', { type: 'string', value: 'a.tif' });            // not an array: the items and the bindings untouched
    expect(host.take()).toEqual([]);
    expect(LISTBOX_REBUILD_CONTENT_PASS_READING).toContain('+0x30');
  });

  it('the rows draw in their columns: the first two cells at POSITION 0 and 40, the third off at 700', () => {
    const { set, l, uiVars } = make(...columns);
    uiVars.set('ROWS', { type: 'array', value: [row(1, 'Setting 1', 'HW')] });
    l.tick(1 / 60, new RecordingHost());
    const items = l.draw(100, 50, 1).filter((i): i is Extract<UiDrawItem, { kind: 'glyphs' }> => i.kind === 'glyphs');
    const lefts = items.map((i) => i.quads[0]!.left);
    expect(lefts.map((x) => x - lefts[0]!)).toEqual([0, 40, 700]);
    expect(set.get('L')).toBe(l);
  });

  // CLAN-DOT (web research 272 §12): `FUN_0037ab90` hands a column's non-zero SCALE (+0x18, D:L273892) to the cell's
  // content's +0x28 (D:L273893) -- 0x37adf0 (`swc1 $f12, 0x40(v1)`) in the TEXT (0x407b40), TIMED_TEXT (0x4070a0) and
  // WRAPPED_TEXT (0x407140) contents' vtables alike: the node's SCALE at every draw. A TEXT or TIMED_TEXT cell draws at it;
  // a WRAPPED_TEXT cell's lines take their scale from the node only at the text's set (`FUN_00379f70` D:L273490), before
  // any draw, and its draw `FUN_003794b0` reads none, so its lines keep the list's (LISTBOX_WRAPPED_LINE_SCALE_READING).
  it("a column's own SCALE is its cell's node scale (listboxCellScale): a TEXT and a TIMED_TEXT cell draw at it, a WRAPPED_TEXT cell's lines at the list's; no SCALE, the list's", () => {
    const { l, uiVars } = make(r('COLUMNS', [
      r('POSITION', '0'), r('POSITION', '40', 'SCALE', '1.5'), r('POSITION', '120', 'TIMED_TEXT', '1', 'SCALE', '1.5'), r('POSITION', '200', 'WRAPPED_TEXT', '1', 'SCALE', '2'),
    ]));
    expect(l.spec.columns.map((c) => c.kind)).toEqual([1, 1, 2, 3]);
    uiVars.set('ROWS', { type: 'array', value: [row(1, 'AB', 'AB', 'AB')] });
    l.tick(1 / 60, new RecordingHost());
    const glyphs = l.draw(100, 50, 1).filter((i): i is Extract<UiDrawItem, { kind: 'glyphs' }> => i.kind === 'glyphs');
    const height = (g: Extract<UiDrawItem, { kind: 'glyphs' }>) => { const q = g.quads.filter((x) => !x.shadow); return Math.max(...q.map((x) => x.bottom)) - Math.min(...q.map((x) => x.top)); };
    // the fixture's 'A' 24 pixels tall at the list's SCALE 1: x 1.5 for the TEXT and the TIMED_TEXT column, the wrapped line 24
    expect(glyphs.map(height)).toEqual([24, 36, 36, 24]);
    expect(l.spec.columns.map((c) => listboxCellScale(1, c))).toEqual([1, 1.5, 1.5, 2]);
    expect(listboxCellScale(0.8, undefined)).toBe(0.8);
    expect(LISTBOX_WRAPPED_LINE_SCALE_READING).toMatch(/D:L273490/);
  });
});

// ONL-14 (web research 164 §3), on research 185's three listbox reads, re-read at the source: an array cell's `COLOR`
// and `DISABLED` keys (`FUN_0037ae10` D:L274032-274056; the colour setter, the text content's +0x2c, is 0x37bd60 in the
// ELF: +0xc8 = 1 and r, g, b into the text's +0x48..+0x50, so the row's draw `FUN_0037ab90` D:L273836-273845 no longer
// writes the row's colour over it); `AddItem` (op 8, D:L269545-269574) building its item with `FUN_0036bbc0`, the
// var rebuild's own builder; `GetContents` (op 10, D:L269629-269643) writing each item's serialised form.
describe('LISTBOX: the keyed cell, AddItem and GetContents (CREATE GAME\'s PLAY LIST)', () => {
  const I = (value: number) => ({ type: 'int' as const, value });
  const S = (value: string) => ({ type: 'string' as const, value });
  const A = (...value: ReturnType<typeof I | typeof S>[] | { type: string }[]) => ({ type: 'array' as const, value }) as never;
  const keyed = (name: string, color: number[] | null, disabled: boolean) => A(S('VALUE'), S(name), ...(color ? [S('COLOR'), A(...color.map(I))] : []), ...(disabled ? [S('DISABLED'), I(1)] : []));
  /** A command whose UIVAR byte (+0x10) names `names[1]`, as the set's `SELECTED_MISSIONS.op8(tmp_idx)` names its var. */
  const opWithVar = (op: number, arg: string) => { const c = nodeCmd('L', op, arg); const bytes = new Uint8Array(0x18); bytes.set(c.bytes); bytes[0x10] = 1; return { ...c, bytes }; };
  const build = (names: string[]) => {
    const d = design([list('L', ...columns)]);
    const uiVars = new UiVarManager(), valves = new ValveStore();
    const set = WidgetSet.build(d, buildDialogScreen(d), { face: () => textFace(), valves, uiVars, name: (_c, i) => names[i] ?? null });
    return { set, l: set.get('L') as ListboxWidget, uiVars, valves };
  };

  it('DISABLED makes the item not selectable; COLOR is the cell\'s own colour, kept over the row\'s at every draw', () => {
    const { l, uiVars } = make(...columns);
    uiVars.set('ROWS', { type: 'array', value: [row(51, 'VIGILANCE'), A(I(52), keyed('THE MIXER', [10, 20, 30], true))] });
    expect(l.items.map((it) => [it.captions, it.selectable])).toEqual([[['51', 'VIGILANCE'], true], [['52', 'THE MIXER'], false]]);
    l.tick(1 / 60, new RecordingHost());
    const glyphs = l.draw(100, 50, 1).filter((i): i is Extract<UiDrawItem, { kind: 'glyphs' }> => i.kind === 'glyphs');
    const rgb = glyphs.map((g) => g.quads[g.quads.length - 1]!.rgba.slice(0, 3));   // the last quad: a glyph, not its shadow
    const row0 = rgb[0]!;
    expect(rgb).toEqual([row0, row0, row0, [10, 20, 30]]);            // every cell the row's colour, the keyed cell its own COLOR
    expect(row0).not.toEqual([10, 20, 30]);
  });

  it('a keyed cell with DISABLED and no COLOR keeps the row\'s colour; with COLOR and no DISABLED stays selectable', () => {
    const { l, uiVars } = make(...columns);
    uiVars.set('ROWS', { type: 'array', value: [A(I(1), keyed('A', null, true)), A(I(2), keyed('B', [1, 2, 3], false))] });
    expect(l.items.map((it) => it.selectable)).toEqual([false, true]);
  });

  it('AddItem (op 8) builds as the var rebuild does: an array element is a column item, a string element a text item', () => {
    const { set, l, uiVars, valves } = build(['NA', 'SRC']);
    uiVars.add('SRC', { type: 'array', value: [row(2, 'FROSTFIRE'), S('Gamma')] }, 1);
    valves.set('i', 0, 2);
    set.nodeCommand(opWithVar(8, 'i'), new RecordingHost());
    valves.set('i', 1, 2);
    set.nodeCommand(opWithVar(8, 'i'), new RecordingHost());
    valves.set('i', 5, 2);
    set.nodeCommand(opWithVar(8, 'i'), new RecordingHost());           // past the end: an item with no cell
    expect(l.items.map((it) => it.captions)).toEqual([['2', 'FROSTFIRE'], ['Gamma'], []]);
  });

  it('GetContents (op 10) writes the items into the named var: a column item a sub-list, each text cell an int, a real or a string as it parses', () => {
    const { set, uiVars } = build(['NA', 'OUT']);
    uiVars.add('OUT', null, 1);                                        // the var exists (FUN_00385900 finds, never adds)
    uiVars.set('ROWS', { type: 'array', value: [row(51, 'VIGILANCE'), A(S('1.5'), S('12a'), S('-3')), S('72')] });
    expect(set.nodeCommand(opWithVar(10, 'NA'), new RecordingHost())).toEqual({ answer: true });
    expect(uiVars.find('OUT')?.value).toEqual({ type: 'array', value: [
      { type: 'array', value: [I(51), S('VIGILANCE')] }, { type: 'array', value: [{ type: 'real', value: 1.5 }, S('12a'), I(-3)] }, I(72),
    ] });
  });

  it('GetContents: an item with no cell (an AddItem past the end, an image cell alone) serialises nothing -- no element for it', () => {
    const { set, l, uiVars } = build(['NA', 'OUT']);
    uiVars.add('OUT', null, 1);
    uiVars.set('ROWS', { type: 'array', value: [S('72')] });
    l.items.push({ ...l.items[0]!, captions: [], images: [], column: false });
    set.nodeCommand(opWithVar(10, 'NA'), new RecordingHost());
    expect(uiVars.find('OUT')?.value).toEqual({ type: 'array', value: [I(72)] });
  });
});
