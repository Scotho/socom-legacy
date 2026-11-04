import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRdr, Zar } from '@s2u/archive';
import { LocService, locTable, parseAnimSets, readLocArchive } from '@s2u/scene';
import { frontEndSoundTable, soundHash } from '@s2u/sound';
import { UI_TICK_SECONDS } from '../../src/clock/uiClock';
import { findNode } from '../../src/compositor/scene';
import type { UiDrawItem } from '../../src/compositor/drawList';
import { UiCommandHost, type UiCommandOutcome } from '../../src/uiCommands';
import { UiVarManager } from '../../src/uiVars';
import { MenuInput } from '../../src/input/menuInput';
import type { PadSlotName } from '../../src/input/padStates';
import { SoftKeyboardFrontEnd, UI_PARAMS_RDR, readSoftKeyboards, type UsbKey } from '../../src/keyboard';
import { UiSoundCues, type UiSoundOutput } from '../../src/sounds/uiSoundCues';
import { CardCommands, type CardConfigFile, type CardFileIo } from '../../src/screens/cardCommands';
import { ConnectCommands, lobbyEventInto } from '../../src/screens/connectCommands';
import { LobbyClient, type LobbyService } from '../../src/screens/lobbyClient';
import { UsagePolicyCommands } from '../../src/screens/usagePolicyCommands';
import { locTextOf } from '../../src/text/captions';
import { dialogLookup } from '../../src/screens/dialogArchive';
import { DialogPartsHost } from '../../src/screens/dialogParts';
import { DnasCommands } from '../../src/screens/dnasCommands';
import { FrontEndMachine } from '../../src/screens/frontEndMachine';
import { MenuCommands, type MenuCardIo } from '../../src/screens/menuCommands';
import { AcctDb, PersonaCommands, type AcctRecord, type PersonaLobby } from '../../src/screens/personaCommands';
import { PopupSlot } from '../../src/screens/popupSlot';
import { UniverseCommands, UniverseList, type UniverseEntry, type UniverseReply } from '../../src/screens/universeCommands';
import type { ListboxWidget } from '../../src/widgets/listbox';
import type { MovieService } from '../../src/movie/movieCommands';
import type { CaptionSource } from '../../src/text/captions';
import type { TextFace } from '../../src/text/face';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import { textFace } from '../text/fixtures';

/**
 * The CONNECT TO SOCOM II rig (ONL-06; web research 153): `dlgNetPlayerName.rdr` -- or `dlgNetServerSelect.rdr`, to
 * come in through SELECT UNIVERSE's CROSS -- opened on `RUN/UI/READERC.ZAR` and `RUN/UIZANIM.ZAR` with every module of
 * the path registered in PLAT-08's host: the screens' rows (PLAT-10), PLAT-11's menu input (its pad a test's
 * snapshot), PLAT-17's soft keyboard over the disc's `UiParams.rdr` (typed through its USB queue), PLAT-23's sound rows
 * (a synthetic table), MENU-01a's card rows and, with a card handed in, OPT-05i's five, ONL-03's and ONL-04's rows
 * over a universe list the rig primes, and this task's rows over an account list and a lobby the test hands in -- so
 * the dialog's own ANIMATIONS run as the original's would. The files come from the disc (`SOCOM_DISC`, else
 * `<SOCOM_PC_ROOT>/game/disc`) or the committed fixtures (`S2U_TEST_FIXTURES`, else `test-fixtures/`): it runs in CI.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
export const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(dirname(fileURLToPath(import.meta.url)), '../../../../test-fixtures');
const from = (root: string, p: string): Uint8Array | null => (root !== '' && existsSync(join(root, p)) ? new Uint8Array(readFileSync(join(root, p))) : null);
const file = (p: string): Uint8Array | null => from(DISC, p) ?? from(FIXTURES, p);
const READERC = file('RUN/UI/READERC.ZAR'), UIZANIM = file('RUN/UIZANIM.ZAR'), LOC = file('RUN/LOCALE/STATES/UIMNLOC.ZAR');
/** The layouts, the sets and the captions are there (the disc, or the fixtures). */
export const HAVE = READERC !== null && UIZANIM !== null && LOC !== null;
/** The disc itself is there (the faces and the banks a drawn frame needs). */
export const HAVE_DISC = DISC !== '' && ['RUN/UI/READERC.ZAR', 'RUN/UIZANIM.ZAR'].every((f) => existsSync(join(DISC, f)));

export const PERSONA = 'dlgNetPlayerName.rdr', SELECT = 'dlgNetServerSelect.rdr', CONNECT = 'dlgNetConnect.rdr';

