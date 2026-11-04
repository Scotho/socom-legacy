import { describe, expect, it } from 'vitest';
import { UI_TICK_SECONDS } from '../../src/clock/uiClock';
import { findNode } from '../../src/compositor/scene';
import type { DialogDesign, DialogRecord } from '../../src/dialog';
import { UiCommandHost, type UiCommandOutcome } from '../../src/uiCommands';
import { UiVarManager } from '../../src/uiVars';
import { DialogPartsHost } from '../../src/screens/dialogParts';
import { DNAS_HOLD_TICKS, DnasCommands, type NetJob } from '../../src/screens/dnasCommands';
import { FrontEndMachine } from '../../src/screens/frontEndMachine';
import type { Launch } from '../../src/screens/launch';
import { MenuCommands } from '../../src/screens/menuCommands';
import { MENU_SWITCH_COUNTDOWN } from '../../src/screens/menuShell';
import { PopupSlot } from '../../src/screens/popupSlot';
import type { MovieService } from '../../src/movie/movieCommands';
import type { ZAnimRtAnimation, ZAnimRtCommand, ZAnimRtSequence, ZAnimRtSet, ZAnimUiCommand } from '../../src/zanimRuntime';
import { textFace } from '../text/fixtures';

/**
 * The DNAS screen's set replayed (ONL-03; web research 146 §3) with `DNASAuthenticate` done on the first tick: a
 * transcription of `dlgNetAuthenticate.rdr`'s `init_socom_online` and the animations it reaches (research 128 R128.7,
 * the ops as ONL-33's pin lists them), assembled as `parseAnimSets` lays the disc's out, run through PLAT-10's machine
 * with PLAT-15's parts, MENU-01a's card rows over the empty card and this task's five, to `SWITCHMENU
 * dlgNetServerSelect.rdr`. Pinned: the captions' ids in the set's order and on which tick, the logo's motions, each
 * command's ticks, the switch and the next build (the same ticks the disc's own set gives in `dnasScreenDisc.test.ts`),
 * what a slow worker and a failed one do, the 90-s watchdog, and the loaded-set rule against `dlgNetConnect.rdr`'s
 * animation of the same name. Left out of the transcription: the progress strip (`ScaleSet`, `Connect_flash`: nodes
 * this synthetic layout lacks), the popups of `has_memcard_changed` and `monitor_timeout` (PLAT-16's content) -- the
 * disc test runs them.
 */

// ---------------------------------------------------------------------------------------------------------------------
// An assembler for the synthetic sets (the layout of `packages/ui/test/zanimRuntime.test.ts`; `boot/introShell.test.ts`'s).

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

/** The names the programs index (each animation's own table on the disc; one shared table here). */
const NAMES = [
  'NA', 'socom_online_initialized', 'success', 'InitNetwork', 'DNASAuthenticate', 'DMEInit', 'MediusInit', 'GetServerList', 'SWITCHMENU',
  'dlgNetServerSelect.rdr', 'TurnOnLogo', 'TurnOnTrademark1', 'TurnOffLogo', 'TurnOffTrademark1', 'Ensure_MC_Dirs_Fast', 'has_memcard_changed',
  'DNASInProgress', 'MC_Exists', '..', 'BASCUS-97275SOCOMII', 'MC_ChDir', 'MemcardAlreadyHasData', 'MC_Changed', 'REBOOT', 'init_socom_online',
  'UNINITNETWORK', 'dlgUsagePolicy.rdr',
];
const NODES = ['NA', 'bar_title', 'ONLINE_LOBBY_STATE', 'DNASLogo', 'DNASTrademark1', 'MENUFADER'];
const ix = (name: string): number => { const i = NAMES.indexOf(name); if (i < 0) throw new Error(name); return i; };
const nx = (node: string): number => { const i = NODES.indexOf(node); if (i < 0) throw new Error(node); return i; };
const OP = { EQ: 2, GT: 3, SET: 11 } as const;

