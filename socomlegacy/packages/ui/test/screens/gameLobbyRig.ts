import { UI_TICK_SECONDS } from '../../src/clock/uiClock';
import { recoverLobbyControls } from '../../src/screens/lobbyRecovery';
import { DIALOG_EVENTS } from '../../src/dialog';
import { decodeTextInput } from '../../src/keyboard/textInput';
import {
  GameLobbyCommands, type GameLobbyCommandsOptions, type GameLobbyMatchStart, type GameLobbySeat, type GameLobbyVoicePort, type GameLobbyView, type GameSocketPort, type JoinGameQuery, type JoinGameReply, type WorldReportQuery,
} from '../../src/screens/gameLobbyCommands';
import { ArmoryProfileCommands, type ArmoryLoadoutService } from '../../src/screens/armoryProfileCommands';
import { mountCreateGame, type CreateGameReply, type CreateGameRequest } from '../../src/screens/createGameCommands';
import type { BriefingRoomCommands } from '../../src/screens/briefingRoomCommands';
import type { WorldOfSocomCommands } from '../../src/screens/worldOfSocomCommands';
import { briefingRig, type BriefingRigOptions } from './briefingRoomRig';
import { parseRdrTyped, parseZdb, zdbMember, Zar } from '@s2u/archive';
import { missionUiVarEntries } from '@s2u/scene';
import type { UiVarEntry } from '../../src/uiVars';
import { file } from './worldOfSocomRig';

/**
 * LOBBY-MAPNAME: a mission's `mission.rdr` `UiVars` entries, each node's type kept (`missionUiVarEntries` over
 * `parseRdrTyped`), read from its map archive's `READERM.ZAR` (`RUN/<MISSION>.ZDB`, the disc's or the committed
 * fixture's), synchronously as `FUN_002acc10` reads it; null when the archive is not held.
 */
export function discMissionVars(mission: string): readonly UiVarEntry[] | null {
  const bytes = file(`RUN/${mission.toUpperCase()}.ZDB`);
  if (!bytes) return null;
  const readerm = Zar.parse(zdbMember(bytes, parseZdb(bytes), 'READERM.ZAR'));
  const key = readerm.root.children.find((k) => k.name.toLowerCase() === 'mission.rdr');
  return key ? missionUiVarEntries(parseRdrTyped(readerm.data(key))) : null;
}

/**
 * The GAME LOBBY rig (ONL-16a; web research 165): `briefingRig` -- SOCOM II ONLINE and the BRIEFING ROOM built from the
 * disc's own records over the logged-in lobby client -- with this task's rows over a fake join service (SVC-06's
 * `/lobby/join-game`, `/lobby/leave-game`) and a fake game socket: the test speaks for the match server (`welcome`,
 * `gameLobby`, `roundStart`, a close) as the page's host (`packages/viewer/src/gameLobbyHost.ts`) hands them on. The
 * soft keyboard is a stand-in row: `GetTextInput` types `typed` into its variable and posts ON_SKB_APPLY (or, with
 * `typed` null, ON_SKB_CANCEL), carrying the committed text as PLAT-17's real keyboard does. The page's clock is the rig's frames.
 */