/** The universe the rig's list holds: our server's shape (SVC-05's), with an address the personas are filed under. */
export const UNIVERSE: UniverseEntry = {
  status: 0, name: 'SOCOM II Local', dns: 'lobby.test', port: 10075, description: 'Local universe for SOCOM II', universeStatus: 1, userCount: 0, maxUsers: 256,
  billing: '', billingName: '', extendedInfo: '', endOfList: true,
};
const reply = (u: UniverseEntry): UniverseReply => ({ universes: [u], news: [{ status: 0, news: 'Welcome to SOCOM II.', endOfList: true }] });

const h = (name: string): string => String(soundHash(name));
const SOUND_SCRIPT = ['SETS', ['HUDUI', ['.DINK', '.METAL', '.TCM_SLIDE', '.BACK', '.TYPE'].map((n) => [h(n), 'ONESHOT', []])], 'GROUPS', []];

/** The USB keys of a text (HID usages: a..z 0x04.., 1..9 0x1e.., 0 0x27, space 0x2c; research 119 §7). */
export function usbKeys(text: string): UsbKey[] {
  return Array.from(text).map((ch) => {
    const lower = ch.toLowerCase();
    if (lower >= 'a' && lower <= 'z') return { hid: 0x04 + lower.charCodeAt(0) - 97, shift: ch !== lower, capsLamp: false };
    if (ch >= '1' && ch <= '9') return { hid: 0x1e + ch.charCodeAt(0) - 49, shift: false, capsLamp: false };
    if (ch === '0') return { hid: 0x27, shift: false, capsLamp: false };
    if (ch === ' ') return { hid: 0x2c, shift: false, capsLamp: false };
    throw new Error(`no USB key for ${JSON.stringify(ch)}`);
  });
}
export const USB_ENTER: UsbKey = { hid: 0x28, shift: false, capsLamp: false };
export const USB_ESCAPE: UsbKey = { hid: 0x29, shift: false, capsLamp: false };

export interface PersonaRigOptions {
  /** The start dialog: the persona form by default. */
  start?: string;
  /** The account list before the build (the card's personas as the boot's LoadConfig left them). */
  records?: readonly AcctRecord[];
  /** The universe SELECT UNIVERSE lists (primed, as the DNAS screen leaves it). */
  universe?: UniverseEntry;
  /** A start on the form runs `LobbyConnect`'s form half first (`PersonaCommands.enterForm`), as the page's deep link does; false: not. */
  entered?: boolean;
  /** The lobby (ONL-07's connection); absent, this task's placeholders. */
  lobby?: PersonaLobby;
  /**
   * ONL-07 (research 157): the lobby client over this service, handed to the persona rows as their lobby (`lobby` is
   * then ignored), with `LobbyLogin` / `LobbyRegister` registered, ONL-08's two rows over the client's session flag,
   * and the client stepped before every frame. Absent: no lobby, as before ONL-07.
   */
  connectService?: LobbyService;
  /** This task's rows registered (false: the table's declared rows answer, as before ONL-06). */
  commands?: boolean;
  /** The card each port answers (`MenuCardIo`); by default both inserted and formatted, no folder. */
  card?: MenuCardIo;
  /** OPT-05i's five rows over this libmc (with `config`): the save chain runs to the card. */
  cardFile?: CardFileIo;
  config?: CardConfigFile;
  /**
   * The page's own connection in place of the rig's (`packages/viewer/src/personaHost.ts` `connectPersona`, whose test
   * hands it in): it registers this task's rows and OPT-05i's five over its account list and card.
   */
  connect?: (host: UiCommandHost, ctx: PersonaRigContext) => { commands: PersonaCommands; db: AcctDb };
  face?: (name: string) => TextFace | null;
  captions?: CaptionSource | null;
  hasTexture?: (name: string) => boolean;
}

/** What `connect` is handed: the session's parts, as `FrontEndSession` holds them. */
export interface PersonaRigContext { machine: () => FrontEndMachine; uiVars: UiVarManager; parts: DialogPartsHost; menu: MenuCommands; universes: UniverseList }

