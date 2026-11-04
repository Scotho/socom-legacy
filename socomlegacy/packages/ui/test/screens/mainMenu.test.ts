import { describe, expect, it } from 'vitest';
import { UI_TICK_SECONDS } from '../../src/clock/uiClock';
import type { DialogDesign, DialogRecord } from '../../src/dialog';
import { MenuInput } from '../../src/input/menuInput';
import { DialogPartsHost } from '../../src/screens/dialogParts';
import { FrontEndMachine } from '../../src/screens/frontEndMachine';
import { MenuCommands, type MenuCardIo } from '../../src/screens/menuCommands';
import { PopupSlot } from '../../src/screens/popupSlot';
import { UiCommandHost } from '../../src/uiCommands';
import { UiVarManager } from '../../src/uiVars';
import type { UiModelGeometry } from '../../src/compositor/models';
import type { ZAnimRtAnimation, ZAnimRtCommand, ZAnimRtSequence, ZAnimRtSet } from '../../src/zanimRuntime';

/**
 * The main menu's answers (MENU-02a; web research 140 §3): `dlgMenu.rdr`'s own set, transcribed op for op from
 * `RUN/UIZANIM.ZAR` (decoded with `decodeUiProgram`; research 140 §1 lists them) -- `SetMenuValve`'s second sequence,
 * `OnMenuBtnUp`, `OnMenuBtnDown`, `ActivateMenuBtns` with its six branches, `PulseArrows` -- run by PLAT-07's runtime
 * on PLAT-10's machine over a made-up `dlgMenu` layout with M1's six buttons and a roller of the twelve item quads:
 *
 * - **the roller carries the item text**: the valve `MenuButtonChanged` names the front item (1 NEW GAME, 2 LOAD GAME,
 *   3 EXTRAS, 4 OPTIONS, 5 LAN, 6 ONLINE); `ActivateMenuBtns` turns the `Roller` node to that item's face (a
 *   quaternion of k x 60 degrees about x) and shows its `_on` quad, every other item's `_off`, then activates that
 *   item's (blank) button and disables the five others;
 * - **the DOWN walk** (`OnMenuBtnDown`: `MenuButtonChanged -= 1`, 0 wraps to 6) and UP (`+= 1`, 7 wraps to 1);
 * - **an empty card** (`GotSaveGames` 0) starts on NEW GAME, a card with a counted save on LOAD GAME (`SetMenuValve`);
 * - **the cues** `.TCM_SLIDE` and `.METAL` at 0, `.METAL` at 0.15 s, `.TCM_SLIDE` at 0.30, `.METAL` at 0.45 of every
 *   `ActivateMenuBtns` (PLAT-23's host; MENU-02's music is not here: nothing plays for it, OT.R8);
 * - **the 2D items**: `SavedGames` and `LoadGameBack` hidden at ONSTART, MENUFADER 0.99 -> 0 in 0.75 s, the arrows'
 *   opacity looping 0.2 -> 0.99 -> 0.2 (`PulseArrows`).
 *
 * The expected values are the decoded ops' numbers; nothing is measured on the original running (the captures are
 * `tools/test/mainMenuDisc.test.ts`'s).
 */

// ---------------------------------------------------------------------------------------------------------------------
// The assembler (research 106 §4's layouts; as `test/zanimRuntime.test.ts` and `test/boot/introShell.test.ts`).

