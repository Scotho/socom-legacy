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
import { DNAS_HOLD_TICKS, DnasCommands } from '../../src/screens/dnasCommands';
import { FrontEndMachine } from '../../src/screens/frontEndMachine';
import { MenuCommands } from '../../src/screens/menuCommands';
import { PopupSlot } from '../../src/screens/popupSlot';
import {
  SERVER_LIST_VAR, SERVER_NAME_VAR, UniverseCommands, UniverseList, type UniverseEntry, type UniverseReply, type UniverseService,
} from '../../src/screens/universeCommands';
import type { ListboxWidget } from '../../src/widgets/listbox';
import type { MovieService } from '../../src/movie/movieCommands';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import { textFace } from '../text/fixtures';

/**
 * ONL-04 over the machine (web research 147 §3): SELECT UNIVERSE (`dlgNetServerSelect.rdr`) built from the disc's own
 * layout and set (`RUN/UI/READERC.ZAR`, `RUN/UIZANIM.ZAR`) with every module of the path registered in PLAT-08's host --
 * the screens' rows, MENU-01a's, ONL-03's five with `GetServerList`'s worker over this task's `UniverseList`, and this
 * task's two -- and a fake universe service standing for SVC-05's server (the replies' fields as
 * `packages/central/src/serverTexts.ts` answers them). Reached the original's way, through the DNAS screen's
 * `init_socom_online`; and directly (a deep link: the list read before the build, as the DNAS screen leaves it). What is
 * pinned: the dialogs built; SERVERLIST's rows (the name, the ONLINE dot's texture, USERS, MAX USERS) from SERVER_LIST;
 * UNIVERSE NEWS (SERVER_NEWS) wrapped into `server_news`; the focus's ChangeServerFocus; L1 / L2 scrolling the news;
 * no row of the dialog's ONSTART left to a later task. The files come from the disc (`SOCOM_DISC`, else
 * `<SOCOM_PC_ROOT>/game/disc`) or the committed fixtures (`S2U_TEST_FIXTURES`, else `test-fixtures/`): it runs in CI.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(dirname(fileURLToPath(import.meta.url)), '../../../../test-fixtures');
const from = (root: string, p: string): Uint8Array | null => (root !== '' && existsSync(join(root, p)) ? new Uint8Array(readFileSync(join(root, p))) : null);
const file = (p: string): Uint8Array | null => from(DISC, p) ?? from(FIXTURES, p);
const READERC = file('RUN/UI/READERC.ZAR'), UIZANIM = file('RUN/UIZANIM.ZAR'), LOC = file('RUN/LOCALE/STATES/UIMNLOC.ZAR');
const HAVE = READERC !== null && UIZANIM !== null && LOC !== null;

const DNAS = 'dlgNetAuthenticate.rdr', SELECT = 'dlgNetServerSelect.rdr';

const entry = (over: Partial<UniverseEntry> = {}): UniverseEntry => ({
  status: 0, name: 'SOCOM II Local', dns: '', port: 0, description: 'Local universe for SOCOM II', universeStatus: 1, userCount: 0, maxUsers: 256,
  billing: '', billingName: '', extendedInfo: '', endOfList: true, ...over,
});
const ONE: UniverseReply = { universes: [entry()], news: [{ status: 0, news: 'Welcome to SOCOM II.', endOfList: true }] };

interface RigOptions { start?: string; service?: UniverseService; primed?: boolean }

function rig(o: RigOptions = {}) {
  const readerc = Zar.parse(READERC!);
  const sets = parseAnimSets(Zar.parse(UIZANIM!)).sets;
  const loc = locTable(readLocArchive(LOC!, 'UIMn').entries);
  let m!: FrontEndMachine;
  let frame = 0;
  const outcomes: { tick: number; dialog: string; o: UiCommandOutcome }[] = [];
  const builds: { tick: number; name: string }[] = [];
  const face = textFace();
  const uiVars = new UiVarManager();
  const parts = new DialogPartsHost({ popupObject: () => m.queue.popupObject, face: () => face, locText: (id) => loc.byId.get(id) ?? null, uiVars });
  const host = new UiCommandHost({ node: parts.nodeCommand });
  let opened = '', builtName = '';
  const dispatch = host.dispatch.bind(host);
  host.dispatch = (cmd: ZAnimUiCommand, time) => {
    const out = dispatch(cmd, time);
    outcomes.push({ tick: frame, dialog: builtName, o: out });
    return out;
  };
  const input = new MenuInput({ machine: () => m, parts });
  input.register(host);
  let down = new Set<PadSlotName>();
  input.source = { read: () => ({ down, stickX: 0, stickY: 0 }) };
  new MenuCommands({ valves: () => m.valves, uiVars, inputString: (cmd) => m.shell()?.inputString(cmd.anim) ?? null, event: (kind) => { m.shell()?.event(kind); } }).register(host);
  const service = o.service ?? { query: () => Promise.resolve(ONE) };
  const list = new UniverseList({ uiVars });
  const disconnects: number[] = [];
  new DnasCommands({ valves: () => m.valves, getServerList: () => list.job(service) }).register(host);
  new UniverseCommands({ valves: () => m.valves, uiVars, list, lobbyDisconnect: () => { disconnects.push(frame); } }).register(host);
  if (o.primed) { const r = ONE; for (const e of r.universes) list.entry(e); for (const n of r.news) list.newsChunk(n); }
  const slot = new PopupSlot();
  slot.connect(parts.makePopup);
  const movie = { service: { background: { on: () => true, off: () => true }, play: () => {} } as unknown as MovieService, frame: () => 'menu' as const, unload: () => {}, load: () => input.built() };
  const lookup = dialogLookup([readerc]);
  m = new FrontEndMachine({
    dialog: (n) => { opened = n; return lookup(n); }, sets, host, popups: slot, startDialog: o.start ?? DNAS, build: { face: () => face },
    built: (b) => { parts.built(b); builtName = opened; builds.push({ tick: frame, name: opened }); }, draw: parts.draw, widgetsTick: parts.widgetsTick, setEnabled: parts.setEnabled,
    input: input.dispatch, pad: input.read, activate: input.activate, movie,
  });
  m.boot();
  const tick = async (): Promise<void> => { frame++; m.frame(UI_TICK_SECONDS); await Promise.resolve(); };
  const run = async (n: number): Promise<void> => { for (let i = 0; i < n; i++) await tick(); };
  const press = async (name: PadSlotName): Promise<void> => { down = new Set([name]); await tick(); down = new Set(); await tick(); };
  const notImplemented = (dialog: string): string[] => {
    const out = new Set<string>();
    for (const x of outcomes) if (x.o.kind === 'not-implemented' && x.dialog === dialog) out.add(`${x.o.row.name} (${x.o.task})`);
    return [...out];
  };
  const hits = (name: string, dialog: string): number[] => outcomes.filter((x) => x.o.kind === 'table' && x.o.row.name === name && x.dialog === dialog).map((x) => x.tick);
  const listbox = (): ListboxWidget => parts.current!.widgets.get('SERVERLIST') as ListboxWidget;
  const news = (): { lines: string[]; scroll: number } => {
    const c = findNode(m.shell()!.screen.root, 'server_news')?.content;
    if (c?.kind !== 'wrapped') return { lines: [], scroll: NaN };
    return { lines: c.lines.map((l) => String.fromCharCode(...l.bytes)), scroll: c.scroll };
  };
  return { input, m, tick, run, press, builds, notImplemented, hits, listbox, news, uiVars, list, disconnects, loc, frame: () => frame };
}

describe.skipIf(!HAVE)(`SELECT UNIVERSE over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('the layout\'s captions are the disc\'s (UIMnLOC 609-613, 316): SELECT UNIVERSE, the column heads and UNIVERSE NEWS', () => {
    const r = rig({ start: SELECT, primed: true });
    // Decoded texts (RS.R8); the glyph bytes for the pad's icons are the disc's (¦ CROSS, ¶ L1, ¼ L2).
    expect([609, 610, 611, 612, 316, 613, 614].map((id) => r.loc.byId.get(id))).toEqual([
      'SELECT UNIVERSE', '¦ Connect to the selected Universe.', 'UNIVERSE NEWS (USE ¶ AND ¼ TO SCROLL)', 'UNIVERSE NAME', 'ONLINE',
      'USERS/MAX USERS', 'Connecting to server...',
    ]);
  });

  it('through the DNAS screen: GetServerList\'s worker asks the service, and SELECT UNIVERSE is built with the list it answered', async () => {
    const queries: unknown[] = [];
    const r = rig({ service: { query: (q) => { queries.push(q); return Promise.resolve(ONE); } } });
    await r.run(120 + DNAS_HOLD_TICKS);
    expect(r.builds.map((b) => b.name)).toEqual([DNAS, SELECT]);
    expect(queries).toEqual([{ infoType: 3, characterEncoding: 2, language: 1 }]);
    expect(r.builds[1]!.tick).toBe(83 + DNAS_HOLD_TICKS);               // the answer within the poll: research 146's 82 ticks, and OT.R20's hold
    await r.run(3);
    expect(r.notImplemented(SELECT)).toEqual([]);                       // enter_server_select: LobbyDisconnect, ChangeServerFocus's two
    expect(r.hits('LobbyDisconnect', SELECT)).toHaveLength(1);
    expect(r.hits('UpdateServerInfo', SELECT)).toHaveLength(1);
    expect(r.disconnects).toHaveLength(1);
  });

  it('SERVERLIST: one row -- the name, the green dot (status word 1: column value 0, TEXTURES[0]), USERS 0, MAX USERS 256', async () => {
    const r = rig();
    await r.run(90 + DNAS_HOLD_TICKS);                                 // through the DNAS screen and OT.R20's hold
    const l = r.listbox();
    expect(l.count).toBe(1);
    expect(l.items[0]!.captions).toEqual(['SOCOM II Local', '', '0', '256']);
    expect(l.items[0]!.images.map((c) => c?.texture ?? null)).toEqual([null, 'ping_dot_green.tif', null, null]);
    expect(r.uiVars.find(SERVER_LIST_VAR)!.value.type).toBe('array');
  });

  it('a status word of 0 draws the red dot (the row\'s `status == 0` is 1: TEXTURES[1])', async () => {
    const r = rig({ service: { query: () => Promise.resolve({ ...ONE, universes: [entry({ universeStatus: 0 })] }) } });
    await r.run(90 + DNAS_HOLD_TICKS);                                 // through the DNAS screen and OT.R20's hold
    expect(r.listbox().items[0]!.images[1]?.texture).toBe('ping_dot_red.tif');
  });

  it('UNIVERSE NEWS: the description, the blank line (skipped by the wrap at a line\'s start) and the news; SERVER_NAME the name', async () => {
    const r = rig();
    await r.run(90 + DNAS_HOLD_TICKS);                                 // through the DNAS screen and OT.R20's hold
    expect(r.news().lines).toEqual(['Local universe for SOCOM II', 'Welcome to SOCOM II.']);
    expect(r.uiVars.find(SERVER_NAME_VAR)!.value).toEqual({ type: 'string', value: 'SOCOM II Local' });
  });

  it('a service still answering holds LOCATING on the DNAS screen; SELECT UNIVERSE comes when it answers', async () => {
    let answer!: (r: UniverseReply) => void;
    const r = rig({ service: { query: () => new Promise((res) => { answer = res; }) } });
    await r.run(120 + DNAS_HOLD_TICKS);
    expect(r.builds.map((b) => b.name)).toEqual([DNAS]);
    answer(ONE);
    await r.run(30);
    expect(r.builds.map((b) => b.name)).toEqual([DNAS, SELECT]);
    expect(r.listbox().count).toBe(1);
  });

  it('a deep link (the list read before the build) shows the same rows and news', async () => {
    const r = rig({ start: SELECT, primed: true });
    await r.run(3);
    expect(r.builds.map((b) => b.name)).toEqual([SELECT]);
    expect(r.listbox().items[0]!.captions).toEqual(['SOCOM II Local', '', '0', '256']);
    expect(r.news().lines).toEqual(['Local universe for SOCOM II', 'Welcome to SOCOM II.']);
    expect(r.notImplemented(SELECT)).toEqual([]);
  });

  it('two universes: DOWN moves the list\'s focus, ONFOCUS runs ChangeServerFocus, and the news follows the focused universe', async () => {
    const two: UniverseReply = {
      universes: [entry({ name: 'First', description: 'One', endOfList: false }), entry({ name: 'Second', description: 'Two', userCount: 7 })],
      news: [{ status: 0, news: 'News.', endOfList: true }],
    };
    const r = rig({ service: { query: () => Promise.resolve(two) } });
    await r.run(90 + DNAS_HOLD_TICKS);                                 // through the DNAS screen and OT.R20's hold
    expect(r.listbox().items.map((i) => i.captions[0])).toEqual(['First', 'Second']);
    expect(r.news().lines[0]).toBe('One');
    // The list holds the focus from the build: `MainWindow`, an IMAGE among CONTROLS, is built disabled (the plain
    // bitmap's constructor clears its bit, D:L278176) and the build steps to the first enabled control (research 116
    // §17; research 147 §6's open item, settled). Its first row is active with no press, as A_34 shows.
    expect(r.input.ring()!.focused!.name).toBe('SERVERLIST');
    expect([r.listbox().state, r.listbox().focus]).toEqual(['active', 0]);
    await r.press('DOWN');
    expect(r.listbox().focus).toBe(1);
    expect(r.m.valves.find('SELECTED_SERVER')!.value).toBe(1);
    expect(r.news().lines[0]).toBe('Two');
    expect(r.uiVars.find(SERVER_NAME_VAR)!.value).toEqual({ type: 'string', value: 'Second' });
  });

  it('UNIVERSE NEWS is printed into the 0x2903-byte buffer of FUN_00379260 (D:L272983-273011): a chunk past it is not drawn', async () => {
    // Twelve chunks of 1000 bytes after the description (27) and the separator (2): FUN_003860f0 prints a string only
    // while its length + 2 fits what is left of 0x2903 (10499), so chunks 0-9 are printed and 10 and 11 are not.
    const chunks = Array.from({ length: 12 }, (_, i) => ({ status: 0, news: `C${String(i).padStart(2, '0')}X ${'news '.repeat(199)}`, endOfList: i === 11 }));
    expect(chunks[0]!.news.length).toBe(1000);
    const r = rig({ service: { query: () => Promise.resolve({ ...ONE, news: chunks }) } });
    await r.run(90 + DNAS_HOLD_TICKS);                                 // through the DNAS screen and OT.R20's hold
    const text = r.news().lines.join(' ');
    expect(text).toContain('C09X');
    expect(text).not.toContain('C10X');
    expect(text).not.toContain('C11X');
  });

  it('L2 scrolls the news down one pitch and L1 back (scroll_policy_down / _up: server_news Scroll_Down / Scroll_Up)', async () => {
    const long = 'A line of news that runs on long enough to wrap. '.repeat(30);
    const r = rig({ service: { query: () => Promise.resolve({ ...ONE, news: [{ status: 0, news: long, endOfList: true }] }) } });
    await r.run(90 + DNAS_HOLD_TICKS);                                 // through the DNAS screen and OT.R20's hold
    expect(r.news().lines.length).toBeGreaterThan(8);
    expect(r.news().scroll).toBe(0);
    await r.press('TRIGGER_L2');
    const down = r.news().scroll;
    expect(down).toBeGreaterThan(0);
    await r.press('TRIGGER_L1');
    expect(r.news().scroll).toBe(0);
  });
});