export function personaRig(o: PersonaRigOptions = {}) {
  const readerc = Zar.parse(READERC!);
  const sets = parseAnimSets(Zar.parse(UIZANIM!)).sets;
  const loc = locTable(readLocArchive(LOC!, 'UIMn').entries);
  let seed = 1;
  const random = (): number => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed; };
  let m!: FrontEndMachine;
  let frames = 0;
  const outcomes: { tick: number; dialog: string; o: UiCommandOutcome }[] = [];
  const builds: string[] = [];
  const fixture = textFace();
  const face = o.face ?? (() => fixture);
  const uiVars = new UiVarManager();
  /** The captions: the test's (the drawn frames hand in every table), else the UIMn table alone. */
  const captions: CaptionSource = o.captions ?? new LocService([readLocArchive(LOC!, 'UIMn')]);
  const parts = new DialogPartsHost({ popupObject: () => m.queue.popupObject, face, captions, uiVars, hasTexture: o.hasTexture });
  const sound: UiSoundOutput & { log: string[] } = { log: [], play(name) { this.log.push(`play ${String(name)}`); }, stopAll() { this.log.push('stopAll'); }, fadeAll() { this.log.push('fadeAll'); }, streaming(on) { this.log.push(`streaming ${on}`); } };
  const cues = new UiSoundCues(frontEndSoundTable(SOUND_SCRIPT as never, new Map([['HUDUI', { names: new Map<string, number>() }]])), { teletype: '.TYPE', back: '.BACK', selection: '.METAL' }, [], sound);
  const host = new UiCommandHost({ node: parts.nodeCommand, sound: (cmd) => { cues.sound(cmd); } });
  let opened = '', builtName = '';
  const dispatch = host.dispatch.bind(host);
  host.dispatch = (cmd: ZAnimUiCommand, time) => { const r = dispatch(cmd, time); outcomes.push({ tick: frames, dialog: builtName, o: r }); return r; };
  let held: PadSlotName | null = null;
  const input = new MenuInput({ machine: () => m, parts });
  input.register(host);
  input.source = { read: () => ({ down: new Set<PadSlotName>(held ? [held] : []), stickX: 0, stickY: 0 }) };
  const skb = new SoftKeyboardFrontEnd({ machine: () => m, parts, face, uiVars, locText: (key) => { const r = captions.caption(key); return r.kind === 'loc' ? r.text : null; } });
  const params = readerc.find(UI_PARAMS_RDR.member);
  if (params) skb.load(readSoftKeyboards(parseRdr(readerc.data(params))));
  skb.connect(host, input);
  const usb: UsbKey[] = [];
  skb.usbKey = () => usb.shift() ?? null;
  for (const [name, entry] of Object.entries(cues.entries())) host.setHandler(name, (cmd) => entry(cmd));
  const events: number[] = [];
  const inserted = { result: 0, type: 2, format: 1 };
  const card: MenuCardIo = o.card ?? { getInfo: () => inserted, getDir: () => ({ result: -4 }), chdir: () => ({ result: -4 }), mkdir: () => -4 };
  const inputString = (cmd: ZAnimUiCommand): string | null => m.shell()?.inputString(cmd.anim) ?? null;
  const event = (kind: number): void => { events.push(kind); m.shell()?.event(kind); };
  const menu = new MenuCommands({ valves: () => m.valves, uiVars, inputString, event, card });
  menu.register(host);
  if (o.cardFile) new CardCommands({ valves: () => m.valves, uiVars, card: o.cardFile, io: () => menu.cardIo(), event, config: o.config }).register(host);
  const universe = o.universe ?? UNIVERSE;
  const list = new UniverseList({ uiVars });
  new DnasCommands({ valves: () => m.valves, getServerList: () => list.job({ query: () => Promise.resolve(reply(universe)) }) }).register(host);
  new UniverseCommands({ valves: () => m.valves, uiVars, list }).register(host);
  for (const e of reply(universe).universes) list.entry(e);
  for (const n of reply(universe).news) list.newsChunk(n);
  const made = o.connect?.(host, { machine: () => m, uiVars, parts, menu, universes: list }) ?? null;
  const db = made?.db ?? new AcctDb();
  for (const r of o.records ?? []) db.put(r);
  // ONL-07: the lobby client and its two rows, wired as the page wires them (`packages/viewer/src/connectHost.ts`).
  let connectRows: ConnectCommands | null = null;
  const lobbyEvents: Array<[number, string | null]> = [];
  const post = lobbyEventInto(() => m, parts);
  const client = o.connectService ? new LobbyClient({
    valves: () => m.valves, service: o.connectService, locText: locTextOf(captions), settled: () => connectRows?.forgetPassword(),
    event: (kind, text) => { lobbyEvents.push([kind, text]); post(kind, text); },
  }) : null;
  if (client) {
    connectRows = new ConnectCommands({ uiVars, lobby: client, db: () => db, forget: () => skb.keyboard.forgetText() });
    connectRows.register(host);
    new UsagePolicyCommands({ uiVars, service: { policy: () => Promise.resolve([{ status: 0, policy: 'EULA', endOfText: true }]) }, lobbyUp: () => client.up }).register(host);
    new UniverseCommands({ valves: () => m.valves, uiVars, list, lobbyDisconnect: () => client.disconnect() }).register(host);
  }
  const persona = made?.commands ?? new PersonaCommands({
    valves: () => m.valves, uiVars, db, universes: list, lobby: client ?? o.lobby, inputString, name: (cmd, i) => parts.current?.name(cmd, i) ?? null, event,
  });
  if (!made && o.commands !== false) persona.register(host);
  const slot = new PopupSlot();
  slot.connect(parts.makePopup);
  const movie = { service: { background: { on: () => true, off: () => true }, play: () => {} } as unknown as MovieService, frame: () => 'menu' as const, unload: () => {}, load: () => input.built() };
  const lookup = dialogLookup([readerc]);
  let last: UiDrawItem[] = [];
  const start = o.start ?? PERSONA;
  m = new FrontEndMachine({
    dialog: (n) => { opened = n; return lookup(n); }, sets, random, host, popups: slot, startDialog: start,
    build: { face, captions },
    built: (b) => { parts.built(b); builtName = opened; builds.push(opened); }, draw: skb.drawOver(parts.draw), widgetsTick: parts.widgetsTick, setEnabled: parts.setEnabled,
    focusTick: skb.tick, input: input.dispatch, pad: input.read, activate: input.activate, movie,
  });
  m.boot();
  if (start === PERSONA && o.entered !== false && o.commands !== false) {
    persona.enterForm(universe.dns, universe.port);
    client?.connect(universe.dns, universe.port);                    // LobbyConnect's other half (the page's deep link runs both)
  }
  const frame = (): void => { frames++; connectRows?.frame(m.shell()?.currentName ?? null); last = m.frame(UI_TICK_SECONDS); };
  const run = (n = 1): void => { for (let i = 0; i < n; i++) frame(); };
  /** `n` frames with the service's replies delivered between them (a resolved promise's callbacks run before each frame). */
  const runReplies = async (n = 1): Promise<void> => { for (let i = 0; i < n; i++) { await Promise.resolve(); await Promise.resolve(); frame(); } };
  /** One button down for one frame (FALLING), up the next (RISING), then `settle` idle frames. */
  const press = (name: PadSlotName, settle = 2): void => { held = name; frame(); held = null; for (let i = 0; i < settle; i++) frame(); };
  /** Types on the open keyboard through its USB queue (a frame a key), then `end` (ENTER by default) and the close's scale-down. */
  const type = (text: string, end: UsbKey | null = USB_ENTER): void => {
    for (const k of usbKeys(text)) { usb.push(k); frame(); }
    if (end) { usb.push(end); frame(); run(12); }
  };
  const notImplemented = (dialog?: string): string[] => {
    const out = new Set<string>();
    for (const x of outcomes) if (x.o.kind === 'not-implemented' && (dialog === undefined || x.dialog === dialog)) out.add(`${x.o.row.name} (${x.o.task})`);
    return [...out];
  };
  /** The rows the table was asked since `from` (an index into `outcomes`), by name, in order, a repeat once. */
  const dispatched = (start_ = 0): string[] => {
    const out: string[] = [];
    for (const x of outcomes.slice(start_)) {
      const n = x.o.kind === 'table' || x.o.kind === 'not-implemented' ? x.o.row.name : null;
      if (n !== null && out[out.length - 1] !== n) out.push(n);
    }
    return out;
  };
  const focused = (): string => input.ring()?.focused?.name ?? '';
  const node = (name: string) => findNode(m.shell()!.screen.root, name);
  /** A TEXT node's codes as a string (the captions' decoded text, research 111). */
  const text = (name: string): string => {
    const c = node(name)?.content;
    return c?.kind === 'text' ? String.fromCharCode(...c.text.codes) : '';
  };
  const listbox = (): ListboxWidget => parts.current!.widgets.get('PersonaList') as ListboxWidget;
  const valve = (name: string): number | undefined => m.valves.find(name)?.value;
  const str = (name: string): string | null => { const v = uiVars.find(name)?.value; return v?.type === 'string' ? v.value : null; };
  const shown = (): boolean => { const g = m.shell()!; return g.popups.shown(g.screen); };
  /** The shown popup's text, its wrapped lines (the table's UTF-8 bytes) joined by one space ('' when none shows). */
  const popupText = (): string => (shown() ? (parts.current?.popup()?.popup.text.lines ?? []).map((l) => new TextDecoder().decode(Uint8Array.from(l.bytes)).trim()).join(' ') : '');
  return {
    m, parts, input, skb, uiVars, db, persona, list, loc, menu, run, frame, press, type, usb, outcomes, notImplemented, dispatched, focused, node, text, listbox,
    valve, str, shown, builds, sound, events, last: () => last, current: () => m.shell()?.currentName ?? '', runReplies, client, connectRows, lobbyEvents, host, popupText,
  };
}
