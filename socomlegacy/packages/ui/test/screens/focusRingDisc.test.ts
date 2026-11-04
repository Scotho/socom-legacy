import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { parseAnimSets } from '@s2u/scene';
import { frontEndSoundTable, soundHash } from '@s2u/sound';
import { UI_TICK_SECONDS } from '../../src/clock/uiClock';
import { findNode } from '../../src/compositor/scene';
import { UiCommandHost, type UiCommandOutcome } from '../../src/uiCommands';
import { UiVarManager } from '../../src/uiVars';
import { VALVE_TYPE } from '../../src/valves';
import { MenuInput } from '../../src/input/menuInput';
import type { PadSlotName } from '../../src/input/padStates';
import { UiSoundCues, type UiSoundOutput } from '../../src/sounds/uiSoundCues';
import { dialogLookup } from '../../src/screens/dialogArchive';
import { DialogPartsHost } from '../../src/screens/dialogParts';
import { DnasCommands } from '../../src/screens/dnasCommands';
import { FrontEndMachine } from '../../src/screens/frontEndMachine';
import { MenuCommands, type MenuCardIo } from '../../src/screens/menuCommands';
import { NetLoginCommands, type NetCnfIop, type NetCnfListView } from '../../src/screens/netLoginCommands';
import { PopupSlot } from '../../src/screens/popupSlot';
import { UniverseCommands, UniverseList, type UniverseEntry, type UniverseReply } from '../../src/screens/universeCommands';
import type { ButtonWidget } from '../../src/widgets/button';
import type { ListboxWidget } from '../../src/widgets/listbox';
import type { MovieService } from '../../src/movie/movieCommands';
import type { ZAnimTraceEvent } from '../../src/zanimRuntime';
import { textFace } from '../text/fixtures';

/**
 * FOCUS-RING over the disc's own dialogs (web research 116 §17): which control holds the focus when a dialog of the
 * online path is built, and what the pad then reaches. The rule under test is the original's: every `CONTROLS` entry is
 * on the ring in file order (`FUN_00367950` D:L263627-263651); a control's enabled bit (+0x14 bit 7, read by every
 * class's +0x48 = 0x1fe270) is what its class's creation leaves -- cleared for an IMAGE and a PROGRESSBAR by the plain
 * bitmap's constructor (`FUN_0020cd50` D:L65834-65853, its copy in `FUN_00382ff0` D:L278176), cleared for the text
 * family by the text's set-up (`FUN_003792f0` D:L273066), set for the button family, the LISTBOX (`FUN_0037e8b0`
 * D:L275854, set again after its bitmap base cleared it) and the MAPCONTROL; the build focuses index 0 when it is
 * enabled, else steps forward to the first enabled control (D:L263735-263745, `FUN_003670d0`).
 *
 * The references: USER AGREEMENT shows ACCEPT lit on arrival with no press (`logs/parity/s4_pcsx2/A_43_eula.png`, the
 * recomp's `08_eula.png`, `scripts/parity/refs/eula.png`); SELECT UNIVERSE shows the list active
 * (`logs/parity/s4_pcsx2/A_34_universe.png`); LOGIN shows LOGIN lit (`A_31.png`).
 *
 * The files come from the disc (`SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`) or the committed fixtures
 * (`S2U_TEST_FIXTURES`, else `test-fixtures/`): it runs in CI. USER AGREEMENT's three ONSTART rows (`RefreshRoomList`,
 * `GetFriendInvitations`, `GetUsagePolicy`: ONL-11, ONL-24, ONL-08) are stubs here -- their bodies are other streams'.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(dirname(fileURLToPath(import.meta.url)), '../../../../test-fixtures');
const from = (root: string, p: string): Uint8Array | null => (root !== '' && existsSync(join(root, p)) ? new Uint8Array(readFileSync(join(root, p))) : null);
const file = (p: string): Uint8Array | null => from(DISC, p) ?? from(FIXTURES, p);
const READERC = file('RUN/UI/READERC.ZAR'), UIZANIM = file('RUN/UIZANIM.ZAR');
const HAVE = READERC !== null && UIZANIM !== null;

const h = (name: string): string => String(soundHash(name));
const SOUND_SCRIPT = ['SETS', ['HUDUI', ['.DINK', '.METAL', '.TCM_SLIDE', '.BACK', '.TYPE'].map((n) => [h(n), 'ONESHOT', []])], 'GROUPS', []];
const LOGIN_ENTRY = { flags: 0, key: 'Combination1', name: 'Setting 1', hardware: 'SCE/Ethernet (Network Adaptor)' } as const;
const universe = (over: Partial<UniverseEntry> = {}): UniverseEntry => ({
  status: 0, name: 'First', dns: '', port: 0, description: 'One', universeStatus: 1, userCount: 0, maxUsers: 256,
  billing: '', billingName: '', extendedInfo: '', endOfList: false, ...over,
});
const TWO: UniverseReply = {
  universes: [universe(), universe({ name: 'Second', description: 'Two', endOfList: true })],
  news: [{ status: 0, news: 'News.', endOfList: true }],
};
/** An agreement long enough to run past `usage_policy`'s HEIGHT (180 at SPACING 20: nine rows). */
const POLICY = Array.from({ length: 40 }, (_, i) => `Clause ${i + 1} of the agreement, long enough to fill a line of the plate.`).join(' ');

