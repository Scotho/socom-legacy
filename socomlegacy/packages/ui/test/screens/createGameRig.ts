import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRdr, Zar } from '@s2u/archive';
import { LocService, locTable, parseAnimSets, readLocArchive } from '@s2u/scene';
import { frontEndSoundTable, soundHash } from '@s2u/sound';
import { UI_TICK_SECONDS } from '../../src/clock/uiClock';
import { findNode } from '../../src/compositor/scene';
import { UiCommandHost, type UiCommandOutcome } from '../../src/uiCommands';
import { UiVarManager } from '../../src/uiVars';
import { MenuInput } from '../../src/input/menuInput';
import type { PadSlotName } from '../../src/input/padStates';
import { SoftKeyboardFrontEnd, UI_PARAMS_RDR, readSoftKeyboards, type UsbKey } from '../../src/keyboard';
import { UiSoundCues, type UiSoundOutput } from '../../src/sounds/uiSoundCues';
import { dialogLookup } from '../../src/screens/dialogArchive';
import { DialogPartsHost } from '../../src/screens/dialogParts';
import { FrontEndMachine } from '../../src/screens/frontEndMachine';
import { MenuCommands } from '../../src/screens/menuCommands';
import { NetLoginCommands } from '../../src/screens/netLoginCommands';
import { OptionGlobals, OptionsCommands } from '../../src/screens/optionsCommands';
import { PopupSlot } from '../../src/screens/popupSlot';
import { AcctDb, PersonaCommands } from '../../src/screens/personaCommands';
import { UniverseList } from '../../src/screens/universeCommands';
import { WorldOfSocomCommands, lobbySessionStart, seedWorldOfSocomValves } from '../../src/screens/worldOfSocomCommands';
import {
  CREATE_GAME, mountCreateGame, missionRecords, openCreateGame, type CreateGameReply, type CreateGameRequest, type CreatedGame,
} from '../../src/screens/createGameCommands';
import type { ListboxWidget } from '../../src/widgets/listbox';
import type { MovieService } from '../../src/movie/movieCommands';
import type { CaptionSource } from '../../src/text/captions';
import type { TextFace } from '../../src/text/face';
import type { UiDrawItem } from '../../src/compositor/drawList';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import { textFace } from '../text/fixtures';
import { usbKeys, USB_ENTER } from './personaRig';

/**
 * The CREATE GAME rig (ONL-13 and ONL-14; web research 163 and 164): `dlgCreateGame.rdr` opened on `RUN/UI/READERC.ZAR`
 * and `RUN/UIZANIM.ZAR`, entered from a stand-in caller -- SOCOM II ONLINE (`dlgWorldOfSOCOM.rdr`), because the
 * briefing room (ONL-12) is another branch's -- through `openCreateGame`, the same `SWITCHMENU(dlgCreateGame.rdr)` the
 * briefing room's `OnCreateGamePress` runs. Mounted as the session mounts them: the screens' rows (PLAT-10), PLAT-11's
 * menu input (its pad a test's snapshot), PLAT-17's soft keyboard over the disc's `UiParams.rdr` (typed through its USB
 * queue), PLAT-23's sound rows (a synthetic table), MENU-01a's rows, ONL-06's CompareValues / PruneUIVarSpaces /
 * NetCensorText, ONL-09's rows (IsMemberOfClan: no clan) and this task's rows over the disc's `missionlist.rdr`
 * (`RUN/READERC.ZAR`) and a fake `/lobby/create-game`. The files come from the disc (`SOCOM_DISC`, else
 * `<SOCOM_PC_ROOT>/game/disc`) or the committed fixtures: it runs in CI.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(dirname(fileURLToPath(import.meta.url)), '../../../../test-fixtures');
const from = (root: string, p: string): Uint8Array | null => (root !== '' && existsSync(join(root, p)) ? new Uint8Array(readFileSync(join(root, p))) : null);
const file = (p: string): Uint8Array | null => from(DISC, p) ?? from(FIXTURES, p);
const READERC = file('RUN/UI/READERC.ZAR'), UIZANIM = file('RUN/UIZANIM.ZAR'), LOC = file('RUN/LOCALE/STATES/UIMNLOC.ZAR'), COMMON = file('RUN/READERC.ZAR');
export const HAVE = READERC !== null && UIZANIM !== null && LOC !== null && COMMON !== null;

export const WORLD = 'dlgWorldOfSOCOM.rdr';
export const ROOM = { name: 'Alpha', worldId: 1 } as const;

const h = (name: string): string => String(soundHash(name));
const SOUND_SCRIPT = ['SETS', ['HUDUI', ['.DINK', '.METAL', '.TCM_SLIDE', '.BACK', '.TYPE', '.NEG'].map((n) => [h(n), 'ONESHOT', []])], 'GROUPS', []];

/** The disc's `missionlist.rdr` (`RUN/READERC.ZAR`), as `FUN_002c9540` reads it. */
export function discMissions() {
  const z = Zar.parse(COMMON!);
  const key = z.root.children.find((k) => k.name.toLowerCase() === 'missionlist.rdr')!;
  return missionRecords(parseRdr(z.data(key)));
}