export interface GameLobbyRigOptions extends BriefingRigOptions {
  /** JoinGame's answer; by default success. */
  joinGame?: (q: JoinGameQuery) => Promise<JoinGameReply>;
  /** What each keyboard types (null: cancelled); a function can answer successive retries. */
  typed?: string | null | (() => string | null);
  /** The welcome's seat id the socket answers its open with (null: no answer). */
  welcome?: number | null;
  /** The first `gameLobby` after the welcome. */
  lobbyView?: (id: number) => GameLobbyView;
  /** CREATE GAME's `/lobby/create-game` answer (ONL-13's rows mounted as the session mounts them); by default world id 9. */
  createGame?: (req: CreateGameRequest) => Promise<CreateGameReply>;
  /** The host's `/lobby/world-report` answer; by default accepted. */
  worldReport?: (q: WorldReportQuery) => Promise<{ status: number; door?: string; token?: string }>;
  /** ONL-17: SVC-24's records as the page reaches them (`ArmoryProfileCommands`, mounted as `connectGameLobby` mounts it); absent, none. */
  loadouts?: ArmoryLoadoutService;
  /** ONL-16b: the page's voice under `VCButton` and `CheckForcedLaunch` (`packages/viewer/src/gameLobbyHost.ts`'s); absent, none. */
  voice?: GameLobbyVoicePort;
  /** ONL-15: AUTOPLAY's chain under `JoinMPGame(RANDOM)` (the test mounts `AutoplaySearch` over the returned `briefing`); absent, none. */
  randomGame?: () => void;
  /** The page's clan id (`GameLobbyCommandsOptions.clanId`, the join's `ClanGameClosed`); absent, none (-1). */
  clanId?: number;
  /** LOBBY-INVITE: `GameLobbyCommandsOptions.joinRefused` (an invite's own refusal line); absent, none. */
  joinRefused?: (status: number, worldId: number) => boolean;
  /** FBA-2: expose the optional bot request transport; defaults to an older server with no bot capability. */
  bots?: boolean;
  /** LOBBY-MAPNAME: `GameLobbyCommandsOptions.missionVars` (`discMissionVars` reads the disc's); absent, none. */
  missionVars?: GameLobbyCommandsOptions['missionVars'];
}

export const seat = (id: number, name: string, team: GameLobbySeat['team'], o: Partial<GameLobbySeat> = {}): GameLobbySeat => ({ id, name, team, ready: false, host: false, readyIn: 30, ...o });