const TIMED = new Set([1, 15, 22, 25, 52, 61]);
function cmd(set: number, n: number, size: number, fill?: (v: DataView, b: Uint8Array) => void): Uint8Array {
  const b = new Uint8Array(size), v = new DataView(b.buffer);
  const timeless = set === 0 ? !TIMED.has(n) : true;
  v.setUint32(0, (n | (set << 8) | (timeless ? 1 << 17 : 0) | (size << 18)) >>> 0, true);
  fill?.(v, b);
  return b;
}
const cat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const ITEMS = ['new', 'load', 'extras', 'options', 'lan', 'online'] as const;
const BUTTONS: Record<(typeof ITEMS)[number], string> = { new: 'new_game_button', load: 'load_game_button', extras: 'Extras_button', options: 'options_button', lan: 'LAN_button', online: 'multiplayer_button' };
const NODES = ['Roller', ...ITEMS.flatMap((i) => [`${i}_on`, `${i}_off`]), 'SavedGames', 'LoadGameBack', 'MENUFADER', 'arrow_up'];
const NAMES = [
  'NA', 'SetMenuValve', 'OnMenuBtnUp', 'OnMenuBtnDown', 'ActivateMenuBtns', 'PulseArrows', 'MenuButtonChanged', 'GotSaveGames',
  'SuspendMenuInput', '0.75', '0.15', 'GetNumSavedGames', 'FlushMenuHistory', 'ActivateButton', 'EnableButton', 'DisableButton',
  ...Object.values(BUTTONS), ...ITEMS.map((i) => `${i}_action`), '.TCM_SLIDE', '.METAL', 'CameFromExtras', 'BeenPastOptions', 'MenuSpot',
];
const ix = (name: string): number => { const i = NAMES.indexOf(name); if (i < 0) throw new Error(`name ${name}`); return i; };
const nx = (node: string): number => { const i = NODES.indexOf(node); if (i < 0) throw new Error(`node ${node}`); return i + 1; };
const OP = { EQ: 2, GT: 3, LT: 4, SET: 11, ADD: 12, SUB: 13 } as const;
const valve = (name: string, op: number, operand: number): Uint8Array => cmd(0, 61, 16, (v) => {
  v.setUint32(4, ix(name), true); v.setUint32(8, operand >>> 0, true); v.setUint8(12, op); v.setUint8(13, 2);
});
const withTokens = (n: number, depth: number, tokens: Uint8Array[]): Uint8Array => {
  const t = cat(...tokens);
  return cmd(0, n, 8 + t.length, (v, b) => { v.setUint8(4, depth); b.set(t, 8); });
};
const IF = (depth: number, ...t: Uint8Array[]): Uint8Array => withTokens(2, depth, t);
const ELSEIF = (depth: number, ...t: Uint8Array[]): Uint8Array => withTokens(3, depth, t);
const ELSE = (depth: number): Uint8Array => cmd(0, 4, 8, (v) => v.setUint8(4, depth));
const ENDIF = (depth: number): Uint8Array => cmd(0, 5, 8, (v) => v.setUint8(4, depth));
const WAIT = (s: number): Uint8Array => cmd(0, 15, 12, (v) => { v.setUint16(4, 9, true); v.setFloat32(8, s, true); });
const LOOP = (): Uint8Array => cmd(0, 14, 12, (v) => { v.setUint32(4, 1, true); v.setInt32(8, -1, true); });
const ACTIVE = (node: string, on: boolean): Uint8Array => cmd(0, 17, 8, (v) => { v.setUint16(4, on ? 1 : 0, true); v.setUint16(6, nx(node), true); });
const OPACITY = (node: string, from: number, to: number, rate: number, time: number): Uint8Array => cmd(0, 25, 0x18, (v) => {
  v.setUint16(4, nx(node), true); v.setFloat32(8, from, true); v.setFloat32(0xc, to, true); v.setFloat32(0x10, rate, true); v.setFloat32(0x14, time, true);
});
const CALL = (name: string, block: boolean): Uint8Array => cmd(0, 45, 20, (v) => { v.setUint16(4, block ? 0x200 : 0, true); v.setUint8(7, ix(name)); });
const STOP_ANIMATION = (name: string): Uint8Array => cmd(0, 46, 8, (v) => v.setUint8(4, ix(name)));
const CALL_SEQUENCE = (name: string): Uint8Array => cmd(0, 50, 8, (v) => v.setUint8(4, ix(name)));
const SOUND = (name: string): Uint8Array => cmd(0, 30, 0x20, (v) => { v.setUint16(4, 0x90, true); v.setUint16(6, ix(name), true); });
const UI = (fn: string, arg = 'NA'): Uint8Array => cmd(1, 1, 16, (v) => { v.setUint16(4, 0, true); v.setUint8(6, ix(fn)); v.setUint16(8, ix(arg), true); });
/** `OBJECT_MOTION_FROM_TO` turning `node` to the quaternion `to` in `time` s (flags 0x40: the "from" its orientation now). */
const ROTATE = (node: string, to: number[], time: number): Uint8Array => cmd(0, 22, 56, (v) => {
  v.setUint16(4, 0x40, true); v.setUint8(6, nx(node)); v.setFloat32(0x34, time, true);
  to.forEach((k, i) => v.setFloat32(0x20 + 4 * i, k, true));
});
/** `OBJECT_MOTION_FROM_TO` scaling `node` from `from` to `to` at `rate` in `time` s (flags 0x300, the scale block at 0x38). */
const SCALE = (node: string, from: number, to: number, rate: number, time: number): Uint8Array => cmd(0, 22, 92, (v) => {
  v.setUint16(4, 0x300, true); v.setUint8(6, nx(node)); v.setFloat32(0x34, time, true); v.setUint16(0x30, 0x38, true);
  for (let i = 0; i < 3; i++) { v.setFloat32(0x38 + 4 * i, from, true); v.setFloat32(0x38 + 12 + 4 * i, to, true); v.setFloat32(0x38 + 24 + 4 * i, rate, true); }
});

