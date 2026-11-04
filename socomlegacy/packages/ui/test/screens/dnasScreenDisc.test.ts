import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { locTable, parseAnimSets, readLocArchive, UIMNLOC } from '@s2u/scene';
import { UI_TICK_SECONDS } from '../../src/clock/uiClock';
import { findNode } from '../../src/compositor/scene';
import { UiCommandHost, type UiCommandOutcome } from '../../src/uiCommands';
import { UiVarManager } from '../../src/uiVars';
import { MenuInput } from '../../src/input/menuInput';
import { dialogLookup } from '../../src/screens/dialogArchive';
import { DialogPartsHost } from '../../src/screens/dialogParts';
import { DNAS_HOLD_TICKS, DnasCommands } from '../../src/screens/dnasCommands';
import { FrontEndMachine } from '../../src/screens/frontEndMachine';
import { MenuCommands } from '../../src/screens/menuCommands';
import { MENU_SWITCH_COUNTDOWN } from '../../src/screens/menuShell';
import { PopupSlot } from '../../src/screens/popupSlot';
import type { MovieService } from '../../src/movie/movieCommands';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import { textFace } from '../text/fixtures';

/**
 * ONL-03 over the disc (a dev-disc test, W6.R8; web research 146 §3): the DNAS screen opened on `RUN/UI/READERC.ZAR` and
 * `RUN/UIZANIM.ZAR` -- its own set replayed by PLAT-07's runtime with every module of the path registered in PLAT-08's
 * host (the screens' rows, `SuspendMenuInput`, MENU-01a's card rows over the empty card, and this task's five) --
 * through `init_socom_online` to `SWITCHMENU(dlgNetServerSelect.rdr)` with `DNASAuthenticate` done on the first tick
 * (the bypass). What is pinned: the dialogs built, in order; the captions' `UIMnLOC` ids in the set's order (R128.7) and
 * their texts off the disc's table (decoded data, RS.R8); each command's ticks; the logo's opacity; the tick of the
 * switch and of the next build (the transcription's timing at PLAT-12's tick). Names, ids and valve values only. The
 * disc is `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; with neither (CI) every test skips.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const FILES = ['RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR', 'RUN/UIZANIM.ZAR', UIMNLOC.archive];
const HAVE_DISC = DISC !== '' && FILES.every((f) => existsSync(join(DISC, f)));
const bytes = (p: string): Uint8Array => new Uint8Array(readFileSync(join(DISC, p)));
const zar = (p: string): Zar => Zar.parse(bytes(p));

const DIALOG = 'dlgNetAuthenticate.rdr', NEXT = 'dlgNetServerSelect.rdr';
/** The set's node commands, in order (R128.7): the node and the `UIMnLOC` id each writes. */
const CAPTION_ORDER: [node: string, id: number][] = [
  ['bar_title', 448], ['ONLINE_LOBBY_STATE', 534], ['ONLINE_LOBBY_STATE', 535], ['ONLINE_LOBBY_STATE', 535], ['bar_title', 536], ['ONLINE_LOBBY_STATE', 537],
];
/** The texts the ids name on the US disc (`UIMnLOC.rdr`, decoded; the segment's fact N7). */
const TEXTS: Record<number, string> = {
  446: 'START', 448: 'CONNECTING', 532: 'DNAS logotype is a trademark of Sony Computer Entertainment Inc.', 533: 'AUTHENTICATING',
  534: 'CONNECTING TO INTERNET', 535: 'AUTHENTICATING DNAS DATA', 536: 'LOCATING UNIVERSES', 537: 'LOCATING AVAILABLE SOCOM II UNIVERSES',
};
/**
 * The ticks, measured on the transcription (research 146 §3): the build at 1 (CG's switch to MS); ONSTART's timeless ops
 * and `InitNetwork`'s start at 2; its end at 3; `WAIT 2` (2 s at 100/2997 s a tick: 59.94) ends at 62, with #535, the
 * logo's SHOW and `Ensure_MC_Dirs_Fast`'s two `MC_Exists`; `DNASAuthenticate` at 63 with everything timeless after it up
 * to `GetServerList`'s start; its end and the `SWITCHMENU` at 64; the next build 15 + 3 + 1 ticks later.
 */
const T = { build: 1, onstart: 2, initDone: 3, waitDone: 62, dnas: 63, switch: 64, nextBuild: 64 + 15 + MENU_SWITCH_COUNTDOWN + 1 } as const;