/** `answers`: rows of later tasks answered as a capture's situation has them (the sweep names each). */
function rig(start: string, answers: Readonly<Record<string, boolean>> = {}) {
  const readerc = Zar.parse(READERC!);
  const sets = parseAnimSets(Zar.parse(UIZANIM!)).sets;
  const lookup = dialogLookup([readerc]);
  let seed = 1;
  const random = (): number => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed; };
  let m!: FrontEndMachine;
  const face = textFace();
  const uiVars = new UiVarManager();
  const parts = new DialogPartsHost({ popupObject: () => m.queue.popupObject, face: () => face, uiVars });
  const sound: UiSoundOutput = { play() {}, stopAll() {}, fadeAll() {}, streaming() {} };
  const cues = new UiSoundCues(frontEndSoundTable(SOUND_SCRIPT as never, new Map([['HUDUI', { names: new Map<string, number>() }]])), { teletype: '.TYPE', back: '.BACK', selection: '.METAL' }, [], sound);
  const host = new UiCommandHost({ node: parts.nodeCommand, sound: (cmd) => { cues.sound(cmd); } });
  let opened = '', builtName = '';
  /** Every table command dispatched: the dialog built then, the row's name, the argument, whether a body answered it. */
  const outcomes: { dialog: string; row: string; arg: string; kind: UiCommandOutcome['kind'] }[] = [];
  const dispatch = host.dispatch.bind(host);
  host.dispatch = (cmd, time) => {
    const o = dispatch(cmd, time);
    if (o.kind === 'table' || o.kind === 'not-implemented') outcomes.push({ dialog: builtName, row: o.row.name, arg: cmd.arg, kind: o.kind });
    return o;
  };
  const input = new MenuInput({ machine: () => m, parts });
  input.register(host);
  let held: PadSlotName | null = null;
  input.source = { read: () => ({ down: new Set<PadSlotName>(held ? [held] : []), stickX: 0, stickY: 0 }) };
  for (const [name, entry] of Object.entries(cues.entries())) host.setHandler(name, (cmd) => entry(cmd));
  const inserted = { result: 0, type: 2, format: 1 };
  const card: MenuCardIo = { getInfo: () => inserted, getDir: () => ({ result: -4 }), chdir: () => ({ result: -4 }), mkdir: () => -4 };
  new MenuCommands({ valves: () => m.valves, uiVars, inputString: (cmd) => m.shell()?.inputString(cmd.anim) ?? null, event: (kind) => { m.shell()?.event(kind); }, card }).register(host);
  const lists: Record<string, NetCnfListView> = { 'mc0:': { result: 1, entries: [LOGIN_ENTRY] }, 'mc1:': { result: 0, entries: [] } };
  const iop: NetCnfIop = {
    combinationList: (d) => lists[d] ?? { result: 0, entries: [] },
    selectCombination: (d, k) => (lists[d]?.entries.some((e) => e.key === k) ? 0 : -1),
    interfaces: () => [LOGIN_ENTRY.hardware],
  };
  new NetLoginCommands({ valves: () => m.valves, uiVars, iop, inputString: (cmd) => m.shell()?.inputString(cmd.anim) ?? null, event: (kind) => { m.shell()?.event(kind); } }).register(host);
  // SELECT UNIVERSE's list as the DNAS screen leaves it (research 147 §4: the deep link reads it before the build).
  const list = new UniverseList({ uiVars });
  new DnasCommands({ valves: () => m.valves, getServerList: () => list.job({ query: () => Promise.resolve(TWO) }) }).register(host);
  new UniverseCommands({ valves: () => m.valves, uiVars, list, lobbyDisconnect: () => {} }).register(host);
  for (const e of TWO.universes) list.entry(e);
  for (const n of TWO.news) list.newsChunk(n);
  // USER AGREEMENT's ONSTART rows, stubbed (ONL-11, ONL-24, ONL-08 own the bodies): the agreement's text into its var.
  host.setHandler('RefreshRoomList', () => true);
  host.setHandler('GetFriendInvitations', () => true);
  host.setHandler('GetUsagePolicy', () => { uiVars.set('UsagePolicy', { type: 'string', value: POLICY }); return true; });
  for (const [name, answer] of Object.entries(answers)) host.setHandler(name, () => answer);
  const slot = new PopupSlot();
  slot.connect(parts.makePopup);
  /** The focus the build itself left (D:L263735-263745), read as the build's hook returns: before any queued record. */
  const builds: { name: string; ring: string[]; focus: string | null; enabled: boolean }[] = [];
  const movie = {
    service: { background: { on: () => true, off: () => true }, play: () => {} } as unknown as MovieService,
    frame: () => 'menu' as const, unload: () => {},
    load: () => {
      input.built();
      const ring = input.ring();
      builds.push({ name: opened, ring: ring?.controls.map((c) => c.name) ?? [], focus: ring?.focused?.name ?? null, enabled: ring?.focused?.enabled() ?? false });
    },
  };
  const started: string[] = [];
  m = new FrontEndMachine({
    dialog: (n) => { opened = n; return lookup(n); }, sets, random, host, popups: slot, startDialog: start, build: { face: () => face },
    built: (b) => { parts.built(b); builtName = opened; }, draw: parts.draw, widgetsTick: parts.widgetsTick, setEnabled: parts.setEnabled,
    input: input.dispatch, pad: input.read, activate: input.activate, movie,
    trace: (e: ZAnimTraceEvent) => { if (e.kind === 'start') started.push(e.anim); },
  });
  m.boot();
  const frame = (): void => { m.frame(UI_TICK_SECONDS); };
  const run = (n: number): void => { for (let i = 0; i < n; i++) frame(); };
  const press = (name: PadSlotName, settle = 2): void => { held = name; frame(); held = null; for (let i = 0; i < settle; i++) frame(); };
  const focused = (): string | null => input.ring()?.focused?.name ?? null;
  const widget = <T>(name: string): T => parts.current!.widgets.get(name) as T;
  const scroll = (node: string): number => {
    const c = findNode(m.shell()!.screen.root, node)?.content;
    return c?.kind === 'wrapped' ? c.scroll : NaN;
  };
  return { m, input, parts, uiVars, run, press, focused, widget, scroll, outcomes, started, builds, dialog: () => m.shell()?.currentName ?? '' };
}

