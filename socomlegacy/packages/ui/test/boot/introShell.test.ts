import { describe, expect, it } from 'vitest';
import { UI_TICK_SECONDS } from '../../src/clock/uiClock';
import type { DialogDesign } from '../../src/dialog';
import { ONMPEGEND, type MovieService } from '../../src/movie/movieCommands';
import { MENU_SWITCH_COUNTDOWN } from '../../src/screens/menuShell';
import { DEFAULT_MENU_SCREEN } from '../../src/screens/menuState';
import { LoaderScreens } from '../../src/boot/loaderScreens';
import { Opener, type OpenerEvent } from '../../src/boot/opener';
import { widgetPad, type PadButtonName } from '../../src/widgets/pad';
import type { ZAnimRtAnimation, ZAnimRtCommand, ZAnimRtSequence, ZAnimRtSet } from '../../src/zanimRuntime';

/**
 * The intro shell's sequence and timing (BOOT-04; web research 139 §5) on a synthetic clock (PLAT-12's tick, one
 * frame per call) with a fake movie source (PLAT-21's rows 4-8: one picture per frame, an empty frame, then event 3):
 * the loader's screens, then `dlgIntroScreen`'s ONSTART through the stubs to `SWITCHMENU dlgIntroCinematic.rdr`, the
 * switch's fade and countdown, `sony448.pss` from the build, event 3 -> `switch_menu dlgSecondCinematic.rdr`,
 * `Intro_2.pss`, its end -> `goto_menu_silent dlgMenu.rdr` or any of the thirteen keys -> `goto_menu dlgMenu.rdr`.
 *
 * The scripts are synthetic sets assembled here as `parseAnimSets` lays the disc's out, a transcription of the path
 * the f0 card takes through the disc's own programs (research 139 §2's table: every op the path executes, with the
 * disc's waits; the branches it does not take -- the format loop, the no-data popups, the DTV check, the HDD branch --
 * are left out, and run only on the disc in `tools/test/introShellDisc.test.ts`). The POPUP node commands are left out
 * too (PLAT-16's content): `POPUPDIALOG` / `KILLPOPUP` are PLAT-10's rows and run.
 */

// ---------------------------------------------------------------------------------------------------------------------
// An assembler for the synthetic sets (the layout of `packages/ui/test/zanimRuntime.test.ts`).

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

/** The names the boot's programs index (each animation's own table on the disc; one shared table here). */
const NAMES = [
  'NA', 'IsControllerConnected', 'ControllerConnected', 'POPUPDIALOG', 'intro_onstart', 'HDD_ENABLE', 'SWITCHMENU',
  'dlgIntroCinematic.rdr', 'load_initial_config', 'memcard_have_loaded_config', 'KeepTryingMemcardLoad',
  'memcard_already_selected', 'find_a_memcard', 'IsMemCardInserted', 'IsMemCardFormatted', 'DisplayLoadingWarning',
  'MemcardAlreadyHasData', 'Ensure_MC_Dirs_Fast', 'memcard_error', 'LoadConfig', 'BASCUS-97275SOCOMII', 'ListSavedGames',
  'video_mode', 'CheckVideoMode', 'DTV', 'KILLPOPUP', 'MENUFADER', 'StoreOptions', 'num_memcards', 'MainMenuCardSlot',
  'MC_ChPort', '0', '1', 'MC_Exists', '..', 'MC_ChDir', 'VagStreaming', 'OFF', 'INPUT_STRING', 'switch', 'menu_fade_up',
  'SND_DINK', 'NotDone', 'IsSpaceForSaveGameFile', 'AcceptNoData', 'HardDriveOperation', 'OPEN', 'hard_disk_error_code',
];
const ix = (name: string): number => { const i = NAMES.indexOf(name); if (i < 0) throw new Error(name); return i; };
const OP = { EQ: 2, GT: 3, NE: 1, SET: 11, ADD: 12 } as const;

