import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { buildDialogScreen, layoutText, UiVarManager, ValveStore, VALVE_TYPE, type UiDrawItem } from '../../src/index';
import { ButtonWidget, WidgetSet, widgetPad, STICK } from '../../src/widgets/index';
import { textFace } from '../text/fixtures';
import { RecordingHost, design, nodeCmd, r, rec } from './fixtures';

// Web research 117 §2-§3: the BUTTON (`C2DButton`, vtable 0x407790) -- its four states, its pad handler `FUN_00377040`
// (D:L271859-271945), its tick `FUN_003723b0` (D:L269237-269276), its draw `FUN_00377aa0` (D:L272218-272240) with the
// body `FUN_0037c220` (D:L274561-274576), its commands `FUN_00376870` / `FUN_003767c0` and the base `FUN_0036fcc0`
// (D:L268005-268080). Expected values worked by hand from those lines.

/** dlgMenu's shape (research 117 §3.1): NORMAL 0.6, ACTIVE 0.75 glowing 0.3-1 over TIME 0.8, PRESSED (255,74,8). */
const menuButton = (...more: (string | RdrNode)[]) => rec('b', 'BUTTON', 256, 330, r(
  'XSIZE', '256', 'YSIZE', '30', 'XOFFSET', '55', 'YOFFSET', '22', 'SCALE', '0.6', 'CAPTION', 'AB',
  'NORMAL', [r('IMAGE', 'n.tif', 'TEXT_COLOR', ['30', '30', '50'], 'SCALE', '0.6')],
  'ACTIVE', [r('IMAGE', 'a.tif', 'TEXT_COLOR', ['12', '68', '78'], 'SCALE', '0.75', 'TEXT_GLOW', [r('RANGE', ['0.3', '1'], 'TIME', '0.8')])],
  'PRESSED', [r('TEXT_COLOR', ['255', '74', '8'], 'SCALE', '0.7')],
  'DISABLED', [r('IMAGE', 'd.tif', 'TEXT_COLOR', ['15', '30', '45'], 'SCALE', '0.6', 'PULSE', '2')],
  'ANIMATIONS', [
    r('EVENT', 'ONACTIVATE', 'ANIMATION', 'OnAct', 'ARGUMENT', 'x'),
    r('BUTTON', 'CROSS', 'ANIMATION', 'Go'),
    r('BUTTON', 'DOWN', 'ANIMATION', 'Down'),
    r('EVENT', 'ONACTIVATE', 'ANIMATION', 'OnAct2'),
    r('BUTTON', 'TRIANGLE', 'STATE', 'DOWN', 'ANIMATION', 'Held'),
    r('BUTTON', 'SQUARE', 'ANIMATION', 'Nowhere'),
  ],
  ...more,
));

const setOf = (...more: (string | RdrNode)[]) => {
  const d = design([menuButton(...more)]);
  const face = textFace();
  return WidgetSet.build(d, buildDialogScreen(d), { face: () => face });
};
const button = (...more: (string | RdrNode)[]): ButtonWidget => setOf(...more).get('b') as ButtonWidget;