const valve = (name: string, op: number, operand: number): Uint8Array => cmd(0, 61, 16, (v) => {
  v.setUint32(4, ix(name), true); v.setUint32(8, operand >>> 0, true); v.setUint8(12, op); v.setUint8(13, 2);
});
const withTokens = (n: number, depth: number, tokens: Uint8Array[]): Uint8Array => {
  const t = cat(...tokens);
  return cmd(0, n, 8 + t.length, (v, b) => { v.setUint8(4, depth); b.set(t, 8); });
};
const IF = (depth: number, ...t: Uint8Array[]): Uint8Array => withTokens(2, depth, t);
const ELSE = (depth: number): Uint8Array => cmd(0, 4, 8, (v) => v.setUint8(4, depth));
const ENDIF = (depth: number): Uint8Array => cmd(0, 5, 8, (v) => v.setUint8(4, depth));
/** `LOOP forever` (14): the count form with -1 (research 106 §4). */
const LOOP = (): Uint8Array => cmd(0, 14, 12, (v) => { v.setUint32(4, 1, true); v.setInt32(8, -1, true); });
const WAIT = (s: number): Uint8Array => cmd(0, 15, 12, (v) => { v.setUint16(4, 9, true); v.setFloat32(8, s, true); });
/** `SHOW` / `HIDE` (OBJECT_ACTIVE_STATE 17): +4 1 on, +6 the node. */
const ACTIVE = (node: string, on: boolean): Uint8Array => cmd(0, 17, 8, (v) => { v.setInt16(4, on ? 1 : 0, true); v.setUint16(6, nx(node), true); });
const OPACITY = (node: string, from: number, to: number, rate: number, time: number): Uint8Array => cmd(0, 25, 0x18, (v) => {
  v.setUint16(4, nx(node), true); v.setFloat32(8, from, true); v.setFloat32(0xc, to, true); v.setFloat32(0x10, rate, true); v.setFloat32(0x14, time, true);
});
const CALL = (name: string, block: boolean): Uint8Array => cmd(0, 45, 20, (v) => { v.setUint16(4, block ? 0x200 : 0, true); v.setUint8(7, ix(name)); });
const STOP_ANIMATION = (name: string): Uint8Array => cmd(0, 46, 8, (v) => v.setUint8(4, ix(name)));
const UI = (fn: string, arg = 'NA'): Uint8Array => cmd(1, 1, 16, (v) => { v.setUint16(4, 0, true); v.setUint8(6, ix(fn)); v.setUint16(8, ix(arg), true); });
/** `<node>.op1(#<id>)`: a `ui::UI_COMMAND` on the node, byte +6 the op + 0xE8, the `UIMnLOC` id at +0xc (research 95 §1.2). */
const CAPTION = (node: string, id: number): Uint8Array => cmd(1, 1, 16, (v) => { v.setUint16(4, nx(node), true); v.setUint8(6, 0xe8 + 1); v.setUint16(8, ix('NA'), true); v.setInt16(0xc, id, true); });

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
  return { name, names: NAMES, nodeRefs: NODES.map((n) => ({ name: n })), params: { flags, priority: 3, seqOffsets: [0, 0, 0, 0], state: 1 }, sequences };
}
const one = (name: string, commands: Uint8Array[]): ZAnimRtAnimation => anim(name, [{ name: 'NA', commands }]);

// ---------------------------------------------------------------------------------------------------------------------
// The DNAS screen's programs (research 128 §3; ONL-33's pin, `chapters[dlgNetAuthenticate.rdr].animations`).

