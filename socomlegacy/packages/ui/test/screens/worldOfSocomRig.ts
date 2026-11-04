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
import { SoftKeyboardFrontEnd, UI_PARAMS_RDR, readSoftKeyboards, type UsbKey } from '../../src/keyboard';
import type { PadSlotName } from '../../src/input/padStates';
import { UiSoundCues, type UiSoundOutput } from '../../src/sounds/uiSoundCues';
import { dialogLookup } from '../../src/screens/dialogArchive';
import type { DialogDesign } from '../../src/dialog';
import { DialogPartsHost } from '../../src/screens/dialogParts';
import { FrontEndMachine } from '../../src/screens/frontEndMachine';
import type { Launch } from '../../src/screens/launch';
import { MenuCommands } from '../../src/screens/menuCommands';
import { NetLoginCommands } from '../../src/screens/netLoginCommands';
import { PopupSlot } from '../../src/screens/popupSlot';
import { ClanInvitationCommands, MyClanInvitations, type ClanInvitationReply, type ClanInvitationsService } from '../../src/screens/clanInvitations';
import {
  PARKED_ROW_GATE, WorldOfSocomCommands, lobbySessionStart, seedWorldOfSocomValves, type AnnouncementReply, type AnnouncementService, type ChannelListEntry, type RoomListService,
} from '../../src/screens/worldOfSocomCommands';
import { IgnoreListCommands, type IgnoreListService } from '../../src/screens/ignoreListCommands';
import { LadderLobbyCommands, type LadderOnlineState, type LadderService } from '../../src/screens/ladderLobbyCommands';
import { FriendListCommands, type FriendListService } from '../../src/screens/friendListCommands';
import { ManageRosterCommands, type ManageRosterService } from '../../src/screens/manageRosterCommands';
import type { MovieService } from '../../src/movie/movieCommands';
import type { CaptionSource } from '../../src/text/captions';
import type { TextFace } from '../../src/text/face';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import type { ValveStore } from '../../src/valves';
import { textFace } from '../text/fixtures';
import { USB_ENTER, usbKeys } from './personaRig';

/**
 * The SOCOM II ONLINE rig (ONL-09; web research 158): `dlgWorldOfSOCOM.rdr` opened on `RUN/UI/READERC.ZAR` and
 * `RUN/UIZANIM.ZAR` with the modules the session mounts for it in PLAT-08's host -- the screens' rows (PLAT-10),
 * PLAT-11's menu input (its pad a test's snapshot), PLAT-23's sound rows (a synthetic table, its output a log),
 * MENU-01a's rows, ONL-01's NetCnf rows, SVC-09a's invitation rows over a fake service answering Horizon's none, ONL-25's
 * ignore list rows (`IgnoreListCommands`) over a fake service answering Horizon's empty list, ONL-30a's ladder rows
 * (`LadderLobbyCommands`, with ONL-30's clans' half over the session's clan) over a fake service answering an empty board
 * (NoResult for the position and the list, the clans' likewise: ClanNotFound, the total 0, one NoResult row), ONL-24's
 * friends rows (`FriendListCommands`) over a fake service answering Horizon's empty list (one NoResult row), ONL-27's
 * clan rows (`ManageRosterCommands`: GetClan's GetMyClans, the roster, QuitClan) over a fake service answering Horizon's
 * no clan (NoResult; `MLS.cs:1614-1636` at be557831), and this task's rows over a fake announcement service -- with the lobby session's variables added and the launch's
 * valves seeded, so the dialog's own ANIMATIONS run as the original's would. The files come from the disc
 * (`SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`) or the committed fixtures (`S2U_TEST_FIXTURES`, else
 * `test-fixtures/`): it runs in CI.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
export const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(dirname(fileURLToPath(import.meta.url)), '../../../../test-fixtures');
const from = (root: string, p: string): Uint8Array | null => (root !== '' && existsSync(join(root, p)) ? new Uint8Array(readFileSync(join(root, p))) : null);
const file = (p: string): Uint8Array | null => from(DISC, p) ?? from(FIXTURES, p);
const READERC = file('RUN/UI/READERC.ZAR'), UIZANIM = file('RUN/UIZANIM.ZAR'), LOC = file('RUN/LOCALE/STATES/UIMNLOC.ZAR');
export const HAVE = READERC !== null && UIZANIM !== null && LOC !== null;
export const HAVE_DISC = DISC !== '' && ['RUN/UI/READERC.ZAR', 'RUN/UIZANIM.ZAR'].every((f) => existsSync(join(DISC, f)));

export const WORLD = 'dlgWorldOfSOCOM.rdr';

const h = (name: string): string => String(soundHash(name));
const SOUND_SCRIPT = ['SETS', ['HUDUI', ['.DINK', '.METAL', '.TCM_SLIDE', '.BACK', '.TYPE'].map((n) => [h(n), 'ONESHOT', []])], 'GROUPS', []];

/** Horizon's answer for a player with no invitation (`MLS.cs:1552-1560` at be557831: one NoResult reply that ends the list). */
export const NO_INVITATION: ClanInvitationReply = { status: 1, clanInvitationId: 0, clanId: 0, responseStatus: 0, message: '', leaderAccountId: 0, leaderAccountName: '', endOfList: true };
export const announced = (announcement: string, status = 0): AnnouncementReply => ({ status, announcementId: 1, announcement, endOfList: true });