describe('BUTTON: the four states (research 117 §2.1-§2.2)', () => {
  it('starts NORMAL: FUN_00380500 calls set-normal (vtable +0x54) once the button is set up (D:L276718)', () => {
    const b = button();
    expect(b.look.state).toBe('NORMAL');
    expect(b.look.color).toEqual([30, 30, 50]);
    expect(b.look.alpha).toBe(100);                                   // FUN_0036e790: 0x42c80000
    expect(b.body.texture).toBe('n.tif');                             // FUN_0036e840: the state's texture
    expect([b.body.w, b.body.h]).toEqual([256, 30]);                  // XSIZE x YSIZE (+0x240, +0x244)
  });

  it('set active: ACTIVE, then every ONACTIVATE binding (event 2) in list order with its ARGUMENT (0x3766a0)', () => {
    const b = button(), h = new RecordingHost();
    b.setActive(h);
    expect(b.look.state).toBe('ACTIVE');
    expect(b.look.scale).toBe(0.75);
    // The record's floats are the reader's (Math.fround of the token), not this test's arithmetic.
    expect(b.look.glow).toMatchObject({ on: true, period: Math.fround(0.8), top: 1, bottom: Math.fround(0.3) });
    expect(h.take()).toEqual(['anim OnAct(x)', 'anim OnAct2']);
  });

  it('press (CROSS falling): PRESSED for 0.2 s, then ACTIVE by the tick -- ONACTIVATE not run again', () => {
    const b = button(), h = new RecordingHost();
    b.setActive(h); h.take();
    expect(b.input(widgetPad({ CROSS: 'FALLING' }), h)).toBe(true);
    expect(b.look.state).toBe('PRESSED');
    expect(b.look.color).toEqual([255, 74, 8]);
    expect(b.body.texture).toBeNull();                                // PRESSED has no IMAGE: the body draws nothing
    expect(h.take()).toEqual(['anim Go']);                            // the press, then the CROSS binding (D:L271883-271885)
    b.tick(0.1, h);
    expect(b.look.state).toBe('PRESSED');
    b.tick(0.15, h);                                                  // 0.15 >= the 0.1 left: the clock runs out
    expect(b.look.state).toBe('ACTIVE');
    expect(h.take()).toEqual([]);
  });

  it('set enabled(false): DISABLED whatever the state; a disabled button refuses set-active, set-normal and every input', () => {
    const b = button(), h = new RecordingHost();
    b.setActive(h); h.take();
    b.setEnabled(false);
    expect(b.look.state).toBe('DISABLED');
    expect(b.body.pulse).toEqual({ period: 2, phase: 0 });            // FUN_0036e730: a PULSE starts the body's pulse
    b.setActive(h); b.setNormal();
    expect(b.look.state).toBe('DISABLED');
    expect(b.input(widgetPad({ CROSS: 'FALLING' }), h)).toBe(false);
    expect(h.take()).toEqual([]);
    b.setEnabled(true);                                               // FUN_00377380: neither ACTIVE nor PRESSED -> set normal
    expect(b.look.state).toBe('NORMAL');
    expect(b.body.pulse).toBeNull();                                  // NORMAL's PULSE 0: the pulse stops at alpha 128
    expect(b.body.alpha).toBe(128);
  });
});