const valve = (name: string, op: number, operand: number): Uint8Array => cmd(0, 61, 16, (v) => {
  v.setUint32(4, ix(name), true); v.setUint32(8, operand >>> 0, true); v.setUint8(12, op); v.setUint8(13, 2);
});
const expr = (code: number): Uint8Array => cmd(0, 43, 8, (v) => v.setUint8(4, code));
const NOT = (): Uint8Array => expr(1), AND = (): Uint8Array => expr(2), OPEN = (): Uint8Array => expr(4), CLOSE = (): Uint8Array => expr(5);
const withTokens = (n: number, depth: number, tokens: Uint8Array[]): Uint8Array => {
  const t = cat(...tokens);
  return cmd(0, n, 8 + t.length, (v, b) => { v.setUint8(4, depth); b.set(t, 8); });
};
const IF = (depth: number, ...t: Uint8Array[]): Uint8Array => withTokens(2, depth, t);
const ELSE = (depth: number): Uint8Array => cmd(0, 4, 8, (v) => v.setUint8(4, depth));
const ENDIF = (depth: number): Uint8Array => cmd(0, 5, 8, (v) => v.setUint8(4, depth));
const WHILE = (...t: Uint8Array[]): Uint8Array => withTokens(39, 0, t);
const END_WHILE = (): Uint8Array => cmd(0, 40, 8);
const WAIT = (s: number): Uint8Array => cmd(0, 15, 12, (v) => { v.setUint16(4, 9, true); v.setFloat32(8, s, true); });
const OPACITY = (node: string, from: number, to: number, rate: number, time: number): Uint8Array => cmd(0, 25, 0x18, (v) => {
  v.setUint16(4, NODES.indexOf(node), true); v.setFloat32(8, from, true); v.setFloat32(0xc, to, true); v.setFloat32(0x10, rate, true); v.setFloat32(0x14, time, true);
});
const CALL = (name: string, block: boolean): Uint8Array => cmd(0, 45, 20, (v) => { v.setUint16(4, block ? 0x200 : 0, true); v.setUint8(7, ix(name)); });
const STOP_ANIMATION = (name: string): Uint8Array => cmd(0, 46, 8, (v) => v.setUint8(4, ix(name)));
const CALL_SEQUENCE = (name: string): Uint8Array => cmd(0, 50, 8, (v) => v.setUint8(4, ix(name)));
const SOUND = (name: string): Uint8Array => cmd(0, 30, 16, (v) => { v.setUint8(4, ix(name)); });
const UI = (fn: string, arg = 'NA'): Uint8Array => cmd(1, 1, 16, (v) => { v.setUint16(4, 0, true); v.setUint8(6, ix(fn)); v.setUint16(8, ix(arg), true); });
const NODES = ['NA', 'MENUFADER', 'POPUP'];

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
/** WHILE ... END_WHILE with their jumps patched (research 106 §4). */
function loop(before: Uint8Array[], whileCmd: Uint8Array, body: Uint8Array[], after: Uint8Array[], head = 0x1c): Uint8Array[] {
  const endWhile = END_WHILE();
  const commands = [...before, whileCmd, ...body, endWhile, ...after];
  let o = head;
  const offs = commands.map((c) => { const at = o; o += c.length; return at; });
  new DataView(whileCmd.buffer).setUint16(6, offs[commands.indexOf(endWhile)]!, true);
  new DataView(endWhile.buffer).setUint16(6, offs[commands.indexOf(whileCmd)]!, true);
  return commands;
}

// ---------------------------------------------------------------------------------------------------------------------
// The boot's programs, the f0 path (research 139 §2).