interface SeqSpec { name: string; word?: number; commands: Uint8Array[] }
function anim(name: string, seqs: SeqSpec[], flags = 0x22): ZAnimRtAnimation {
  let at = 0;
  const sequences: ZAnimRtSequence[] = seqs.map((s) => {
    const offset = at;
    let o = offset + 0x1c;
    const commands: ZAnimRtCommand[] = s.commands.map((b) => {
      const h = new DataView(b.buffer, b.byteOffset).getUint32(0, true);
      const c = { offset: o, set: (h >>> 8) & 0xff, cmd: h & 0xff, timeless: (h & (1 << 17)) !== 0, size: h >>> 18, bytes: b };
      o += b.length;
      return c;
    });
    at = o;
    return { offset, name: s.name, word: s.word ?? 0x102, size: o - offset, commands };
  });
  return { name, names: NAMES, nodeRefs: ['NA', ...NODES].map((n) => ({ name: n })), params: { flags, priority: 3, seqOffsets: [0, 0, 0, 0], state: 1 }, sequences };
}

// ---------------------------------------------------------------------------------------------------------------------
// dlgMenu.rdr's programs (research 140 §1; the ops as decoded, the branches this test walks).

/** `ActivateMenuBtns`' six faces: the quaternion each branch turns `Roller` to (k x 60 degrees about x, as stored). */
export const ROLLER_FACES: Record<number, number[]> = {
  1: [0, 0, 0, 1], 2: [0.5, 0, 0, 0.8660253882408142], 3: [0.866025447845459, 0, 0, 0.4999999701976776],
  4: [1, 0, 0, -4.371138828673793e-8], 5: [0.8660253882408142, 0, 0, -0.5000000596046448], 6: [0.5000000596046448, 0, 0, -0.8660253882408142],
};
/** The item each `MenuButtonChanged` value puts at the front. */
export const FRONT_ITEM: Record<number, (typeof ITEMS)[number]> = { 1: 'new', 2: 'load', 3: 'extras', 4: 'options', 5: 'lan', 6: 'online' };