interface Rig {
  m: FrontEndMachine;
  /** One tick; the dialog current after it. */
  tick(): string;
  run(n: number): void;
  outcomes: { tick: number; dialog: string; o: UiCommandOutcome }[];
  /** Every node command with a `UIMnLOC` id, in order: the tick, the node, the id. */
  captions: { tick: number; node: string; id: number }[];
  /** Each dialog built, with its tick. */
  builds: { tick: number; name: string }[];
  notImplemented(dialog?: string): string[];
  hits(name: string, dialog?: string): number[];
  text(node: string): string;
  logo(): { visible: boolean; opacity: number };
  loc: ReturnType<typeof locTable>;
  frame: number;
}

/** `holdSeconds`: OT.R20's DNAS hold; absent, the owner's constant (`DNAS_HOLD_SECONDS_PLACEHOLDER`). */
function rig(holdSeconds?: number): Rig {
  const readerc = zar('RUN/UI/READERC.ZAR'), readerx = zar('RUN/UI/READERX.ZAR');
  const sets = parseAnimSets(zar('RUN/UIZANIM.ZAR')).sets;
  const loc = locTable(readLocArchive(bytes(UIMNLOC.archive), 'UIMn').entries);
  let seed = 1;
  const random = (): number => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed; };
  let m!: FrontEndMachine;
  const r: Rig = {
    m: null as unknown as FrontEndMachine, tick: null as unknown as Rig['tick'], run: null as unknown as Rig['run'], outcomes: [], captions: [], builds: [], frame: 0,
    notImplemented: (dialog) => {
      const out = new Set<string>();
      for (const x of r.outcomes) if (x.o.kind === 'not-implemented' && (dialog === undefined || x.dialog === dialog)) out.add(`${x.dialog}: ${x.o.row.name} (${x.o.task})`);
      return [...out];
    },
    hits: (name, dialog) => r.outcomes.filter((x) => x.o.kind === 'table' && x.o.row.name === name && (dialog === undefined || x.dialog === dialog)).map((x) => x.tick),
    text: (node) => { const c = findNode(m.shell()!.screen.root, node)?.content; return c?.kind === 'text' ? String.fromCharCode(...c.text.codes) : `<${c?.kind ?? 'none'}>`; },
    logo: () => { const n = findNode(m.shell()!.screen.root, 'DNASLogo')!; return { visible: n.visible, opacity: n.opacity }; },
    loc,
  };
  const face = textFace();
  const parts = new DialogPartsHost({ popupObject: () => m.queue.popupObject, face: () => face, locText: (id) => loc.byId.get(id) ?? null });
  const host = new UiCommandHost({ node: parts.nodeCommand });
  let opened = '', builtName = '';
  const lookup = dialogLookup([readerc, readerx]);
  const dispatch = host.dispatch.bind(host);
  host.dispatch = (cmd: ZAnimUiCommand, time) => {
    if (cmd.node !== null && cmd.loc !== 0) r.captions.push({ tick: r.frame, node: cmd.node, id: cmd.loc });
    const o = dispatch(cmd, time);
    r.outcomes.push({ tick: r.frame, dialog: builtName, o });
    return o;
  };
  const input = new MenuInput({ machine: () => m, parts });
  input.register(host);
  input.source = { read: () => ({ down: new Set(), stickX: 0, stickY: 0 }) };
  const uiVars = new UiVarManager();
  new MenuCommands({ valves: () => m.valves, uiVars, inputString: (cmd) => m.shell()?.inputString(cmd.anim) ?? null, event: (kind) => { m.shell()?.event(kind); } }).register(host);
  new DnasCommands({ valves: () => m.valves, ...(holdSeconds === undefined ? {} : { holdSeconds }) }).register(host);
  const slot = new PopupSlot();
  slot.connect(parts.makePopup);
  const movie = {
    service: { background: { on: () => true, off: () => true }, play: () => {} } as unknown as MovieService,
    frame: () => 'menu' as const, unload: () => {}, load: () => input.built(),
  };
  m = new FrontEndMachine({
    dialog: (n) => { opened = n; return lookup(n); }, sets, random, host, popups: slot, startDialog: DIALOG,
    built: (b) => { parts.built(b); builtName = opened; r.builds.push({ tick: r.frame, name: opened }); }, draw: parts.draw, widgetsTick: parts.widgetsTick, setEnabled: parts.setEnabled,
    input: input.dispatch, pad: input.read, activate: input.activate, movie,
  });
  m.boot();
  r.m = m;
  r.tick = () => { r.frame++; m.frame(UI_TICK_SECONDS); return m.shell()?.currentName ?? ''; };
  r.run = (n) => { for (let i = 0; i < n; i++) r.tick(); };
  return r;
}