/** `dlgIntroScreen.rdr` / `do_onstart`: the controller check, `intro_onstart`, the HDD branch, the switch. */
const doOnstart = anim('do_onstart', [{ name: 'NA', commands: loop(
  [IF(0, NOT(), OPEN(), UI('IsControllerConnected'), CLOSE()), valve('ControllerConnected', OP.SET, 0), UI('POPUPDIALOG')],
  WHILE(valve('ControllerConnected', OP.EQ, 0)), [],
  [ENDIF(1), CALL('intro_onstart', true),
    IF(0, valve('HDD_ENABLE', OP.EQ, 1)), valve('hard_disk_error_code', OP.SET, 0), UI('POPUPDIALOG'), WAIT(0.3),
    IF(1, UI('HardDriveOperation', 'OPEN')), ENDIF(2), ENDIF(1),
    UI('SWITCHMENU', 'dlgIntroCinematic.rdr')],
) }]);
/** `UIanim.rdr` / `intro_onstart`: its one auto-start sequence `end_of_screen` calls `load_initial_config`. */
const introOnstart = anim('intro_onstart', [{ name: 'end_of_screen', commands: [CALL('load_initial_config', true)] }]);
/** `UIMemCardAnim.rdr` / `load_initial_config`: the one pass of its retry loop the f0 card takes. */
const loadInitialConfig = anim('load_initial_config', [{ name: 'NA', commands: [
  IF(0, valve('memcard_have_loaded_config', OP.EQ, 0)),
  ...loop(
    [valve('KeepTryingMemcardLoad', OP.SET, 1)],
    WHILE(valve('KeepTryingMemcardLoad', OP.EQ, 1)),
    [valve('KeepTryingMemcardLoad', OP.SET, 0),
      IF(2, valve('memcard_already_selected', OP.EQ, 0)), CALL('find_a_memcard', true), ENDIF(2),
      IF(2, UI('IsMemCardInserted')),
      IF(3, NOT(), OPEN(), UI('IsMemCardFormatted'), CLOSE(), AND(), UI('IsMemCardInserted')), valve('NotDone', OP.SET, 1), ENDIF(3),
      IF(3, UI('IsMemCardFormatted')),
      CALL('DisplayLoadingWarning', true), valve('MemcardAlreadyHasData', OP.SET, 0), CALL('Ensure_MC_Dirs_Fast', true),
      IF(4, valve('MemcardAlreadyHasData', OP.EQ, 0), AND(), UI('IsMemCardInserted')),
      IF(5, UI('IsSpaceForSaveGameFile')), ENDIF(5),
      ELSE(4),
      valve('memcard_error', OP.SET, 0), UI('LoadConfig', 'BASCUS-97275SOCOMII'), UI('ListSavedGames'), WAIT(0.3),
      IF(5, valve('memcard_error', OP.EQ, 1)), ELSE(5),
      IF(6, valve('video_mode', OP.EQ, 1)), IF(7, NOT(), UI('CheckVideoMode', 'DTV')), ENDIF(7), ENDIF(6),
      ENDIF(5), ENDIF(4),
      ELSE(3), valve('AcceptNoData', OP.SET, 0), UI('POPUPDIALOG'), ENDIF(3),
      ENDIF(2),
      UI('KILLPOPUP'), valve('memcard_have_loaded_config', OP.SET, 1), OPACITY('MENUFADER', 0.7, 0, -14, 0.05)],
    [], 0x1c + 8 + 16),                                             // the WHILE's jumps: after the IF (8 + 16 bytes)
  ENDIF(1), UI('StoreOptions'),
] }]);
/** `UIMemCardAnim.rdr` / `find_a_memcard`: the search popup, 1 s, both ports asked, one card found. */
const findAMemcard = anim('find_a_memcard', [{ name: 'NA', commands: [
  valve('num_memcards', OP.SET, 0), UI('POPUPDIALOG'), WAIT(1), valve('MainMenuCardSlot', OP.SET, 0), UI('MC_ChPort', '0'),
  IF(0, UI('IsMemCardInserted')), valve('num_memcards', OP.ADD, 1), ENDIF(1),
  valve('MainMenuCardSlot', OP.SET, 1), UI('MC_ChPort', '1'),
  IF(0, UI('IsMemCardInserted')), valve('num_memcards', OP.ADD, 1), ELSE(1), valve('MainMenuCardSlot', OP.SET, 0), UI('MC_ChPort', '0'), ENDIF(1),
  IF(0, valve('num_memcards', OP.GT, 1)), ENDIF(1),
] }]);
const displayLoadingWarning = anim('DisplayLoadingWarning', [{ name: 'NA', commands: [UI('POPUPDIALOG'), WAIT(0.3)] }]);
const ensureMcDirsFast = anim('Ensure_MC_Dirs_Fast', [{ name: 'NA', commands: [
  IF(0, UI('MC_Exists', '..')), UI('MC_ChDir', '..'), ENDIF(1),
  IF(0, UI('MC_Exists', 'BASCUS-97275SOCOMII')), valve('MemcardAlreadyHasData', OP.SET, 1), UI('MC_ChDir', 'BASCUS-97275SOCOMII'), ENDIF(1),
] }]);
/** `UIanim.rdr`'s wrappers (research 115 §2) and `menu_fade_up` (flags 0x21: auto-start). */
const gotoMenu = anim('goto_menu', [
  { name: 'NA', commands: [SOUND('SND_DINK'), STOP_ANIMATION('menu_fade_up'), CALL_SEQUENCE('switch')] },
  { name: 'switch', word: 0x104, commands: [UI('SWITCHMENU', 'INPUT_STRING')] },
]);
const gotoMenuSilent = anim('goto_menu_silent', [
  { name: 'NA', commands: [STOP_ANIMATION('menu_fade_up'), CALL_SEQUENCE('switch')] },
  { name: 'switch', word: 0x104, commands: [UI('SWITCHMENU', 'INPUT_STRING')] },
]);
const switchMenu = anim('switch_menu', [{ name: 'NA', commands: [UI('SWITCHMENU', 'INPUT_STRING')] }]);
const menuFadeUp = anim('menu_fade_up', [{ name: 'NA', commands: [OPACITY('MENUFADER', 1, 0, -0.6667, 1.5)] }], 0x21);
const turnOffVagStream = anim('TurnOffVagStream', [{ name: 'NA', commands: [UI('VagStreaming', 'OFF')] }]);