const hideOn = ITEMS.map((i) => ACTIVE(`${i}_on`, false)), showOff = ITEMS.map((i) => ACTIVE(`${i}_off`, true));
/** An action sequence: activation 2 (the word's low byte 4) -- started by `CALL_SEQUENCE` alone, not with the animation. */
const action = (item: (typeof ITEMS)[number]): SeqSpec => ({
  name: `${item}_action`, word: 0x104, commands: [
    ACTIVE(`${item}_on`, true), ACTIVE(`${item}_off`, false),
    UI('ActivateButton', BUTTONS[item]), UI('EnableButton', BUTTONS[item]),
    ...ITEMS.filter((o) => o !== item).map((o) => UI('DisableButton', BUTTONS[o])),
    SCALE(`${item}_on`, 1, 1.4, 4, 0.1), SCALE(`${item}_on`, 1.4, 1, -2.6666665, 0.15), SCALE(`${item}_on`, 1, 1.15, 1, 0.15),
    SCALE(`${item}_on`, 1.15, 1, -0.75, 0.2), SCALE(`${item}_on`, 1, 1.03, 0.2, 0.15), SCALE(`${item}_on`, 1.03, 1, -0.2, 0.15),
  ],
});
const activateMenuBtns = anim('ActivateMenuBtns', [{ name: 'NA', commands: [
  IF(0, valve('MenuButtonChanged', OP.EQ, 1)), ROTATE('Roller', ROLLER_FACES[1]!, 0.15), CALL_SEQUENCE('new_action'),
  ELSEIF(1, valve('MenuButtonChanged', OP.EQ, 2)), ROTATE('Roller', ROLLER_FACES[2]!, 0.15), CALL_SEQUENCE('load_action'),
  ELSEIF(1, valve('MenuButtonChanged', OP.EQ, 3)), ROTATE('Roller', ROLLER_FACES[3]!, 0.15), CALL_SEQUENCE('extras_action'),
  ELSEIF(1, valve('MenuButtonChanged', OP.EQ, 4)), ROTATE('Roller', ROLLER_FACES[4]!, 0.15), CALL_SEQUENCE('options_action'),
  ELSEIF(1, valve('MenuButtonChanged', OP.EQ, 5)), ROTATE('Roller', ROLLER_FACES[5]!, 0.15), CALL_SEQUENCE('lan_action'),
  ELSEIF(1, valve('MenuButtonChanged', OP.EQ, 6)), ROTATE('Roller', ROLLER_FACES[6]!, 0.15), CALL_SEQUENCE('online_action'),
  ENDIF(1),
  SOUND('.TCM_SLIDE'), SOUND('.METAL'), WAIT(0.15), SOUND('.METAL'), WAIT(0.15), SOUND('.TCM_SLIDE'), WAIT(0.15), SOUND('.METAL'),
] }, ...ITEMS.map(action)]);
const onMenuBtnUp = anim('OnMenuBtnUp', [{ name: 'NA', commands: [
  UI('SuspendMenuInput', '0.15'), valve('MenuButtonChanged', OP.ADD, 1), ...hideOn, ...showOff,
  IF(0, valve('MenuButtonChanged', OP.GT, 6)), valve('MenuButtonChanged', OP.SET, 1), ENDIF(1),
  STOP_ANIMATION('ActivateMenuBtns'), CALL('ActivateMenuBtns', false),
] }]);
const onMenuBtnDown = anim('OnMenuBtnDown', [{ name: 'NA', commands: [
  UI('SuspendMenuInput', '0.15'), ...hideOn, ...showOff, valve('MenuButtonChanged', OP.SUB, 1),
  IF(0, valve('MenuButtonChanged', OP.LT, 1)), valve('MenuButtonChanged', OP.SET, 6), ENDIF(1),
  STOP_ANIMATION('ActivateMenuBtns'), CALL('ActivateMenuBtns', false),
] }]);
const setMenuValve = anim('SetMenuValve', [
  { name: 'NA', commands: [
    valve('CameFromExtras', OP.SET, 0), valve('BeenPastOptions', OP.SET, 0), UI('SuspendMenuInput', '0.75'),
    ACTIVE('SavedGames', false), ACTIVE('LoadGameBack', false), OPACITY('MENUFADER', 0.99, 0, -1.32, 0.75),
  ] },
  { name: 'NA', commands: [
    UI('GetNumSavedGames', 'GotSaveGames'),
    IF(0, valve('GotSaveGames', OP.GT, 0)), valve('MenuButtonChanged', OP.SET, 2), ELSE(1), valve('MenuButtonChanged', OP.SET, 1), ENDIF(1),
    CALL('ActivateMenuBtns', false), ...hideOn, UI('FlushMenuHistory'), valve('MenuSpot', OP.SET, 1),
  ] },
]);
const pulseArrows = anim('PulseArrows', [{ name: 'NA', commands: [
  OPACITY('arrow_up', 0.2, 0.99, 1.0533334, 0.75), OPACITY('arrow_up', 0.99, 0.2, -1.0533334, 0.75), WAIT(0.15), LOOP(),
] }]);
export const SET: ZAnimRtSet = { name: 'dlgMenu.rdr', anims: [setMenuValve, onMenuBtnUp, onMenuBtnDown, activateMenuBtns, pulseArrows] } as ZAnimRtSet;

// ---------------------------------------------------------------------------------------------------------------------
// The layout (M1's six buttons, the arrows, the list and the roller) and the roller's geometry (one quad a part).