describe.skipIf(!HAVE_DISC)(`the DNAS screen over the disc${HAVE_DISC ? '' : ' (no SOCOM_DISC / SOCOM_PC_ROOT)'}`, () => {
  it('the captions the set names are the disc\'s (UIMnLOC): CONNECTING, CONNECTING TO INTERNET, AUTHENTICATING DNAS DATA, LOCATING ...', () => {
    const r = rig(0);
    for (const [id, text] of Object.entries(TEXTS)) expect(r.loc.byId.get(Number(id)), id).toBe(text);
  });

  it('init_socom_online runs through the real bodies to dlgNetServerSelect: no row of this dialog is left to a later task', () => {
    const r = rig(0);
    r.run(200);                                                        // ~6.7 s: the 2-s WAIT, the workers, the switch's fade
    expect(r.builds.map((b) => b.name)).toEqual([DIALOG, NEXT]);
    expect(r.notImplemented(DIALOG)).toEqual([]);
    // Every ONSTART row hit on this dialog, by name: this task's five and MENU-01a's card rows (`Ensure_MC_Dirs_Fast`, `has_memcard_changed`).
    for (const row of ['InitNetwork', 'DNASAuthenticate', 'DMEInit', 'MediusInit', 'GetServerList', 'MC_Exists', 'MC_Changed', 'SwitchMenu']) {
      expect(r.hits(row, DIALOG).length, row).toBeGreaterThan(0);
    }
    expect(r.hits('MC_Exists', DIALOG)).toHaveLength(2);               // Ensure_MC_Dirs_Fast: `..` and the save folder (neither on the empty card)
    expect(r.hits('MC_ChDir', DIALOG)).toHaveLength(0);
    expect(r.m.valves.find('success')!.value).toBe(1);
    expect(r.m.valves.find('DNASInProgress')!.value).toBe(0);
    expect(r.m.valves.find('DNAS_ERROR_CODE')).toBeUndefined();         // the bypass acquires none (D:L170486-170494 never run)
    expect(r.m.valves.find('socom_online_initialized')?.value ?? 0).toBe(0);   // R128.9: only ever set to 0; the guard passes
    // SELECT UNIVERSE's own ONSTART (`enter_server_select`) is ONL-04's: its rows are what is left, on the next dialog.
    expect(r.notImplemented(NEXT).map((l) => l.split(': ')[1])).toEqual(['LobbyDisconnect (ONL-04)', 'UpdateServerInfo (ONL-04)']);
  }, 120_000);

  it('DNASAuthenticate is done on its first tick; InitNetwork and GetServerList take two (start, then ended); DMEInit and MediusInit one', () => {
    const r = rig(0);
    r.run(200);
    expect(r.hits('DNASAuthenticate', DIALOG)).toEqual([T.dnas]);
    expect(r.hits('InitNetwork', DIALOG)).toEqual([T.onstart, T.initDone]);
    expect(r.hits('GetServerList', DIALOG)).toEqual([T.dnas, T.switch]);
    expect(r.hits('DMEInit', DIALOG)).toEqual([T.dnas]);
    expect(r.hits('MediusInit', DIALOG)).toEqual([T.dnas]);
    expect(r.hits('MC_Exists', DIALOG)).toEqual([T.waitDone, T.waitDone]);   // the blocking CALL's tick, both timeless
    expect(r.hits('MC_Changed', DIALOG)).toEqual([T.dnas]);                 // has_memcard_changed's first poll (its 1.5-s loop never comes round again)
    expect(r.hits('SwitchMenu', DIALOG)).toEqual([T.switch]);
  }, 120_000);

  it('the captions change in the set\'s order (R128.7): bar_title #448, the state #534, #535, #535, bar_title #536, the state #537', () => {
    const r = rig(0);
    r.tick();
    // DNAS_FIRST_FRAME_READING, the port's answer: the build's frame draws the layout's captions as written (the
    // layout's `_533_AUTHENTICATING_MSG` and `_446_START_MSG`; PLAT-14 draws a caption it cannot resolve as its name);
    // the ONSTART animation starts at the build and runs its first ops on the next tick (research 106 §2: a
    // just-started instance is set up, then stepped), so #448 / #534 stand from the second frame.
    expect(r.text('bar_title')).toBe('_533_AUTHENTICATING_MSG');
    expect(r.text('ONLINE_LOBBY_STATE')).toBe('_446_START_MSG');
    r.tick();
    expect(r.text('bar_title')).toBe(TEXTS[448]);
    expect(r.text('ONLINE_LOBBY_STATE')).toBe(TEXTS[534]);
    r.run(T.waitDone - 2);
    expect(r.text('ONLINE_LOBBY_STATE')).toBe(TEXTS[535]);
    r.tick();
    expect(r.text('bar_title')).toBe(TEXTS[536]);
    expect(r.text('ONLINE_LOBBY_STATE')).toBe(TEXTS[537]);
    r.run(200);
    const inOrder = r.captions.filter((c) => c.tick <= T.switch).map((c) => [c.node, c.id]);
    expect(inOrder).toEqual(CAPTION_ORDER);
    expect(r.captions.filter((c) => c.tick <= T.switch).map((c) => c.tick)).toEqual([T.onstart, T.onstart, T.waitDone, T.dnas, T.dnas, T.dnas]);
    for (const c of r.captions) expect(r.loc.byId.has(c.id), String(c.id)).toBe(true);
  }, 120_000);

  it('the logo: the layout\'s on the build\'s frame, hidden by ONSTART, shown with the DNAS step; TurnOn and TurnOff overlap (DNAS_LOGO_OVERLAP_READING) and it stands at 0.96 to the unload', () => {
    const r = rig(0);
    r.tick();
    expect(r.logo()).toEqual({ visible: true, opacity: 1 });          // the layout's node, before ONSTART's HIDE
    r.tick();
    expect(r.logo().visible).toBe(false);                              // HIDE DNASLogo (init_socom_online's third op)
    r.run(T.waitDone - 2);
    // TurnOnLogo: SHOW, then 0 -> 1 in 0.8 s (a rate of 1.25/s: 0.0417 a tick); its first step lands on the WAIT's last tick.
    expect(r.logo().visible).toBe(true);
    expect(r.logo().opacity).toBeCloseTo(0.0417, 3);
    r.tick();
    // DNASAuthenticate done at once: TurnOffLogo (1 -> 0 in 0.8 s) starts the same tick, its begin writing 1 and its first
    // step -0.0417; from here both motions tick the one node and their rates cancel (research 106 §2: both instances
    // live in the scheduler's list; `FUN_0025f880`'s step is `+= rate x dt`), so the logo stands at 0.96 ...
    expect(r.logo()).toEqual({ visible: true, opacity: expect.closeTo(0.9583, 3) as number });
    r.run(T.nextBuild - T.dnas - 1);
    expect(r.m.shell()!.currentName).toBe(NEXT);
    expect(r.builds).toHaveLength(1);
    expect(r.logo()).toEqual({ visible: true, opacity: expect.closeTo(0.9583, 3) as number });
    // ... until the switch's unload: neither motion's 0.8 s (24 ticks) has run out when SELECT UNIVERSE is built.
    r.tick();
    expect(r.builds.map((b) => b.name)).toEqual([DIALOG, NEXT]);
  }, 120_000);

  it('the timing (the transcription at PLAT-12\'s tick): SWITCHMENU on the tick GetServerList ends; SELECT UNIVERSE built 15 + 3 + 1 ticks later, 2.77 s in', () => {
    const r = rig(0);
    r.run(200);
    expect(r.builds).toEqual([{ tick: T.build, name: DIALOG }, { tick: T.nextBuild, name: NEXT }]);
    expect(T.nextBuild).toBe(83);
    expect(r.hits('SwitchMenu', DIALOG)).toEqual([r.hits('GetServerList', DIALOG)[1]]);
    // The switch record is consumed on the shell's A5 of the same frame; then the fade to black (15 ticks of 2/29.97
    // per tick), the three-frame countdown and the dispatch (research 115 §4.1; research 139 §5 measured the same 19).
    expect((T.nextBuild - T.build) * UI_TICK_SECONDS).toBeCloseTo(2.736, 2);
  }, 120_000);

  it('OT.R20: with the owner\'s hold the disc\'s own set holds DNASAuthenticate 90 ticks: the switch at 154, SELECT UNIVERSE built on 173, 5.7 s in', () => {
    const r = rig();
    r.run(300);
    expect(DNAS_HOLD_TICKS).toBe(90);
    expect(r.hits('DNASAuthenticate', DIALOG)).toEqual(Array.from({ length: DNAS_HOLD_TICKS + 1 }, (_, i) => T.dnas + i));
    expect(r.hits('SwitchMenu', DIALOG)).toEqual([T.switch + DNAS_HOLD_TICKS]);
    expect(r.builds).toEqual([{ tick: T.build, name: DIALOG }, { tick: T.nextBuild + DNAS_HOLD_TICKS, name: NEXT }]);
    expect(T.nextBuild + DNAS_HOLD_TICKS).toBe(173);
    expect(r.captions.filter((c) => c.tick > T.waitDone && c.tick < T.dnas + DNAS_HOLD_TICKS)).toEqual([]);   // #535 stands through the hold
  }, 120_000);
});
