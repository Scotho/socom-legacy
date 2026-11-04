import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import {
  BINDING_DEFAULT_CODE, DIALOG_BUTTONS, DIALOG_EVENTS, DialogLoader, LISTBOX_UNSET_READING, POSITION_UNSET_READING, RdrLookup, UNNAMED,
  dialogNodeNames, keysOf, loadDialog, unreadKeys, type DialogWidget,
} from '../src/index';

// Web research 105. Every expectation is transcribed from the retail decompilation (`D:L<line>` = a line of
// game/analysis/socom2_game.elf.decomp.c); the records are made up, shaped as `parseRdr` returns a compiled dialog
// (a key string, then the list of its values). No expected value was produced by running the loader.

/** `("K1" (v...) "K2" (v...))` from `['K1', v, 'K2', v]`; a value that is not a list is wrapped in one. */
const r = (...kv: (string | RdrNode)[]): RdrNode[] => {
  const out: RdrNode[] = [];
  for (let i = 0; i < kv.length; i += 2) {
    const v = kv[i + 1]!;
    out.push(kv[i] as string, Array.isArray(v) ? v : [v]);
  }
  return out;
};
/** A dialog file's root: the `SCREENS` record wrapped as `parseRdr` returns it. */
const dialog = (...kv: (string | RdrNode)[]): RdrNode => [['SCREENS', r(...kv), '0', '0']];
/** A record of a CONTROLS/OBJECTS list. */
const widget = (name: string, type: string, spec: RdrNode[], ...more: (string | RdrNode)[]): RdrNode[] =>
  r('NAME', name, 'TYPE', type, 'XPOS', '10', 'YPOS', '20', ...more, 'SPEC', spec);
/** One control loaded by the control factory (`FUN_00382890`), its widget. */
const control = (type: string, spec: RdrNode[]): DialogWidget => {
  const d = loadDialog(dialog('CONTROLS', [widget('w', type, spec)]));
  expect(d.dropped).toEqual([]);
  return d.controls[0]!.widget;
};
const object = (type: string, spec: RdrNode[]): DialogWidget => {
  const d = loadDialog(dialog('OBJECTS', [widget('w', type, spec)]));
  expect(d.dropped).toEqual([]);
  return d.objects[0]!.widget;
};

describe('the lookups (FUN_0032f0e0 D:L230255-230299 and its readers)', () => {
  it('searches depth-first and takes the first match in document order, a nested one before a later sibling', () => {
    const q = new RdrLookup();
    const node: RdrNode = ['A', ['x'], ['NESTED', ['FONT', ['inner']]], 'FONT', ['outer']];
    expect(q.str(node, 'FONT')).toBe('inner');
  });
  it('never reaches a doubled key\'s second copy', () => {
    const q = new RdrLookup();
    expect(q.str(r('FILENAME', 'arrow_top.tif', 'FILENAME', ' '), 'FILENAME')).toBe('arrow_top.tif');
  });
  it('compares with strcmp (FUN_00198f18): case-sensitive', () => {
    expect(new RdrLookup().find(r('caption', 'x'), 'CAPTION')).toBeUndefined();
  });
  it('FUN_0032ee10: a string, or the first element of a list when it is a string; an empty list is none', () => {
    const q = new RdrLookup();
    expect(q.str(r('NAME', ['Extras', 'are', 'available']), 'NAME')).toBe('Extras');
    expect(q.str(['HCENTERED', []], 'HCENTERED')).toBeNull();
    expect(q.str(['K', [['L']]], 'K')).toBeNull();
  });
  it('FUN_0032e970 / FUN_0032ea80: only from a list of at least n elements; a float is truncated for an int; a word is 0', () => {
    const q = new RdrLookup();
    expect(q.int(r('XPOS', '2.75'), 'XPOS')).toBe(2);
    expect(q.float(r('SCALE', '0.75'), 'SCALE')).toBe(Math.fround(0.75));
    expect(q.int(r('XPOS', 'left'), 'XPOS')).toBe(0);
    expect(q.ints(r('RANGE', '1'), 'RANGE', 2)).toBeNull();
    expect(q.int(['XPOS', []], 'XPOS')).toBeNull();
  });
  it('FUN_0032dc80 needs two elements, FUN_0032de80 three', () => {
    const q = new RdrLookup();
    expect(q.int2(r('SIZE', ['640', '448']), 'SIZE')).toEqual([640, 448]);
    expect(q.int2(r('SIZE', ['640']), 'SIZE')).toBeNull();
    expect(q.float3(r('COLOR', ['1', '2']), 'COLOR')).toBeNull();
    expect(q.float3(r('COLOR', ['36', '72', '75']), 'COLOR')).toEqual([36, 72, 75]);
  });
  it('records what it matched; keysOf lists a subtree\'s keys, not its values', () => {
    const q = new RdrLookup();
    const node = r('A', ['1', '2'], 'B', r('C', 'x'));
    q.find(node, 'C');
    const keys = keysOf(node);
    expect(keys.map((k) => k.path)).toEqual(['A', 'B', 'B/C']);
    expect(keys.map((k) => q.wasRead(k.list, k.index))).toEqual([false, false, true]);
  });
});