/** `init_socom_online`, op for op (the progress strip's `CALL ScaleSet` aside). */
const initSocomOnline = one('init_socom_online', [
  ACTIVE('DNASLogo', false), ACTIVE('DNASTrademark1', false),
  CAPTION('bar_title', 448),
  IF(0, valve('socom_online_initialized', OP.EQ, 0)),
  CAPTION('ONLINE_LOBBY_STATE', 534),
  UI('InitNetwork', 'success'),
  WAIT(2),
  IF(1, valve('success', OP.GT, 0)),
  CAPTION('ONLINE_LOBBY_STATE', 535),
  CALL('TurnOnLogo', false), CALL('TurnOnTrademark1', false),
  CALL('Ensure_MC_Dirs_Fast', true),
  STOP_ANIMATION('has_memcard_changed'),
  valve('DNASInProgress', OP.SET, 1),
  UI('DNASAuthenticate', 'success'),
  valve('DNASInProgress', OP.SET, 0),
  CALL('has_memcard_changed', false),
  CALL('TurnOffLogo', false), CALL('TurnOffTrademark1', false),
  ENDIF(2),
  IF(1, valve('success', OP.GT, 0)), UI('DMEInit', 'success'), ENDIF(2),
  IF(1, valve('success', OP.GT, 0)), CAPTION('ONLINE_LOBBY_STATE', 535), UI('MediusInit', 'success'), ENDIF(2),
  IF(1, valve('success', OP.GT, 0)), CAPTION('bar_title', 536), CAPTION('ONLINE_LOBBY_STATE', 537), UI('GetServerList', 'success'), ENDIF(2),
  IF(1, valve('success', OP.GT, 0)), UI('SWITCHMENU', 'dlgNetServerSelect.rdr'), ELSE(2), UI('NA', 'NA'), ENDIF(2),
  ENDIF(1),
]);
/** The logo's four: SHOW then 0 -> 1 in 0.8 s; 1 -> 0 in 0.8 s then HIDE (a rate of 1.25/s). */
const turnOn = (name: string, node: string): ZAnimRtAnimation => one(name, [ACTIVE(node, true), OPACITY(node, 0, 1, 1.25, 0.8)]);
const turnOff = (name: string, node: string): ZAnimRtAnimation => one(name, [OPACITY(node, 1, 0, -1.25, 0.8), ACTIVE(node, false)]);
/** `monitor_timeout`: WAIT 90, the sequence stopped, (the #450 popup left out), `exit_connect_screen`'s REBOOT. */
const monitorTimeout = one('monitor_timeout', [WAIT(90), STOP_ANIMATION('init_socom_online'), UI('UNINITNETWORK'), UI('SWITCHMENU', 'REBOOT')]);
const exitConnectScreen = one('exit_connect_screen', [UI('UNINITNETWORK'), UI('SWITCHMENU', 'REBOOT')]);
/** `UIMemCardAnim.rdr`'s two the set reaches (research 138 §1; the card-change popup branch left out). */
const ensureMcDirsFast = one('Ensure_MC_Dirs_Fast', [
  IF(0, UI('MC_Exists', '..')), UI('MC_ChDir', '..'), ENDIF(1),
  IF(0, UI('MC_Exists', 'BASCUS-97275SOCOMII')), valve('MemcardAlreadyHasData', OP.SET, 1), UI('MC_ChDir', 'BASCUS-97275SOCOMII'), ENDIF(1),
]);
const hasMemcardChanged = one('has_memcard_changed', [IF(0, UI('MC_Changed')), ENDIF(1), WAIT(1.5), LOOP()]);
/** `UIanim.rdr`'s `menu_fade_up` (flags 0x21: auto-start at every build): MENUFADER 1 -> 0 in 1.5 s, so the switch's fade to black starts from 0. */
const menuFadeUp = anim('menu_fade_up', [{ name: 'NA', commands: [OPACITY('MENUFADER', 1, 0, -0.6667, 1.5)] }], 0x21);