const AGREEMENT = 'dlgUsagePolicy.rdr', SELECT = 'dlgNetServerSelect.rdr', LOGIN = 'dlgNetLogin.rdr';
/** 3.1 s at the UI tick: LOGIN's ONSTART is the longest of the path (`SuspendMenuInput(3.0)`, research 144 §6). */
const SETTLED = 93;

describe.skipIf(!HAVE)(`the focus a dialog of the online path is built with${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('USER AGREEMENT (dlgUsagePolicy): ACCEPT holds the focus on arrival, with no press (A_43, 08_eula, refs/eula)', () => {
    const t = rig(AGREEMENT);
    t.run(SETTLED);
    // CONTROLS: teletype_plate (an IMAGE: its plain bitmap is built disabled, D:L278176), YesAccept, NoAccept.
    expect(t.input.ring()!.controls.map((c) => c.name)).toEqual(['teletype_plate', 'YesAccept', 'NoAccept']);
    expect(t.focused()).toBe('YesAccept');
    expect(t.builds[0]).toMatchObject({ name: AGREEMENT, focus: 'YesAccept', enabled: true });   // the build's own focus, no script's
    expect(t.widget<ButtonWidget>('YesAccept').look.state).toBe('ACTIVE');
    expect(t.widget<ButtonWidget>('NoAccept').look.state).toBe('NORMAL');
  });

  it('USER AGREEMENT: DOWN and UP scroll the agreement (the screen\'s bindings), and the focus stays on ACCEPT', () => {
    const t = rig(AGREEMENT);
    t.run(SETTLED);
    expect(t.focused()).toBe('YesAccept');
    expect(t.scroll('usage_policy')).toBe(0);
    t.press('DOWN');
    expect(t.started).toContain('scroll_policy_down');
    expect(t.scroll('usage_policy')).toBe(20);                       // one SPACING (20): usage_policy Scroll_Down, FUN_00379b10
    expect(t.focused()).toBe('YesAccept');
    t.press('UP');
    expect(t.started).toContain('scroll_policy_up');
    expect(t.scroll('usage_policy')).toBe(0);
    expect(t.focused()).toBe('YesAccept');
  });

  it('USER AGREEMENT: LEFT and RIGHT move between ACCEPT and DECLINE (activate_no / activate_yes: ActivateButton)', () => {
    const t = rig(AGREEMENT);
    t.run(SETTLED);
    t.press('RIGHT');
    expect(t.focused()).toBe('NoAccept');
    expect([t.widget<ButtonWidget>('YesAccept').look.state, t.widget<ButtonWidget>('NoAccept').look.state]).toEqual(['NORMAL', 'ACTIVE']);
    t.press('RIGHT');
    expect(t.focused()).toBe('YesAccept');
    t.press('LEFT');
    expect(t.focused()).toBe('NoAccept');
    t.press('LEFT');
    expect(t.focused()).toBe('YesAccept');
    expect(t.started.filter((a) => a === 'activate_no' || a === 'activate_yes')).toEqual(['activate_no', 'activate_yes', 'activate_no', 'activate_yes']);
  });

  it('USER AGREEMENT: CROSS on ACCEPT runs ForceUsagePolicyReturn -- SWITCHMENU(dlgWorldOfSOCOM.rdr) with UsagePolicyReturnScreen 1, else SWITCHMENU(PREVIOUS_SCREEN)', () => {
    for (const [valve, arg] of [[1, 'dlgWorldOfSOCOM.rdr'], [0, 'PREVIOUS_SCREEN']] as const) {
      const t = rig(AGREEMENT);
      t.run(SETTLED);
      expect(t.focused()).toBe('YesAccept');
      t.m.valves.set('UsagePolicyReturnScreen', valve, VALVE_TYPE.TEMP);   // 1 is dlgNetConnect's, on the way in
      const before = t.outcomes.length;
      t.press('CROSS', 4);
      expect(t.started).toContain('ForceUsagePolicyReturn');
      const after = t.outcomes.slice(before).filter((o) => o.dialog === AGREEMENT).map((o) => `${o.row}(${o.arg})`.toLowerCase());
      expect(after.filter((x) => x.startsWith('switchmenu'))).toEqual([`switchmenu(${arg.toLowerCase()})`]);
    }
  });

  it('SELECT UNIVERSE (dlgNetServerSelect): the list holds the focus on arrival, its first row active (A_34)', () => {
    const t = rig(SELECT);
    t.run(SETTLED);
    // CONTROLS: MainWindow (an IMAGE, built disabled), SERVERLIST (a LISTBOX: FUN_0037e8b0 sets its bit, D:L275854).
    expect(t.input.ring()!.controls.map((c) => c.name)).toEqual(['MainWindow', 'SERVERLIST']);
    expect(t.builds[0]).toMatchObject({ name: SELECT, focus: 'SERVERLIST', enabled: true });
    expect(t.focused()).toBe('SERVERLIST');
    const l = t.widget<ListboxWidget>('SERVERLIST');
    expect([l.state, l.count, l.focus]).toEqual(['active', 2, 0]);
  });

  it('SELECT UNIVERSE: DOWN and UP move the list\'s row (PADHOG keeps the pad at its ends); CROSS runs select_server', () => {
    const t = rig(SELECT);
    t.run(SETTLED);
    const l = t.widget<ListboxWidget>('SERVERLIST');
    expect([t.focused(), l.focus]).toEqual(['SERVERLIST', 0]);
    t.press('DOWN');
    expect([t.focused(), l.focus]).toEqual(['SERVERLIST', 1]);
    expect(t.m.valves.find('SELECTED_SERVER')!.value).toBe(1);       // ONFOCUS: ChangeServerFocus
    t.press('DOWN');                                                 // the last row: PADHOG, the focus does not leave the list
    expect([t.focused(), l.focus, l.state]).toEqual(['SERVERLIST', 1, 'active']);
    t.press('UP');
    expect([t.focused(), l.focus]).toEqual(['SERVERLIST', 0]);
    t.press('UP');                                                   // the first row: PADHOG
    expect([t.focused(), l.focus, l.state]).toEqual(['SERVERLIST', 0, 'active']);
    const before = t.outcomes.length;
    t.press('CROSS');
    expect(t.started).toContain('select_server');
    // select_server opens on `IF VerifyPatchLevel(INPUT_STRING)` (ONL-05's row, declared on this base): it was dispatched.
    expect(t.outcomes.slice(before).map((o) => `${o.row}(${o.arg})`)[0]).toBe('VerifyPatchLevel(INPUT_STRING)');
  });

  /** The game lobby as `A_53` has it: the host, SWITCH TEAMS enabled (ONL-16's rows, declared on this base). */
  const HOST = { IsSessionMaster: true, IsSwitchTeamsOK: true };

  /**
   * The sweep: every dialog of the online path the disc holds (research 128's chapters; research 116 §17.4 is this
   * table with its sources). `ring`: the CONTROLS count. `build`: the control the build's own focus rests on, by the
   * rule (`*` before it when it is disabled: no control of the ring is enabled and nothing is active). `settled`: the
   * focus once the dialog's ONSTART scripts have run -- where it differs from `build` an ONSTART script's
   * `ActivateButton` moved it (the queue's record 6, after the build). `answers`: rows of later tasks answered as the
   * capture's situation has them; every other row of a later task answers as PLAT-08's table declares it.
   */
  const SWEEP: readonly [dialog: string, ring: number, build: string | null, settled: string | null, answers?: Record<string, boolean>][] = [
    ['dlgMPswitch.rdr', 0, null, null],                              // no CONTROLS; its ONSTART switches to LOGIN
    [LOGIN, 10, 'login_btn', 'login_btn'],                           // LOGIN lit (A_31): OpenCardOne's ActivateButton(login_btn)
    ['dlgNetAuthenticate.rdr', 0, null, null],                       // no CONTROLS
    [SELECT, 2, 'SERVERLIST', 'SERVERLIST'],                         // the list active (A_34): the build's own
    ['dlgNetPlayerName.rdr', 10, 'playername_btn', 'playername_btn'],   // PLAYER NAME lit (A_35)
    ['dlgNetConnect.rdr', 1, '*ConnectAnim', '*ConnectAnim'],        // one TEXT, disabled: nothing active
    [AGREEMENT, 3, 'YesAccept', 'YesAccept'],                        // ACCEPT lit (A_43): the build's own
    ['dlgWorldOfSOCOM.rdr', 28, 'LadderTop10', 'popup_motd_button'], // SERVER NEWS up on the first arrival (A_44): init_screen
    ['dlgMPBriefingRoom.rdr', 91, 'PLAYERLIST', 'JoinGame'],         // JOIN GAME lit (A_48): OnBriefingRoomstart
    ['dlgCreateGame.rdr', 101, 'gamename_btn', 'gamename_btn'],      // GAME NAME lit (A_49)
    ['dlgGameLobby.rdr', 15, 'B_SPECLIST', 'Glswitchteams', HOST],   // SWITCH TEAMS at first; ARMORY after the ten-count (A_53): below
  ];

  it('the sweep: the initial focus of every dialog of the online path, by the build and after ONSTART', () => {
    const mark = (name: string | null, enabled: boolean): string | null => (name === null ? null : enabled ? name : `*${name}`);
    const seen = SWEEP.map(([dialog, , , , answers]) => {
      const t = rig(dialog, answers);
      t.run(1);
      const b = t.builds[0]!;
      expect(b.name).toBe(dialog);
      t.run(SETTLED);
      // A dialog that switched away (dlgMPswitch to LOGIN) has no settled focus of its own.
      const ring = t.dialog() === dialog ? t.input.ring() : null;
      return [dialog, b.ring.length, mark(b.focus, b.enabled), ring ? mark(ring.focused?.name ?? null, ring.focused?.enabled() ?? false) : null];
    });
    expect(seen).toEqual(SWEEP.map((r) => r.slice(0, 4)));
  }, 120_000);

  it('GAME LOBBY, the host: ONSTART disables the lists, SWITCH TEAMS takes the focus, and ARMORY takes it when the ten-count ends (A_53)', () => {
    const t = rig('dlgGameLobby.rdr', HOST);
    t.run(SETTLED);
    // Enable_SM_Launch queues, in one frame, ActivateButton(Glswitchteams) ... ActivateButton(weaponselect): the queue
    // is read newest first (research 115 R115.2), so SWITCH TEAMS is activated last and holds the focus.
    expect(t.focused()).toBe('Glswitchteams');
    const bit = (name: string): boolean => t.input.ring()!.controls.find((c) => c.name === name)!.enabled();
    expect(['B_SPECLIST', 'B_SEALLIST', 'B_REDLIST', 'weaponselect'].map(bit)).toEqual([false, false, false, false]);
    // ArmButtonClock: ten WAIT 1, then (the host) ActivateButton(weaponselect), EnableButton(weaponselect). A_53 is this
    // state: the #350 popup still up, ARMORY lit, SWITCH TEAMS enabled and not lit. (READY, disabled in A_53, follows
    // the 45-second clock `mp_45_sec_clock`, ONL-16: not held here.)
    t.run(330 - SETTLED);
    expect(t.focused()).toBe('weaponselect');
    expect([t.widget<ButtonWidget>('weaponselect').look.state, t.widget<ButtonWidget>('Glswitchteams').look.state]).toEqual(['ACTIVE', 'NORMAL']);
    const shell = t.m.shell()!;
    expect(shell.popups.shown(shell.screen)).toBe(true);
  }, 120_000);
});