describe('the design reader (FUN_00381550 D:L277197-277422)', () => {
  it('never looks up SCREENS: loose tokens beside it change nothing (the fourteen ":end of file" layouts, research 96 §2.3)', () => {
    const root: RdrNode = [['SCREENS', r('FONT', 'font_text_01', 'OBJECTS', [widget('a', 'TEXT', r('CAPTION', 'x'))])], ':end of file', ':end of Def\'s'];
    const d = loadDialog(root);
    expect(d.font).toBe('font_text_01');
    expect(d.objects.map((o) => o.name)).toEqual(['a']);
  });
  it('LIBRARY first, then LIBRARIES; "UIVAR <name>" in LIBRARIES is a var resolved at load (D:L277232-277306)', () => {
    const d = loadDialog(dialog('LIBRARY', 'ui/assetlib/ui2d', 'LIBRARIES', ['ui/assetlib/uibf', 'uivar', 'EquipLib', 'ui/assetlib/uiop']));
    expect(d.libraries).toEqual([{ name: 'ui/assetlib/ui2d' }, { name: 'ui/assetlib/uibf' }, { uivar: 'EquipLib' }, { name: 'ui/assetlib/uiop' }]);
  });
  it('USES_MEMCARD and NOFONTLIB are flags; FONT is the first anywhere -- an object\'s, when the screen has none (D:L277307-277322)', () => {
    const d = loadDialog(dialog('USES_MEMCARD', [], 'NOFONTLIB', [], 'OBJECTS', [widget('t', 'TEXT', r('FONT', 'font_titlebar_01'))]));
    expect([d.usesMemcard, d.fontLib, d.font]).toEqual([true, false, 'font_titlebar_01']);
    expect(loadDialog(dialog()).fontLib).toBe(true);
  });
  it('BACKGROUND: TYPE IMAGE 0, MPEG 1, MPEG_LOOPING 2 (strcasecmp), another word 0; FILENAME (D:L277323-277351)', () => {
    const bg = (t: string) => loadDialog(dialog('BACKGROUND', r('TYPE', t, 'FILENAME', 'run/movies/common/menuloop.pss'))).background;
    expect([bg('IMAGE')!.type, bg('MPEG')!.type, bg('mpeg_looping')!.type, bg('MOVIE')!.type]).toEqual([0, 1, 2, 0]);
    expect(bg('MPEG')!.filename).toBe('run/movies/common/menuloop.pss');
    expect(loadDialog(dialog()).background).toBeNull();
  });
  it('the screen ANIMATIONS, SCRIPT_LIBRARY (strings only) and MODELS (FUN_003812b0 D:L277126-277190)', () => {
    const d = loadDialog(dialog(
      'SCRIPT_LIBRARY', ['dlgMenu.rdr', 'uianim.rdr'],
      'ANIMATIONS', [r('EVENT', 'ONSTART', 'ANIMATION', 'PulseArrows')],
      'MODELS', [r('NAME', 'Roller', 'MODEL', 'mainmenu_roller', 'ELEV', '-12.5', 'DISTANCE', '60', 'ROTX', '5', 'ROTY', '6'), r('NAME', 'Bare', 'USEMODELUIVAR', [])],
    ));
    expect(d.scripts).toEqual(['dlgMenu.rdr', 'uianim.rdr']);
    expect(d.bindings.map((b) => [b.kind, b.name, b.animation])).toEqual([['event', 'ONSTART', 'PulseArrows']]);
    // ROTX, ROTY and ROTZ all land in one field (D:L277177-277184): the last read, ROTZ (absent: 0), wins.
    expect(d.models).toEqual([
      { name: 'Roller', model: 'mainmenu_roller', azimuth: 0, elev: -12.5, distance: 60, rot: 0, useModelUiVar: false },
      { name: 'Bare', model: null, azimuth: 0, elev: 0, distance: 20, rot: 0, useModelUiVar: true },
    ]);
  });
});