const SETS: ZAnimRtSet[] = [
  // `dlgNetConnect.rdr` defines an `init_socom_online` of its own (research 128 §4.5), earlier in the archive: not loaded
  // by this dialog, so never the one started (LOADED_SETS_READING, research 139 §4).
  { name: 'dlgNetConnect.rdr', anims: [one('init_socom_online', [UI('SWITCHMENU', 'dlgUsagePolicy.rdr')])] },
  { name: 'uianim.rdr', anims: [menuFadeUp] },
  { name: 'UIMemCardAnim.rdr', anims: [ensureMcDirsFast, hasMemcardChanged] },
  { name: 'dlgNetAuthenticate.rdr', anims: [initSocomOnline, turnOn('TurnOnLogo', 'DNASLogo'), turnOn('TurnOnTrademark1', 'DNASTrademark1'), turnOff('TurnOffLogo', 'DNASLogo'), turnOff('TurnOffTrademark1', 'DNASTrademark1'), monitorTimeout, exitConnectScreen] },
];

const text = (name: string, caption: string, x: number, y: number): DialogRecord => ({
  name, type: 'TEXT', x, y, opacity: 1, childOf: null,
  widget: { type: 'TEXT', uivar: null, text: { caption, scale: 1, font: null, hcentered: false, rightJustified: false, color: [128, 128, 128] } },
});
const image = (name: string, filename: string, x: number, y: number): DialogRecord => ({
  name, type: 'IMAGE', x, y, opacity: 1, childOf: null, widget: { type: 'IMAGE', uivar: null, image: { filename, size: [0, 0], pulse: null } },
});
const base = (): DialogDesign => ({
  libraries: [], usesMemcard: false, font: null, fontLib: true, background: { type: 0, typeName: 'IMAGE', filename: 'multplay_back.tif' },
  bindings: [], controls: [], objects: [], scripts: [], models: [], dropped: [],
});
const event = (name: string, code: number, animation: string) => ({ kind: 'event' as const, name, code, state: 1, animation, argument: null });
const DIALOG = 'dlgNetAuthenticate.rdr', NEXT = 'dlgNetServerSelect.rdr';
/** The two dialogs: the DNAS screen's four nodes the set writes (research 128 §3's layout), and an empty SELECT UNIVERSE. */
const DIALOGS: Record<string, DialogDesign> = {
  [DIALOG]: {
    ...base(), scripts: ['dlgNetAuthenticate.rdr', 'uianim.rdr', 'UIMemCardAnim.rdr'],
    objects: [image('DNASLogo', 'DNASLogo.tif', 230, 180), text('DNASTrademark1', '_532_DnasLogotype_MSG', 60, 300), text('bar_title', '_533_AUTHENTICATING_MSG', 40, 40), text('ONLINE_LOBBY_STATE', '_446_START_MSG', 60, 120)],
    bindings: [{ kind: 'button', name: 'TRIANGLE', code: 6, state: 1, animation: 'exit_connect_screen', argument: null }, event('ONSTART', 0, 'init_socom_online'), event('ONSTART', 0, 'monitor_timeout')],
  },
  [NEXT]: { ...base(), scripts: ['uianim.rdr'] },
};

// ---------------------------------------------------------------------------------------------------------------------
// The rig: PLAT-10's machine with PLAT-15's parts, MENU-01a's rows (the empty card) and ONL-03's.

/** A worker that ends after `polls` polls, with the result it writes. */
function slowJob(polls: number, result = 1): NetJob {
  let n = 0;
  return { result, poll: () => ++n >= polls };
}