export interface WorldRigOptions {
  /** The start dialog: SOCOM II ONLINE by default. */
  start?: string;
  /** LOBBY-INVITE: the dialog lookup wrapped as the page wraps it (`withInviteButton`); absent, the disc's as read. */
  dialogs?: (lookup: (name: string) => DialogDesign | null) => (name: string) => DialogDesign | null;
  /** The persona's name (PLAYERNAMEVAR, as ONL-06 leaves it). */
  name?: string;
  /** The announcement the fake service answers (a text, or a whole service); by default a fresh server's empty success. */
  announcement?: string | AnnouncementService;
  /** ONL-11: the rooms the fake lobby service answers `/lobby/channel-list` with (entries, or a whole service); by default none -- a request never answered. */
  rooms?: readonly ChannelListEntry[] | RoomListService;
  /** The invitations the fake service answers; by default Horizon's none. */
  invitations?: ClanInvitationReply[] | ClanInvitationsService;
  /** ONL-25: the ignore list's service (SVC-17's `/lobby/ignore-*`, SVC-18's `/lobby/find-player`); by default Horizon's empty list (one NoResult row), the rest never answered. */
  ignore?: IgnoreListService;
  /** ONL-30a: the ladder's service (SVC-13's `/lobby/ladder-list`, SVC-15a's `/lobby/player-info`; ONL-30's clans' three); by default an empty board -- NoResult for my position and for every page, PLAYER INFO never answered; the clans' ClanNotFound, a total of 0 and one NoResult row. */
  ladder?: LadderService;
  /** SVC-15: the room's player list's online state of a name (`BriefingRoomCommands.roomPlayerState`), PLAYER INFO's BRIEFING origin; absent, none. */
  roomState?: (name: string) => LadderOnlineState | null;
  /** ONL-24: the friends' service (SVC-16's `/lobby/friend-*`); by default Horizon's empty list (one NoResult row), none waiting, no push, the rest never answered. */
  friends?: FriendListService;
  /** ONL-24: the session's account name the friends' own-name check reads; absent, PLAYERNAMEVAR's text (`ACCOUNT_NAME_READING`). */
  accountName?: string;
  /** ONL-27: the clan's service (SVC-08's `/clan/my-clans`, `/clan/roster`, SVC-09's `/clan/remove`); by default Horizon's no clan (one NoResult reply), the roster ClanNotFound, the quit never answered. */
  roster?: ManageRosterService;
  /** ONL-27: the band's request GetMyClans' success sends (ONL-29's `ClanMessagesCommands.myClanMessages`); absent, none. */
  clanMessages?: { myClanMessages(): void };
  /** This task's mount (false: the base before ONL-09 -- the table's declared rows answer, no variable, no valve seeded). */
  commands?: boolean;
  /** The parked rows' gate (false: removed, so a parked row's CROSS runs the set's own script). */
  gate?: boolean;
  register?: (host: UiCommandHost, ctx: WorldRigContext) => void;
  /** Called at each frame before the machine's (ONL-12's rig: the lobby's step, as the page's `advance` calls it first). */
  tick?: () => void;
  /** SA-43c: the menu state's tick step (6), the system messages drained (`MenuStateOptions.systemMessages`); absent, none. */
  systemMessages?: () => void;
  face?: (name: string) => TextFace | null;
  captions?: CaptionSource | null;
  hasTexture?: (name: string) => boolean;
  /** One valve store for every launch, as the page's opener holds it (ONL-10's relaunch); absent, each boot makes its own. */
  valves?: ValveStore;
  /**
   * OPT-15 (web research 265 §1): PLAT-17's soft keyboard over the disc's `UiParams.rdr`, typed through its USB queue,
   * as the persona rig mounts it (`./personaRig`) -- ONLINE OPTIONS' PLAYER DESCRIPTION opens it. Absent: no keyboard.
   */
  keyboard?: boolean;
}
export interface WorldRigContext {
  machine: () => FrontEndMachine; uiVars: UiVarManager; parts: DialogPartsHost; event: (kind: number) => void;
  /** This task's rows (null before ONL-09's mount): ONL-12's join reads its rooms. */
  world: () => WorldOfSocomCommands | null;
  /** ONL-24's rows (null before ONL-09's mount). */
  friends: () => FriendListCommands | null;
  /** ONL-27's clan rows (null before ONL-09's mount). */
  roster: () => ManageRosterCommands | null;
}