describe('a CONTROLS / OBJECTS record (FUN_00383360 D:L278260-278342)', () => {
  it('NAME, TYPE, XPOS, YPOS, OPACITY (default 1), CHILDOF; a NAME of three tokens is its first', () => {
    const d = loadDialog(dialog('OBJECTS', [
      widget('a', 'TEXT', r('CAPTION', 'x'), 'OPACITY', '0.2', 'CHILDOF', 'b'),
      r('NAME', ['Extras', 'are', 'available'], 'TYPE', 'TEXT', 'SPEC', r('CAPTION', 'y')),
    ]));
    expect(d.objects.map((o) => [o.name, o.type, o.x, o.y, o.opacity, o.childOf])).toEqual([
      ['a', 'TEXT', 10, 20, Math.fround(0.2), 'b'], ['Extras', 'TEXT', 0, 0, 1, null],
    ]);
  });
  it('a record with no SPEC, or a TYPE its factory does not make, is passed over; an empty NAME is "unnamed"', () => {
    const d = loadDialog(dialog(
      'OBJECTS', [r('NAME', 'nospec', 'TYPE', 'IMAGE'), widget('btn', 'BUTTON', r('CAPTION', 'x')), widget('', 'IMAGE', r('FILENAME', 'a.tif'))],
    ));
    // The object factory (FUN_00382070) makes no BUTTON: only the control factory (FUN_00382890) does.
    expect(d.objects.map((o) => o.name)).toEqual([UNNAMED]);
    expect(d.dropped).toEqual([
      { list: 'OBJECTS', name: 'nospec', type: 'IMAGE', why: 'no SPEC' },
      { list: 'OBJECTS', name: 'btn', type: 'BUTTON', why: 'unknown TYPE' },
    ]);
  });
  it('CHILDOF is the first anywhere in the record: a RADIOSTRIP with none of its own takes its first subordinate\'s', () => {
    const strip = r('NAME', 'HDDOnOff', 'TYPE', 'RADIOSTRIP', 'SPEC', r('SUBORDINATES', [r('NAME', 'HDD_On', 'TYPE', 'CHECKBOX', 'SPEC', r('CHILDOF', 'HDDOnOff'))]));
    expect(loadDialog(dialog('CONTROLS', [strip])).controls[0]!.childOf).toBe('HDDOnOff');
  });
  it('the menu\'s nodes: each control, then its subordinates, then the objects (FUN_00367950 D:L263627-263658)', () => {
    const d = loadDialog(dialog(
      'OBJECTS', [widget('title', 'TEXT', r('CAPTION', 'x'))],
      'CONTROLS', [
        widget('first', 'BUTTON', r('CAPTION', 'x')),
        widget('strip', 'RADIOSTRIP', r('SUBORDINATES', [r('NAME', 'on', 'TYPE', 'CHECKBOX', 'SPEC', r()), r('NAME', 'off', 'TYPE', 'CHECKBOX', 'SPEC', r())])),
        widget('map', 'MAPCONTROL', r('ELEMENTS', [r('TYPE', 'IMAGE', 'SPEC', r('FILENAME', 'dot.tif'))])),
      ],
    ));
    expect(dialogNodeNames(d)).toEqual(['first', 'strip', 'on', 'off', 'map', 'title']);
  });
});

describe('a binding (ParseButtonAnim FUN_00365d50 D:L262463-262795)', () => {
  const bind = (b: RdrNode[]) => new DialogLoader().binding(b);
  it('a BUTTON: its code (FUN_0036a5d0 D:L264986-265078), its STATE (UP 0, FALLING 1, DOWN 2, RISING 3; else 1)', () => {
    expect(bind(r('BUTTON', 'TRIGGER_L1', 'STATE', 'DOWN', 'ANIMATION', 'ScrollTextUp'))).toEqual(
      { kind: 'button', name: 'TRIGGER_L1', code: 12, state: 2, animation: 'ScrollTextUp', argument: null });
    expect(bind(r('BUTTON', 'CROSS', 'ANIMATION', 'goto_menu', 'ARGUMENT', 'dlgMenu.rdr'))).toMatchObject({ code: DIALOG_BUTTONS.CROSS, state: 1, argument: 'dlgMenu.rdr' });
    expect(bind(r('BUTTON', 'R1', 'STATE', 'SIDEWAYS', 'ANIMATION', 'a'))).toMatchObject({ code: 0, state: 1 });
  });
  it('an EVENT: its code; an unknown name is 0, ONSTART\'s (D:L262682)', () => {
    expect(bind(r('EVENT', 'MEMCARD_ERROR', 'ANIMATION', 'handle_memcard_error'))).toMatchObject({ kind: 'event', code: DIALOG_EVENTS.MEMCARD_ERROR, state: 1 });
    expect(DIALOG_EVENTS.MEMCARD_ERROR).toBe(0x1b);
    expect(bind(r('EVENT', 'ON_SOMETHING', 'ANIMATION', 'a')).code).toBe(0);
  });
  it('neither BUTTON nor EVENT (a TRIGGER, a BUTTONS): the slot keeps FUN_003838b0\'s defaults and no animation', () => {
    expect(bind(r('TRIGGER', 'R1', 'ANIMATION', 'goto_menu', 'ARGUMENT', 'dlgMenu.rdr'))).toEqual(
      { kind: 'button', name: null, code: BINDING_DEFAULT_CODE, state: 1, animation: null, argument: null });
  });
});