const SETS: ZAnimRtSet[] = [
  // An unloaded set with the boot's names, first in the archive (research 139 §4: `do_onstart` in dlgAfterErrorReboot.rdr).
  { name: 'dlgAfterErrorReboot.rdr', anims: [anim('do_onstart', [{ name: 'NA', commands: [UI('SWITCHMENU', 'dlgIntroCinematic.rdr')] }])] },
  { name: 'UIanim.rdr', anims: [menuFadeUp, gotoMenu, gotoMenuSilent, switchMenu, introOnstart] },
  { name: 'UIMemCardAnim.rdr', anims: [loadInitialConfig, findAMemcard, displayLoadingWarning, ensureMcDirsFast] },
  { name: 'dlgIntroScreen.rdr', anims: [doOnstart] },
  { name: 'dlgIntroCinematic.rdr', anims: [turnOffVagStream] },
];

const base = (): DialogDesign => ({
  libraries: [], usesMemcard: false, font: null, fontLib: true, background: null, bindings: [], controls: [], objects: [],
  scripts: [], models: [], dropped: [],
});
const event = (name: string, code: number, animation: string, argument: string | null = null) =>
  ({ kind: 'event' as const, name, code, state: 1, animation, argument });
const button = (name: string, code: number, animation: string, argument: string) =>
  ({ kind: 'button' as const, name, code, state: 1, animation, argument });