export function worldRig(o: WorldRigOptions = {}) {
  const readerc = Zar.parse(READERC!);
  const sets = parseAnimSets(Zar.parse(UIZANIM!)).sets;
  const loc = locTable(readLocArchive(LOC!, 'UIMn').entries);
  let m!: FrontEndMachine;
  let frames = 0;
  const outcomes: { tick: number; dialog: string; fn: string; arg: string; node: string | null; op: number; loc: number; o: UiCommandOutcome }[] = [];
  const builds: string[] = [];
  const launches: Launch[] = [];
  const fixture = textFace();
  const face = o.face ?? (() => fixture);
  const uiVars = new UiVarManager();
  const captions: CaptionSource = o.captions ?? new LocService([readLocArchive(LOC!, 'UIMn')]);
  const parts = new DialogPartsHost({ popupObject: () => m.queue.popupObject, face, captions, uiVars, hasTexture: o.hasTexture });
  const sound: UiSoundOutput & { log: string[] } = { log: [], play(name) { this.log.push(`play ${String(name)}`); }, stopAll() { this.log.push('stopAll'); }, fadeAll() { this.log.push('fadeAll'); }, streaming(on) { this.log.push(`streaming ${on}`); } };
  const cues = new UiSoundCues(frontEndSoundTable(SOUND_SCRIPT as never, new Map([['HUDUI', { names: new Map<string, number>() }]])), { teletype: '.TYPE', back: '.BACK', selection: '.METAL' }, [], sound);
  const selections: number[] = [];
  const host = new UiCommandHost({ node: parts.nodeCommand, sound: (cmd) => { sound.log.push(`SOUND ${JSON.stringify(cmd)}`); cues.sound(cmd); } });
  let opened = '', builtName = '';
  const dispatch = host.dispatch.bind(host);
  host.dispatch = (cmd: ZAnimUiCommand, time) => { const r = dispatch(cmd, time); outcomes.push({ tick: frames, dialog: builtName, fn: cmd.fn ?? '', arg: cmd.arg, node: cmd.node, op: (cmd.opcodeByte - 0xe8) & 0xff, loc: cmd.loc, o: r }); return r; };
  let held: PadSlotName | null = null;
  const input = new MenuInput({ machine: () => m, parts, selection: () => { selections.push(frames); } });
  input.register(host);
  input.source = { read: () => ({ down: new Set<PadSlotName>(held ? [held] : []), stickX: 0, stickY: 0 }) };
  const usb: UsbKey[] = [];
  let skb: SoftKeyboardFrontEnd | null = null;
  if (o.keyboard) {
    skb = new SoftKeyboardFrontEnd({ machine: () => m, parts, face, uiVars, locText: (key) => { const r = captions.caption(key); return r.kind === 'loc' ? r.text : null; } });
    const params = readerc.find(UI_PARAMS_RDR.member);
    if (params) skb.load(readSoftKeyboards(parseRdr(readerc.data(params))));
    skb.connect(host, input);
    skb.usbKey = () => usb.shift() ?? null;
  }
  for (const [name, entry] of Object.entries(cues.entries())) host.setHandler(name, (cmd) => entry(cmd));
  const events: number[] = [];
  const inputString = (cmd: ZAnimUiCommand): string | null => m.shell()?.inputString(cmd.anim) ?? null;
  const event = (kind: number): void => { events.push(kind); m.shell()?.event(kind); };
  new MenuCommands({ valves: () => m.valves, uiVars, inputString, event }).register(host);
  new NetLoginCommands({ valves: () => m.valves, uiVars }).register(host);
  const queries: { announcement: unknown[]; invitations: unknown[]; rooms: unknown[] } = { announcement: [], invitations: [], rooms: [] };
  let world: WorldOfSocomCommands | null = null;
  let friends: FriendListCommands | null = null;
  let roster: ManageRosterCommands | null = null;
  if (o.commands !== false) {
    const a = o.announcement;
    const service: AnnouncementService = typeof a === 'object' ? a : { announcement: () => Promise.resolve(announced(a ?? '')) };
    const rl = o.rooms;
    const rooms: RoomListService = rl === undefined ? { channelList: () => new Promise(() => {}) } : Array.isArray(rl) ? { channelList: () => Promise.resolve(rl) } : rl as RoomListService;
    world = new WorldOfSocomCommands({
      uiVars, service: { announcement: (q) => { queries.announcement.push(q); return service.announcement(q); } },
      roomList: { channelList: (q) => { queries.rooms.push(q); return rooms.channelList(q); } },
    });
    world.register(host);
    if (o.gate === false) host.setBindingGate(PARKED_ROW_GATE, null);
    lobbySessionStart(uiVars);
    const i = o.invitations;
    const invites: ClanInvitationsService = Array.isArray(i) || i === undefined ? { check: () => Promise.resolve(i ?? [NO_INVITATION]) } : i;
    new ClanInvitationCommands({ list: new MyClanInvitations({ uiVars, event }), service: { check: (q) => { queries.invitations.push(q); return invites.check(q); } } }).register(host);
    const never = <T>(): Promise<T> => new Promise<T>(() => {});
    const ignore: IgnoreListService = o.ignore ?? {
      list: () => Promise.resolve([{ status: 1, ignoreAccountId: 0, ignoreAccountName: '', playerStatus: 0, endOfList: true }]), accountId: never, add: never, remove: never,
    };
    new IgnoreListCommands({ uiVars, service: ignore, event: (kind) => { event(kind); }, inputString }).register(host);   // ONL-25: SOCOM II ONLINE's GetIgnoreList, IGNORE's page
    const ladder: LadderService = o.ladder ?? {
      position: () => Promise.resolve({ status: 1, ladderPosition: 0, totalRankings: 0 }),
      list: () => Promise.resolve([{ status: 1, ladderPosition: 0, accountId: 0, accountName: '', stats: '', onlineState: { connectStatus: 0, lobbyWorldId: 0, gameWorldId: 0, lobbyName: '', gameName: '' }, endOfList: true }]),
      playerInfo: never,
      clanPosition: (q) => Promise.resolve({ tag: q.tag ?? '', status: -971, ladderPosition: 0, totalRankings: 0 }),
      clanTotal: () => Promise.resolve({ status: 0, totalRankings: 0 }),
      clanList: (q) => Promise.resolve([{ tag: q.tag, status: 1, clanId: 0, clanName: '', ladderPosition: 0, endOfList: true }]),
    };
    const friendService: FriendListService = o.friends ?? {
      list: () => Promise.resolve([{ status: 1, accountId: 0, accountName: '', onlineState: { connectStatus: 0, lobbyWorldId: -1, gameWorldId: -1, lobbyName: '', gameName: '' }, endOfList: true }]),
      request: never, answer: () => Promise.resolve(), invitations: () => Promise.resolve([]), add: never, remove: never, events: () => Promise.resolve([]),
    };
    const fl = new FriendListCommands({ uiVars, service: friendService, event: (kind) => { event(kind); }, inputString, ...(o.accountName !== undefined ? { accountName: () => o.accountName! } : {}) });
    fl.register(host);   // ONL-24: SOCOM II ONLINE's GetFriendsList, FRIENDS' page
    friends = fl;
    new LadderLobbyCommands({
      uiVars, valves: () => m.valves, service: ladder, event: (kind) => { event(kind); }, inputString, friendState: (name) => fl.onlineStateByName(name),
      ...(o.roomState ? { roomState: o.roomState } : {}), clan: world.clan, clanState: world.clan.find.bind(world.clan),
    }).register(host);   // ONL-30a: the menu's top ten, PLAYER RANKING, PLAYER INFO (ONL-24: its FRIEND origin; SVC-15: its BRIEFING origin; PLAYER-INFO-CLAN: its CLAN origin, as ladderLobbyHost.ts mounts it); ONL-30: CLAN RANKING over the session's clan
    const clanService: ManageRosterService = o.roster ?? {
      myClans: () => Promise.resolve([{ status: 1, clanId: 0, clanName: '', leaderAccountId: 0, leaderAccountName: '', stats: '00'.repeat(256), endOfList: true }]),
      roster: () => Promise.resolve([{ status: -971, accountId: 0, accountName: '', stats: '00'.repeat(256), onlineState: { connectStatus: 0, lobbyWorldId: 0, gameWorldId: 0, lobbyName: '', gameName: '' }, ladderStat: 0, ladderPosition: 0, totalRankings: 0, endOfList: true }]),
      remove: never,
    };
    roster = new ManageRosterCommands({
      uiVars, clan: world.clan, service: clanService, event: (kind) => { event(kind); }, inputString,
      ...(o.accountName !== undefined ? { accountName: () => o.accountName! } : {}), ...(o.clanMessages ? { clanMessages: o.clanMessages } : {}),
    });
    roster.register(host);   // ONL-27: SOCOM II ONLINE's GetClan, IsMemberOfClan, IsLeaderOfClan; the rosters' rows
  }
  o.register?.(host, { machine: () => m, uiVars, parts, event, world: () => world, friends: () => friends, roster: () => roster });
  if (o.name !== undefined) uiVars.add('PLAYERNAMEVAR', { type: 'string', value: o.name }, 2);
  const slot = new PopupSlot();
  slot.connect(parts.makePopup);
  const movie = { service: { background: { on: () => true, off: () => true }, play: () => {} } as unknown as MovieService, frame: () => 'menu' as const, unload: () => {}, load: () => input.built() };
  const lookup = (o.dialogs ?? ((l) => l))(dialogLookup([readerc]));
  let last: UiDrawItem[] = [];
  const start = o.start ?? WORLD;
  m = new FrontEndMachine({
    dialog: (n) => { opened = n; return lookup(n); }, sets, host, popups: slot, startDialog: start,
    build: { face, captions },
    built: (b) => { parts.built(b); builtName = opened; builds.push(opened); }, draw: skb ? skb.drawOver(parts.draw) : parts.draw, widgetsTick: parts.widgetsTick, setEnabled: parts.setEnabled,
    ...(skb ? { focusTick: skb.tick } : {}), input: input.dispatch, pad: input.read, activate: input.activate, movie, onLaunch: (l) => { launches.push(l); },
    valves: o.valves ? () => o.valves! : undefined,
    ...(o.systemMessages ? { systemMessages: o.systemMessages } : {}),
  });
  m.boot();
  if (o.commands !== false) seedWorldOfSocomValves(m.valves);
  const frame = (): void => { frames++; o.tick?.(); last = m.frame(UI_TICK_SECONDS); };
  const run = (n = 1): void => { for (let i = 0; i < n; i++) frame(); };
  const settle = async (n = 1): Promise<void> => { for (let i = 0; i < n; i++) { frame(); await Promise.resolve(); await Promise.resolve(); } };
  /** One button down for one frame (FALLING), up the next (RISING), then `after` idle frames. */
  const press = (name: PadSlotName, after = 2): void => { held = name; frame(); held = null; for (let i = 0; i < after; i++) frame(); };
  /** Typed on the USB keyboard a key a frame, then `end` (ENTER by default) and 12 frames (the `keyboard` option's). */
  const type = (text: string, end: UsbKey | null = USB_ENTER): void => {
    for (const k of usbKeys(text)) { usb.push(k); frame(); }
    if (end) { usb.push(end); frame(); run(12); }
  };
  /** A button held down from the next frame (FALLING, then DOWN each frame) until `hold(null)` lets it go (RISING). */
  const hold = (name: PadSlotName | null): void => { held = name; };
  /** A switch to `dialog` asked of the table's SwitchMenu, as a page's return to this menu asks it, and run to the build. */
  const switchTo = async (dialog: string): Promise<void> => {
    const built = builds.length;
    host.dispatch({ anim: 'test', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'SwitchMenu', arg: dialog, loc: 0, bytes: new Uint8Array(0x10) });
    for (let i = 0; i < 120 && builds.length === built; i++) await settle(1);
  };
  /**
   * The dispatches on `dialog` since `fromIndex`, one a line: a command a node's object took as `<node>.op<n>(<#id or
   * argument>)`; a table row as `<name>(<argument>) table`, or `not implemented: <task>` when no body is registered,
   * with `<node>:` before it when the set aims the row at a node; `none` when no row has the key.
   */
  const line = (x: (typeof outcomes)[number]): string => {
    if (x.o.kind === 'node') return `${x.node}.op${x.op}(${x.loc > 0 ? `#${x.loc}` : x.arg})`;
    return `${x.node !== null ? `${x.node}:` : ''}${x.fn}(${x.arg}) ${x.o.kind === 'not-implemented' ? `not implemented: ${x.o.task}` : x.o.kind}`;
  };
  const calls = (dialog = WORLD, fromIndex = 0): string[] => outcomes.slice(fromIndex).filter((x) => x.dialog === dialog).map(line);
  const focused = (): string => input.ring()?.focused?.name ?? '';
  const node = (name: string) => findNode(m.shell()!.screen.root, name);
  const text = (name: string): string[] => {
    const c = node(name)?.content;
    if (c?.kind === 'wrapped') return c.lines.map((l) => String.fromCharCode(...l.bytes));
    if (c?.kind === 'text') return [String.fromCharCode(...c.text.codes)];
    return [];
  };
  const valve = (name: string): number | undefined => m.valves.find(name)?.value;
  const shown = (): boolean => { const g = m.shell()!; return g.popups.shown(g.screen); };
  return { m, friends: () => friends, parts, input, skb, type, uiVars, loc, run, settle, frame, press, hold, outcomes, calls, focused, node, text, valve, shown, builds, sound, selections, events, launches, queries, switchTo, host, last: () => last, current: () => m.shell()?.currentName ?? '', frames: () => frames };
}