describe('the object factory FUN_00382070 (D:L277598-277788)', () => {
  it('TEXT (D:L277613-277656): CAPTION, SCALE 1, FONT, HCENTERED, RIGHT_JUSTIFIED read after it, COLOR 128', () => {
    expect(object('TEXT', r('CAPTION', '_507_DevelopedZipper_MSG', 'HCENTERED', []))).toEqual({
      type: 'TEXT', uivar: null,
      text: { caption: '_507_DevelopedZipper_MSG', scale: 1, font: null, hcentered: true, rightJustified: false, color: [128, 128, 128] },
    });
    const both = object('TEXT', r('HCENTERED', [], 'RIGHT_JUSTIFIED', [], 'COLOR', ['36', '72', '75'], 'SCALE', '0.8'));
    expect(both).toMatchObject({ text: { caption: null, hcentered: false, rightJustified: true, color: [36, 72, 75], scale: Math.fround(0.8) } });
  });
  it('IMAGE (FUN_00383160 D:L278187-278230): FILENAME, SIZE then XSIZE/YSIZE over it, PULSE when present', () => {
    expect(object('IMAGE', r('SIZE', ['610', '46'], 'YSIZE', '32', 'FILENAME', 'backsolid.tif'))).toEqual(
      { type: 'IMAGE', uivar: null, image: { filename: 'backsolid.tif', size: [610, 32], pulse: null } });
    expect(object('IMAGE', r('PULSE', '2'))).toMatchObject({ image: { filename: null, size: [0, 0], pulse: 2 } });
  });
  it('TELETYPE (D:L277667-277698): MAXHEIGHT -1, PULSERATE, SPACING, INTERVAL, MAXLENGTH, NOCURSOR, FADECURSOR', () => {
    expect(object('TELETYPE', r('INTERVAL', '0.05', 'NOCURSOR', []))).toMatchObject({
      maxHeight: -1, pulseRate: 0, spacing: 0, interval: Math.fround(0.05), maxLength: 0, noCursor: true, fadeCursor: false,
    });
  });
  it('WRAPPEDTEXT (D:L277701-277744): WIDTH, SPACING 10, HEIGHT -1, the arrows, AUTOSCROLL, DISPLAY_ONE_LINE', () => {
    expect(object('WRAPPEDTEXT', r('WIDTH', '300', 'DOWN_ARROW', r('TEXTURE', 'arrow_botm.tif', 'SIZE', ['16', '16'])))).toMatchObject({
      width: 300, spacing: 10, height: -1, upArrow: null, autoScroll: false, displayOneLine: false, displayableLines: null,
      downArrow: { texture: 'arrow_botm.tif', size: [16, 16], offset: [0, 0] },
    });
  });
  it('PROGRESSBAR (FUN_0037e600 D:L275702-275725): an image, FILENAME_IS_UIVAR, LEADING_EDGE_NODE', () => {
    expect(object('PROGRESSBAR', r('FILENAME', 'load_progress_filling', 'FILENAME_IS_UIVAR', []))).toMatchObject({
      image: { filename: 'load_progress_filling' }, filenameIsUiVar: true, leadingEdgeNode: null,
    });
  });
  it('COUNTER (FUN_00381e10 D:L277523-277593): StartTime, ValVar, EndTime -- or Duration, flagged, when EndTime is absent', () => {
    expect(object('COUNTER', r('StartTime', '5', 'EndTime', '0'))).toMatchObject({ startTime: 5, endTime: 0, isDuration: false, valVar: null });
    expect(object('COUNTER', r('Duration', '30', 'ValVar', 'Timer'))).toMatchObject({ endTime: 30, isDuration: true, valVar: 'Timer' });
  });
  it('CLOCK (FUN_0037d3f0 D:L275026-275079) and SECURETEXT (FUN_00382670): the text fields', () => {
    expect(object('CLOCK', r('CAPTION', 'c'))).toMatchObject({ type: 'CLOCK', text: { caption: 'c', scale: 1 } });
    expect(object('SECURETEXT', r('SCALE', '0.9'))).toMatchObject({ type: 'SECURETEXT', text: { caption: null, scale: Math.fround(0.9) } });
  });
  it('a widget\'s UIVAR (FUN_00386ff0 D:L280288-280349): NAME, VALUE, LONGEVITY; a TYPE in it is not read', () => {
    expect(object('TEXT', r('UIVAR', r('NAME', 'VERSION_STRING')))).toMatchObject({ uivar: { name: 'VERSION_STRING', value: null, longevity: 1 } });
    expect(object('TEXT', r('UIVAR', r('NAME', 'v', 'VALUE', '3', 'LONGEVITY', 'permanent')))).toMatchObject({ uivar: { value: '3', longevity: 2 } });
    expect(object('TEXT', r('UIVAR', r('NAME', 'v', 'TYPE', 'PERMANENT')))).toMatchObject({ uivar: { longevity: 1 } });
  });
});

