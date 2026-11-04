import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { buildDialogScreen, UiVarManager, ValveStore, type UiDrawItem, type UiVarValue } from '../../src/index';
import { LISTBOX_CLIP_DROP, LISTBOX_ROW_ALPHA_START_READING, ListboxWidget, WidgetSet, widgetPad, STICK } from '../../src/widgets/index';
import { engineCodes } from '../../src/text/codes';
import { fmul } from '../../src/text/f32';
import { wrapLines } from '../../src/text/wrapped';
import { glyphsAt } from '../../src/widgets/draw';
import { textFace } from '../text/fixtures';
import { RecordingHost, design, nodeCmd, r, rec } from './fixtures';

// Web research 117 §6: the LISTBOX (`CUIListBox`, vtable 0x407670) -- set-up `FUN_00375e20` (D:L271051-271262, set
// normal at its end), normal `FUN_00376420` (D:L271267-271290), active `FUN_00374cb0` (D:L270516-270606), press
// `FUN_00374a50` (D:L270448-270471), the pad `FUN_003745e0` (D:L270311-270443), up / down `FUN_00374010` /
// `FUN_003742f0` (D:L270113-270306), the tick `FUN_00375040` (D:L270611-270739), the draw `FUN_00373850`
// (D:L269930-270073), the commands `FUN_00372980` (D:L269435-269649).

const CAPTIONS = ['A', 'B', 'AB', 'BA', 'C', 'CA'];
const option = (i: number, ...more: string[]) => r('CAPTION', [CAPTIONS[i]!], 'FOCUS_ANIM', 'Foc', 'FOCUS_ARG', `f${i}`, ...more);
const list = (...more: (string | RdrNode)[]) => rec('L', 'LISTBOX', 100, 50, r(
  'FILENAME', 'list.tif', 'XSIZE', '200', 'YSIZE', '100', 'SPACING', '20', 'SCALE', '1', 'TOP_MARGIN', '10', 'LEFT_MARGIN', '5',
  'NORMAL', 'hl_n.tif', 'ACTIVE', 'hl_a.tif', 'PRESSED', 'hl_p.tif',
  'NORMAL_COLOR', ['128', '128', '128'], 'ACTIVE_COLOR', ['91', '72', '36'], 'PRESSED_COLOR', ['102', '87', '38'],
  'UP_ARROW', r('TEXTURE', 'up.tif', 'OFFSET', ['190', '0'], 'SIZE', ['8', '8']),
  'DOWN_ARROW', r('TEXTURE', 'dn.tif', 'OFFSET', ['190', '92'], 'SIZE', ['8', '8']),
  'OPTIONS', [
    option(0, 'BUTTON', 'CROSS', 'ANIMATION', 'Pick', 'USERDATA', 'u0'),
    option(1, 'BUTTON', 'CROSS', 'ANIMATION', 'Pick', 'ARGUMENT', 'a1'),
    option(2), option(3), option(4), option(5),
  ],
  'ANIMATIONS', [
    r('EVENT', 'ONFOCUS', 'ANIMATION', 'OnFoc'), r('EVENT', 'ONACTIVATE', 'ANIMATION', 'OnAct'),
    r('EVENT', 'ONSCROLL', 'ANIMATION', 'OnScr'), r('EVENT', 'ONSCROLL_END', 'ANIMATION', 'OnEnd'),
  ],
  ...more,
));
const make = (valves?: ValveStore, ...more: (string | RdrNode)[]) => {
  const d = design([list(...more)]);
  const face = textFace();
  const set = WidgetSet.build(d, buildDialogScreen(d), { face: () => face, valves });
  return { set, l: set.get('L') as ListboxWidget };
};
const down = widgetPad({ DOWN: 'FALLING' }), up = widgetPad({ UP: 'FALLING' });