/** The thirteen keys `dlgSecondCinematic` binds (research 96 §3.2), with `DIALOG_BUTTONS`' codes. */
const THIRTEEN: [string, number][] = [['START', 0], ['CIRCLE', 7], ['SQUARE', 8], ['TRIANGLE', 6], ['CROSS', 9], ['UP', 4], ['DOWN', 5], ['RIGHT', 2], ['LEFT', 3], ['TRIGGER_R1', 10], ['TRIGGER_R2', 11], ['TRIGGER_L1', 12], ['TRIGGER_L2', 13]];
const DIALOGS: Record<string, DialogDesign> = {
  'dlgIntroScreen.rdr': { ...base(), background: { type: 0, typeName: 'IMAGE', filename: ' ' }, scripts: ['dlgIntroScreen.rdr', 'uianim.rdr', 'UIMemCardAnim.rdr'], bindings: [event('ONSTART', 0, 'do_onstart')] },
  'dlgIntroCinematic.rdr': { ...base(), background: { type: 1, typeName: 'MPEG', filename: 'run/movies/common/sony448.pss' }, scripts: ['dlgIntroCinematic.rdr', 'uianim.rdr'], bindings: [event('ONSTART', 0, 'TurnOffVagStream'), event('ONMPEGEND', 3, 'switch_menu', 'dlgSecondCinematic.rdr')] },
  'dlgSecondCinematic.rdr': { ...base(), background: { type: 1, typeName: 'MPEG', filename: 'run/movies/Intro_2.pss' }, scripts: ['uianim.rdr'], bindings: [event('ONMPEGEND', 3, 'goto_menu_silent', 'dlgMenu.rdr'), ...THIRTEEN.map(([n, c]) => button(n, c, 'goto_menu', 'dlgMenu.rdr'))] },
  'dlgMenu.rdr': { ...base(), background: { type: 1, typeName: 'MPEG', filename: 'run/movies/common/menuloop.pss' }, scripts: ['uianim.rdr'], bindings: [] },
};

// ---------------------------------------------------------------------------------------------------------------------
// The fake movie (PLAT-21's background player, rows 4-8: a picture per tick, an empty tick, then event 3, closed).

const COUNTS: Record<string, number> = { 'run/movies/common/sony448.pss': 310, 'run/movies/intro_2.pss': 3836, 'run/movies/common/menuloop.pss': 3732 };

function fakeMovie(onEnd: () => void) {
  let file: string | null = null, left = 0, playing = false, empty = false;
  const presented: string[] = [];
  const service: MovieService = { background: { on: () => true, off: () => { playing = false; return true; } }, play() {} };
  return {
    presented,
    get file() { return file; },
    get playing() { return playing; },
    service,
    frame: () => {
      if (!playing) return 'menu' as const;
      if (left > 0) { left--; presented.push(file!); return 'menu' as const; }
      if (!empty) { empty = true; return 'menu' as const; }                   // NODATA: no picture (row 6)
      playing = false; onEnd();                                                // row 8: event 3, then closed
      return 'menu' as const;
    },
    unload: () => { playing = false; file = null; },
    load: (bg: DialogDesign['background']) => {
      if (!bg || bg.type === 0 || bg.filename === null) return;
      file = bg.filename; left = COUNTS[bg.filename.toLowerCase()] ?? 0; playing = true; empty = false;
    },
  };
}

interface Run { opener: Opener; events: OpenerEvent[]; movie: ReturnType<typeof fakeMovie>; step(n: number, press?: PadButtonName): void }
function run(o: { loader?: LoaderScreens | null } = {}): Run {
  const events: OpenerEvent[] = [];
  let pad: ReturnType<typeof widgetPad> | null = null;
  let opener: Opener;
  const movie = fakeMovie(() => { opener.machine.shell()?.event(ONMPEGEND); });
  opener = new Opener({
    dialog: (n) => DIALOGS[n] ?? null, sets: SETS,
    movie: { service: movie.service, frame: movie.frame, unload: movie.unload, load: movie.load },
    loaderScreens: o.loader, tap: () => pad, onEvent: (e) => events.push(e),
  });
  return {
    opener, events, movie,
    step: (n, press) => {
      for (let i = 0; i < n; i++) {
        pad = press && i === 0 ? widgetPad({ [press]: 'FALLING' }) : press && i === 1 ? widgetPad({ [press]: 'RISING' }) : null;
        opener.frame(UI_TICK_SECONDS);
      }
    },
  };
}

const kinds = (events: OpenerEvent[], kind: OpenerEvent['kind']): OpenerEvent[] => events.filter((e) => e.kind === kind);
const tick = (t: number): number => Math.round(t / UI_TICK_SECONDS);

