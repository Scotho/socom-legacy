import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { buildDialogScreen, composeScreen, findNode, UiVarManager, ValveStore, VALVE_TYPE, type UiDrawItem } from '../../src/index';
import { CounterWidget, ProgressBarWidget, WidgetSet } from '../../src/widgets/index';
import { textFace } from '../text/fixtures';
import { RecordingHost, design, nodeCmd, r, rec } from './fixtures';

// Web research 117 §7: PROGRESSBAR (`CHProgressBar`, vtable 0x407550: set-up `FUN_00371a10` D:L269003-269054, draw
// `FUN_003717c0` D:L268942-268998, tick 0x3719e0 and var 0x371ba0 in the ELF), COUNTER (`C2DCounter`, vtable 0x407be0:
// made by `FUN_00381be0` D:L277427-277482, tick `FUN_0037b5c0` D:L274186-274245, commands `FUN_0037b490`
// D:L274143-274181), and the stateless objects PLAT-14 draws (TEXT, SECURETEXT, IMAGE, WRAPPEDTEXT): their ticks and
// commands.

const face = textFace();
const build = (controls: ReturnType<typeof rec>[], objects: ReturnType<typeof rec>[], uiVars?: UiVarManager) => {
  const d = design(controls, objects);
  const screen = buildDialogScreen(d, { face: () => face });
  return { screen, set: WidgetSet.build(d, screen, { face: () => face, uiVars }) };
};

describe('PROGRESSBAR (R117.13)', () => {
  const bar = () => rec('load_progress_filling', 'PROGRESSBAR', 337, 110, r('FILENAME', 'load_line.tif', 'XSIZE', '270', 'YSIZE', '2', 'UIVAR', [r('NAME', 'Load_progress')]));

  it('an unset duration (0) fills it at the first tick (PROGRESSBAR_UNSET_READING): dlgLoad\'s bar is full at once', () => {
    const { set } = build([], [bar()]);
    const p = set.get('load_progress_filling') as ProgressBarWidget;
    expect(p.fill).toBe(0);
    set.tick(1 / 60, new RecordingHost());
    expect(p.fill).toBe(1);
  });

  it('its UIVAR is a duration in seconds; the fill grows dt / duration a tick; every change of the var restarts it from 0', () => {
    const uiVars = new UiVarManager();
    const { set } = build([], [bar()], uiVars);
    const p = set.get('load_progress_filling') as ProgressBarWidget, h = new RecordingHost();
    uiVars.set('Load_progress', { type: 'int', value: 4 });
    expect([p.duration, p.fill]).toEqual([4, 0]);
    set.tick(1, h);
    expect(p.fill).toBe(0.25);
    uiVars.set('Load_progress', { type: 'real', value: 2 });
    expect(p.fill).toBe(0);
    set.tick(1, h); set.tick(1, h); set.tick(1, h);
    expect(p.fill).toBe(1);                                           // capped
  });

  it('drawn under a scissor XSIZE x fill wide: revealed left to right, not stretched', () => {
    const uiVars = new UiVarManager();
    const { set } = build([], [bar()], uiVars);
    const p = set.get('load_progress_filling') as ProgressBarWidget;
    uiVars.set('Load_progress', { type: 'int', value: 4 });
    set.tick(1, new RecordingHost());
    const [s] = p.draw(337, 110, 1).filter((i): i is Extract<UiDrawItem, { kind: 'sprite' }> => i.kind === 'sprite');
    expect([s!.texture, s!.x0, s!.y0, s!.x1, s!.y1]).toEqual(['load_line.tif', 337, 110, 607, 112]);
    expect(s!.clip).toEqual({ x0: 337, y0: 110, x1: 337 + 67, y1: 112 });   // (int)(270 x 0.25)
  });
});