describe('BUTTON: the pad (FUN_00377040, research 117 §2.3-§2.4)', () => {
  it('the first button binding whose button holds the binding\'s STATE starts; the rest are not looked at', () => {
    const b = button(), h = new RecordingHost();
    expect(b.input(widgetPad({ DOWN: 'FALLING' }), h)).toBe(true);
    expect(h.take()).toEqual(['anim Down']);
    expect(b.input(widgetPad({ TRIANGLE: 'FALLING' }), h)).toBe(false);   // bound STATE DOWN: a press edge is not it
    expect(b.input(widgetPad({ TRIANGLE: 'DOWN' }), h)).toBe(true);
    expect(h.take()).toEqual(['anim Held']);
  });

  it('an EVENT binding is never matched by a pad byte (the kind byte at +0x250 is tested, D:L271881)', () => {
    const b = button(), h = new RecordingHost();
    expect(b.input(widgetPad({ RIGHT: 'FALLING' }), h)).toBe(false);  // ONACTIVATE is code 2, RIGHT's
    expect(h.take()).toEqual([]);
  });

  it('a FALLING binding on a direction also fires on the left stick\'s edge (FUN_0036a060: 3 UP, 4 DOWN, 1 LEFT, 2 RIGHT)', () => {
    const b = button(), h = new RecordingHost();
    expect(b.input(widgetPad({}, STICK.DOWN), h)).toBe(true);
    expect(h.take()).toEqual(['anim Down']);
    expect(b.input(widgetPad({}, STICK.UP), h)).toBe(false);
  });

  it('each direction\'s binding answers its own stick edge only (D:L271900-271914: code 4 stick 3, 5 4, 3 1, 2 2)', () => {
    // One binding per direction, each FALLING; the stick edge only, every button byte UP.
    const dirs = ['UP', 'DOWN', 'LEFT', 'RIGHT'] as const;
    const d = design([rec('b', 'BUTTON', 0, 0, r('ANIMATIONS', dirs.map((n) => r('BUTTON', n, 'ANIMATION', `On${n}`))))]);
    const b = WidgetSet.build(d, buildDialogScreen(d)).get('b') as ButtonWidget, h = new RecordingHost();
    const fired = [STICK.UP, STICK.DOWN, STICK.LEFT, STICK.RIGHT, STICK.NONE, STICK.CENTRED].map((s) => {
      b.input(widgetPad({}, s), h);
      return h.take().join();
    });
    expect(fired).toEqual(['anim OnUP', 'anim OnDOWN', 'anim OnLEFT', 'anim OnRIGHT', '', '']);
  });

  it('a held (DOWN) binding on a direction is not fired by the stick: the edge test asks FALLING (D:L271894)', () => {
    const d = design([rec('b', 'BUTTON', 0, 0, r('ANIMATIONS', [r('BUTTON', 'UP', 'STATE', 'DOWN', 'ANIMATION', 'Held')]))]);
    const b = WidgetSet.build(d, buildDialogScreen(d)).get('b') as ButtonWidget;
    expect(b.input(widgetPad({}, STICK.UP), new RecordingHost())).toBe(false);
  });

  it('a button with children hands the pad to the child at the focus index, with focus 0, and does nothing itself (D:L271933-271941)', () => {
    const parent = button(), h = new RecordingHost();
    const seen: string[] = [];
    const child = (name: string, answer: boolean) => Object.assign(button(), {
      name,
      input: (_pad: unknown, _host: unknown, focus = 0) => { seen.push(`${name}@${focus}`); return answer; },
    }) as ButtonWidget;
    parent.children = [child('c0', true), child('c1', true), child('c2', false)];
    expect(parent.input(widgetPad({ CROSS: 'FALLING', DOWN: 'FALLING' }), h, 1)).toBe(true);
    expect(seen.splice(0)).toEqual(['c1@0']);
    expect(parent.look.state).toBe('NORMAL');                         // no press: CROSS is the leaf's
    expect(h.take()).toEqual([]);                                     // nor its own bindings ('Go', 'Down')
    expect(parent.input(widgetPad({ CROSS: 'FALLING' }), h, 2)).toBe(false);   // the child declines: not handled
    expect(seen.splice(0)).toEqual(['c2@0']);
    expect(parent.input(widgetPad({ CROSS: 'FALLING' }), h, 3)).toBe(false);   // no child there
    expect(parent.input(widgetPad({ CROSS: 'FALLING' }), h)).toBe(true);       // the focus index defaults to 0
    expect(seen.splice(0)).toEqual(['c0@0']);
    parent.setEnabled(false);
    expect(parent.input(widgetPad({ CROSS: 'FALLING' }), h, 0)).toBe(false);   // disabled: +0x48 first (D:L271879)
    expect(seen).toEqual([]);
  });

  it('a binding whose animation is not found still handles the press (D:L271916-271925 return 1 either way)', () => {
    const b = button(), h = new RecordingHost(new Set(['Nowhere']));
    expect(b.input(widgetPad({ SQUARE: 'FALLING' }), h)).toBe(true);
    expect(h.take()).toEqual(['missing Nowhere']);
  });

  it('an unbound button passes: not handled', () => {
    expect(button().input(widgetPad({ CIRCLE: 'FALLING' }), new RecordingHost())).toBe(false);
  });
});

describe('BUTTON: the ACTIVE glow sampled at 5 fps (research 117 §3.1, R117.6-R117.7)', () => {
  it('dlgMenu\'s RANGE 0.3 1, TIME 0.8: a rectified half-sine on the caption\'s alpha, period 1.6 s, 8 samples a cycle', () => {
    const b = button(), h = new RecordingHost();
    b.setActive(h);
    b.tick(0.05, h);                                                  // off the wrap point: phase 0.025
    const samples: number[] = [];
    for (let i = 0; i < 16; i++) { b.tick(0.2, h); samples.push(b.look.alpha); }
    // phase = 0.025 + 0.1 k, wrapped at 0.8 (one cycle = 1.6 s of ticks); alpha = 128 (0.3 + 0.7 sin(3.14 phase / 0.8)).
    const want = Array.from({ length: 16 }, (_, k) => (0.025 + 0.1 * (k + 1)) % 0.8)
      .map((p) => 128 * (0.3 + 0.7 * Math.sin((3.14 * p) / 0.8)));
    samples.forEach((s, i) => expect(s).toBeCloseTo(want[i]!, 2));
    expect(b.look.color).toEqual([12, 68, 78]);                        // the colour is untouched: alpha only
  });
});

