import { lobbyEventInto } from '../../src/screens/connectCommands';
import { LobbyClient } from '../../src/screens/lobbyClient';
import {
  BriefingRoomCommands, seedBriefingRoomValves, type BriefingRoomService, type CurrentGameHeld, type GameListEntry, type JoinChannelQuery, type RoomPlayerEntry, type WorldReply,
} from '../../src/screens/briefingRoomCommands';
import type { MissionRecord } from '../../src/screens/createGameCommands';
import { BriefingRoomChat, type ChatFwdLine, type ServerSystemMessage } from '../../src/screens/briefingRoomChat';
import { UI_TICK_SECONDS } from '../../src/clock/uiClock';
import type { UiCommandHost } from '../../src/uiCommands';
import { worldRig, type WorldRigContext, type WorldRigOptions } from './worldOfSocomRig';

/**
 * The BRIEFING ROOM rig (ONL-12; web research 162): `worldRig` -- SOCOM II ONLINE built from the disc's own records with
 * the session's modules -- with ONL-07's lobby client (`LobbyClient`, logged in over a fake account service and
 * stepped once a frame before the machine, as the page's `advance` steps it) and this task's rows over a fake briefing
 * room service (SVC-06's `/lobby/join-channel`, `/lobby/set-filter`, `/lobby/leave-channel`, `/lobby/game-list`).
 * The lobby's events reach the built dialog with their text (`lobbyEventInto`), so MP_JOIN_ROOM runs the menu's
 * `switch_to_briefing_room` and MP_MEDIUS_JOIN_ROOM_FAILURE its `OnJoinRoomFailure`. The login itself is the rig's
 * set-up: its events (MP_SUCCESS, the login's MP_JOIN_ROOM) are not delivered, since the menu is reached past them
 * (research 157 R157.5). The files come from the disc or the committed fixtures, as `worldRig`'s. ONL-23 (research 266
 * §1): the lobby server's chat (`BriefingRoomChat`) over a fake chat service (SVC-18's `/lobby/find-player`,
 * `/lobby/chat`, `/lobby/chat-lines`), its poll stepped once a frame on the rig's clock; its requests apart
 * (`chatRequests`), so the room's own stay in order.
 */

/** The session's ticket the fake account service issues. */
export const TICKET = 'T1';

export interface BriefingRigOptions extends WorldRigOptions {
  /** JoinChannel's answer; by default success with the room's id. */
  joinChannel?: (q: JoinChannelQuery) => Promise<WorldReply>;
  /** The game list's entries (or a function answering each request); by default Horizon's NoResult page. */
  games?: readonly GameListEntry[] | (() => Promise<readonly GameListEntry[]>);
  /** ONL-16a's rig: told the host, the context, the lobby and this task's rows once they are mounted. */
  mounted?: (m: { host: UiCommandHost; ctx: WorldRigContext; lobby: LobbyClient; briefing: BriefingRoomCommands; chat: BriefingRoomChat; event: (kind: number, text: string | null) => void }) => void;
  /** ONL-23: the lines `/lobby/chat-lines` answers at the next poll (taken); by default none. */
  chatLines?: () => ChatFwdLine[];
  /** SA-43c: the live notices `/lobby/chat-lines` carries as `system` at each poll; absent, the reply is the lines alone (an older server's). */
  system?: () => readonly ServerSystemMessage[];
  /** ONL-23: FindPlayer's answer; by default the account 42 of that name. */
  findPlayer?: (name: string) => { status: number; accountId: number; accountName: string };
  /** SVC-15: the room's players `/lobby/room-player-list` answers; by default Horizon's NoResult row (MLS.cs:2963-2970). */
  players?: readonly RoomPlayerEntry[];
  /** ONL-13's `missionlist.rdr` records (GAME DETAILS' type words and check, `GetGameInfo`); absent, none. */
  missions?: () => readonly MissionRecord[];
  /** `GetGameInfo('CurrentGame')`'s held play list and mission (`GameLobbyCommands.currentGame`); absent, none. */
  currentGame?: () => CurrentGameHeld | null;
}

const NO_PLAYERS: RoomPlayerEntry = {
  status: 1, accountId: 0, accountName: '', onlineState: { connectStatus: 0, lobbyWorldId: 0, gameWorldId: 0, lobbyName: '', gameName: '' }, endOfList: true,
};