/** `RUN/UIZANIM.ZAR`'s sets as the disc holds them (before `playListSets`). */
export function discAnimSets() {
  return parseAnimSets(Zar.parse(UIZANIM!)).sets;
}

export interface CreateGameRigOptions {
  /** Browser development capability already checked by the page; absent/false keeps the native row disabled. */
  respawnRules?: boolean;
  /** `/lobby/create-game`'s answer (a reply, or a whole function); by default a request never answered. */
  reply?: CreateGameReply | ((req: CreateGameRequest) => Promise<CreateGameReply>);
  /** The room's world id (the briefing room's `DAT_0066a538`); by default `ROOM.worldId`. */
  roomWorldId?: number;
  /** A 401: the session lost (ONL-07's `LobbyClient.sessionLost`), as the page's service hands it on. */
  sessionLost?: boolean;
  /** For a drawn run (`tools/test/createGamePictureDisc.test.ts`): the disc's faces and captions, the page's banks' lookup. */
  face?: (name: string) => TextFace | null;
  captions?: CaptionSource;
  hasTexture?: (name: string) => boolean;
  /** The server's CREATE GAME offer (`CreateGameCommandsOptions.offered`, map numbers); absent, not handed in (the four). */
  offered?: () => readonly number[] | null;
}

export function createGameRig(o: CreateGameRigOptions = {}) {
  const readerc = Zar.parse(READERC!);
  const sets = parseAnimSets(Zar.parse(UIZANIM!)).sets;
  const loc = locTable(readLocArchive(LOC!, 'UIMn').entries);
  let m!: FrontEndMachine;
  let frames = 0;
  const outcomes: { tick: number; dialog: string; o: UiCommandOutcome; fn: string; arg: string }[] = [];
  const builds: string[] = [];
  const fixture = textFace();
  const face = o.face ?? (() => fixture);
  const uiVars = new UiVarManager();
  const captions: CaptionSource = o.captions ?? new LocService([readLocArchive(LOC!, 'UIMn')]);
  const parts = new DialogPartsHost({ popupObject: () => m.queue.popupObject, face, captions, uiVars, hasTexture: o.hasTexture });
  const sound: UiSoundOutput & { log: string[] } = { log: [], play(name) { this.log.push(`play ${String(name)}`); }, stopAll() { this.log.push('stopAll'); }, fadeAll() { this.log.push('fadeAll'); }, streaming(on) { this.log.push(`streaming ${on}`); } };
  const cues = new UiSoundCues(frontEndSoundTable(SOUND_SCRIPT as never, new Map([['HUDUI', { names: new Map<string, number>() }]])), { teletype: '.TYPE', back: '.BACK', selection: '.METAL' }, [], sound);
  const host = new UiCommandHost({ node: parts.nodeCommand, sound: (cmd) => { cues.sound(cmd); } });
  let opened = '', builtName = '';
  const dispatch = host.dispatch.bind(host);
  host.dispatch = (cmd: ZAnimUiCommand, time) => { const r = dispatch(cmd, time); outcomes.push({ tick: frames, dialog: builtName, o: r, fn: cmd.fn ?? '', arg: cmd.arg }); return r; };
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
  const inputString = (cmd: ZAnimUiCommand): string | null => m.shell()?.inputString(cmd.anim) ?? null;
  const event = (kind: number): void => { events.push(kind); m.shell()?.event(kind); };
  new MenuCommands({ valves: () => m.valves, uiVars, inputString, event }).register(host);
  new NetLoginCommands({ valves: () => m.valves, uiVars }).register(host);
  new OptionsCommands({
    valves: () => m.valves, uiVars, globals: new OptionGlobals(), dialog: () => m.shell()?.currentName ?? null,
    name: (cmd, i) => parts.current?.name(cmd, i) ?? null,
  }).register(host);
  new PersonaCommands({ valves: () => m.valves, uiVars, db: new AcctDb(), universes: new UniverseList({ uiVars }), inputString, name: (cmd, i) => parts.current?.name(cmd, i) ?? null, event }).register(host);
  new WorldOfSocomCommands({ uiVars, service: { announcement: () => new Promise(() => {}) }, roomList: { channelList: () => new Promise(() => {}) } }).register(host);
  lobbySessionStart(uiVars);
  uiVars.set(uiVars.add('MEDIUS_LOBBY_NAME', null, 2), { type: 'string', value: ROOM.name });     // the briefing room's join wrote it (lobby +0xc0)
  uiVars.add('PLAYERNAMEVAR', { type: 'string', value: 'socomc' }, 2);
  const requests: CreateGameRequest[] = [];
  const created: CreatedGame[] = [];
  const lost: number[] = [];
  const r = o.reply;
  const answer = (req: CreateGameRequest): Promise<CreateGameReply> => (r === undefined ? new Promise(() => {}) : typeof r === 'function' ? r(req) : Promise.resolve(r));
  const commands = mountCreateGame(host, {
    uiVars, valves: () => m.valves, event, missions: discMissions, roomWorldId: () => o.roomWorldId ?? ROOM.worldId,
    respawnRules: o.respawnRules,
    ...(o.offered ? { offered: o.offered } : {}),
    service: {
      createGame: (req) => {
        requests.push(req);
        if (o.sessionLost) { lost.push(frames); event(0x0b); return Promise.reject(new Error('session lost')); }   // as the page: sessionLost queues state 2, MP_MEDIUS_ERROR
        return answer(req);
      },
    },
    created: (g) => { created.push(g); },
  });
  const slot = new PopupSlot();
  slot.connect(parts.makePopup);
  const movie = { service: { background: { on: () => true, off: () => true }, play: () => {} } as unknown as MovieService, frame: () => 'menu' as const, unload: () => {}, load: () => input.built() };
  const lookup = dialogLookup([readerc]);
  m = new FrontEndMachine({
    dialog: (n) => { opened = n; return lookup(n); }, sets, host, popups: slot, startDialog: WORLD,
    build: { face, captions },
    built: (b) => { parts.built(b); builtName = opened; builds.push(opened); }, draw: skb.drawOver(parts.draw), widgetsTick: parts.widgetsTick, setEnabled: parts.setEnabled,
    focusTick: skb.tick, input: input.dispatch, pad: input.read, activate: input.activate, movie, onLaunch: () => {},
  });
  m.boot();
  seedWorldOfSocomValves(m.valves);
  let last: UiDrawItem[] = [];
  const frame = (): void => { frames++; last = m.frame(UI_TICK_SECONDS); };
  const run = (n = 1): void => { for (let i = 0; i < n; i++) frame(); };
  const settle = async (n = 1): Promise<void> => { for (let i = 0; i < n; i++) { frame(); await Promise.resolve(); await Promise.resolve(); } };
  const press = (name: PadSlotName, after = 4): void => { held = name; frame(); held = null; for (let i = 0; i < after; i++) frame(); };
  const type = (text: string): void => { for (const k of usbKeys(text)) { usb.push(k); frame(); } usb.push(USB_ENTER); frame(); run(12); };
  const node = (name: string) => findNode(m.shell()!.screen.root, name);
  const text = (name: string): string => { const c = node(name)?.content; return c?.kind === 'text' ? String.fromCharCode(...c.text.codes) : ''; };
  const valve = (name: string): number | undefined => m.valves.find(name)?.value;
  const str = (name: string): string | null => { const v = uiVars.find(name)?.value; return v?.type === 'string' ? v.value : null; };
  const focused = (): string => input.ring()?.focused?.name ?? '';
  const list = (name: string): ListboxWidget => parts.current!.widgets.get(name) as ListboxWidget;
  const shown = (): boolean => { const g = m.shell()!; return g.popups.shown(g.screen); };
  const popupText = (): string => (shown() ? (parts.current?.popup()?.popup.text.lines ?? []).map((l) => new TextDecoder().decode(Uint8Array.from(l.bytes)).trim()).join(' ') : '');
  const current = (): string => m.shell()?.currentName ?? '';
  /** The stand-in caller settled (SERVER NEWS closed), then CREATE GAME entered by `openCreateGame` and run to its build. */
  const enter = async (): Promise<void> => {
    await settle(60);
    press('CROSS', 10);                                                // SERVER NEWS closed
    const built = builds.length;
    openCreateGame(host);
    for (let i = 0; i < 120 && builds.length === built; i++) await settle(1);
    await settle(30);
  };
  /** DOWN until `name` holds the focus. */
  const go = (name: string): void => { for (let i = 0; i < 16 && focused() !== name; i++) press('DOWN', 6); };
  return {
    m, parts, input, skb, uiVars, loc, run, settle, frame, press, type, outcomes, node, text, valve, str, focused, list, shown, popupText, current, enter, go,
    builds, sound, events, requests, created, lost, commands, host, frames: () => frames, last: () => last, dialog: CREATE_GAME,
  };
}