const button = (name: string, y: number): DialogRecord => ({
  name, type: 'BUTTON', x: 256, y, opacity: 1, childOf: null,
  widget: { type: 'BUTTON', uivar: null, button: {
    size: [250, 30], offset: [55, 22], scale: 0.6, caption: ' ', hcentered: true, font: null,
    normal: { block: true, image: null, textColor: [30, 30, 50], pulse: 0, scale: 0.6, glow: null },
    active: { block: true, image: null, textColor: [12, 68, 78], pulse: 0, scale: 0.75, glow: { range: [0.3, 1], time: 0.8 } },
    pressed: { block: true, image: null, textColor: [255, 74, 8], pulse: 0, scale: 0.7, glow: null },
    disabled: { block: true, image: null, textColor: [15, 30, 45], pulse: 0, scale: 0.6, glow: null },
    bindings: [
      { kind: 'button', name: 'DOWN', code: 5, state: 1, animation: 'OnMenuBtnDown', argument: null },
      { kind: 'button', name: 'UP', code: 4, state: 1, animation: 'OnMenuBtnUp', argument: null },
    ],
  } },
});
const image = (name: string, x: number, y: number, file: string, size: [number, number], childOf: string | null = null): DialogRecord =>
  ({ name, type: 'IMAGE', x, y, opacity: 1, childOf, widget: { type: 'IMAGE', uivar: null, image: { filename: file, size, pulse: null } } });
const design = (): DialogDesign => ({
  libraries: [{ name: 'ui/assetlib/ui2d' }], usesMemcard: true, font: null, fontLib: true, background: { type: 1, typeName: 'MPEG', filename: 'run/movies/common/menuloop.pss' },
  bindings: [{ kind: 'event', name: 'ONSTART', code: 0, state: 1, animation: 'PulseArrows', argument: null }, { kind: 'event', name: 'ONSTART', code: 0, state: 1, animation: 'SetMenuValve', argument: null }],
  controls: [
    button('new_game_button', 330), button('load_game_button', 300), button('multiplayer_button', 360), button('options_button', 390), button('Extras_button', 420), button('LAN_button', 420),
    image('LoadGameBack', 0, 0, 'popup_bg.tif', [640, 448]), image('arrow_up', 293, 240, 'arrow_top.tif', [50, 50]), image('arrow_dwn', 0, 112, 'arrow_botm.tif', [50, 50], 'arrow_up'),
    { name: 'SavedGames', type: 'IMAGE', x: 200, y: -350, opacity: 1, childOf: null, widget: { type: 'IMAGE', uivar: null, image: { filename: 'popup_load.tif', size: [512, 270], pulse: null } } },
  ],
  objects: [], scripts: ['dlgMenu.rdr'], models: [{ name: 'Roller', model: 'mainmenu_roller', azimuth: 0, elev: -12.5, distance: 60, rot: 0, useModelUiVar: false }], dropped: [],
});
const roller = (): UiModelGeometry => ({
  name: 'mainmenu_roller',
  parts: ITEMS.flatMap((i) => [`${i}_on`, `${i}_off`]).map((node) => ({
    node, meshes: [{ positions: new Float32Array([1, 1, 5, -1, 1, 5, -1, -1, 5]), uvs: new Float32Array(6), colors: new Float32Array(12).fill(1), indices: new Uint16Array([0, 1, 2]), texture: `menu_${node}.tif`, cull: true }],
  })),
});

function rig(card?: MenuCardIo) {
  let m!: FrontEndMachine;
  const face = null;
  const parts = new DialogPartsHost({ popupObject: () => m.queue.popupObject, face: () => face });
  const cues: { name: string; t: number }[] = [];
  let t = 0;
  const host = new UiCommandHost({ node: parts.nodeCommand, sound: (cmd) => { cues.push({ name: cmd.sound, t: Math.round(t * 1000) / 1000 }); } });
  const input = new MenuInput({ machine: () => m, parts });
  input.register(host);
  input.source = { read: () => ({ down: new Set(), stickX: 0, stickY: 0 }) };
  const menuCommands = new MenuCommands({ valves: () => m.valves, uiVars: new UiVarManager(), card });
  menuCommands.register(host);
  const slot = new PopupSlot();
  slot.connect(parts.makePopup);
  const activated: string[] = [];
  m = new FrontEndMachine({
    dialog: (n) => (n === 'dlgMenu.rdr' ? design() : null), sets: [SET], host, popups: slot, startDialog: 'dlgMenu.rdr',
    build: { model: (n) => (n === 'mainmenu_roller' ? roller() : null) },
    built: parts.built, draw: parts.draw, widgetsTick: parts.widgetsTick, setEnabled: parts.setEnabled,
    input: input.dispatch, pad: input.read, activate: (n) => { activated.push(n); input.activate(n); },
    trace: process.env.M2_TRACE ? (e) => console.log(JSON.stringify(e)) : undefined,
  });
  m.boot();
  const run = (n: number): void => { for (let i = 0; i < n; i++) { m.frame(UI_TICK_SECONDS); t += UI_TICK_SECONDS; } };
  const scripts = () => { const b = m.shell()!; return b; };
  const screen = () => m.shell()!.screen;
  const model = () => screen().models[0]!;
  const node = (name: string) => model().parts.find((p) => p.name === name)!;
  /** The `_on` quads shown now, in the roller's order. */
  const lit = (): string[] => model().parts.filter((p) => p.active && p.name.endsWith('_on')).map((p) => p.name);
  const value = (name: string): number => m.valves.find(name)?.value ?? NaN;
  return { m, run, scripts, screen, model, node, lit, value, cues, activated, input };
}