const NO_GAMES: GameListEntry = {
  status: 1, mediusWorldId: 0, playerCount: 0, minPlayers: 0, maxPlayers: 0, gameLevel: 0, playerSkillLevel: 0, rulesSet: 0, genericField1: 0, genericField2: 0,
  genericField3: 0, securityLevel: 0, worldStatus: 0, gameHostType: 0, gameName: '', gameStats: '00'.repeat(256), endOfList: true,
};

export async function briefingRig(o: BriefingRigOptions = {}) {
  let lobby!: LobbyClient;
  let deliver = false;
  const requests: { op: string; body: unknown }[] = [];
  const chatRequests: { op: string; body: unknown }[] = [];
  let chat!: BriefingRoomChat;
  let frames = 0;
  const service: BriefingRoomService = {
    joinChannel: (q) => { requests.push({ op: 'join-channel', body: q }); return o.joinChannel?.(q) ?? Promise.resolve({ status: 0, mediusWorldId: q.mediusWorldId }); },
    setGameListFilter: (q) => { requests.push({ op: 'set-filter', body: q }); return Promise.resolve({ status: 0, filterId: q.filterField }); },
    leaveChannel: () => { requests.push({ op: 'leave-channel', body: {} }); return Promise.resolve({ status: 0 }); },
    gameList: (q) => {
      requests.push({ op: 'game-list', body: q });
      const g = o.games;
      return typeof g === 'function' ? g() : Promise.resolve(g ?? [NO_GAMES]);
    },
    roomPlayerList: (q) => { requests.push({ op: 'room-player-list', body: q }); return Promise.resolve(o.players ?? [NO_PLAYERS]); },
  };
  let briefingRows: BriefingRoomCommands | null = null;
  const r = worldRig({
    ...o,
    roomState: (name) => briefingRows?.roomPlayerState(name) ?? null,   // SVC-15: PLAYER INFO's BRIEFING origin
    tick: () => { frames++; lobby.step(); chat.frame(frames * UI_TICK_SECONDS * 1000); o.tick?.(); },
    systemMessages: () => { chat.systemMessages(); },                    // SA-43c: the menu state's tick step (6)
    register: (host, ctx) => {
      const into = lobbyEventInto(ctx.machine, ctx.parts);
      lobby = new LobbyClient({
        valves: () => ctx.machine().valves, event: (kind, text) => { if (deliver) into(kind, text); },
        service: { login: () => Promise.resolve({ status: 0, ticket: TICKET }), register: () => Promise.resolve({ status: 0 }) },
      });
      chat = new BriefingRoomChat({
        uiVars: ctx.uiVars, lobby, rooms: () => ctx.world()?.rooms() ?? [], event: into, ticket: () => lobby.ticket(),
        service: {
          findPlayer: (q) => { chatRequests.push({ op: 'find-player', body: q }); return Promise.resolve(o.findPlayer?.(q.name) ?? { status: 0, accountId: 42, accountName: q.name }); },
          chat: (q) => { chatRequests.push({ op: 'chat', body: q }); return Promise.resolve(); },
          chatLines: () => { chatRequests.push({ op: 'chat-lines', body: {} }); const lines = o.chatLines?.() ?? []; return Promise.resolve(o.system ? { lines, system: o.system() } : lines); },
        },
      });
      chat.register(host);
      const briefing = new BriefingRoomCommands({
        uiVars: ctx.uiVars, valves: () => ctx.machine().valves, lobby, service, rooms: () => ctx.world()?.rooms() ?? [],
        inputString: (cmd) => ctx.machine().shell()?.inputString(cmd.anim) ?? null, event: into, ticket: () => lobby.ticket(), chat,
        ...(o.missions ? { missions: o.missions } : {}), ...(o.currentGame ? { currentGame: o.currentGame } : {}),
      });
      briefing.register(host);
      briefingRows = briefing;
      o.mounted?.({ host, ctx, lobby, briefing, chat, event: into });
      o.register?.(host, ctx);
    },
  });
  seedBriefingRoomValves(r.m.valves);
  lobby.connect('localhost', 10075);
  lobby.login('socomc', 'pw');
  for (let i = 0; i < 12 && lobby.state() !== 11; i++) await r.settle(1);
  deliver = true;
  return { ...r, lobby, requests, chatRequests, chat: () => chat };
}
