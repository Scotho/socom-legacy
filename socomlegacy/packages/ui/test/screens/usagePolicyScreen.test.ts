import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { locTable, parseAnimSets, readLocArchive } from '@s2u/scene';
import { UI_TICK_SECONDS } from '../../src/clock/uiClock';
import { findNode } from '../../src/compositor/scene';
import { UiCommandHost, type UiCommandOutcome } from '../../src/uiCommands';
import { UiVarManager } from '../../src/uiVars';
import { MenuInput } from '../../src/input/menuInput';
import type { PadSlotName } from '../../src/input/padStates';
import { dialogLookup } from '../../src/screens/dialogArchive';
import { DialogPartsHost } from '../../src/screens/dialogParts';
import { FrontEndMachine } from '../../src/screens/frontEndMachine';
import { REBOOT_LAUNCH, type Launch } from '../../src/screens/launch';
import { MenuCommands } from '../../src/screens/menuCommands';
import { NetLoginCommands } from '../../src/screens/netLoginCommands';
import { PopupSlot } from '../../src/screens/popupSlot';
import { UsagePolicyCommands, type UsagePolicyChunk, type UsagePolicyService } from '../../src/screens/usagePolicyCommands';
import type { MovieService } from '../../src/movie/movieCommands';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import { textFace } from '../text/fixtures';