describe('the intro shell (BOOT-04, research 139 §5)', () => {
  it('runs the original\'s order: the loader, dlgIntroScreen, dlgIntroCinematic + sony448, dlgSecondCinematic + Intro_2, dlgMenu + menuloop', () => {
    const r = run();
    r.step(5000);
    const dialogs = kinds(r.events, 'dialog').map((e) => (e as { name: string }).name);
    expect(dialogs).toEqual([DEFAULT_MENU_SCREEN, 'dlgIntroCinematic.rdr', 'dlgSecondCinematic.rdr', 'dlgMenu.rdr']);
    expect(kinds(r.events, 'movie').map((e) => (e as { file: string | null }).file)).toEqual([null, 'run/movies/common/sony448.pss', 'run/movies/Intro_2.pss', 'run/movies/common/menuloop.pss']);
    expect(kinds(r.events, 'switch').map((e) => (e as { target: string }).target)).toEqual(['dlgIntroCinematic.rdr', 'dlgSecondCinematic.rdr', 'dlgMenu.rdr']);
    expect(kinds(r.events, 'loader').map((e) => (e as { phase: string }).phase)).toContain('LOADING hold');
    expect(r.opener.machine.shell()!.currentName).toBe('dlgMenu.rdr');
    expect(r.movie.file).toBe('run/movies/common/menuloop.pss');
    // Every picture of both movies was presented once, in order, before the next dialog (research 121 §10).
    expect(r.movie.presented.filter((f) => f === 'run/movies/common/sony448.pss')).toHaveLength(310);
    expect(r.movie.presented.filter((f) => f === 'run/movies/Intro_2.pss')).toHaveLength(3836);
  });

  it('the stubs answer in the scripts\' order: the controller, both ports, the card formatted, the folder, the config', () => {
    const r = run();
    r.step(200);
    const stubs = kinds(r.events, 'stub').map((e) => { const s = e as { name: string; arg: string; answer: boolean }; return `${s.name}(${s.arg})=${s.answer ? 1 : 0}`; });
    expect(stubs).toEqual([
      'IsControllerConnected(NA)=1',
      'MC_ChPort(0)=1', 'IsMemCardInserted(NA)=1', 'MC_ChPort(1)=1', 'IsMemCardInserted(NA)=0', 'MC_ChPort(0)=1',
      'IsMemCardInserted(NA)=1', 'IsMemCardFormatted(NA)=1', 'IsMemCardInserted(NA)=1', 'IsMemCardFormatted(NA)=1',
      'MC_Exists(..)=0', 'MC_Exists(BASCUS-97275SOCOMII)=1', 'MC_ChDir(BASCUS-97275SOCOMII)=1',
      'IsMemCardInserted(NA)=1', 'LoadConfig(BASCUS-97275SOCOMII)=1', 'ListSavedGames(NA)=1',
      'StoreOptions(NA)=1',
    ]);
    expect(r.opener.valves.find('video_mode')?.value).toBe(0);            // the f0 card's (F0_CARD_BOOT_VALVES)
    expect(r.opener.valves.find('HDD_ENABLE')?.value).toBe(0);
    expect(r.opener.valves.find('memcard_have_loaded_config')?.value).toBe(1);
    expect(r.opener.stubs.state).toEqual({ port: 0, slot: 0, cwd: 'BASCUS-97275SOCOMII' });
  });

  it('the timing is the scripts\' and the manager\'s: the loader 3.20 s; the card popups 55 ticks to the switch; 18 ticks to the build; the movies at one picture a tick', () => {
    const r = run();
    r.step(5000);
    const at = (kind: OpenerEvent['kind'], i = 0): number => kinds(r.events, kind)[i]!.t;
    const game = at('game');
    expect(tick(game)).toBe(96);                                          // the loader: LOADING_HOLD_PLACEHOLDER 2.5 s + 21 fields of fades (research 130)
    expect(game).toBeCloseTo(3.2032, 3);
    const built = kinds(r.events, 'dialog').map((e) => e.t), switches = kinds(r.events, 'switch').map((e) => e.t), movies = kinds(r.events, 'movie').map((e) => e.t);
    // dlgIntroScreen's ONSTART: find_a_memcard's 1 s, DisplayLoadingWarning's 0.3 s, LoadConfig's 0.3 s, the fader's
    // 0.05 s (1.65 s, 49.4 ticks) and a tick for each blocking CALL and the commands between: 55 ticks (1.84 s) to the switch.
    expect(tick(switches[0]! - built[0]!)).toBe(55);
    // The switch: 15 ticks of fade to black at 2 x 1/29.97 per tick (research 115 §4.1, n = 15 at 1/30), then the three-frame
    // countdown and the dispatch (MENU_SWITCH_COUNTDOWN + 1): the build on the 19th frame after the one that consumed the
    // switch (a switch event is stamped after its frame, a build inside its own: 18 between the stamps).
    for (let i = 0; i < 3; i++) expect(tick(built[i + 1]! - switches[i]!)).toBe(15 + MENU_SWITCH_COUNTDOWN + 1 - 1);
    // sony448 opens at dlgIntroCinematic's build (step 9); 310 pictures, one a tick, then an empty tick and the event's
    // (research 121 rows 5-8): the switch to dlgSecondCinematic comes 312 ticks after the open, the next tick's A5.
    expect(movies[1]).toBe(built[1]);
    expect(tick(switches[1]! - movies[1]!)).toBe(310 + 2 + 1);
    expect(tick(switches[2]! - movies[2]!)).toBe(3836 + 2 + 1);
    // From the loader's first frame to the main menu's build: the sum (research 139 §5 against 02-boot B9).
    expect([tick(built[0]!), tick(built[1]!), tick(built[2]!), tick(built[3]!)]).toEqual([96, 96 + 55 + 18, 96 + 55 + 18 + 313 + 18, 96 + 55 + 18 + 313 + 18 + 3839 + 18]);
  });

  for (const [name] of THIRTEEN) {
    it(`${name} during Intro_2 goes to the menu at once (goto_menu dlgMenu.rdr), with the DINK and the switch's fade`, () => {
      const r = run();
      r.step(96 + 55 + 18 + 313 + 18 + 30);                           // 30 ticks into Intro_2
      expect(r.opener.machine.shell()!.currentName).toBe('dlgSecondCinematic.rdr');
      const before = r.events.length;
      r.step(2, name as PadButtonName);
      expect(kinds(r.events.slice(before), 'button')).toHaveLength(1);
      expect(kinds(r.events.slice(before), 'switch').map((e) => (e as { target: string }).target)).toEqual(['dlgMenu.rdr']);
      r.step(19);
      expect(r.opener.machine.shell()!.currentName).toBe('dlgMenu.rdr');
      expect(r.movie.presented.filter((f) => f === 'run/movies/Intro_2.pss').length).toBeLessThan(60);
    });
  }

  it('SELECT is not bound: Intro_2 plays on', () => {
    const r = run();
    r.step(96 + 55 + 18 + 313 + 18 + 30);
    r.step(2, 'SELECT');
    r.step(19);
    expect(r.opener.machine.shell()!.currentName).toBe('dlgSecondCinematic.rdr');
    expect(kinds(r.events, 'button')).toHaveLength(0);
  });

  it('dlgIntroCinematic binds no key: a press during sony448 does nothing (research 121 §6)', () => {
    const r = run();
    r.step(96 + 55 + 18 + 30);
    expect(r.opener.machine.shell()!.currentName).toBe('dlgIntroCinematic.rdr');
    r.step(2, 'CROSS');
    r.step(19);
    expect(r.opener.machine.shell()!.currentName).toBe('dlgIntroCinematic.rdr');
    expect(kinds(r.events, 'button')).toHaveLength(0);
  });

  it('with no loader (a deep link\'s replay) the game runs from the first frame; skipLoader() ends a loader early', () => {
    const r = run({ loader: null });
    expect(r.opener.phase).toBe('game');
    r.step(1);
    expect(r.opener.machine.shell()!.currentName).toBe(DEFAULT_MENU_SCREEN);
    const s = run();
    expect(s.opener.phase).toBe('loader');
    s.opener.machine.boot('dlgMenu.rdr');
    s.opener.skipLoader();
    s.step(1);
    expect(s.opener.machine.shell()!.currentName).toBe('dlgMenu.rdr');
    expect(kinds(s.events, 'loader')).toHaveLength(0);
  });
});