export async function gameLobbyRig(o: GameLobbyRigOptions = {}) {
  let commands!: GameLobbyCommands;
  let profiles!: ArmoryProfileCommands;
  let briefing!: BriefingRoomCommands;
  let world: () => WorldOfSocomCommands | null = () => null;
  let frames = 0;
  const sent: string[] = [];
  const socketLog: string[] = [];
  const joins: JoinGameQuery[] = [];
  const leaves: number[] = [];
  const starts: GameLobbyMatchStart[] = [];
  const switches: string[] = [];
  const creates: CreateGameRequest[] = [];
  const reports: WorldReportQuery[] = [];
  /** WATCH-JOIN W1: each `GetTextInput` the scripts ran -- its variable and its title line, `decodeTextInput` over the command's own bytes (research 119 §4). */
  const keyboards: { uiVar: string; purpose: string }[] = [];
  let lastEvent: ((kind: number, text: string | null) => void) | null = null;
  const socket: GameSocketPort = {
    open: (id, pass) => {
      socketLog.push(pass ? `open ${id} ${pass.door} ${pass.token}` : `open ${id}`);   // SA-6b: a placed game's door and token, logged with the open
      const w = o.welcome === undefined ? 2 : o.welcome;
      if (w !== null) void Promise.resolve().then(() => { commands.welcomed(w); commands.gameLobby(o.lobbyView?.(w) ?? { seats: [seat(1, 'host', 'seal', { host: true }), seat(w, 'socomc', 'terrorist')], countdown: null, launched: false }); });
      return true;
    },
    send: (type) => { sent.push(type); },
    chat: (text, team) => { sent.push(`chat ${text}${team ? ' (team)' : ''}`); },   // ONL-23: the seat's line (`{ type: 'chat', text }`); SVC-19: its TEAM scope
    ...(o.bots ? { bots: (team: 'seal' | 'terrorist', setting: import('../../src/screens/gameLobbyCommands').BotSetting) => { sent.push(`bots ${team} ${setting}`); } } : {}),
    close: () => { socketLog.push('close'); },
  };
  const r = await briefingRig({
    ...o,
    currentGame: () => commands?.currentGame() ?? null,   // GetGameInfo('CurrentGame'): the game held (lobby +0x84, 0x414e00)
    tick: () => { frames++; o.tick?.(); },
    mounted: (m) => {
      lastEvent = m.event;
      briefing = m.briefing;
      world = m.ctx.world;
      m.host.setHandler('GetTextInput', (cmd) => {
        keyboards.push({ uiVar: cmd.arg, purpose: decodeTextInput(cmd.bytes, (i) => m.ctx.parts.current?.name(cmd, i) ?? null).purpose });
        const typed = typeof o.typed === 'function' ? o.typed() : o.typed === undefined ? 'pw' : o.typed;
        if (typed !== null) m.ctx.uiVars.set(m.ctx.uiVars.add(cmd.arg, null, 2), { type: 'string', value: typed });
        void Promise.resolve().then(() => m.event(DIALOG_EVENTS[typed === null ? 'ON_SKB_CANCEL' : 'ON_SKB_APPLY']!, typed));
        return true;
      });
      commands = new GameLobbyCommands({
        recoverLobby: (state) => recoverLobbyControls(m.ctx.parts.current, m.ctx.machine().shell()?.currentName, state),
        uiVars: m.ctx.uiVars, valves: () => m.ctx.machine().valves, lobby: m.lobby, games: () => m.briefing.gamesHeld(),
        service: {
          joinGame: (q) => { joins.push(q); return o.joinGame?.(q) ?? Promise.resolve({ status: 0, mediusWorldId: q.mediusWorldId }); },
          leaveGame: () => { leaves.push(frames); return Promise.resolve({ status: 0 }); },
          worldReport: (q) => { reports.push(q); return o.worldReport?.(q) ?? Promise.resolve({ status: 0 }); },
        },
        roomWorldId: () => m.briefing.roomWorldId(),
        socket, inputString: (cmd) => m.ctx.machine().shell()?.inputString(cmd.anim) ?? null, event: m.event, chat: m.chat,
        switchMenu: (d) => { switches.push(d); m.ctx.machine().queue.switchMenu(d); }, matchStart: (s) => { starts.push(s); },
        ...(o.voice ? { voice: o.voice } : {}),
        ...(o.randomGame ? { randomGame: o.randomGame } : {}),
        ...(o.clanId !== undefined ? { clanId: () => o.clanId! } : {}),
        ...(o.joinRefused ? { joinRefused: o.joinRefused } : {}),
        ...(o.missionVars ? { missionVars: o.missionVars } : {}),
        now: () => frames * UI_TICK_SECONDS * 1000, log: (n, a, ans) => { if (process.env.GL_DEBUG) console.log('ROW', n, a, ans, m.lobby.state(), JSON.stringify(m.briefing.gamesHeld().map((g) => g.gameName)), m.ctx.machine().shell()?.inputString('aux_join_game')); },
      });
      commands.register(m.host);
      profiles = new ArmoryProfileCommands({ valves: () => m.ctx.machine().valves, mission: () => commands.missionName(), service: o.loadouts });   // ONL-17
      profiles.register(m.host);
      mountCreateGame(m.host, {                                                  // ONL-13's mount: its success is this lobby's entry
        uiVars: m.ctx.uiVars, valves: () => m.ctx.machine().valves, event: (k) => m.event(k, null), roomWorldId: () => m.briefing.roomWorldId(),
        lobbyUp: () => m.lobby.up, lobbyState: () => m.lobby.state(),
        service: { createGame: (req) => { creates.push(req); return o.createGame?.(req) ?? Promise.resolve({ status: 0, mediusWorldId: 9 }); } },
        created: (g) => commands.created(g),
      });
    },
  });
  return { ...r, commands, briefing, world, profiles: () => profiles, sent, socketLog, joins, leaves, starts, switches, creates, reports, keyboards, post: (event: string) => lastEvent?.(DIALOG_EVENTS[event]!, null),
    /** LOBBY-INVITE: a named event with its text (MP_MEDIUS_JOIN_ROOM_FAILURE's POPUP INPUT_STRING). */
    postWith: (kind: number, text: string | null) => lastEvent?.(kind, text) };
}