interface RigOptions { initNetwork?: () => NetJob; getServerList?: () => NetJob; dnasHoldSeconds?: number }
function rig(o: RigOptions = {}) {
  let m!: FrontEndMachine;
  const outcomes: { tick: number; dialog: string; o: UiCommandOutcome }[] = [];
  const captions: { tick: number; node: string; id: number }[] = [];
  const builds: { tick: number; name: string }[] = [];
  const launches: Launch[] = [];
  let frame = 0;
  const face = textFace();
  const parts = new DialogPartsHost({ popupObject: () => m.queue.popupObject, face: () => face, locText: (id) => `#${id}` });
  const host = new UiCommandHost({ node: parts.nodeCommand });
  let opened = '', builtName = '';
  const dispatch = host.dispatch.bind(host);
  host.dispatch = (cmd: ZAnimUiCommand, time) => {
    if (cmd.node !== null && cmd.loc !== 0) captions.push({ tick: frame, node: cmd.node, id: cmd.loc });
    const out = dispatch(cmd, time);
    outcomes.push({ tick: frame, dialog: builtName, o: out });
    return out;
  };
  new MenuCommands({ valves: () => m.valves, uiVars: new UiVarManager() }).register(host);
  new DnasCommands({ valves: () => m.valves, initNetwork: o.initNetwork, getServerList: o.getServerList, ...(o.dnasHoldSeconds === undefined ? {} : { holdSeconds: o.dnasHoldSeconds }) }).register(host);
  const slot = new PopupSlot();
  slot.connect(parts.makePopup);
  m = new FrontEndMachine({
    dialog: (n) => { opened = n; return DIALOGS[n] ?? null; }, sets: SETS, host, popups: slot, startDialog: DIALOG,
    built: (b) => { parts.built(b); builtName = opened; builds.push({ tick: frame, name: opened }); }, draw: parts.draw, widgetsTick: parts.widgetsTick, setEnabled: parts.setEnabled,
    movie: { service: { background: { on: () => true, off: () => true }, play: () => {} } as unknown as MovieService, frame: () => 'menu' as const, unload: () => {}, load: () => {} },
    onLaunch: (l) => launches.push(l),
  });
  m.boot();
  const tick = (): void => { frame++; m.frame(UI_TICK_SECONDS); };
  const run = (n: number): void => { for (let i = 0; i < n; i++) tick(); };
  const hits = (name: string, dialog = DIALOG): number[] => outcomes.filter((x) => x.o.kind === 'table' && x.o.row.name === name && x.dialog === dialog).map((x) => x.tick);
  const notImplemented = (dialog = DIALOG): string[] => {
    const out = new Set<string>();
    for (const x of outcomes) if (x.o.kind === 'not-implemented' && x.dialog === dialog) out.add(`${x.o.row.name} (${x.o.task})`);
    return [...out];
  };
  const text = (node: string): string => { const c = findNode(m.shell()!.screen.root, node)?.content; return c?.kind === 'text' ? String.fromCharCode(...c.text.codes) : `<${c?.kind ?? 'none'}>`; };
  const node = (name: string): { visible: boolean; opacity: number } => { const n = findNode(m.shell()!.screen.root, name)!; return { visible: n.visible, opacity: n.opacity }; };
  return { m, tick, run, hits, notImplemented, text, node, captions, builds, launches, frame: () => frame };
}

/** The ticks the set gives (research 146 §3; the disc's own set gives the same in `dnasScreenDisc.test.ts`). */
const T = { build: 1, onstart: 2, initDone: 3, waitDone: 62, dnas: 63, switch: 64, nextBuild: 64 + 15 + MENU_SWITCH_COUNTDOWN + 1 } as const;