describe('COUNTER (R117.14)', () => {
  const counter = (more: string[] = []) =>
    rec('RoundsWonSeals', 'COUNTER', 0, 35, r('SCALE', '0.9', 'HCENTERED', [], 'StartTime', '3.5', 'ValVar', 'Won', 'EndTime', '4', ...more));

  it('counts 0 up to its ValVar (read once) between StartTime and EndTime, a TELETYPE sound per new number', () => {
    const uiVars = new UiVarManager();
    uiVars.add('Won', { type: 'int', value: 8 }, 1);
    const { set } = build([], [counter()], uiVars);
    const c = set.get('RoundsWonSeals') as CounterWidget, h = new RecordingHost();
    uiVars.set('Won', { type: 'int', value: 99 });                    // read once, at creation
    expect(c.target).toBe(8);
    set.tick(3.5, h);                                                 // clock 3.5: (int)(8 x 0 / 0.5) = 0
    expect([c.shown, String.fromCharCode(...c.codes)]).toEqual([0, '0']);
    set.tick(0.25, h);                                                // 3.75: 4
    expect(c.shown).toBe(4);
    set.tick(0.25, h);                                                // 4.0: not below the end -> the target
    expect(c.shown).toBe(8);
    set.tick(1, h);                                                   // past the end: the clock stops
    expect(h.take()).toEqual(['sound TELETYPE', 'sound TELETYPE', 'sound TELETYPE']);
  });

  it('Duration counts from StartTime; Start (op 4) restarts it now; Finish (op 5) shows the target', () => {
    const uiVars = new UiVarManager();
    uiVars.add('Won', { type: 'real', value: 6.7 }, 1);
    const { set } = build([], [rec('C', 'COUNTER', 0, 0, r('StartTime', '1', 'ValVar', 'Won', 'Duration', '2'))], uiVars);
    const c = set.get('C') as CounterWidget, h = new RecordingHost();
    expect(c.target).toBe(6);                                         // a real truncated
    set.tick(2, h);                                                   // 1 s into 2: (int)(6 x 0.5) = 3
    expect(c.shown).toBe(3);
    expect(set.nodeCommand(nodeCmd('C', 4), h)).toEqual({ answer: true });
    expect(c.startTime).toBe(2);
    expect(set.nodeCommand(nodeCmd('C', 5), h)).toEqual({ answer: true });
    expect([c.shown, String.fromCharCode(...c.codes)]).toEqual([6, '6']);
  });
});