/** The ticks of `seconds` at PLAT-12's tick, rounded up. */
const ticks = (seconds: number): number => Math.ceil(seconds / UI_TICK_SECONDS);

describe('dlgMenu on an empty card: SetMenuValve, then ActivateMenuBtns (research 140 §1, §3)', () => {
  it('hides SavedGames and LoadGameBack, fades MENUFADER 0.99 -> 0 in 0.75 s, and puts NEW GAME at the front (MenuButtonChanged 1)', () => {
    const r = rig();
    r.run(2);                                                       // CG's switch to MS: the build and ONSTART, the first tick
    const screen = r.screen();
    expect(r.lit()).toEqual([]);                                    // every _on hidden by SetMenuValve; the front's lit after the 0.15 s turn
    r.run(ticks(0.2));
    const find = (n: string) => { const seek = (x: typeof screen.root): typeof screen.root | null => { if (x.name === n) return x; for (const c of x.children) { const h = seek(c); if (h) return h; } return null; }; return seek(screen.root)!; };
    expect(find('SavedGames').visible).toBe(false);
    expect(find('LoadGameBack').visible).toBe(false);
    expect(r.value('GotSaveGames')).toBe(0);
    expect(r.value('MenuButtonChanged')).toBe(1);
    expect(r.lit()).toEqual(['new_on']);
    expect(r.model().parts.filter((p) => p.active && p.name.endsWith('_off')).map((p) => p.name)).toEqual(['load_off', 'extras_off', 'options_off', 'lan_off', 'online_off']);
    expect(r.activated).toEqual(['new_game_button']);
    expect(r.model().root.rotation).toEqual([0, 0, 0, 1]);
    r.run(ticks(0.6));
    expect(screen.fader.opacity).toBe(0);
  });

  it('plays .TCM_SLIDE and .METAL at 0, .METAL at 0.15 s, .TCM_SLIDE at 0.30, .METAL at 0.45 -- and nothing for the music', () => {
    const r = rig();
    r.run(ticks(0.9));                                              // the 0.15 s turn, then the four steps of 0.15
    expect(r.cues.map((c) => c.name)).toEqual(['.TCM_SLIDE', '.METAL', '.METAL', '.TCM_SLIDE', '.METAL']);
    const t0 = r.cues[0]!.t;
    expect(r.cues.map((c) => Math.round((c.t - t0) / 0.15))).toEqual([0, 0, 1, 2, 3]);
    expect(r.cues.some((c) => /MUS_/.test(c.name))).toBe(false);
  });

  it('pulses the arrows: arrow_up 0.2 -> 0.99 over 0.75 s, back to 0.2 over 0.75 s, then again (PulseArrows)', () => {
    const r = rig();
    const arrow = () => { const seek = (x: ReturnType<typeof r.screen>['root']): number | null => { if (x.name === 'arrow_up') return x.opacity; for (const c of x.children) { const h = seek(c); if (h !== null) return h; } return null; }; return seek(r.screen().root)!; };
    r.run(2);
    expect(arrow()).toBeCloseTo(0.2, 1);
    r.run(ticks(0.375));
    expect(arrow()).toBeGreaterThan(0.5);
    r.run(ticks(0.4));
    expect(arrow()).toBeGreaterThan(0.85);                          // at the top of the rise (0.99 at 0.75 s)
    r.run(ticks(0.75));
    expect(arrow()).toBeLessThan(0.35);                             // back near 0.2
    r.run(ticks(0.15 + 0.4));
    expect(arrow()).toBeGreaterThan(0.5);                           // rising again after the 0.15 s rest
  });
});