describe('the control factory FUN_00382890 (D:L277870-277985)', () => {
  it('BUTTON (FUN_00380620 D:L276723-277103): sizes, offsets, a state as a block, a state flat, the bindings', () => {
    const w = control('BUTTON', r(
      'XSIZE', '256', 'YSIZE', '30', 'XOFFSET', '55', 'YOFFSET', '22', 'SCALE', '0.6', 'CAPTION', ' ', 'HCENTERED', [],
      'PRESSED', r('TEXT_COLOR', ['255', '74', '8'], 'SCALE', '0.7'),
      'ACTIVE', r('TEXT_COLOR', ['12', '68', '78'], 'TEXT_GLOW', r('RANGE', ['0.3', '1'], 'TIME', '0.8'), 'SCALE', '0.75'),
      'NORMAL', 'brown_back.tif', 'NORMALGLOW', r('RANGE', ['1', '2'], 'TIME', '0.5'), 'NORMAL_COLOR', ['30', '30', '50'],
      'DISABLED', 'dim.tif', 'SCALE', '0.2',
      'ANIMATIONS', [r('BUTTON', 'CROSS', 'ANIMATION', 'UiprepMission1')],
    ));
    if (w.type !== 'BUTTON') throw new Error(w.type);
    const b = w.button;
    expect([b.size, b.offset, b.scale, b.caption, b.hcentered, b.font]).toEqual([[256, 30], [55, 22], Math.fround(0.6), ' ', true, null]);
    expect(b.pressed).toEqual({ block: true, image: null, textColor: [255, 74, 8], pulse: 0, scale: Math.fround(0.7), glow: null });
    expect(b.active).toEqual({ block: true, image: null, textColor: [12, 68, 78], pulse: 0, scale: Math.fround(0.75), glow: { range: [Math.fround(0.3), 1], time: Math.fround(0.8) } });
    // Flat: the image is the state's own word; the glow's RANGE is read as ints (D:L276865); the scale is the button's.
    expect(b.normal).toEqual({ block: false, image: 'brown_back.tif', textColor: [30, 30, 50], pulse: 0, scale: Math.fround(0.6), glow: { range: [1, 2], time: 0.5 } });
    // A flat DISABLED image is looked up and dropped (D:L277011).
    expect(b.disabled.image).toBeNull();
    expect(b.bindings.map((x) => [x.name, x.code, x.animation])).toEqual([['CROSS', 9, 'UiprepMission1']]);
  });
  it('BUTTON: SIZE over XSIZE/YSIZE and OFFSET over XOFFSET/YOFFSET (D:L276832-276837); SCALE defaults to 1', () => {
    const w = control('BUTTON', r('XSIZE', '1', 'SIZE', ['180', '30'], 'OFFSET', ['10', '28'], 'YOFFSET', '5'));
    expect(w).toMatchObject({ button: { size: [180, 30], offset: [10, 28], scale: 1, normal: { scale: 1, textColor: [128, 128, 128] } } });
  });
  it('SCROLLINGTEXT (FUN_00382c70 D:L278025-278126 and D:L277891-277900): the wrapping fields and DISPLAYABLELINES', () => {
    expect(control('SCROLLINGTEXT', r('DISPLAYABLELINES', '6', 'AUTOSCROLL', []))).toMatchObject({ type: 'SCROLLINGTEXT', displayableLines: 6, autoScroll: true, spacing: 10 });
  });
  it('HANDLERBUTTON (FUN_00380280 D:L276588-276656): a button with one SUBORDINATE through the control factory', () => {
    const w = control('HANDLERBUTTON', r('CAPTION', 'x', 'SUBORDINATE', r('NAME', 'inner', 'TYPE', 'BUTTON', 'XPOS', '4', 'SPEC', r('CAPTION', 'y'))));
    expect(w).toMatchObject({ type: 'HANDLERBUTTON', subordinate: { name: 'inner', type: 'BUTTON', x: 4, y: POSITION_UNSET_READING, opacity: 1, childOf: null } });
  });
  it('LISTBOX (FUN_0037eab0 D:L275893-276585): the image, the list fields, the columns, the options, SPEED 60', () => {
    const w = control('LISTBOX', r(
      'PRESSED_COLOR', ['102', '87', '38'], 'ACTIVE_COLOR', ['91', '72', '36'], 'NOSELECT', [], 'PADHOG', [],
      'FILENAME', 'popup_load.tif', 'XSIZE', '512', 'YSIZE', '270', 'SPACING', '21', 'SCALE', '0.8', 'LEFT_MARGIN', '25', 'TOP_MARGIN', '84',
      'COLUMNS', [r('POSITION', '-5'), r('POSITION', '300', 'TIMED_TEXT', [], 'MAXWIDTH', '90'), r('POSITION', '7', 'IMAGE', r('SIZE', ['16', '16'], 'TEXTURES', ['a.tif', 'b.tif']))],
      'OPTIONS', [r('CAPTION', 'One', 'BUTTON', 'CROSS', 'ANIMATION', 'pick', 'USERDATA', '1')],
      'UIVAR', r('NAME', 'SavedGames'),
      'ANIMATIONS', [r('BUTTON', 'TRIANGLE', 'ANIMATION', 'CancelLoadGame')],
    ));
    if (w.type !== 'LISTBOX') throw new Error(w.type);
    expect([w.image, w.spacing, w.scale, w.topMargin, w.leftMargin, w.noSelect, w.autoScroll, w.padHog]).toEqual(
      [{ filename: 'popup_load.tif', size: [512, 270], pulse: null }, 21, Math.fround(0.8), 84, 25, true, false, true]);
    expect([w.normalColor, w.activeColor, w.pressedColor, w.activeGlow]).toEqual([[128, 128, 128], [91, 72, 36], [102, 87, 38], { range: [0, 0], time: 0 }]);
    expect(w.columns).toEqual([
      { kind: 1, position: -5, topOffset: 0, maxWidth: 1000, rightJustified: false, scale: 0, size: [0, 21], textures: null },
      { kind: 2, position: 300, topOffset: 0, maxWidth: 90, rightJustified: false, scale: 0, size: [0, 21], textures: null },
      { kind: 0, position: 7, topOffset: 0, maxWidth: 0, rightJustified: false, scale: 0, size: [16, 16], textures: ['a.tif', 'b.tif'] },
    ]);
    expect(w.options).toEqual([{
      caption: 'One', captions: ['One'], binding: { kind: 'button', name: 'CROSS', code: 9, state: 1, animation: 'pick', argument: null },
      focus: { kind: 'event', name: 'ONACTIVATE', code: DIALOG_EVENTS.ONACTIVATE, state: 1, animation: null, argument: null }, userData: '1',
    }]);
    expect([w.uivar?.name, w.bindings.map((b) => b.animation), w.speed, w.sequenceDelay]).toEqual(['SavedGames', ['CancelLoadGame'], 60, 0]);
  });
  it('LISTBOX option CAPTION (FUN_0036bdd0 D:L265910-265950 -> FUN_0037b2f0 D:L274070-274138): one cell per column, its strings only', () => {
    const two = r('POSITION', '0'), cols = (n: number): RdrNode[] => Array.from({ length: n }, () => two);
    const options = (n: number, ...captions: RdrNode[]) => {
      const w = control('LISTBOX', r('COLUMNS', cols(n), 'OPTIONS', captions.map((c) => ['CAPTION', c])));
      if (w.type !== 'LISTBOX') throw new Error(w.type);
      return w.options.map((o) => [o.caption, o.captions]);
    };
    // Two columns: both strings are cells; the cell count is min(the CAPTION list's length, the columns) (D:L274097-274100).
    expect(options(2, ['Name', '8/16'])).toEqual([['Name', ['Name', '8/16']]]);
    expect(options(1, ['Name', '8/16'])).toEqual([['Name', ['Name']]]);
    expect(options(3, ['Name'])).toEqual([['Name', ['Name']]]);
    // Only a string element makes a cell (D:L274113); a CAPTION that is not a list makes none (D:L265937-265940).
    expect(options(2, [['x'], 'B'])).toEqual([['B', ['B']]]);
    expect(options(2, 'bare')).toEqual([[null, []]]);
  });
  it('LISTBOX option focus (D:L276259-276274, D:L276538; the slot from D:L265927-265931): an event, ONACTIVATE, FOCUS_ANIM and FOCUS_ARG', () => {
    const w = control('LISTBOX', r('OPTIONS', [r('CAPTION', 'One', 'FOCUS_ANIM', 'Hilite', 'FOCUS_ARG', '3')]));
    if (w.type !== 'LISTBOX') throw new Error(w.type);
    expect(w.options[0]!.focus).toEqual({ kind: 'event', name: 'ONACTIVATE', code: 2, state: 1, animation: 'Hilite', argument: '3' });
  });
  it('LISTBOX: no COLUMNS is one default column; SPACING and the margins absent are LISTBOX_UNSET_READING', () => {
    const w = control('LISTBOX', r('FILENAME', 'x.tif'));
    expect(w).toMatchObject({ columns: [{ kind: 1, position: 0 }], spacing: LISTBOX_UNSET_READING, topMargin: LISTBOX_UNSET_READING });
  });
  it('SLIDERBAR (D:L277921-277946): a button, NUM_INTERVALS 10, KNOB_TEXTURE, KNOB_SIZE, CENTER_VALUE 0.5', () => {
    expect(control('SLIDERBAR', r('KNOB_TEXTURE', 'knob.tif'))).toMatchObject({ numIntervals: 10, knobTexture: 'knob.tif', knobSize: [0, 0], centerValue: 0.5 });
  });
  it('CHECKBOX (FUN_0037e2a0 D:L275588-275646): CHECK_X/Y then CHECK_OFFSET, the sizes, the texture, ONCHECK / ONUNCHECK', () => {
    const w = control('CHECKBOX', r(
      'CHECK_X', '7', 'CHECK_Y', '7', 'CHECKSIZE_X', '25', 'CHECKSIZE_Y', '25', 'CHECK_SIZE', ['30', '31'], 'CHECK_TEXTURE', 'op_check.tif',
      'ONCHECK', r('BUTTON', 'NONE', 'ANIMATION', 'Enable_HDD'), 'CAPTION', 'ENABLED',
    ));
    expect(w).toMatchObject({
      checkOffset: [7, 7], checkSize: [30, 31], checkTexture: 'op_check.tif',
      onCheck: { kind: 'button', name: 'NONE', code: 0, animation: 'Enable_HDD' },
      onUncheck: { kind: 'button', name: null, code: BINDING_DEFAULT_CODE, state: 1, animation: null },
      button: { caption: 'ENABLED' },
    });
  });
  it('RADIOSTRIP (FUN_0037da50 D:L275264-275367): a button; SUBORDINATES through the control factory, CHILDOF from each SPEC', () => {
    const d = loadDialog(dialog('CONTROLS', [widget('w', 'RADIOSTRIP', r('CAPTION', 'HDD', 'SUBORDINATES', [
      r('NAME', 'HDD_On', 'XPOS', '200', 'YPOS', '-2', 'TYPE', 'CHECKBOX', 'SPEC', r('CHILDOF', 'HDDOnOff', 'CAPTION', 'ENABLED')),
      r('NAME', 'gone', 'TYPE', 'CHECKBOX'),
    ]))]));
    expect(d.dropped).toEqual([{ list: 'SUBORDINATES', name: 'gone', type: 'CHECKBOX', why: 'no SPEC' }]);
    expect(d.controls[0]!.widget).toMatchObject({ type: 'RADIOSTRIP', button: { caption: 'HDD' }, subordinates: [{ name: 'HDD_On', type: 'CHECKBOX', x: 200, y: -2, opacity: 1, childOf: 'HDDOnOff' }] });
  });
  it('MAPCONTROL (FUN_0037d600 D:L275098-275207): UPPERLEFT, LOWERRIGHT, ELEMENTS through the object factory, ANIMATIONS', () => {
    const d = loadDialog(dialog('CONTROLS', [widget('map', 'MAPCONTROL', r(
      'UPPERLEFT', ['10', '20'], 'LOWERRIGHT', ['300', '400'],
      'ELEMENTS', [r('XOFFSET', '3', 'YOFFSET', '4', 'TYPE', 'TEXT', 'SPEC', r('CAPTION', 'A')), r('TYPE', 'BUTTON', 'SPEC', r())],
    ))]));
    expect(d.controls[0]!.widget).toMatchObject({ upperLeft: [10, 20], lowerRight: [300, 400], elements: [{ type: 'TEXT', x: 3, y: 4 }], bindings: [] });
    expect(d.dropped).toEqual([{ list: 'ELEMENTS', name: null, type: 'BUTTON', why: 'unknown TYPE' }]);
  });
  it("MAPCONTROL ELEMENTS: XOFFSET/YOFFSET absent keep the previous element's, a dropped one's too (D:L275114-275115, L275160-275161)", () => {
    const d = loadDialog(dialog('CONTROLS', [widget('map', 'MAPCONTROL', r('ELEMENTS', [
      r('TYPE', 'TEXT', 'SPEC', r()),
      r('XOFFSET', '3', 'YOFFSET', '4', 'TYPE', 'TEXT', 'SPEC', r()),
      r('YOFFSET', '9', 'TYPE', 'TEXT'),
      r('TYPE', 'IMAGE', 'SPEC', r()),
    ]))]));
    const w = d.controls[0]!.widget;
    if (w.type !== 'MAPCONTROL') throw new Error(w.type);
    expect(w.elements.map((e) => [e.x, e.y])).toEqual([[POSITION_UNSET_READING, POSITION_UNSET_READING], [3, 4], [3, 9]]);
  });
  it("RADIOSTRIP SUBORDINATES: XPOS/YPOS absent keep the previous subordinate's (D:L275285-275286, L275316-275317)", () => {
    const d = loadDialog(dialog('CONTROLS', [widget('w', 'RADIOSTRIP', r('SUBORDINATES', [
      r('NAME', 'a', 'TYPE', 'CHECKBOX', 'SPEC', r()),
      r('NAME', 'b', 'XPOS', '200', 'YPOS', '-2', 'TYPE', 'CHECKBOX'),
      r('NAME', 'c', 'YPOS', '30', 'TYPE', 'CHECKBOX', 'SPEC', r()),
      r('NAME', 'd', 'XPOS', '7', 'TYPE', 'CHECKBOX', 'SPEC', r()),
    ]))]));
    const w = d.controls[0]!.widget;
    if (w.type !== 'RADIOSTRIP') throw new Error(w.type);
    // 'c' carries b's x (iStack_4), 'd' carries c's y (iStack_8): both locals survive the loop.
    expect(w.subordinates.map((s) => [s.name, s.x, s.y])).toEqual([['a', POSITION_UNSET_READING, POSITION_UNSET_READING], ['c', 200, 30], ['d', 7, 30]]);
  });
  it('falls back to the object factory: a TEXT among the CONTROLS is a TEXT', () => {
    expect(control('TEXT', r('CAPTION', 'x'))).toMatchObject({ type: 'TEXT', text: { caption: 'x' } });
  });
});

describe('the keys no reader looked up (research 105 §4)', () => {
  it('sorts them: SCREENS a container, a doubled key shadowed, the rest unread at the top of their subtree', () => {
    const root = dialog('OBJECTS', [widget('a', 'IMAGE', r('FILENAME', 'x.tif', 'FILENAME', ' ', 'VALVE', 'V', 'SPACING', '3'), 'SCALE', '1')], 'ANIMATIONS', [r('TRIGGER', 'R1', 'ANIMATION', 'goto_menu')]);
    const loader = new DialogLoader();
    loader.load(root);
    const u = unreadKeys(root, loader);
    expect(u.containers.map((k) => k.key)).toEqual(['SCREENS']);
    expect(u.shadowed.map((k) => k.path)).toEqual(['SCREENS/OBJECTS/SPEC/FILENAME']);
    expect(u.unread.map((k) => k.path)).toEqual(['SCREENS/OBJECTS/SCALE', 'SCREENS/OBJECTS/SPEC/VALVE', 'SCREENS/OBJECTS/SPEC/SPACING', 'SCREENS/ANIMATIONS/TRIGGER']);
  });
});