describe('the stateless objects: what the widget set adds to PLAT-14\'s draw', () => {
  it('SECURETEXT: a Caption command is masked as the caption was, one * a character (FUN_0036aff0)', () => {
    const { screen, set } = build([], [rec('pw', 'SECURETEXT', 0, 0, r('CAPTION', 'ABC'))]);
    const node = findNode(screen.root, 'pw')!;
    expect(node.content?.kind === 'text' ? node.content.text.codes : null).toEqual([0x2a, 0x2a, 0x2a]);
    set.nodeCommand(nodeCmd('pw', 1, 'ABCAB'), new RecordingHost());
    expect(node.content?.kind === 'text' ? node.content.text.codes : null).toEqual([0x2a, 0x2a, 0x2a, 0x2a, 0x2a]);
  });

  it('TEXT: a UIVAR set before the build shows at once -- the set-up attaches the item and tells it (FUN_003792f0 D:L273072-273077)', () => {
    const uiVars = new UiVarManager();
    uiVars.set(uiVars.add('VERSION_STRING', null, 2), { type: 'string', value: 'SOCOM 2 r0001' });
    const { screen } = build([], [rec('VERSION', 'TEXT', 0, 36, r('UIVAR', [r('NAME', 'VERSION_STRING')], 'SCALE', '0.8'))], uiVars);
    const node = findNode(screen.root, 'VERSION')!;
    expect(node.content?.kind === 'text' ? String.fromCharCode(...node.content.text.codes) : null).toBe('SOCOM 2 r0001');
  });

  it('TEXT: its UIVAR printed into +0x78 (FUN_00379260 -> FUN_00363830) is drawn up to the first "$~"', () => {
    const uiVars = new UiVarManager();
    uiVars.set(uiVars.add('GAMENAMEVAR', null, 2), { type: 'string', value: 'test$~Channel 1' });
    const { screen } = build([], [rec('name', 'TEXT', 0, 0, r('UIVAR', [r('NAME', 'GAMENAMEVAR')]))], uiVars);
    const node = findNode(screen.root, 'name')!;
    expect(node.content?.kind === 'text' ? String.fromCharCode(...node.content.text.codes) : null).toBe('test');
  });

  it('TEXT: Caption (op 1) and Valve (op 2) as the base handler FUN_0036fcc0', () => {
    const { screen, set } = build([], [rec('t', 'TEXT', 0, 0, r('CAPTION', 'A'))]);
    const node = findNode(screen.root, 't')!;
    set.nodeCommand(nodeCmd('t', 1, 'BC'), new RecordingHost());
    expect(node.content?.kind === 'text' ? node.content.text.codes : null).toEqual([0x42, 0x43]);
  });

  it('IMAGE: its PULSE is ticked (FUN_00378fc0): alpha 64 + 64 sin(phase), a cycle of PULSE seconds', () => {
    const { screen, set } = build([], [rec('i', 'IMAGE', 0, 0, r('FILENAME', 'a.tif', 'SIZE', ['4', '4'], 'PULSE', '2'))]);
    const node = findNode(screen.root, 'i')!;
    set.tick(0.5, new RecordingHost());                               // a quarter turn: sin = 1
    expect(node.content?.kind === 'sprite' ? node.content.sprite.alpha : null).toBeCloseTo(128, 3);
  });

  it('IMAGE: a string UIVAR names its bitmap when the bitmap is found (FUN_00379160); an unknown name keeps the old', () => {
    const uiVars = new UiVarManager();
    const d = design([], [rec('i', 'IMAGE', 0, 0, r('FILENAME', 'a.tif', 'SIZE', ['4', '4'], 'UIVAR', [r('NAME', 'pic')]))]);
    const screen = buildDialogScreen(d, { face: () => face });
    WidgetSet.build(d, screen, { face: () => face, uiVars, hasTexture: (n) => n !== 'gone.tif' });
    const tex = (): string | null => { const c = findNode(screen.root, 'i')!.content; return c?.kind === 'sprite' ? c.sprite.texture : null; };
    uiVars.set('pic', { type: 'string', value: 'b.tif' });
    expect(tex()).toBe('b.tif');
    uiVars.set('pic', { type: 'string', value: 'gone.tif' });
    expect(tex()).toBe('b.tif');
  });

  it('the draw list: each widget item replaced by its widget\'s quads in place; a MAPCONTROL (MENU-16) kept as it was and named undrawn', () => {
    const { screen, set } = build([
      rec('b', 'BUTTON', 10, 20, r('XSIZE', '8', 'YSIZE', '4', 'CAPTION', 'A', 'NORMAL', [r('IMAGE', 'n.tif')])),
      rec('m', 'MAPCONTROL', 0, 0, r('UPPERLEFT', ['0', '0'], 'LOWERRIGHT', ['1', '1'])),
    ], [rec('t', 'TEXT', 0, 0, r('CAPTION', 'A'))]);
    const { items, undrawn } = set.draw(composeScreen(screen));
    expect(items.map((i) => ('node' in i ? `${i.kind}:${i.node}` : i.kind))).toEqual([
      'clear', 'sprite:b', 'glyphs:b', 'widget:m', 'glyphs:t', 'models', 'sprite:MENUFADER',
    ]);
    expect(undrawn).toEqual(['widget m (MAPCONTROL)']);
  });
});