describe('the DNAS screen\'s set replayed with DNASAuthenticate done on the first tick (ONL-03; OT.R20\'s hold at 0: the numbers before it)', () => {
  it('runs init_socom_online to SWITCHMENU dlgNetServerSelect.rdr: the two dialogs built, every row answered, the valves as the set leaves them', () => {
    const r = rig({ dnasHoldSeconds: 0 });
    r.run(120);
    expect(r.builds).toEqual([{ tick: T.build, name: DIALOG }, { tick: T.nextBuild, name: NEXT }]);
    expect(r.notImplemented()).toEqual([]);
    expect(r.m.valves.find('success')!.value).toBe(1);
    expect(r.m.valves.find('DNASInProgress')!.value).toBe(0);
    expect(r.m.valves.find('DNAS_ERROR_CODE')).toBeUndefined();
    expect(r.launches).toEqual([]);                                   // no REBOOT: the watchdog never came round
  });

  it('the commands\' ticks: InitNetwork 2 and 3, the WAIT to 62, DNASAuthenticate once at 63 with DMEInit and MediusInit, GetServerList 63 and 64, the switch at 64', () => {
    const r = rig({ dnasHoldSeconds: 0 });
    r.run(120);
    expect(r.hits('InitNetwork')).toEqual([T.onstart, T.initDone]);
    expect(r.hits('MC_Exists')).toEqual([T.waitDone, T.waitDone]);       // Ensure_MC_Dirs_Fast (a blocking CALL: its own tick)
    expect(r.hits('MC_ChDir')).toEqual([]);                              // the empty card
    expect(r.hits('DNASAuthenticate')).toEqual([T.dnas]);
    expect(r.hits('DMEInit')).toEqual([T.dnas]);
    expect(r.hits('MediusInit')).toEqual([T.dnas]);
    expect(r.hits('MC_Changed')).toEqual([T.dnas]);                      // has_memcard_changed's first poll
    expect(r.hits('GetServerList')).toEqual([T.dnas, T.switch]);
    expect(r.hits('SwitchMenu')).toEqual([T.switch]);
    expect(T.nextBuild).toBe(83);
    expect((T.nextBuild - T.build) * UI_TICK_SECONDS).toBeCloseTo(2.736, 2);
  });

  it('the captions in the set\'s order (R128.7), each on its tick; the build\'s frame shows the layout\'s (DNAS_FIRST_FRAME_READING)', () => {
    const r = rig({ dnasHoldSeconds: 0 });
    r.tick();
    expect([r.text('bar_title'), r.text('ONLINE_LOBBY_STATE')]).toEqual(['_533_AUTHENTICATING_MSG', '_446_START_MSG']);
    r.tick();
    expect([r.text('bar_title'), r.text('ONLINE_LOBBY_STATE')]).toEqual(['#448', '#534']);
    r.run(T.waitDone - 2);
    expect([r.text('bar_title'), r.text('ONLINE_LOBBY_STATE')]).toEqual(['#448', '#535']);
    r.tick();
    expect([r.text('bar_title'), r.text('ONLINE_LOBBY_STATE')]).toEqual(['#536', '#537']);
    r.run(60);
    expect(r.captions.map((c) => `${c.tick}:${c.node}#${c.id}`)).toEqual([
      `${T.onstart}:bar_title#448`, `${T.onstart}:ONLINE_LOBBY_STATE#534`, `${T.waitDone}:ONLINE_LOBBY_STATE#535`,
      `${T.dnas}:ONLINE_LOBBY_STATE#535`, `${T.dnas}:bar_title#536`, `${T.dnas}:ONLINE_LOBBY_STATE#537`,
    ]);
  });

  it('the logo and its trademark: hidden by ONSTART, shown fading in with AUTHENTICATING DNAS DATA; TurnOff a tick later cancels the fade (DNAS_LOGO_OVERLAP_READING): 0.96 to the unload', () => {
    const r = rig({ dnasHoldSeconds: 0 });
    r.tick();
    expect(r.node('DNASLogo')).toEqual({ visible: true, opacity: 1 });
    r.tick();
    expect(r.node('DNASLogo').visible).toBe(false);
    expect(r.node('DNASTrademark1').visible).toBe(false);
    r.run(T.waitDone - 2);
    expect(r.node('DNASLogo')).toEqual({ visible: true, opacity: expect.closeTo(1.25 * UI_TICK_SECONDS, 4) as number });
    r.tick();
    expect(r.node('DNASLogo')).toEqual({ visible: true, opacity: expect.closeTo(1 - 1.25 * UI_TICK_SECONDS, 4) as number });
    expect(r.node('DNASTrademark1')).toEqual({ visible: true, opacity: expect.closeTo(1 - 1.25 * UI_TICK_SECONDS, 4) as number });
    r.run(T.nextBuild - T.dnas - 1);
    expect(r.node('DNASLogo')).toEqual({ visible: true, opacity: expect.closeTo(1 - 1.25 * UI_TICK_SECONDS, 4) as number });
    expect(r.builds).toHaveLength(1);
    r.tick();
    expect(r.builds).toHaveLength(2);
  });

  it('a slow GetServerList worker holds LOCATING ... on the screen: the switch moves by its polls, the captions stand', () => {
    const r = rig({ dnasHoldSeconds: 0, getServerList: () => slowJob(30) });
    r.run(150);
    expect(r.hits('GetServerList')).toHaveLength(31);                     // the start, then 30 polls
    expect(r.hits('GetServerList').at(-1)).toBe(T.dnas + 30);
    expect(r.hits('SwitchMenu')).toEqual([T.dnas + 30]);
    expect(r.builds[1]).toEqual({ tick: T.dnas + 30 + 15 + MENU_SWITCH_COUNTDOWN + 1, name: NEXT });
    expect(r.captions.filter((c) => c.tick > T.dnas)).toEqual([]);
  });

  it('a slow InitNetwork worker holds CONNECTING TO INTERNET: the 2-s WAIT starts only when it ends', () => {
    const r = rig({ dnasHoldSeconds: 0, initNetwork: () => slowJob(10) });
    r.run(150);
    expect(r.hits('InitNetwork')).toHaveLength(11);                       // the start, then 10 polls: nine ticks more than the immediate job
    expect(r.hits('DNASAuthenticate')).toEqual([T.dnas + 9]);
    expect(r.builds[1]!.tick).toBe(T.nextBuild + 9);
  });

  it('a failed InitNetwork (success 0): no logo, no DNAS, the NA branch; the 90-s watchdog then stops the sequence and reboots', () => {
    const r = rig({ dnasHoldSeconds: 0, initNetwork: () => slowJob(1, 0) });
    r.run(200);
    expect(r.hits('DNASAuthenticate')).toEqual([]);
    expect(r.hits('SwitchMenu')).toEqual([]);
    expect(r.node('DNASLogo').visible).toBe(false);
    expect([r.text('bar_title'), r.text('ONLINE_LOBBY_STATE')]).toEqual(['#448', '#534']);
    expect(r.builds).toHaveLength(1);
    // monitor_timeout: WAIT 90 from its first tick (2); 90 s is 2697.3 ticks and the WAIT counts the tick it begins on
    // (the 2-s WAIT begun on tick 3 ended on 62 the same way), so the STOP, UNINITNETWORK (ONL-10's: the table's constant
    // 1) and SWITCHMENU(REBOOT) run on tick 2699; the reboot is dispatched after the switch's fade and countdown
    // (15 + 3 + 1 ticks, as any switch: `switchTo` is reached from the shell's branch B once the fader is opaque).
    r.run(2698 - 200);
    expect(r.hits('SwitchMenu')).toEqual([]);
    r.tick();
    expect(r.hits('SwitchMenu')).toEqual([2699]);
    expect(r.notImplemented()).toEqual(['UnInitNetwork (ONL-10)']);
    expect(r.launches).toHaveLength(0);
    r.run(15 + MENU_SWITCH_COUNTDOWN);
    expect(r.launches).toHaveLength(0);
    r.tick();
    expect(r.launches).toHaveLength(1);
    expect(r.frame()).toBe(2699 + 15 + MENU_SWITCH_COUNTDOWN + 1);
  });

  it('the loaded-set rule: dlgNetConnect.rdr\'s init_socom_online (earlier in the archive, not loaded) is never the one started', () => {
    const r = rig({ dnasHoldSeconds: 0 });
    r.run(120);
    expect(r.builds.map((b) => b.name)).toEqual([DIALOG, NEXT]);
    expect(r.builds.some((b) => b.name === 'dlgUsagePolicy.rdr')).toBe(false);
  });
});