describe('LISTBOX: its states (research 117 §6.1)', () => {
  it('is built NORMAL (set-up ends in set normal): NORMAL_COLOR, item alpha 80, the NORMAL highlight', () => {
    const { l } = make();
    expect([l.state, l.currentColor, l.itemAlpha, l.highlight]).toEqual(['normal', [128, 128, 128], 80, 'hl_n.tif']);
  });

  it('set active: ACTIVE_COLOR, item alpha 100, the focus item\'s FOCUS_ANIM, then ONACTIVATE by the argument rule', () => {
    const { l } = make(), h = new RecordingHost();
    l.setActive(h);
    expect([l.state, l.currentColor, l.itemAlpha, l.highlight]).toEqual(['active', [91, 72, 36], 100, 'hl_a.tif']);
    expect(h.take()).toEqual(['anim Foc(f0)', 'anim OnAct(u0)']);     // USERDATA of a selectable item
    l.input(down, h); h.take();
    l.setActive(h);
    expect(h.take()).toEqual(['anim Foc(f1)', 'anim OnAct(B)']);   // no USERDATA: the caption
  });
});

describe('LISTBOX: the pad (FUN_003745e0)', () => {
  it('DOWN moves the focus one row: the pixel offset by SPACING, FOCUS_ANIM, SELECTION, ONFOCUS by the argument rule', () => {
    const { l } = make(), h = new RecordingHost();
    expect(l.input(down, h)).toBe(true);
    expect([l.focus, l.focusOffset]).toEqual([1, 20]);
    expect(h.take()).toEqual(['anim Foc(f1)', 'sound SELECTION', 'anim OnFoc(B)']);
    expect(l.input(widgetPad({}, STICK.DOWN), h)).toBe(true);           // the stick's down edge (FUN_0036a970)
    expect(l.focus).toBe(2);
    expect(l.input(up, h)).toBe(true);
    expect(l.focus).toBe(1);
  });

  it('at either end the move is refused and the press passes unless PADHOG (+0xea)', () => {
    const { l } = make(), h = new RecordingHost();
    expect(l.input(up, h)).toBe(false);
    const hog = make(undefined, 'PADHOG', []).l;
    expect(hog.input(up, h)).toBe(true);
    expect(hog.focus).toBe(0);
  });

  it('the focus item\'s own binding on its button\'s press edge: ARGUMENT, else USERDATA; then press for 0.2 s, then set active again', () => {
    const { l, set } = make(), h = new RecordingHost();
    l.setActive(h); h.take();
    expect(l.input(widgetPad({ CROSS: 'FALLING' }), h)).toBe(true);
    expect(h.take()).toEqual(['anim Pick(u0)']);
    expect([l.state, l.currentColor, l.highlight]).toEqual(['pressed', [102, 87, 38], 'hl_p.tif']);
    set.tick(0.1, h);
    expect(l.state).toBe('pressed');
    set.tick(0.15, h);
    expect(l.state).toBe('active');
    expect(h.take()).toEqual(['anim Foc(f0)', 'anim OnAct(u0)']);     // FOCUS_ANIM and ONACTIVATE again
    l.input(down, h); h.take();
    l.input(widgetPad({ CROSS: 'FALLING' }), h);
    expect(h.take()).toEqual(['anim Pick(a1)']);
  });

  it('an item binding whose animation is not found: not handled, no press (D:L270352-270353)', () => {
    const { l } = make(), h = new RecordingHost(new Set(['Pick']));
    l.setActive(h); h.take();
    expect(l.input(widgetPad({ CROSS: 'FALLING' }), h)).toBe(false);
    expect(l.state).toBe('active');
  });

  it('the list\'s bindings match by code and STATE, not kind: an EVENT ONACTIVATE (2) answers RIGHT (LISTBOX_EVENT_AS_BUTTON_READING)', () => {
    const { l } = make(), h = new RecordingHost();
    expect(l.input(widgetPad({ RIGHT: 'FALLING' }), h)).toBe(true);
    expect(h.take()).toEqual(['anim OnAct(u0)']);
    expect(l.state).toBe('pressed');                                   // the focus item is selectable: press
  });

  it('PADHOG swallows LEFT / RIGHT press edges; a sideways stick flick is not handled', () => {
    const hog = make(undefined, 'PADHOG', []).l, h = new RecordingHost();
    expect(hog.input(widgetPad({ LEFT: 'FALLING' }), h)).toBe(true);
    expect(hog.input(widgetPad({}, STICK.LEFT), h)).toBe(false);
  });

  it('a held UP / DOWN moves once the hold clock passes 0.4 s, each call, the clock not reset', () => {
    const { l, set } = make(), h = new RecordingHost();
    l.input(down, h);
    set.tick(0.41, h);
    expect(l.input(widgetPad({ DOWN: 'DOWN' }), h)).toBe(true);
    expect(l.input(widgetPad({ DOWN: 'DOWN' }), h)).toBe(true);
    expect(l.focus).toBe(3);
  });
});