describe('WRAPPEDTEXT: its commands (FUN_00379b10, names FUN_00379970) and its UIVAR', () => {
  // In the fixture face every letter is wider than WIDTH 1: each word is a line of its own (research 111 §5).
  const wrapped = (more: (string | RdrNode)[] = [], caption = 'A B C D E F') =>
    rec('w', 'WRAPPEDTEXT', 10, 40, r('CAPTION', caption, 'WIDTH', '1', 'SPACING', '10', 'HEIGHT', '30', ...more));
  const lineText = (screen: ReturnType<typeof build>['screen']): string[] => {
    const c = findNode(screen.root, 'w')!.content;
    return c?.kind === 'wrapped' ? c.lines.map((l) => String.fromCharCode(...l.codes)) : [];
  };
  const scrollOf = (screen: ReturnType<typeof build>['screen']): number => {
    const c = findNode(screen.root, 'w')!.content;
    return c?.kind === 'wrapped' ? c.scroll : NaN;
  };

  it('Scroll_Down (op 5) adds a SPACING while the scroll is short of rows x SPACING - HEIGHT; Scroll_Up (op 4) takes one off while above 0', () => {
    const { screen, set } = build([], [wrapped()]);
    const h = new RecordingHost();
    expect(lineText(screen)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    // +0x44 (the rows) is the last draw's: none yet, so 0 x 10 - 30 bounds it and Scroll_Down does nothing.
    expect(set.nodeCommand(nodeCmd('w', 5), h)).toEqual({ answer: true });
    expect(scrollOf(screen)).toBe(0);
    set.draw(composeScreen(screen));                                  // the draw counts 6 rows: the bound is 60 - 30
    const downs = [1, 2, 3, 4].map(() => { set.nodeCommand(nodeCmd('w', 5), h); return scrollOf(screen); });
    expect(downs).toEqual([10, 20, 30, 30]);
    const ups = [1, 2, 3, 4].map(() => { expect(set.nodeCommand(nodeCmd('w', 4), h)).toEqual({ answer: true }); return scrollOf(screen); });
    expect(ups).toEqual([20, 10, 0, 0]);
    expect(set.nodeCommand(nodeCmd('w', 3), h)).toBeNull();          // not its op, nor the base's (FUN_0036fcc0 returns 0)
    expect(h.take()).toEqual([]);
  });

  it('Caption (op 1) re-wraps through the setter +0x70 (FUN_00379f70); without AUTOSCROLL the scroll stays', () => {
    const { screen, set } = build([], [wrapped()]);
    set.draw(composeScreen(screen));
    set.nodeCommand(nodeCmd('w', 5), new RecordingHost());
    expect(set.nodeCommand(nodeCmd('w', 1, 'AB CA'), new RecordingHost())).toEqual({ answer: true });
    expect(lineText(screen)).toEqual(['AB', 'CA']);
    expect(scrollOf(screen)).toBe(10);
  });

  it('with AUTOSCROLL a new text resets the scroll to 0', () => {
    const { screen, set } = build([], [wrapped(['AUTOSCROLL', []])]);
    set.draw(composeScreen(screen));
    set.nodeCommand(nodeCmd('w', 5), new RecordingHost());
    expect(scrollOf(screen)).toBe(10);
    set.nodeCommand(nodeCmd('w', 1, 'C'), new RecordingHost());
    expect([lineText(screen), scrollOf(screen)]).toEqual([['C'], 0]);
  });

  it('Valve (op 2): the valve\'s value printed and wrapped (FUN_0036fcc0 calls +0x70); no name: the buffer\'s "0"', () => {
    const valves = new ValveStore();
    const d = design([], [wrapped()]);
    const screen = buildDialogScreen(d, { face: () => face });
    const set = WidgetSet.build(d, screen, { face: () => face, valves });
    valves.set('score', 42, VALVE_TYPE.PERM);
    expect(set.nodeCommand(nodeCmd('w', 2, 'score'), new RecordingHost())).toEqual({ answer: true });
    expect(lineText(screen)).toEqual(['42']);
    set.nodeCommand(nodeCmd('w', 2, ''), new RecordingHost());
    expect(lineText(screen)).toEqual(['0']);
  });

  it('its UIVAR: each change printed and wrapped (FUN_00379260 at the second vtable\'s +0xa4 -> +0x78 -> +0x70)', () => {
    const uiVars = new UiVarManager();
    const { screen } = build([], [wrapped(['UIVAR', [r('NAME', 'chat')]])], uiVars);
    uiVars.set('chat', { type: 'string', value: 'BA AB' });
    expect(lineText(screen)).toEqual(['BA', 'AB']);
    uiVars.set('chat', { type: 'int', value: 7 });
    expect(lineText(screen)).toEqual(['7']);
  });
});

describe('TELETYPE in a dialog: ticked with the widgets; its commands (FUN_00378600 D:L272607-272656, then the base FUN_0036fcc0)', () => {
  // `dlgWorldOfSOCOM.rdr`'s `O_filters` (ONL-09, research 158 section 2.4): built on the caption " ", given #783 by AUTOPLAY's ONACTIVATE.
  const tty = () => rec('t', 'TELETYPE', 10, 40, r('CAPTION', ' ', 'INTERVAL', '1100', 'MAXLENGTH', '370', 'MAXHEIGHT', '170', 'SPACING', '20', 'PULSERATE', '10', 'FADECURSOR', []));
  const typed = (screen: ReturnType<typeof build>['screen']): string => {
    const c = findNode(screen.root, 't')!.content;
    return c?.kind === 'teletype' ? String.fromCharCode(...c.state.typed) : '?';
  };

  it("the widgets' tick types the held caption: nothing before a tick, all of it after enough of them", () => {
    const { screen, set } = build([], [tty()]);
    const h = new RecordingHost();
    expect(typed(screen)).toBe('');
    for (let i = 0; i < 30; i++) set.tick(1 / 30, h);
    expect(typed(screen)).toBe(' ');
  });

  it('Caption (op 1) through the setter (FUN_00378a10): the typed text emptied, the new one typed a character at a time with the TELETYPE sound after the first, ON_TTY_DONE (0x15) at the last', () => {
    const { screen, set } = build([], [tty()]);
    const h = new RecordingHost();
    for (let i = 0; i < 30; i++) set.tick(1 / 30, h);
    h.take();
    expect(set.nodeCommand(nodeCmd('t', 1, 'ABC AB'), h)).toEqual({ answer: true });
    expect(typed(screen)).toBe('');
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) { set.tick(1 / 3000, h); seen.add(typed(screen)); }   // 1 s in steps of a third of a pixel (INTERVAL 1100)
    expect(typed(screen)).toBe('ABC AB');
    expect(seen.has('A') || seen.has('AB') || seen.has('ABC')).toBe(true);        // typed out, not set whole
    const calls = h.take();
    expect(calls.filter((c) => c === 'sound TELETYPE')).toHaveLength(5);          // every character but the first
    expect(calls.filter((c) => c === 'event 0x15')).toHaveLength(1);
  });

  it("Valve (op 2) types the valve's value; finish (op 7) types what is left at once, silently, and the base declines it; Continue (op 4) is taken", () => {
    const valves = new ValveStore();
    const d = design([], [tty()]);
    const screen = buildDialogScreen(d, { face: () => face });
    const set = WidgetSet.build(d, screen, { face: () => face, valves });
    const h = new RecordingHost();
    valves.set('score', 42, VALVE_TYPE.PERM);
    expect(set.nodeCommand(nodeCmd('t', 2, 'score'), h)).toEqual({ answer: true });
    expect(set.nodeCommand(nodeCmd('t', 7), h)).toBeNull();
    expect(typed(screen)).toBe('42');
    expect(h.take().filter((c) => c === 'sound TELETYPE')).toEqual([]);
    expect(set.nodeCommand(nodeCmd('t', 4), h)).toEqual({ answer: true });
    expect(set.nodeCommand(nodeCmd('t', 3), h)).toBeNull();                        // no op 3: the base's answer 0
  });
});