describe('BUTTON: the draw (FUN_00377aa0, FUN_0037c220)', () => {
  const sprites = (items: UiDrawItem[]) => items.filter((i): i is Extract<UiDrawItem, { kind: 'sprite' }> => i.kind === 'sprite');

  it('the body at the node over XSIZE x YSIZE in the state\'s texture, then the caption at (x + XOFFSET, y + YOFFSET)', () => {
    const b = button();
    const items = b.draw(256, 330, 1);
    expect(sprites(items).map((s) => [s.texture, s.x0, s.y0, s.x1, s.y1])).toEqual([['n.tif', 256, 330, 512, 360]]);
    const glyphs = items.find((i) => i.kind === 'glyphs');
    const want = layoutText(textFace(), [0x41, 0x42], 256 + 55, 330 + 22, { scale: Math.fround(0.6), color: [30, 30, 50], alpha: 100 });
    expect(glyphs && glyphs.kind === 'glyphs' ? glyphs.quads : null).toEqual(want.quads);
  });

  it('HCENTERED: the body from -(w >> 1) to (int)(XSIZE / 2) around the node, the caption centred (+0x85)', () => {
    const b = button('HCENTERED', []);
    const s = sprites(b.draw(256, 330, 1))[0]!;
    expect([s.x0, s.x1]).toEqual([256 - 128, 256 + 128]);
    const glyphs = b.draw(256, 330, 1).find((i) => i.kind === 'glyphs');
    const want = layoutText(textFace(), [0x41, 0x42], 256 + 55, 330 + 22, { scale: Math.fround(0.6), color: [30, 30, 50], alpha: 100, hcentered: true });
    expect(glyphs && glyphs.kind === 'glyphs' ? glyphs.quads : null).toEqual(want.quads);
  });

  it('the walk\'s fade does not reach a button: its vtable +0x34 is `jr ra` (0x1fe320, read in the ELF)', () => {
    const b = button();
    const faded = b.draw(256, 330, 0.5);
    expect(sprites(faded)[0]!.rgba[3]).toBe(128);
    expect(faded).toEqual(b.draw(256, 330, 1));
  });
});

describe('BUTTON: commands (FUN_00376870 -> FUN_0036fcc0) and its UIVAR (FUN_00376b40)', () => {
  it('Caption (op 1): the name at +8 through the text setter; Valve (op 2): "%d" of the valve, made PERM at 0 when absent', () => {
    const valves = new ValveStore();
    const d = design([menuButton()]);
    const face = textFace();
    const set = WidgetSet.build(d, buildDialogScreen(d), { face: () => face, valves });
    const b = set.get('b') as ButtonWidget, h = new RecordingHost();
    expect(set.nodeCommand(nodeCmd('b', 1, 'CBA'), h)).toEqual({ answer: true });
    expect(b.captionCodes).toEqual([0x43, 0x42, 0x41]);
    expect(set.nodeCommand(nodeCmd('b', 2, 'score'), h)).toEqual({ answer: true });
    expect(b.captionCodes).toEqual([0x30]);
    expect(valves.find('score')?.type).toBe(VALVE_TYPE.PERM);
    valves.set('score', 42, VALVE_TYPE.PERM);
    set.nodeCommand(nodeCmd('b', 2, 'score'), h);
    expect(b.captionCodes).toEqual([0x34, 0x32]);
    expect(set.nodeCommand(nodeCmd('b', 2, ''), h)).toEqual({ answer: true });   // no name: the buffer's "0" (0x3e03f0)
    expect(b.captionCodes).toEqual([0x30]);
    expect(set.nodeCommand(nodeCmd('b', 4, ''), h)).toBeNull();                 // no such op: not taken
  });

  it('a button with a UIVAR shows its printed value whenever the var changes (%d, %f, %s)', () => {
    const uiVars = new UiVarManager();
    const d = design([menuButton('UIVAR', [r('NAME', 'Count', 'VALUE', '3')])]);
    const face = textFace();
    const set = WidgetSet.build(d, buildDialogScreen(d), { face: () => face, uiVars });
    const b = set.get('b') as ButtonWidget;
    expect(b.captionCodes).toEqual([0x33]);
    uiVars.set('Count', { type: 'real', value: Math.fround(0.5) });
    expect(String.fromCharCode(...b.captionCodes)).toBe('0.500000');
    uiVars.set('Count', { type: 'string', value: 'ok' });
    expect(String.fromCharCode(...b.captionCodes)).toBe('ok');
  });
});