describe('LISTBOX: scrolling (the tick FUN_00375040)', () => {
  it('the top row follows a focus past YSIZE - 2 x SPACING (ONSCROLL); the view moves at max(SPEED, 2 x distance) px/s (ONSCROLL_END on landing)', () => {
    const { l, set } = make(), h = new RecordingHost();
    for (let i = 0; i < 4; i++) l.input(down, h);
    h.take();
    expect([l.focus, l.focusOffset, l.top]).toEqual([4, 80, 0]);
    set.tick(0.1, h);                                                 // 80 > 100 - 40: top 1, offset 60
    expect([l.top, l.focusOffset]).toEqual([1, 60]);
    // distance 20: max(60, 40) x 0.1 = 6 px this tick.
    expect(l.scroll).toBe(-6);
    expect(h.take()).toEqual(['anim OnScr']);
    set.tick(0.1, h);                                                 // distance 14: max(60, 28) x 0.1 = 6
    expect(l.scroll).toBe(-12);
    set.tick(1, h);                                                   // lands
    expect(l.scroll).toBe(-20);
    expect(h.take()).toEqual(['anim OnEnd']);
  });
});

describe('LISTBOX: the draw (FUN_00373850)', () => {
  it('ACTIVE_BACKGROUND (none here), the list\'s image, the highlight on the focus row, the rows clipped, the arrows', () => {
    const { l } = make(), h = new RecordingHost();
    l.setActive(h);
    // The arrows take the focus row's alpha as it stood before this draw's rows (D:L270021-270027 read it first): the
    // first draw finds the row's text as it was made (LISTBOX_ROW_ALPHA_START_READING), the second the 100 it was given.
    const first = l.draw(100, 50, 1).find((i) => i.kind === 'sprite' && i.texture === 'dn.tif');
    expect(first && first.kind === 'sprite' ? first.rgba[3] : null).toBe(LISTBOX_ROW_ALPHA_START_READING);
    const items = l.draw(100, 50, 1);
    const sprites = items.filter((i): i is Extract<UiDrawItem, { kind: 'sprite' }> => i.kind === 'sprite');
    // the highlight: (x, int(offset + HIGHLIGHT_OFFSET + y + TOP_MARGIN - 0.75 SPACING)), the list's width, one row.
    expect(sprites.map((s) => [s.texture, s.x0, s.y0, s.x1, s.y1, s.rgba[3]])).toEqual([
      ['list.tif', 100, 50, 300, 150, 128],
      ['hl_a.tif', 100, 45, 300, 65, 100],
      ['up.tif', 290, 50, 298, 58, 0],                                // at the top: alpha 0
      ['dn.tif', 290, 142, 298, 150, 100],                            // rows below the window: the focus row's alpha
    ]);
    const rows = items.filter((i): i is Extract<UiDrawItem, { kind: 'glyphs' }> => i.kind === 'glyphs');
    expect(rows.length).toBe(6);
    expect(rows.every((g) => g.clip !== null && g.clip.y0 === LISTBOX_CLIP_DROP + 60 - 20 && g.clip.y1 === 150)).toBe(true);
    const own = (g: (typeof rows)[number]) => g.quads.find((q) => !q.shadow)!.rgba;
    expect(own(rows[0]!)).toEqual([91, 72, 36, 100]);                 // the focus row: the current colour, +0xe0
    expect(own(rows[1]!)).toEqual([128, 128, 128, 80]);               // the others: NORMAL_COLOR, 80
  });

  it('Highlight_off (op 3) sets NOSELECT: the highlight is not drawn', () => {
    const { l, set } = make(), h = new RecordingHost();
    set.nodeCommand(nodeCmd('L', 3), h);
    expect(l.draw(100, 50, 1).some((i) => i.kind === 'sprite' && i.texture === 'hl_n.tif')).toBe(false);
  });
});