/**
 * ONL-08 over the machine (web research 156 §1.5): USER AGREEMENT (`dlgUsagePolicy.rdr`) built from the disc's own
 * layout and set (`RUN/UI/READERC.ZAR`, `RUN/UIZANIM.ZAR`) with the modules of the path in PLAT-08's host -- the screens'
 * rows, PLAT-11's input, MENU-01a's, ONL-01's NetCnf rows and this task's two -- and a fake policy service standing for
 * SVC-05's `/texts/policy` (the chunks as `packages/central/src/serverTexts.ts` answers them). Reached by the deep link
 * (`--menu_state`): the original reaches it from `dlgNetConnect` (ONL-07's, a parallel stream), which sets
 * `UsagePolicyReturnScreen` to 1; the test sets that valve itself. The persona's name is the UI variable
 * `PLAYERNAMEVAR` the layout's `playername` TEXT reads (ONL-06 writes it; the test sets it). The files come from the
 * disc (`SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`) or the committed fixtures: it runs in CI.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(dirname(fileURLToPath(import.meta.url)), '../../../../test-fixtures');
const from = (root: string, p: string): Uint8Array | null => (root !== '' && existsSync(join(root, p)) ? new Uint8Array(readFileSync(join(root, p))) : null);
const file = (p: string): Uint8Array | null => from(DISC, p) ?? from(FIXTURES, p);
const READERC = file('RUN/UI/READERC.ZAR'), UIZANIM = file('RUN/UIZANIM.ZAR'), LOC = file('RUN/LOCALE/STATES/UIMNLOC.ZAR');
const HAVE = READERC !== null && UIZANIM !== null && LOC !== null;

const AGREEMENT = 'dlgUsagePolicy.rdr', WORLD = 'dlgWorldOfSOCOM.rdr';
const EULA: UsagePolicyChunk[] = [{ status: 0, policy: 'EULA', endOfText: true }];

interface RigOptions { service?: UsagePolicyService; name?: string; returnScreen?: number }

function rig(o: RigOptions = {}) {
  const readerc = Zar.parse(READERC!);
  const sets = parseAnimSets(Zar.parse(UIZANIM!)).sets;
  const loc = locTable(readLocArchive(LOC!, 'UIMn').entries);
  let m!: FrontEndMachine;
  let frame = 0;
  const outcomes: { tick: number; dialog: string; fn: string; arg: string; o: UiCommandOutcome }[] = [];
  const builds: { tick: number; name: string }[] = [];
  const launches: Launch[] = [];
  const face = textFace();
  const uiVars = new UiVarManager();
  if (o.name !== undefined) uiVars.add('PLAYERNAMEVAR', { type: 'string', value: o.name }, 2);
  const parts = new DialogPartsHost({ popupObject: () => m.queue.popupObject, face: () => face, locText: (id) => loc.byId.get(id) ?? null, uiVars });
  const host = new UiCommandHost({ node: parts.nodeCommand });
  let opened = '', builtName = '';
  const dispatch = host.dispatch.bind(host);
  host.dispatch = (cmd: ZAnimUiCommand, time) => {
    const out = dispatch(cmd, time);
    outcomes.push({ tick: frame, dialog: builtName, fn: cmd.fn ?? '', arg: cmd.arg, o: out });
    return out;
  };
  const input = new MenuInput({ machine: () => m, parts });
  input.register(host);
  let down = new Set<PadSlotName>();
  input.source = { read: () => ({ down, stickX: 0, stickY: 0 }) };
  new MenuCommands({ valves: () => m.valves, uiVars, inputString: (cmd) => m.shell()?.inputString(cmd.anim) ?? null, event: (kind) => { m.shell()?.event(kind); } }).register(host);
  new NetLoginCommands({ valves: () => m.valves, uiVars }).register(host);
  const queries: unknown[] = [];
  const service = o.service ?? { policy: (q) => { queries.push(q); return Promise.resolve(EULA); } };
  new UsagePolicyCommands({ uiVars, service }).register(host);
  const slot = new PopupSlot();
  slot.connect(parts.makePopup);
  const movie = { service: { background: { on: () => true, off: () => true }, play: () => {} } as unknown as MovieService, frame: () => 'menu' as const, unload: () => {}, load: () => input.built() };
  const lookup = dialogLookup([readerc]);
  m = new FrontEndMachine({
    dialog: (n) => { opened = n; return lookup(n); }, sets, host, popups: slot, startDialog: AGREEMENT, build: { face: () => face },
    built: (b) => { parts.built(b); builtName = opened; builds.push({ tick: frame, name: opened }); }, draw: parts.draw, widgetsTick: parts.widgetsTick, setEnabled: parts.setEnabled,
    input: input.dispatch, pad: input.read, activate: input.activate, movie, onLaunch: (l) => { launches.push(l); },
  });
  m.boot();
  if (o.returnScreen !== undefined) m.valves.acquire('UsagePolicyReturnScreen', 1).value = o.returnScreen;
  const tick = async (): Promise<void> => { frame++; m.frame(UI_TICK_SECONDS); await Promise.resolve(); };
  const run = async (n: number): Promise<void> => { for (let i = 0; i < n; i++) await tick(); };
  const press = async (name: PadSlotName): Promise<void> => { down = new Set([name]); await tick(); down = new Set(); await tick(); };
  const calls = (dialog: string) => outcomes.filter((x) => x.dialog === dialog).map((x) => `${x.fn}(${x.arg}) ${x.o.kind === 'not-implemented' ? `not implemented: ${x.o.task}` : x.o.kind}`);
  const text = (node: string): string[] => {
    const c = findNode(m.shell()!.screen.root, node)?.content;
    if (c?.kind === 'wrapped') return c.lines.map((l) => String.fromCharCode(...l.bytes));
    if (c?.kind === 'text') return [String.fromCharCode(...c.text.codes)];
    return [];
  };
  const scroll = (node: string): number => { const c = findNode(m.shell()!.screen.root, node)?.content; return c?.kind === 'wrapped' ? c.scroll : NaN; };
  return { input, m, tick, run, press, builds, calls, text, scroll, uiVars, loc, queries, launches, outcomes, frame: () => frame };
}

describe.skipIf(!HAVE)(`USER AGREEMENT over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('the layout\'s captions are the disc\'s (UIMnLOC 756, 761-763, 150) and the popup\'s buttons #246 NO / #253 YES', () => {
    const r = rig();
    // Decoded texts (RS.R8); the glyph bytes for the pad's icons are the disc's.
    expect([756, 761, 762, 763, 246, 253, 150].map((id) => r.loc.byId.get(id))).toEqual([
      'USER AGREEMENT', '± µ to scroll the agreement up/down.', 'Retrieving User Agreement...',
      'Not accepting the User Agreement will disconnect you from SOCOM II Online. Are you sure you want to disconnect?', 'NO', 'YES', '¦ SELECT',
    ]);
  });

  it('ONSTART retrieve_usage: RefreshRoomList (ONL-11) and GetFriendInvitations (ONL-24) left to their tasks, GetUsagePolicy asks the service once', async () => {
    const r = rig({ name: 'socome' });
    await r.run(3);
    expect(r.builds.map((b) => b.name)).toEqual([AGREEMENT]);
    expect(r.calls(AGREEMENT)).toEqual([
      'RefreshRoomList(NA) not implemented: ONL-11', 'GetFriendInvitations(NA) not implemented: ONL-24', 'GetUsagePolicy(NA) table',
    ]);
    expect(r.queries).toEqual([{ type: 0 }]);
  });

  it('the agreement\'s text is the server\'s reply in usage_policy; the persona\'s name (PLAYERNAMEVAR) bottom left', async () => {
    const r = rig({ name: 'socome' });
    await r.run(3);
    expect(r.text('usage_policy')).toEqual(['EULA']);
    expect(r.text('playername')).toEqual(['socome']);
  });

  it('while the server has not answered: "Retrieving Usage Policy....." (GetUsagePolicy\'s own text over the caption #762)', async () => {
    const r = rig({ service: { policy: () => new Promise(() => {}) } });
    await r.run(3);
    expect(r.text('usage_policy')).toEqual(['Retrieving Usage Policy.....']);
  });

  it('the d-pad scrolls the text: DOWN one line on (op 5 Scroll_Down), UP back (op 4), held by the text\'s height', async () => {
    const long = Array.from({ length: 30 }, (_, i) => `Line ${i + 1} of a long agreement.`).join(' ');
    const r = rig({ service: { policy: () => Promise.resolve([{ status: 0, policy: long, endOfText: true }]) } });
    await r.run(3);
    expect(r.text('usage_policy').length).toBeGreaterThan(9);              // HEIGHT 180 at SPACING 20: more rows than it shows
    expect(r.scroll('usage_policy')).toBe(0);
    await r.press('DOWN');
    const one = r.scroll('usage_policy');
    expect(one).toBe(20);                                                // one SPACING
    await r.press('DOWN');
    expect(r.scroll('usage_policy')).toBe(40);
    await r.press('UP');
    expect(r.scroll('usage_policy')).toBe(one);
    expect(r.calls(AGREEMENT).filter((c) => c.endsWith('node'))).toHaveLength(3);   // usage_policy.op5 x2, op4: the set's scroll_policy_* bodies
  });

  it('the focus: the ring starts on ACCEPT, the first control built enabled -- teletype_plate is an IMAGE, built disabled (research 116 §17; the captures show ACCEPT lit)', async () => {
    const r = rig();
    await r.run(3);
    expect(r.input.ring()!.focused!.name).toBe('YesAccept');
    for (const b of ['DOWN', 'UP'] as const) { await r.press(b); expect(r.input.ring()!.focused!.name, b).toBe('YesAccept'); }   // UP and DOWN are the text's scroll
  });

  it('LEFT and RIGHT move between ACCEPT and DECLINE (activate_no / activate_yes: ActivateButton)', async () => {
    const r = rig();
    await r.run(3);
    r.input.activate('YesAccept');                                       // the set's own ActivateButton(YesAccept), standing for the captures' arrival focus
    await r.run(1);
    await r.press('RIGHT');
    expect(r.input.ring()!.focused!.name).toBe('NoAccept');
    await r.press('LEFT');
    expect(r.input.ring()!.focused!.name).toBe('YesAccept');
    await r.press('LEFT');
    expect(r.input.ring()!.focused!.name).toBe('NoAccept');
  });

  it('ACCEPT with UsagePolicyReturnScreen 1 (dlgNetConnect\'s): SWITCHMENU(dlgWorldOfSOCOM.rdr) -- ONL-09\'s screen is built next', async () => {
    const r = rig({ returnScreen: 1 });
    await r.run(3);
    r.input.activate('YesAccept');
    await r.run(1);
    await r.press('CROSS');
    await r.run(60);
    expect(r.calls(AGREEMENT).filter((c) => /SWITCHMENU/i.test(c))).toEqual(['SWITCHMENU(dlgWorldOfSOCOM.rdr) table']);
    expect(r.builds.map((b) => b.name)).toEqual([AGREEMENT, WORLD]);
  });

  it('ACCEPT with UsagePolicyReturnScreen not 1 (the agreement opened from elsewhere): SWITCHMENU(PREVIOUS_SCREEN) (R128.10)', async () => {
    const r = rig({ returnScreen: 0 });
    await r.run(3);
    r.input.activate('YesAccept');
    await r.run(1);
    await r.press('CROSS');
    await r.run(3);
    expect(r.calls(AGREEMENT).filter((c) => /SWITCHMENU/i.test(c))).toEqual(['SWITCHMENU(PREVIOUS_SCREEN) table']);
    expect(r.builds.map((b) => b.name)).toEqual([AGREEMENT]);            // a deep link: no history to pop
  });

  it('DECLINE: the #763 popup; NO (its first button) closes it and the agreement stays', async () => {
    const r = rig();
    await r.run(3);
    r.input.activate('NoAccept');
    await r.run(1);
    await r.press('CROSS');
    await r.run(2);
    expect(r.m.shell()!.popups.shown(r.m.shell()!.screen)).toBe(true);
    await r.press('CROSS');
    await r.run(3);
    expect(r.m.shell()!.popups.shown(r.m.shell()!.screen)).toBe(false);
    expect(r.calls(AGREEMENT).some((c) => c.startsWith('LobbyLogout'))).toBe(false);
    expect(r.builds.map((b) => b.name)).toEqual([AGREEMENT]);
    expect(r.launches).toEqual([]);
  });

  it('DECLINE, YES: the disconnect chain in the set\'s order, then the reboot to dlgAfterErrorReboot.rdr (N17\'s relaunch)', async () => {
    const r = rig();
    await r.run(3);
    r.input.activate('NoAccept');
    await r.run(1);
    await r.press('CROSS');
    await r.run(2);
    await r.press('RIGHT');
    await r.press('CROSS');
    await r.run(60);
    const chain = r.calls(AGREEMENT).slice(r.calls(AGREEMENT).indexOf('POPUPDIALOG(NA) table') + 2);
    expect(chain).toEqual([
      'SuspendMenuInput(3.0) table', 'LobbyLogout(NA) table', 'UnInitNetwork(NA) not implemented: ONL-10', 'NetCnfClose(NA) table',
      'NetCnfUnInit(NA) table', 'SWITCHMENU(REBOOT) table',
    ]);
    expect(r.launches).toEqual([{ elf: REBOOT_LAUNCH.elf, argv: ['--menu_state', 'dlgAfterErrorReboot.rdr', ''] }]);
    expect(r.builds.map((b) => b.name)).toEqual([AGREEMENT, 'dlgAfterErrorReboot.rdr']);
  });
});