describe('the DOWN walk (OnMenuBtnDown: MenuButtonChanged -= 1, 0 wraps to 6) and UP', () => {
  /** The pad DOWN for one frame: FALLING, then released. */
  const press = (r: ReturnType<typeof rig>, name: 'DOWN' | 'UP'): void => {
    let frames = 0;
    r.input.source = { read: () => ({ down: new Set(frames++ === 0 ? [name] : []), stickX: 0, stickY: 0 }) };
    r.run(1);
    r.input.source = { read: () => ({ down: new Set(), stickX: 0, stickY: 0 }) };
  };
  it('walks NEW GAME -> ONLINE -> LAN -> OPTIONS -> EXTRAS -> LOAD GAME -> NEW GAME (M3\'s empty-card order), the roller turned to each face', () => {
    const r = rig();
    r.run(ticks(1.0));                                              // SuspendMenuInput 0.75 at ONSTART; the walk's own first wait is 1.0 s
    const seen: number[] = [r.value('MenuButtonChanged')];
    for (let i = 0; i < 6; i++) {
      press(r, 'DOWN');
      r.run(ticks(1.5));                                            // menu_explore.txt's stable+1.5 between presses: the turn, the pulse, the queue
      const k = r.value('MenuButtonChanged');
      seen.push(k);
      expect(r.lit(), `step ${i + 1}`).toEqual([`${FRONT_ITEM[k]}_on`]);
      expect(r.activated[r.activated.length - 1], `step ${i + 1}`).toBe(BUTTONS[FRONT_ITEM[k]!]);
      const q = r.model().root.rotation;
      ROLLER_FACES[k]!.forEach((v, j) => expect(q[j], `face ${k}[${j}]`).toBeCloseTo(v, 5));
    }
    expect(seen).toEqual([1, 6, 5, 4, 3, 2, 1]);
    expect(seen.map((k) => FRONT_ITEM[k])).toEqual(['new', 'online', 'lan', 'options', 'extras', 'load', 'new']);
  });
  it('UP goes the other way (MenuButtonChanged += 1): NEW GAME -> LOAD GAME; a press while suspended is lost', () => {
    const r = rig();
    r.run(ticks(1.0));
    press(r, 'UP');
    press(r, 'UP');                                                 // within OnMenuBtnUp's SuspendMenuInput 0.15: lost
    r.run(ticks(1.5));
    expect(r.value('MenuButtonChanged')).toBe(2);
    expect(r.lit()).toEqual(['load_on']);
    for (let i = 0; i < 5; i++) { press(r, 'UP'); r.run(ticks(1.5)); }
    expect(r.value('MenuButtonChanged')).toBe(1);                   // 2 -> 3 -> 4 -> 5 -> 6 -> 1 (7 wraps)
  });
  it('a card with a counted save starts on LOAD GAME (GotSaveGames > 0 -> MenuButtonChanged 2; research 138 R138.4)', () => {
    const card: MenuCardIo = {
      getInfo: () => ({ result: 0, type: 2, format: 1 }), getDir: (_p, _s, path) => ({ result: path === 'SaveGame0' ? 1 : 0 }),
      chdir: () => ({ result: 0 }), mkdir: () => 0, saveHeaderText: () => 'mission 1',
    };
    const r = rig(card);
    r.run(ticks(0.3));
    expect(r.value('GotSaveGames')).toBe(1);
    expect(r.value('MenuButtonChanged')).toBe(2);
    expect(r.lit()).toEqual(['load_on']);
    const q = r.model().root.rotation;
    ROLLER_FACES[2]!.forEach((v, j) => expect(q[j]).toBeCloseTo(v, 5));
  });
  it('the lit quad pulses in scale: 1 -> 1.4 in 0.1 s, back in 0.15, 1.15, 1, 1.03, 1 (the action sequence)', () => {
    const r = rig();
    r.run(ticks(0.2));                                              // the turn
    const s = () => r.node('new_on').scale[0];
    r.run(ticks(0.05));
    expect(s()).toBeGreaterThan(1);
    expect(s()).toBeLessThanOrEqual(1.4);
    r.run(ticks(1.0));
    expect(s()).toBeCloseTo(1, 5);
  });
});