describe('LISTBOX: commands (FUN_00372980; names FUN_00373640)', () => {
  it('Has_Items (4) answers the count; GetItemCount (5) and GetFocusIndex (6) set a TEMP valve; SetFocusIndex (7) jumps', () => {
    const valves = new ValveStore();
    const { l, set } = make(valves), h = new RecordingHost();
    expect(set.nodeCommand(nodeCmd('L', 4), h)).toEqual({ answer: true });
    set.nodeCommand(nodeCmd('L', 5, 'n'), h);
    expect(valves.find('n')?.value).toBe(6);
    valves.set('to', 3, 2);
    set.nodeCommand(nodeCmd('L', 7, 'to'), h);
    expect([l.focus, l.top, l.focusOffset]).toEqual([3, 0, 60]);
    set.nodeCommand(nodeCmd('L', 6, 'at'), h);
    expect(valves.find('at')?.value).toBe(3);
    set.nodeCommand(nodeCmd('L', 11), h);                             // RemoveAllItems
    expect(set.nodeCommand(nodeCmd('L', 4), h)).toEqual({ answer: false });
  });
});

// ONL-04 (web research 147 §2): the list's UIVAR. Its var is attached to the list's second base at +0x80 (vtable 0x4076e0,
// whose +0xc is the thunk 0x37d060: `this - 0x80`, then `FUN_003754d0`), and that callback is run at set-up
// (D:L271177-271187) and at each change of the var: an array var rebuilds the items -- RemoveAllItems (`FUN_00375c70`),
// one item per element (`FUN_0036bbc0`: a string element one text cell; an array element one cell per column up to the
// column count, `FUN_0037ae10` D:L273903-274064: an IMAGE column takes `TEXTURES[value % count]` at the column's SIZE,
// a text column the element printed by `FUN_003860f0`), AUTOSCROLL's focus on the last, then the list's
// ON_UPDATE_UIVAR (0x2e) bindings started (D:L270742-270826). Research 117 §13.1's "names its background image's
// texture, not its items" read the primary vtable's +0x8c; the second base's is this one.
describe('LISTBOX: its UIVAR rebuilds the items (FUN_003754d0)', () => {
  const columned = (...more: (string | RdrNode)[]) => rec('L', 'LISTBOX', 100, 50, r(
    'XSIZE', '300', 'YSIZE', '100', 'SPACING', '20', 'SCALE', '1', 'TOP_MARGIN', '10', 'LEFT_MARGIN', '5',
    'UIVAR', r('NAME', 'LIST_VAR'),
    'COLUMNS', [
      r('POSITION', '10'),
      r('POSITION', '100', 'TOP_OFFSET', '-18', 'IMAGE', r('SIZE', ['12', '12'], 'TEXTURES', ['g.tif', 'r.tif'])),
      r('POSITION', '200', 'RIGHT_JUSTIFIED', '1'),
    ],
    'OPTIONS', [r('CAPTION', ['old'])],
    ...more,
  ));
  const build = (vars: UiVarManager, ...more: (string | RdrNode)[]) => {
    const d = design([columned(...more)]);
    const face = textFace();
    const set = WidgetSet.build(d, buildDialogScreen(d), { face: () => face, uiVars: vars });
    return { set, l: set.get('L') as ListboxWidget };
  };
  const S = (value: string): UiVarValue => ({ type: 'string', value });
  const I = (value: number): UiVarValue => ({ type: 'int', value });
  const rows: UiVarValue = { type: 'array', value: [
    { type: 'array', value: [S('Alpha'), I(0), I(5)] },
    { type: 'array', value: [S('Beta'), I(1), I(256)] },
    S('Gamma'),
  ] };

  it('an array written into the var replaces the OPTIONS: an array element one cell per column, a string element one text cell', () => {
    const vars = new UiVarManager();
    const { l } = build(vars);
    expect(l.items.map((i) => i.captions)).toEqual([['old']]);
    vars.set('LIST_VAR', rows);
    expect(l.count).toBe(3);
    expect(l.items.map((i) => i.captions)).toEqual([['Alpha', '', '5'], ['Beta', '', '256'], ['Gamma']]);
    expect(l.items.map((i) => i.images.map((c) => c?.texture ?? null))).toEqual([[null, 'g.tif', null], [null, 'r.tif', null], [null]]);
  });

  it('a var that already holds the array when the list is made fills it at set-up (the callback run once, D:L271185-271186)', () => {
    const vars = new UiVarManager();
    vars.add('LIST_VAR', rows, 1);
    const { l } = build(vars);
    expect(l.items.map((i) => i.captions[0])).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('a non-array value leaves the items (the callback tests the node type 4 first)', () => {
    const vars = new UiVarManager();
    const { l } = build(vars);
    vars.set('LIST_VAR', S('x.tif'));
    expect(l.items.map((i) => i.captions)).toEqual([['old']]);
  });

  it('draws an IMAGE cell at the column\'s place and SIZE, its TOP_OFFSET from the row, 128 grey, inside the list\'s clip', () => {
    const vars = new UiVarManager();
    const { l } = build(vars);
    vars.set('LIST_VAR', rows);
    const items = l.draw(100, 50, 1);
    const dots = items.filter((i): i is Extract<UiDrawItem, { kind: 'sprite' }> => i.kind === 'sprite' && (i.texture === 'g.tif' || i.texture === 'r.tif'));
    // row 0's pen: y + TOP_MARGIN = 60; x + LEFT_MARGIN + POSITION = 205; the cell's top 60 - 18.
    expect(dots.map((s) => [s.texture, s.x0, s.y0, s.x1, s.y1, s.rgba])).toEqual([
      ['g.tif', 205, 42, 217, 54, [128, 128, 128, 128]],
      ['r.tif', 205, 62, 217, 74, [128, 128, 128, 128]],
    ]);
    expect(dots.every((s) => s.clip !== null)).toBe(true);
  });

  it('AUTOSCROLL puts the focus on the last item with no test of the count: an empty array leaves it at -1 (D:L270789-270793)', () => {
    const vars = new UiVarManager();
    const { l } = build(vars, 'AUTOSCROLL', '1');
    vars.set('LIST_VAR', rows);
    expect([l.count, l.focus, l.top, l.focusOffset]).toEqual([3, 2, 0, 40]);
    vars.set('LIST_VAR', { type: 'array', value: [] });
    expect([l.count, l.focus, l.top, l.focusOffset]).toEqual([0, -1, 0, -20]);
  });

  it('an int, a real or an empty array element is an item with no cell (the content left null, D:L265854)', () => {
    const vars = new UiVarManager();
    const { l } = build(vars);
    vars.set('LIST_VAR', { type: 'array', value: [I(7), { type: 'real', value: 2.5 }, { type: 'array', value: [] }, S('x')] });
    expect(l.items.map((i) => i.captions)).toEqual([[], [], [], ['x']]);
    expect(l.items.map((i) => i.images)).toEqual([[], [], [], [null]]);
  });

  it('starts the list\'s ON_UPDATE_UIVAR bindings after a rebuild', () => {
    const vars = new UiVarManager();
    const d = design([columned('ANIMATIONS', [r('EVENT', 'ON_UPDATE_UIVAR', 'ANIMATION', 'Upd')])]);
    const face = textFace();
    const started: string[] = [];
    WidgetSet.build(d, buildDialogScreen(d), { face: () => face, uiVars: vars, animation: (name, arg) => { started.push(`${name}(${arg})`); return true; } });
    vars.set('LIST_VAR', rows);
    expect(started).toEqual(['Upd(null)']);
  });
});

// NU-13 (the next-update checklist; web research 274 §9): a `WRAPPED_TEXT` column's cell is the original's
// CListItemWrappedTextTypeImpl (vtable 0x407140), not a plain text: `FUN_0037ae10` builds it with `FUN_0036b210`
// (D:L265449-265468: a CWrappedText, `FUN_0027f250`, its HEIGHT -1 -- D:L126950 -- so no scissor of its own), hands it the
// list's font and SCALE, the list's SPACING (the item's +0x10 -> the content's +0x48, 0x37be50: the text's +0xbc) and the
// column's MAXWIDTH (+0x14 -> +0x4c, 0x37be70: the text's +0xc0), then sets the text, which the wrapping setter
// `FUN_00379f70` (D:L273409-273555) splits into lines in the colour the text holds then -- 255, 255, 255 from its
// constructor (`FUN_0037a770` D:L273681-273683); the row's colour written later (`FUN_0037ab90` D:L273850-273857: into the
// text's +0x48..+0x50, then its +0xa0) never reaches the lines (the class's +0xa0 is 0x37a630, `jr ra`). Its draw (+0x38, `FUN_0037be90` D:L274473-274489) is `FUN_003794b0`: line k's pen
// (x, int(y + k x SPACING - 3)) (D:L273144), the lines counted into +0x44 (D:L273162), then the scissor reset to the whole
// frame (D:L273163). The item's rows (+0x44 of its content) are the largest of its cells' (`FUN_0037cdc0`
// D:L274866-274885): a wrapped cell's max(1, +0x44) (0x37be30) -- the count of its last draw, -1 after the set
// (D:L273549) -- every other cell 1 (0x36ba60). The values worked by hand from those lines.
describe('LISTBOX: a WRAPPED_TEXT column draws a CWrappedText cell (NU-13)', () => {
  const wrappedList = () => rec('L', 'LISTBOX', 100, 50, r(
    'XSIZE', '447', 'YSIZE', '270', 'SPACING', '17', 'SCALE', '1', 'TOP_MARGIN', '25', 'LEFT_MARGIN', '10', 'HIGHLIGHT_OFFSET', '-6',
    'NORMAL', 'hl_n.tif', 'ACTIVE', 'hl_a.tif', 'PRESSED', 'hl_p.tif',
    'UIVAR', r('NAME', 'LIST_VAR'),
    'COLUMNS', [r('POSITION', '-300'), r('POSITION', '90', 'TOP_OFFSET', '3', 'MAXWIDTH', '30', 'WRAPPED_TEXT', '1'), r('POSITION', '0')],
  ));
  const S = (value: string): UiVarValue => ({ type: 'string', value });
  const row = (...cells: string[]): UiVarValue => ({ type: 'array', value: cells.map(S) });
  const build = () => {
    const vars = new UiVarManager();
    const d = design([wrappedList()]);
    const face = textFace();
    const set = WidgetSet.build(d, buildDialogScreen(d), { face: () => face, uiVars: vars });
    const l = set.get('L') as ListboxWidget;
    vars.set('LIST_VAR', { type: 'array', value: [row('1', 'AB AB AB', 'CA'), row('-1', ' ', 'CB')] });
    return { l, face };
  };
  type Glyphs = Extract<UiDrawItem, { kind: 'glyphs' }>;
  const glyphs = (items: UiDrawItem[]): Glyphs[] => items.filter((i): i is Glyphs => i.kind === 'glyphs');
  const codesOf = (g: Glyphs): string => String.fromCharCode(...g.quads.filter((q) => !q.shadow).map((q) => q.code));
  /** The list's scissor (D:L270012): -3 + the first row's y less a row, down to the list's foot. */
  const LIST_CLIP = { x0: 0, y0: LISTBOX_CLIP_DROP + (75 - 17), x1: 640, y1: 320 };
  const FRAME = { x0: 0, y0: 0, x1: 640, y1: 448 };

  it('the text wrapped at MAXWIDTH, white at the face\'s opacity x 128; line k at (left + POSITION, row + TOP_OFFSET - 3 + k x SPACING); the label on the row, past the reset scissor', () => {
    const { l, face } = build();
    const lines = wrapLines(face, 'AB AB AB', { width: 30, scale: 1, color: [255, 255, 255] });
    expect(lines.map((x) => String.fromCharCode(...x.bytes))).toEqual(['AB', 'AB', 'AB']);
    const line = { scale: fmul(1, face.scale), color: [255, 255, 255] as [number, number, number], alpha: fmul(face.opacity, 128), bold: false };
    const drawn = glyphs(l.draw(100, 50, 1));
    // row 0's pen: (100 + 10, 50 + 25); the cell's (110 + 90, 75 + 3), its lines 3 above and 17 apart.
    expect(drawn.filter((g) => codesOf(g) === 'AB')).toEqual([
      glyphsAt('L', face, lines[0]!.codes, 200, 75, line, LIST_CLIP),
      glyphsAt('L', face, lines[1]!.codes, 200, 92, line, LIST_CLIP),
      glyphsAt('L', face, lines[2]!.codes, 200, 109, line, LIST_CLIP),
    ]);
    const label = drawn.find((g) => codesOf(g) === 'CA')!;
    const own = label.quads.find((q) => !q.shadow)!;
    const want = (glyphsAt('L', face, engineCodes('CA'), 110, 75, { scale: 1, color: [0, 0, 0], alpha: 0 }) as Glyphs).quads.find((q) => !q.shadow)!;
    expect([own.left, own.top, label.clip]).toEqual([want.left, want.top, FRAME]);
    expect(l.placed.cells.filter((c) => c.item === 0).map((c) => [c.column, c.kind, c.x, c.y, c.lines.map((p) => [p.x, p.y])])).toEqual([
      [0, 'text', -190, 75, []], [1, 'wrapped', 200, 78, [[200, 75], [200, 92], [200, 109]]], [2, 'text', 110, 75, []],
    ]);
  });

  it('the item\'s rows are its cell\'s line count from the last draw: one on the first draw, three after -- the next row moves down, the bar three rows tall', () => {
    const { l } = build();
    const first = l.draw(100, 50, 1);
    const bar = (items: UiDrawItem[]) => items.find((i): i is Extract<UiDrawItem, { kind: 'sprite' }> => i.kind === 'sprite' && i.texture === 'hl_n.tif')!;
    // the bar: (x, int(0 - 6 + 75 - 0.75 x 17) = 56), the list's width, the focus item's rows x SPACING.
    expect([bar(first).x0, bar(first).y0, bar(first).x1, bar(first).y1]).toEqual([100, 56, 547, 73]);
    expect(l.placed.cells.filter((c) => c.item === 1 && c.column === 2).map((c) => c.y)).toEqual([92]);
    expect(l.items[0]!.wrapped[1]!.rows).toBe(3);
    const second = l.draw(100, 50, 1);
    expect([bar(second).x0, bar(second).y0, bar(second).x1, bar(second).y1]).toEqual([100, 56, 547, 107]);
    expect(l.placed.highlight).toEqual({ x: 100, y: 56, w: 447, h: 51 });
    expect(l.placed.cells.filter((c) => c.item === 1 && c.column === 2).map((c) => c.y)).toEqual([126]);
  });

  it('a blank text (" ") makes no line; the captions keep the cell\'s text for GetContents', () => {
    const { l } = build();
    l.draw(100, 50, 1);
    expect(l.items.map((i) => i.captions)).toEqual([['1', 'AB AB AB', 'CA'], ['-1', ' ', 'CB']]);
    expect(l.items[1]!.wrapped.map((w) => (w === null ? null : w.lines.length))).toEqual([null, 0, null]);
    expect(l.items[1]!.wrapped[1]!.rows).toBe(0);
  });
});