/**
 * OT.R20 (the owner, 2026-10-04: "menu time should be extended slightly, the login and DNAS screen in particular. a few
 * seconds each atleast"): `DNASAuthenticate` answers "in progress" (0, as `FUN_002cc670` answers while libdnas2 works,
 * D:L170469-170513) for `DNAS_HOLD_TICKS` ticks of the machine's clock, then done -- the set runs it as a statement, so
 * a 0 holds the sequence on it (research 106 R106.3) with AUTHENTICATING DNAS DATA (#535) and the logo up. Every caption
 * and the watchdog are the set's; the rest of the sequence moves by the hold's ticks.
 */
describe('OT.R20: the DNAS screen held by the owner\'s pacing (DNAS_HOLD_SECONDS_PLACEHOLDER, 90 ticks)', () => {
  const H = DNAS_HOLD_TICKS;

  it('DNASAuthenticate from 63 to 63 + 90 (its last answer the done one), the switch at 154, SELECT UNIVERSE built on 173', () => {
    expect(H).toBe(90);
    const r = rig();
    r.run(260);
    expect(r.hits('DNASAuthenticate')).toEqual(Array.from({ length: H + 1 }, (_, i) => T.dnas + i));
    expect(r.hits('DMEInit')).toEqual([T.dnas + H]);
    expect(r.hits('MediusInit')).toEqual([T.dnas + H]);
    expect(r.hits('GetServerList')).toEqual([T.dnas + H, T.switch + H]);
    expect(r.hits('SwitchMenu')).toEqual([T.switch + H]);
    expect(r.builds).toEqual([{ tick: T.build, name: DIALOG }, { tick: T.nextBuild + H, name: NEXT }]);
    expect(T.nextBuild + H).toBe(173);
    expect((T.nextBuild + H - T.build) * UI_TICK_SECONDS).toBeCloseTo(5.739, 2);   // the screen up 5.7 s, was 2.7 s
    expect(r.notImplemented()).toEqual([]);
    expect(r.launches).toEqual([]);
  });

  it('during the hold: AUTHENTICATING DNAS DATA (#535) stands, DNASInProgress is 1, the logo fades in to full; the set\'s captions only', () => {
    const r = rig();
    r.run(T.dnas + 45);
    expect([r.text('bar_title'), r.text('ONLINE_LOBBY_STATE')]).toEqual(['#448', '#535']);
    expect(r.m.valves.find('DNASInProgress')!.value).toBe(1);
    expect(r.node('DNASLogo')).toEqual({ visible: true, opacity: 1 });       // TurnOnLogo's 0.8 s ran out before TurnOffLogo
    r.run(260);
    expect(r.m.valves.find('DNASInProgress')!.value).toBe(0);
    expect(r.captions.map((c) => `${c.tick}:${c.node}#${c.id}`)).toEqual([
      `${T.onstart}:bar_title#448`, `${T.onstart}:ONLINE_LOBBY_STATE#534`, `${T.waitDone}:ONLINE_LOBBY_STATE#535`,
      `${T.dnas + H}:ONLINE_LOBBY_STATE#535`, `${T.dnas + H}:bar_title#536`, `${T.dnas + H}:ONLINE_LOBBY_STATE#537`,
    ]);
  });

  it('the 90-s watchdog is the set\'s: a failed InitNetwork never reaches DNASAuthenticate, and the reboot still comes on 2699', () => {
    const r = rig({ initNetwork: () => slowJob(1, 0) });
    r.run(2698);
    expect(r.hits('DNASAuthenticate')).toEqual([]);
    expect(r.hits('SwitchMenu')).toEqual([]);
    r.tick();
    expect(r.hits('SwitchMenu')).toEqual([2699]);
  });
});
