import {
  appendGameLobbyChat, ArmoryProfileCommands, GameLobbyCommands, type LobbyTextChat, type ArmoryLoadoutProfile, type ArmoryLoadoutRecord, type ArmoryLoadoutService, type ArmoryLoadoutSide, type BotSetting, type LobbySide, type GameJoinService, type GameLobbyLobby, type GameLobbyMatchStart, type GameListEntry, type GameSocketPort,
  type GameLobbyVoicePort, type GameSeatPass, type JoinGameQuery, type JoinGameReply, type UiCommandHost, type UiVarManager, type ValveStore, type WorldReportQuery, type ZAnimUiCommand,
} from '@s2u/ui';
import { tunersOfVars } from './audio';
import {
  GAME_HELLO_WAIT_MS_ADAPTATION, GAME_RETOKEN_REASONS, GAME_RETOKEN_WAIT_MS_ADAPTATION, gameSeatOpen, gameSeatProvider, isGameToken, isPinnedSocket, isSeatOf, pinnedGameDoor, socketHost,
  type GameSeat, type GameSeatProvider, type GameSeatProviderOptions, type GameTokenReply, type PinnedGameDoor, type PinnedSocketUrl, type Reseat,
} from './connectHost';
import type { PadButton } from './gamepad';
import { heardTalker, VOICE_SUSPENDED_MARK_PLACEHOLDER } from './hudVoice';
import { NetClient, type NetWalk, type WebSocketLike } from './net/client';
import { SERVER_UPDATE_CLOSE, type ServerEvent } from './net/protocol';

/** OBF-4 (F4-1): the game's end close (4007, `match/src/gameRules.ts` GAME_ENDED_CLOSE), the seat's end a 4022 is read as. */
const GAME_ENDED_CLOSE_CODE = 4007;
import type { VoiceDown } from './net/voiceWire';
import { dropRetry, GAME_FINAL_CLOSES, retryDueAt } from './netPage';
import type { TauntMenuDeps } from './tauntMenu';
import { mountHeadset, type Headset } from './voice/headset';
import { LOBBY_TALK_BUTTON, TalkInput } from './voice/talkInput';
import { mountVoice, type MatchVoice, type MatchVoiceDeps, type VoiceState } from './voice/voiceClient';

/**
 * ONL-16a's page half (web research 165 §4): the game join's and the game lobby's requests to the room service --
 * `/lobby/join-game`, `/lobby/leave-game`, `/lobby/world-report` with the session's ticket as the bearer, at the page's
 * own origin, as the briefing room's (`./briefingRoomHost`) -- and the game's socket to the match server (SVC-07a,
 * research 159 §4): opened only through the page's pinned URL (`pinnedMatchSocket`, research 169 measure 7), its hello
 * carrying `game` and `ticket`; the session held by it from its accepted hello (`LobbyClient.socketHolds(true)`) and let
 * go at every close (research 157 §6); its `welcome`, `gameLobby` and `roundStart` handed to `@s2u/ui`'s
 * `GameLobbyCommands`; a close the server made for good (`GAME_FINAL_CLOSES`) or a refused hello the seat's end, any
 * other close -- a drop, `JOIN_FAILED_CLOSE` 4010 -- opened again on `NetPage`'s backoff. At the match's start the
 * socket is handed on open (`GameLobbyHandOff`, ONL-18's). The transport is ours (OT.R27).
 *
 * SA-6b (the server split, SA.R22 (1)-(4), (6); `GAME_DOOR_ADAPTATION`, `GAME_SEAT_PASS_ADAPTATION`): a placed game's
 * join or report answer carries its door and game token; the socket then opens on the door (`pinnedGameDoor`, the page's
 * devmode rule for the loopback) with the token in the hello in place of the ticket, and the hand-off carries the door
 * and the token; the login's bearer never goes to a door.
 *
 * SA-6c (SA.R22 (5), (7) as amended 2026-10-18; `GAME_RETOKEN_ADAPTATION`): a placed seat's every reconnect awaits central's
 * re-token (`POST /lobby/game-token`, `fetchGameLobbyService.gameToken`) through the seat's one provider
 * (`gameSeatProvider`, made at the open and handed on at the match's start), and opens the seat answered; a local seat
 * reconnects as today.
 */

/** A 401: the server holds no session for the ticket (`SESSION_LOST_READING`, `@s2u/ui`'s lobby client). */
export const GAME_LOBBY_SESSION_LOST = 'session-lost' as const;
type Lost = typeof GAME_LOBBY_SESSION_LOST;

/**
 * GAME_LOBBY_HTTP_ADAPTATION: as `BRIEFING_ROOM_HTTP_ADAPTATION` -- 2xx the reply's fields, checked; 401 the session lost
 * (handed to `LobbyClient.sessionLost`); anything else a request never answered; no ticket, no request. A browser
 * adaptation of the transport.
 */
export const GAME_LOBBY_HTTP_ADAPTATION = '2xx the reply; 401 the session lost; anything else never answered; no ticket, no request' as const;

/**
 * LOBBY_IDLE_WALK_ADAPTATION: `NetClient` drives a walk (the match's mover); in the lobby there is none, so the socket
 * is made over a walk that does nothing until ONL-18's match takes the client on with its own. A browser adaptation.
 */
export const LOBBY_IDLE_WALK_ADAPTATION = 'the game socket over an idle walk until the match takes it' as const;

const idleWalk: NetWalk = { setNetTap: () => {}, respawn: () => false, nudge: () => {}, setLocked: () => {}, grounded: () => false };   // LATER 498: no ground, so its refusal holds no spawn

const record = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object') throw new Error('game lobby reply: not the shape');
  return raw as Record<string, unknown>;
};
const ints = <K extends string>(raw: unknown, keys: readonly K[]): Record<K, number> => {
  const r = record(raw);
  if (!keys.every((k) => Number.isSafeInteger(r[k]))) throw new Error('game lobby reply: not the shape');
  return Object.fromEntries(keys.map((k) => [k, r[k] as number])) as Record<K, number>;
};
/**
 * SA-6b (`GAME_SEAT_PASS_ADAPTATION`): a placed game's `door` and `token` as sent -- each, when present, a string, the
 * token of its form (`isGameToken`), else not the shape; whether both came is the lobby's rule (`seatPassOf`), so one
 * without the other is refused on its failure paths, not taken as never answered.
 */
const seatPassFields = (raw: unknown): { door?: string; token?: string } => {
  const r = record(raw);
  if ((r['door'] !== undefined && typeof r['door'] !== 'string') || (r['token'] !== undefined && !isGameToken(r['token']))) {
    throw new Error('game lobby reply: not the shape');
  }
  return { ...(r['door'] !== undefined ? { door: r['door'] as string } : {}), ...(r['token'] !== undefined ? { token: r['token'] as string } : {}) };
};

/** The transport: each request with the ticket as its bearer. */
export interface GameLobbyTransport {
  joinGame(q: JoinGameQuery, ticket: string, signal?: AbortSignal): Promise<JoinGameReply | Lost>;
  leaveGame(ticket: string, signal?: AbortSignal): Promise<{ status: number } | Lost>;
  worldReport(q: WorldReportQuery, ticket: string): Promise<{ status: number; door?: string; token?: string } | Lost>;
  /** ONL-17 / SVC-24: `GET /lobby/loadout`, the account's ARMORY records; absent, none are loaded. */
  loadLoadouts?(ticket: string): Promise<ArmoryLoadoutRecord[] | Lost>;
  /** ONL-17 / SVC-24: `PUT /lobby/loadout`, one side's record of one mission; absent, none is saved. */
  saveLoadout?(mission: string, side: ArmoryLoadoutSide, profile: ArmoryLoadoutProfile, ticket: string): Promise<void | Lost>;
  /**
   * SA-6c (`GAME_RETOKEN_ADAPTATION`): `POST /lobby/game-token` `{ game }`, a placed seat's re-token -- the body's status,
   * door and token as sent (the provider checks them), or the session lost; rejects for every other answer (the
   * backoff's: no answer, a 5xx, 404 from a central without the split, any other status, a body not of the shape).
   * Absent, no re-token.
   */
  gameToken?(game: number, ticket: string, signal?: AbortSignal): Promise<GameTokenReply>;
}

const isProfile = (p: unknown): boolean => {
  const v = p as Partial<ArmoryLoadoutProfile> | null;
  return v === null || (typeof v === 'object' && Number.isInteger(v.charSet) && typeof v.valid === 'boolean' && Array.isArray(v.items) && v.items.length === 5 && v.items.every((i) => Number.isInteger(i)));
};
/** SVC-24's `GET` answer read: every record of its shape, else a throw. */
function loadoutsOf(raw: unknown): ArmoryLoadoutRecord[] {
  const list = record(raw)['loadouts'];
  if (!Array.isArray(list) || !list.every((r) => r && typeof r === 'object' && typeof (r as ArmoryLoadoutRecord).mission === 'string' && isProfile((r as ArmoryLoadoutRecord).seal) && isProfile((r as ArmoryLoadoutRecord).terrorist))) {
    throw new Error('game lobby reply: not the shape');
  }
  return list as ArmoryLoadoutRecord[];
}

/**
 * NET-DRAIN (web research 223 §7): a request the server refused with a JSON body carrying the Medius status -- the drain's
 * 503 -- is passed on as that status (`refused`), so the screen shows its refusal at once; a refusal without one is a
 * request never answered, as before.
 */
async function statusOf(res: Response): Promise<number | null> {
  try {
    const body = await res.json() as { status?: unknown } | null;
    return body && typeof body === 'object' && Number.isSafeInteger(body.status) ? body.status as number : null;
  } catch { return null; }
}

/** The three requests over the match server's `POST <base>/lobby/<op>` (`GAME_LOBBY_HTTP_ADAPTATION`). */
export function fetchGameLobbyService(base: string, fetchFn: typeof fetch = (...a) => fetch(...a)): GameLobbyTransport {
  const post = async <T>(op: string, body: unknown, ticket: string, read: (raw: unknown) => T, refused?: (status: number) => T, signal?: AbortSignal): Promise<T | Lost> => {
    const res = await fetchFn(`${base}/lobby/${op}`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ticket}` }, body: JSON.stringify(body),
      credentials: 'omit', cache: 'no-store', ...(signal ? { signal } : {}),
    });
    if (res.status === 401) return GAME_LOBBY_SESSION_LOST;
    if (!res.ok) {
      const status = refused ? await statusOf(res) : null;
      if (status !== null && status !== 0) return refused!(status);
      throw new Error(`${op}: HTTP ${res.status}`);
    }
    return read(await res.json());
  };
  // SVC-24 (`packages/central/src/loadoutHttp.ts`): GET and PUT on one path, the bearer the session's ticket.
  const loadout = async <T>(method: 'GET' | 'PUT', body: unknown, ticket: string, read: (raw: unknown) => T): Promise<T | Lost> => {
    const res = await fetchFn(`${base}/lobby/loadout`, {
      method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), authorization: `Bearer ${ticket}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), credentials: 'omit', cache: 'no-store',
    });
    if (res.status === 401) return GAME_LOBBY_SESSION_LOST;
    // LOW-5 (research 223 s6): the status carried, so the ARMORY's copy tells a lasting 409 (`LOADOUT_LASTING_REFUSAL`).
    if (!res.ok) throw Object.assign(new Error(`loadout: HTTP ${res.status}`), { status: res.status });
    return read(await res.json());
  };
  return {
    loadLoadouts: (t) => loadout('GET', undefined, t, loadoutsOf),
    saveLoadout: (mission, side, profile, t) => loadout('PUT', { mission, side, profile }, t, () => undefined),
    joinGame: (q, t, signal) => post('join-game', q, t, (r) => ({ ...ints(r, ['status', 'mediusWorldId'] as const), ...seatPassFields(r) }), (status) => ({ status, mediusWorldId: 0 }), signal),
    leaveGame: (t, signal) => post('leave-game', {}, t, (r) => ints(r, ['status'] as const), undefined, signal),
    worldReport: (q, t) => post('world-report', q, t, (r) => ({ ...ints(r, ['status'] as const), ...seatPassFields(r) })),
    // SA-6c (GAME_RETOKEN_ADAPTATION): the bearer on the account base -- the page's own origin -- never to a door.
    gameToken: async (game, t, signal) => {
      const res = await fetchFn(`${base}/lobby/game-token`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, body: JSON.stringify({ game }),
        credentials: 'omit', cache: 'no-store', ...(signal ? { signal } : {}),
      });
      if (res.status === 401) return GAME_LOBBY_SESSION_LOST;
      if (!res.ok) throw new Error(`game-token: HTTP ${res.status}`);
      const r = record(await res.json());
      if (!Number.isSafeInteger(r['status'])) throw new Error('game lobby reply: not the shape');
      return { status: r['status'] as number, ...(r['door'] !== undefined ? { door: r['door'] } : {}), ...(r['token'] !== undefined ? { token: r['token'] } : {}) };
    },
  };
}

/**
 * GAME_SEAT_REQUEST_ORDER_ADAPTATION (MLS-PASS): seat mutations under the same bearer finish in call order. BACK must
 * leave after a pending join, and a retry must join after the preceding leave; otherwise HTTP can reserve a seat after
 * BACK or remove the retry's seat. The ticket is captured at the call, not when a queued request starts. A replacement
 * ticket has its own queue, so a delayed old session never blocks or sends its leave as the new session. Rejections
 * release the queue. Reports are independent: their native timeout must still be able to leave. A silent join/leave
 * aborts its HTTP at the native join's 30-second bound (research 165 §1, `monitor_timeout`; the same bound as
 * `GAME_HELLO_WAIT_MS_ADAPTATION`) and releases the queue. Central's `lobbyHttp.ts` dispatches join/leave synchronously
 * after `readBody`: an accepted mutation precedes its response, and the following leave/retry reconciles it even if
 * that response was lost. A late response never settles the timed-out request again. Browser transport adaptation;
 * the original's password, join and refusal rules are unchanged.
 */
export const GAME_SEAT_REQUEST_ORDER_ADAPTATION = 'join and leave finish in call order per captured ticket; failures and aborted timeouts release the queue; report independent' as const;
/** Browser transport cap, reusing the native join's existing wait rather than extending a cancelled join forever. */
export const GAME_SEAT_REQUEST_WAIT_MS_ADAPTATION = GAME_HELLO_WAIT_MS_ADAPTATION;

/** The client's `GameJoinService` over the transport: the ticket captured at each call, a 401 handed to `sessionLost`. */
export function sessionGameLobby(t: GameLobbyTransport, ticket: () => string | null, sessionLost: (ticket: string) => void): GameJoinService {
  const tails = new Map<string, Promise<void>>();
  const send = async <T>(held: string, ask: (held: string, signal?: AbortSignal) => Promise<T | Lost>, signal?: AbortSignal): Promise<T> => {
    const r = await ask(held, signal);
    if (r === GAME_LOBBY_SESSION_LOST) { sessionLost(held); throw new Error('game lobby: session lost'); }
    return r as T;
  };
  const mutate = <T>(ask: (held: string, signal?: AbortSignal) => Promise<T | Lost>): Promise<T> => {
    const held = ticket();
    if (held === null) return Promise.reject(new Error('game lobby: no ticket'));
    const run = async (): Promise<T> => {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const expired = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('game lobby: seat request timed out')); }, GAME_SEAT_REQUEST_WAIT_MS_ADAPTATION);
      });
      try { return await Promise.race([send(held, ask, controller.signal), expired]); }
      finally { clearTimeout(timer); }
    };
    const before = tails.get(held);
    const result = before ? before.then(run) : run();
    const settled = result.then(() => {}, () => {});
    tails.set(held, settled);
    void settled.then(() => { if (tails.get(held) === settled) tails.delete(held); });
    return result;
  };
  return {
    joinGame: (q) => mutate((h, signal) => t.joinGame(q, h, signal)),
    leaveGame: () => mutate((h, signal) => t.leaveGame(h, signal)),
    worldReport: (q) => {
      const held = ticket();
      return held === null ? Promise.reject(new Error('game lobby: no ticket')) : send(held, (h) => t.worldReport(q, h));
    },
  };
}

/**
 * ONL-17's `ArmoryLoadoutService` over the transport (SVC-24): the ticket read at each request, a 401 handed to
 * `sessionLost` (research 157) and the request rejected; any other failure rejected too -- the rows show nothing for it
 * (`@s2u/ui`'s armoryProfileCommands, research 167 §3).
 */
export function sessionLoadouts(t: GameLobbyTransport, ticket: () => string | null, sessionLost: (ticket: string) => void): ArmoryLoadoutService {
  const send = async <T>(ask: (held: string) => Promise<T | Lost>): Promise<T> => {
    const held = ticket();
    if (held === null) throw new Error('loadout: no ticket');
    const r = await ask(held);
    if (r === GAME_LOBBY_SESSION_LOST) { sessionLost(held); throw new Error('loadout: session lost'); }
    return r as T;
  };
  return {
    load: () => send((h) => t.loadLoadouts?.(h) ?? Promise.resolve([])),
    save: (mission, side, profile) => send((h) => t.saveLoadout?.(mission, side, profile, h) ?? Promise.resolve()),
  };
}

/** What the game socket feeds (`GameLobbyCommands`' half); `chatLine` optional (ONL-23): a page with no chat panel (/testroom's match page) has none. */
export type GameSocketFeed = Pick<GameLobbyCommands, 'welcomed' | 'gameLobby' | 'roundStart' | 'seatEnded' | 'dropped'> & Partial<Pick<GameLobbyCommands, 'chatLine' | 'seatTold' | 'seatClans'>>;

// ---- ONL-16b (web sprint 20): the game lobby's voice (research 227 §1) ----

/**
 * The one talk input (W20.R9): the lobby's CIRCLE feeds a `TalkInput`'s lobby phase while the page stands in the game
 * lobby, and the same instance is handed on with the socket at the match's start (`GameLobbyHandOff.talk`), for the
 * match's taunts part to take on with its Chat menu (`adopt`). The original has one voice object across the two
 * (`DAT_0045b718`): its talk flag is cleared at the round's start (`FUN_0030e6e0(voice, 0)`, D:L55845) but, as read,
 * not its wait after a cut (state 4, research 170 C6: D:L211075-211104 leave state 4 alone when the flag goes off, and
 * `FUN_0030e7f0` at D:L55846 clears only the floor table), so a lobby talk cut at 10 s just before the launch still
 * holds the round's first press off until the wait ends -- one instance keeps that. The menu's own hooks are the adopter's: until
 * then the menu (never opened in the lobby phase) sends, sounds and lists nothing.
 */
export class LobbyTalk {
  readonly input: TalkInput;
  private menu: TauntMenuDeps | null = null;

  constructor() {
    this.input = new TalkInput({
      send: (c) => { this.menu?.send(c); }, custom: () => this.menu?.custom() ?? [], sound: (n) => { this.menu?.sound(n); },
      unsupported: (n) => { this.menu?.unsupported(n); }, entries: (root) => this.menu?.entries?.(root) ?? [],
    });
  }

  /** The match's taunts part takes the instance on (`../matchTaunts`): its Chat menu's hooks bound; the input returned. */
  adopt(deps: TauntMenuDeps): TalkInput { this.menu = deps; return this.input; }
}

/**
 * LOBBY_VOICE_CLIENT_ADAPTATION: the original has one voice object (`DAT_0045b718`) and one headset from the lobby into
 * the round. The page's voice client is the match's part (`./voice/voiceClient`, mounted by `./matchMount`), so the
 * lobby mounts its own over the game socket at the socket's first frame and disposes it at the hand-off (or at BACK, or
 * the seat's end): its microphone track is stopped, and the match's client asks `getGameMicrophone()` again at the
 * round's first press. The talk input is not doubled (`LobbyTalk`). A browser adaptation of the page's wiring.
 */
export const LOBBY_VOICE_CLIENT_ADAPTATION = 'the lobby\'s own voice client over the game socket, disposed at the hand-off' as const;

/** The lobby's voice client's options: `mountVoice`'s, its link the game socket's; absent, the page's own. */
export type LobbyVoiceDeps = Partial<Omit<MatchVoiceDeps, 'net' | 'headset'>> & {
  /** The talk input's clock, seconds; absent, `performance.now() / 1000`. */
  seconds?(): number;
  /** The lobby's headset UX (`./voice/headset`) on its line; absent, `mountHeadset` on the page's window and pads. */
  headset?(line: (text: string) => void): Headset;
  /**
   * True: the original's ARMORY -- RADIO OFF at its entry and RADIO ON at its return (`armoryToRoom`), the DEV key not
   * read there. Absent or false: `LOBBY_ARMORY_VOICE_ADAPTATION`'s, the lobby's voice kept live over its ARMORY.
   */
  armoryRadioOff?: boolean;
};

/**
 * LOBBY_ARMORY_VOICE_ADAPTATION (product track; a browser adaptation on the owner's word, seat b6, 2026-11-06: "work a
 * little fix into the armory, allow lobbby mics to continue working"): the game lobby's voice stays live while the
 * page has its ARMORY up. The original takes the seat off the lobby's channel there -- `InitializeOnlineArmory`
 * (`FUN_0027d8c0`, D:L126098-126099) clears the talk flag (`FUN_0030e6e0(voice, 0)`) and then sets RADIO OFF
 * (`FUN_0030e490`: the voice object joins channel 11, D:L210672-210681), so a seat in its ARMORY hears no one and no one
 * hears it until the lobby's return asks 9 again (`FUN_0027c9f0`, D:L125568), as read. Here the page sends neither
 * RADIO OFF nor its RADIO ON (`armoryToRoom` is not run), so the room keeps the seat on the lobby's 9: it hears the
 * lobby, and the DEV talk key is read over the ARMORY as on the lobby's screen. The lobby's CIRCLE (`VCButton`,
 * `dlgGameLobby.rdr`'s bindings) is not read while the ARMORY has the pad -- CIRCLE is the ARMORY's own there -- so a
 * CIRCLE talk held into it is carried instead (the v0.4.11 review's F1, the controller's call, OT.R111): it keeps
 * transmitting until the read pad's own CIRCLE is released, read raw through the headset's poll (`Headset.circle`), never
 * through the ARMORY's menu input, which keeps every CIRCLE press for itself. A talk held in with no pad CIRCLE down (a
 * DEV keyboard's) is let go at the entry, as before. Starting a NEW talk inside the ARMORY is not done: it waits on the
 * owner's choice of a free button there (L1 or R1); until then a pad player in the ARMORY talks only by a CIRCLE held
 * in from the lobby. The original's path stays behind `LobbyVoiceDeps.armoryRadioOff` and its tests
 * (`gameLobbyVoice.test.ts`). The room is unchanged: it still takes the two `voiceRadio` events in its waiting phase
 * (`Room.voiceLobbyArmory`) from a page that sends them.
 */
export const LOBBY_ARMORY_VOICE_ADAPTATION = "the game lobby's voice kept live over its ARMORY: no RADIO OFF, the DEV talk key read there" as const;

/**
 * LOBBY_VOICE_LINE_ADAPTATION: where the headset's two lines (`VOICE_MIC_NOTICE_PLACEHOLDER`: the notice before the
 * first microphone ask, the no-headset line) are drawn in the game lobby, which has no HUD message line. The round draws
 * them on the HUD's message window (research 226 §5); here they go to the lobby's own text panel -- `B_CHATLIST`
 * (`WRAPPEDTEXT` on BCHATLISTVAR, under `ChatText` #343), which the disc's layout draws -- one line each, in order, among
 * the text chat's lines and kept with them to its last 21 (`@s2u/ui`'s `appendGameLobbyChat`, ONL-23, research 266
 * §1), without a colour code of their own. No dialog the original does not draw (constraint 2). A browser adaptation,
 * its place the owner's to move (H87 VOICE-MIC-NOTICE).
 */
export const LOBBY_VOICE_LINE_ADAPTATION = 'the headset\'s lines in the lobby\'s B_CHATLIST (BCHATLISTVAR), among the chat\'s 21' as const;

/** What the game socket hands the lobby's voice: the room's floor entry and voice frames, the hand-off, a seat's end. */
export interface GameSocketVoice {
  voiceFloor(ev: Extract<ServerEvent, { type: 'voiceFloor' }>): void;
  voiceFrame(down: VoiceDown): void;
  /** The match's start: the lobby's voice client let go; the talk input handed on. */
  handOff(): LobbyTalk;
  /** The lobby left (BACK, the seat's end): the voice client let go. */
  release(): void;
}

type VoiceLink = Pick<NetClient, 'id' | 'send' | 'sendVoice' | 'state'>;
const NO_BUTTONS: ReadonlySet<PadButton> = new Set();
const CIRCLE_HELD: ReadonlySet<PadButton> = new Set([LOBBY_TALK_BUTTON]);

/**
 * The page's half of the game lobby's voice (ONL-16b; research 227 §1), under `@s2u/ui`'s `GameLobbyVoicePort`:
 *
 * - **the edges**: `VCButton(1x)` / `(0x)` -- CIRCLE's FALLING and RISING on `dlgGameLobby.rdr`, the disc's scripts run
 *   as they stand (VOICE_LOBBY_BUTTON_EDGE_READING, resolved: R2-AV §1.6, the STATE fields re-read on the disc in
 *   research 227 §1) -- set and clear CIRCLE as the talk input's lobby phase reads it (`./voice/talkInput`: press talks,
 *   release stops, the 10 s cut and the 20 s ask again, a late joiner inert), once a frame (`frame`), its flag handed to
 *   the voice client (`./voice/voiceClient` `pad`), which asks the microphone at the first press and sends `voiceTalk`;
 * - **the floor**: the room's `voiceFloor` -- the listener's own channel's entry (W20.R6) -- kept for the bar
 *   (`holder`) and passed to the voice client; `recording` is the flag set while the entry names this page, the
 *   original's state 3 (`FUN_0030e710`), which `CheckForcedLaunch` writes into `can_talk` for the icon;
 * - **the ARMORY**: `InitializeOnlineArmory` clears the flag (`FUN_0027d8c0` D:L126098: `FUN_0030e6e0(voice, 0)`),
 *   then sets RADIO OFF (`FUN_0030e490`, D:L126099), and the return re-enters the lobby, which asks 9 (`FUN_0027c9f0`
 *   D:L125568). The menu's lobby seat never sets the room's `arming` (the front end's match has no `armory`
 *   capability), so the page carries both on the game socket (W20.R12; the close review's F2): `voiceRadio {on: false}`
 *   once as the valve `GoneToArmory` goes 1, `{on: true}` once as it goes 0, each on the client it is seen on -- the
 *   room takes exactly these two in its waiting phase (`Room.voiceLobbyArmory`, note 225 §4.2). That is the original's
 *   path, kept behind `LobbyVoiceDeps.armoryRadioOff`; by default the page sends neither and keeps the DEV key live
 *   there (`LOBBY_ARMORY_VOICE_ADAPTATION`, the owner's word of 2026-11-06, OT.R111), a pad CIRCLE talk held in
 *   carried to its raw release (F1);
 * - **the hand-off**: the lobby's voice client disposed, the talk input handed on (`LobbyTalk`).
 *
 * Fed only while the game socket holds a client: from the hand-off until the match gives it back the match owns the
 * talk input, and the lobby reads nothing.
 */
export class GameLobbyVoice implements GameLobbyVoicePort, GameSocketVoice {
  readonly talk = new LobbyTalk();
  private voice: MatchVoice | null = null;
  /** CIRCLE as `VCButton`'s edges leave it. */
  private circle = false;
  /** The talk input's flag after the voice object's cycle (`TalkFrame.talk`). */
  private flag = false;
  /** The listener's channel's entry: its holder, null when free; and the client it was told on. */
  private floor: number | null = null;
  private floorOf: VoiceLink | null = null;

  /** The headset UX (SVC-22b), mounted with the voice client and let go with it. */
  private headset: Headset | null = null;
  /** F2: the client the ARMORY's RADIO OFF went on (its return owed there), or null. */
  private armoryOf: VoiceLink | null = null;
  /** LOBBY_ARMORY_VOICE_ADAPTATION (F1): a CIRCLE talk held into the ARMORY, kept until the pad's raw CIRCLE is up. */
  private carried = false;

  constructor(private readonly o: {
    /** The game socket's client, or null (none yet, or the match holds it). */
    link(): VoiceLink | null;
    /** The game's `+0xcc` (the valve `late_joiner`). */
    lateJoiner(): boolean;
    /** The ARMORY's screen over the lobby (the valve `GoneToArmory`, set by `goto_eq_mp_set_return_valve`, cleared by `check_loop`). */
    inArmory(): boolean;
    deps: LobbyVoiceDeps;
    /** HEADSET VOLUME, absent the deps' own: the front end's uiVars (`tunersOfVars`). */
    tuners(): { headset: number };
    /** The headset's lines (`LOBBY_VOICE_LINE_ADAPTATION`). */
    line(text: string): void;
  }) {}

  private seconds(): number { return this.o.deps.seconds?.() ?? performance.now() / 1000; }
  /** The entry as told on the current client; a new client (a reconnect) has been told none yet. */
  private entry(): number | null { return this.floorOf !== null && this.floorOf === this.o.link() ? this.floor : null; }

  button(on: boolean): void { this.circle = on; }
  recording(): boolean { const c = this.o.link(); return this.flag && c !== null && this.entry() === c.id; }
  /**
   * The bar's talker: VOICE-LATE (B; `./hudVoice` `heardTalker`, research 226 §3.2) the speaker whose voice the lobby's
   * client plays now, else the floor entry's holder (`FUN_0027cbf0`'s, research 170 §5.1) -- the early hint.
   */
  holder(): number | null {
    const entry = this.entry(), playing = this.voice?.state().playing ?? null;
    if (playing === null) return entry;
    return heardTalker(entry, playing, this.o.link()?.id ?? null) ?? entry;
  }
  /** VOICE-LATE (A): the suspended mark's line for the bar (`VOICE_SUSPENDED_MARK_PLACEHOLDER`), null while voice plays. */
  notice(): string | null { return this.voice?.state().suspended ? VOICE_SUSPENDED_MARK_PLACEHOLDER : null; }
  /**
   * V-E2E (sprint 20; note 227 §4): the lobby's voice client's own state (`VoiceState`, what the match hook's `voice()`
   * gives in a round), or null before the socket's first frame mounts it and after it is let go. A read; it changes nothing.
   */
  state(): VoiceState | null { return this.voice?.state() ?? null; }

  voiceFloor(ev: Extract<ServerEvent, { type: 'voiceFloor' }>): void {
    this.floor = ev.holder; this.floorOf = this.o.link();
    this.voice?.netDeps().voiceFloor(ev);
  }
  voiceFrame(down: VoiceDown): void { this.voice?.netDeps().voiceFrame(down); }

  /**
   * `InitializeOnlineArmory`'s `FUN_0030e6e0(voice, 0)` (D:L126098): the talk flag cleared; its RADIO OFF (D:L126099)
   * follows in `frame` (`armoryToRoom`) only with `armoryRadioOff`. Without it (LOBBY_ARMORY_VOICE_ADAPTATION, F1) a
   * CIRCLE talk held in is carried, not cleared, while the pad's raw CIRCLE stays down (`frame`).
   */
  armory(): void {
    this.carried = this.o.deps.armoryRadioOff !== true && this.circle;
    this.circle = false;
    this.frame();
  }

  /** Once a frame: the talk input's lobby phase, its flag to the voice client (mounted on the socket's first frame). */
  frame(): void {
    const link = this.o.link();
    if (link === null) return;
    const { headset: makeHeadset, armoryRadioOff, ...d } = this.o.deps;
    // SVC-22b's headset (the review's F6): the notice before the first microphone ask and the no-headset line, the
    // pad's loss and the window's focus as the talk input's releases, the DEV R key as CIRCLE; no modulation in the
    // lobby (`VOICE_MOD_LOBBY_OFF_READING`, the headset's phase).
    const headset = this.headset ??= (makeHeadset ?? ((line: (text: string) => void) => mountHeadset({ line })))((text) => { this.o.line(text); });
    this.voice ??= mountVoice({ ...d, net: () => { const l = this.o.link(); return l ? { client: l } : null; }, tuners: d.tuners ?? (() => this.o.tuners()), headset });
    const h = headset.frame({ phase: 'lobby', spectator: false });
    // The DEV R key (`keys('lobby')`, H87 VOICE-KEY) is CIRCLE on the lobby's screen -- over its ARMORY too under
    // LOBBY_ARMORY_VOICE_ADAPTATION, not in the original's ARMORY (`armoryRadioOff`).
    const key = !(armoryRadioOff === true && this.o.inArmory()) && headset.keys('lobby').size > 0;
    // F1: the carried talk ends at the read pad's raw CIRCLE release (or the pad's loss), seen by the headset's poll.
    if (this.carried && headset.circle?.() !== true) this.carried = false;
    const f = this.talk.input.frame(this.seconds(), this.circle || key || this.carried ? CIRCLE_HELD : NO_BUTTONS, {
      phase: 'lobby', preset: 'Default', runAndTalk: false, menuAllowed: false, talkAllowed: true,
      lateJoiner: this.o.lateJoiner(), padPresent: h.padPresent, focused: h.focused,
    });
    this.flag = f.talk;
    this.voice.pad(f.talk);
    if (armoryRadioOff === true) this.armoryToRoom(link);              // LOBBY_ARMORY_VOICE_ADAPTATION: else never sent
  }

  /**
   * The close review's F2: the ARMORY's entry and exit to the room, after the flag's clear (D:L126098, then D:L126099).
   * Sent only on an open client (a closed one drops it unsent); a client that came after the entry (a reconnect) seats
   * on 9 and is sent the entry again; a return is owed only to the client the entry went on.
   */
  private armoryToRoom(link: VoiceLink): void {
    if (link.state !== 'open') return;
    const inArmory = this.o.inArmory();
    if (inArmory && this.armoryOf !== link) {
      link.send({ type: 'voiceRadio', on: false });
      this.armoryOf = link;
    } else if (!inArmory && this.armoryOf !== null) {
      if (this.armoryOf === link) link.send({ type: 'voiceRadio', on: true });
      this.armoryOf = null;
    }
  }

  handOff(): LobbyTalk { this.release(); return this.talk; }

  release(): void {
    this.voice?.dispose();
    this.voice = null;
    this.headset?.dispose();
    this.headset = null;
    this.circle = false; this.flag = false; this.floor = null; this.floorOf = null; this.armoryOf = null; this.carried = false;
  }
}

/**
 * **ONL-18's hand-off point** (`GameSocketHostOptions.matchStart`, the named event `GAME_LOBBY_MATCH_START`): the
 * room started round 1 (or a late joiner's next round): the game, its first mission, the open client -- its socket kept
 * for the match, still holding the session (`held`: the match releases it at its close) -- and the room's events so far
 * that the match needs (the `welcome`, the `roundStart`).
 */
export interface GameLobbyHandOffFields extends GameLobbyMatchStart {
  client: NetClient;
  held: true;
  welcome: Extract<ServerEvent, { type: 'welcome' }> | null;
  roundStart: Extract<ServerEvent, { type: 'roundStart' }> | null;
  /**
   * LATE-WATCH's review F1: a late seat's hand-off (its READY, ui `GameLobbyCommands.ReadyToLoad`'s late branch) carries the
   * room's last `score` heard in the lobby, its `timeLeft` less the time since it came -- the host's timer as it stands
   * (the original's late console draws the host's; `FUN_0027caf0` D:L125606-125608 loads it apart from any round's start).
   * Absent for a launch that is no late join, or with no score heard.
   */
  score?: Extract<ServerEvent, { type: 'score' }>;
  /**
   * LATE-WATCH's re-review N1: the room's last `roundOver` heard in the lobby after the welcome, and how many seconds ago
   * it came, when it came after the round handed on (or with none) -- the round screens the room is in, and the game's
   * end if it ended it, newer than the welcome's standing result (`LobbyMatch` takes the screens and `matchOver` from it).
   */
  roundOver?: { event: Extract<ServerEvent, { type: 'roundOver' }>; seconds: number };
  /**
   * LATE-SPAWN-HANDOFF (LATER 56; research 322 §4.1, "Found on the way"): a late seat's hand-off carries the seat's own
   * last `spawn` heard in the lobby -- the room spawns a late respawn seat while its console still sits in the game lobby (a
   * classic one, since LATER 85, has no body until its load: a round's start passes it by, naming it in `ghosts`): a
   * respawn room at its welcome (`room.ts` `start`: no ghost outside classic; LATER 266) -- so the match's page is given
   * the room's kit and type
   * and the seat's spawn (PAR-94 B2's HUD gate). `beforeRoundStart`: it is the handed-on round's own start spawn, heard
   * just before that `roundStart` (`startRound` spawns every seat, then sends the `roundStart`), and is replayed before
   * it -- the room's order; else after it. Another seat's spawn is not kept (the welcome names the others); a spawn of a
   * round the room has since ended, a new `roundStart` after that end, is dropped. Absent for a launch that is no late
   * join (its round 1 spawns the seat after the hand-off) or with no spawn of the seat heard.
   */
  spawn?: { event: Extract<ServerEvent, { type: 'spawn' }>; beforeRoundStart: boolean };
  /** ONL-16b (W20.R9): the lobby's talk input, for the match's taunts part to adopt; absent without the lobby's voice. */
  talk?: LobbyTalk;
  /**
   * SA-6c (`GAME_RETOKEN_ADAPTATION`): a placed seat's one provider, the lobby's own, for the match's retries
   * (`NetPageDeps.game.reseat`); absent for a local seat (it reconnects as today) or with no re-token wired.
   */
  reseat?: GameSeatProvider;
}
/**
 * The hand-off with its game seat (`GameSeat`): the page's pinned socket and the login's ticket for a local game, or
 * (SA-6b, `GAME_DOOR_ADAPTATION`) a placed game's pinned door and its game token -- what a drop reopens.
 */
export type GameLobbyHandOff = GameLobbyHandOffFields & GameSeat;
/** The hand-off's name, for the page's log and ONL-18's listener. */
export const GAME_LOBBY_MATCH_START = 'game-lobby-match-start' as const;

export interface GameSocketHostOptions {
  /** `pinnedMatchSocket`'s URL: any other is refused at the construction (research 169 measure 7). */
  pinned: PinnedSocketUrl;
  /** The session's ticket (`LobbyClient.ticket()`). */
  ticket: () => string | null;
  /** `LobbyClient.socketHolds` (research 157 §6). */
  holds: (held: boolean) => void;
  /** The hello's name (the server seats the account's own: research 159 §1). */
  name?: () => string;
  /** A socket for the tests. */
  socket?: (url: string) => WebSocketLike;
  /** The page's clock, ms; absent, `performance.now`. */
  now?: () => number;
  /** ONL-18's hand-off (`GAME_LOBBY_MATCH_START`). */
  matchStart?: (h: GameLobbyHandOff) => void;
  /**
   * SA-6c (`GAME_RETOKEN_ADAPTATION`): the re-token's request (`GameLobbyTransport.gameToken`) and the session's loss
   * (`LobbyClient.sessionLost`); absent, a placed seat reopens its door with the token it was opened with.
   */
  retoken?: { ask(game: number, ticket: string, signal: AbortSignal): Promise<GameTokenReply>; sessionLost(ticket: string): void };
  /** A seat provider for the tests; absent, `gameSeatProvider`. */
  provider?: (o: GameSeatProviderOptions) => GameSeatProvider;
  /**
   * SA-43c Part 2 (research 345 sections 1-2): the room's `system` event on the game socket while the game lobby holds it
   * -- the front end's `BriefingRoomChat.systemMessage(text, severity)`, Part 1's routing of `FUN_0030dce0` (in the game
   * lobby, dlgGameLobby's OnSystemMessage at the menu state's tick); absent, dropped.
   */
  system?: (text: string, severity: number) => void;
  /**
   * OBF-4 (OBF.R4; a browser and service adaptation): the game socket closed for its host's update while the game lobby
   * holds it (`SERVER_UPDATE_CLOSE`, final): called after the seat's end, for the page's warning and reload
   * (`./serverUpdate` `pageServerUpdate`); absent, the seat's end alone.
   */
  serverUpdate?: () => void;
}

/**
 * GAME_HELLO_WAIT_MS_ADAPTATION (SA-55, the server split; product track, a browser adaptation): the longest a game
 * socket is given from its connect to its welcome -- its upgrade still `connecting`, or `open` with its hello sent and no
 * answer -- before the page takes it as a drop (`GameSocketHost.frame`): closed, the session let go, `dropped()` told, the
 * next socket on the backoff (`retryDelayMs`), a placed seat's through its re-token. The live bug it closes (2026-10-21
 * ~01:36Z, the first game on a newly started host): the creator's first socket was neither welcomed nor closed, `frame`
 * never retried, and the lobby sat with no seats until it was left (central logged no `/lobby/game-token`). The original
 * has no retry; its join gives the connect 30 s -- the network library's own wait on the connect's state (`FUN_00617788`,
 * research 343 R343.7 and its `DOOR_CONNECT_WAIT_MS_READING` row), inside the briefing room's `monitor_timeout`
 * (`WAIT 30`, #440), the bound `HOST_REPORT_WAIT_READING` takes too -- and the page gives its socket that 30 s, no figure
 * of its own. It is well past the match server's own answer: a socket with no hello is closed at `HELLO_MS` (10 s), a
 * hello held at most `HELLO_HOLD_MS_ADAPTATION` (2 s) for its admit (`packages/match/src/server.ts`, `game.ts`). The
 * token: a placed game's lives 60 s from central's answer (`GAME_TOKEN_LIFETIME_PLACEHOLDER`, sized to cover this 30 s
 * connect), so a hello sent inside the wait presents a live one; a lapse at 30 s waits the backoff (2 s never reached,
 * then 4, 8 ... 60 s; at once after a reach, once in 10 s, then 2, 4 ... 10 s) and re-tokens, the fresh token's 60 s starting at that answer, so no
 * hello carries a token older than the wait. A local seat reconnects with the login's ticket read at its connect, as a
 * drop's does. A welcomed socket is never timed out by it (later silence is the heartbeat's). SA-57: `NetPage`'s socket
 * (the match's) takes the same wait (`NetPage.helloWait`); the value is defined in `./connectHost`, which both import.
 */
export { GAME_HELLO_WAIT_MS_ADAPTATION };

/** The game socket (`GameSocketPort` for `@s2u/ui`'s lobby): open, the bridge's three requests, the page's own close. */
/** ARMORY-SAVE: the lobby ARMORY's choice as the game socket keeps it (`GameSocketHost.loadout`). */
type LobbyChoice = { side: NonNullable<NetClient['team']>; char: number; picks: { slot: number; id: number }[] };

export class GameSocketHost implements GameSocketPort {
  private client: NetClient | null = null;
  private off: (() => void) | null = null;
  private feed: GameSocketFeed | null = null;
  private game = -1;
  private held = false;
  private reached = false;
  private attempts = 0;
  private retryAt = 0;
  /** PT195-4 (review F4): the last at-once reconnect (`dropRetry`, one in `QUICK_RECONNECT_WINDOW_MS_ADAPTATION`). */
  private quickAt = Number.NEGATIVE_INFINITY;
  private stopped = true;
  private welcome: GameLobbyHandOff['welcome'] = null;
  private roundStarted: GameLobbyHandOff['roundStart'] = null;
  /**
   * LATE-WATCH F1, N1: the last `roundOver` the room sent the lobby and when it came (the page's clock), or null.
   * LATE-SPAWN-HANDOFF: `n`, its place in the socket's order (`heard`).
   */
  private roundEnded: { ev: Extract<ServerEvent, { type: 'roundOver' }>; at: number; n: number } | null = null;
  /** LATE-SPAWN-HANDOFF: the socket's events counted as they come -- the room's one ordered socket -- for their order. */
  private heard = 0;
  /** LATE-SPAWN-HANDOFF: `roundStarted`'s place in the socket's order. */
  private roundStartedN = 0;
  /** LATE-SPAWN-HANDOFF (LATER 56): the seat's own last `spawn` heard in the lobby and its place in the order, or null. */
  private ownSpawn: { ev: Extract<ServerEvent, { type: 'spawn' }>; n: number } | null = null;
  /** LATER 80: the room's round counter as its events since the welcome tell it (`roundWelcome`), or null with none heard. */
  private roundNow: number | null = null;
  /** LATE-WATCH N1: when the welcome came: a `roundOver` before it is older than its standing result. */
  private welcomeAt = 0;
  /** LATE-WATCH F1: when `roundStarted` came (the page's clock). */
  private roundStartedAt = 0;
  /** LATE-WATCH F1: the room's last `score` in the lobby and when it came (the page's clock), for a late hand-off. */
  private scored: { ev: Extract<ServerEvent, { type: 'score' }>; at: number } | null = null;
  /** SVC-23f: the room's `refused` reason for this socket's hello, handed to the seat's end (`seatEnded`). */
  private refusal: string | null = null;
  /** The room's last game lobby view's seats (the bridge's `gameLobby`): every seat's side now, for the hand-off. */
  private seats: SeatsView = null;
  /** ONL-16b: the lobby's voice (`GameLobbyVoice`), and the client's voice frames' listener. */
  private voice: GameSocketVoice | null = null;
  private offVoice: (() => void) | null = null;
  /**
   * ARMORY-SAVE (research 167 §7): the lobby ARMORY's last choice sent (`loadout`), its side, type and picks -- sent again
   * on a new socket's welcome on that side (a reconnect's seat is a new one, which would take the stored record at the
   * launch), forgotten when the seat's side changes (SWITCH TEAMS re-arms from the record, P:L7596-7615) and at the
   * match's hand-off (the map's load drops the console's `IDFromBriefing`, research 309 §2.3).
   */
  private choice: LobbyChoice | null = null;
  /**
   * SA-6b (`GAME_DOOR_ADAPTATION`): the placed game's door and token the last `open` was given, or null (a local game:
   * the pinned socket with the ticket read at each connect). Kept across `adopt` (the same game); `close` forgets it.
   */
  private door: { pinned: PinnedGameDoor; token: string } | null = null;
  /** SA-6c (`GAME_RETOKEN_ADAPTATION`): the placed seat's one provider, made at the open; kept across `adopt`; `close` forgets it. */
  private reseater: GameSeatProvider | null = null;
  /** SA-6c: a re-token is out (the backoff paused, no second request); `asks` numbers them, so a late or stale answer is dropped. */
  private asking = false;
  private asks = 0;
  /** SA-41 (the release review's H7): a held hello's refusal has been re-tokened since the last welcome (`GAME_RETOKEN_REASONS`). */
  private retokened = false;
  /**
   * SA-55 (`GAME_HELLO_WAIT_MS_ADAPTATION`): when the socket not yet welcomed was made (the page's clock), null once it is
   * welcomed or adopted; `helloLapsed`, the socket given up on past the wait (closed, its own close perhaps never heard);
   * `helloHost`, its URL's host for the console line.
   */
  private helloSince: number | null = null;
  private helloLapsed = false;
  private helloHost = '';

  constructor(private readonly o: GameSocketHostOptions) {
    if (!isPinnedSocket(o.pinned)) throw new TypeError('a game socket needs its pinned URL (pinnedMatchSocket)');
  }

  /** The lobby's rows the socket's events go to (set once, at the mount). */
  attach(feed: GameSocketFeed): void { this.feed = feed; }

  /** ONL-16b: the lobby's voice -- the room's `voiceFloor` and voice frames, the hand-off, the lobby's end (set once, at the mount). */
  attachVoice(voice: GameSocketVoice): void { this.voice = voice; }

  /** The socket's client while the lobby holds it (none before the open, none from the hand-off until the match gives it back). */
  link(): NetClient | null { return this.client; }

  private listenVoice(client: NetClient): void {
    this.offVoice?.();
    this.offVoice = client.onVoice((down) => { this.voice?.voiceFrame(down); });
  }

  private now(): number { return this.o.now?.() ?? performance.now(); }
  private hold(held: boolean): void { if (this.held !== held) { this.held = held; this.o.holds(held); } }

  open(mediusWorldId: number, pass?: GameSeatPass): boolean {
    this.drop();
    const ticket = this.o.ticket();
    if (ticket === null) return false;
    // SA-6b: a placed game's door pinned from central's answer (the page's devmode rule for the loopback) and its token;
    // a door the page does not follow, or a token not of its form, opens nothing.
    const pinned = pass ? pinnedGameDoor(pass.door, mediusWorldId, this.o.pinned.devDoors) : null;
    if (pass && (!pinned || !isGameToken(pass.token))) return false;
    this.door = pinned && pass ? { pinned, token: pass.token } : null;
    this.game = mediusWorldId;
    // SA-6c: a placed seat's one provider (a local seat has none: it reconnects as today).
    const retoken = this.o.retoken;
    this.reseater = this.door && retoken ? (this.o.provider ?? gameSeatProvider)({
      game: mediusWorldId, pinned: this.o.pinned, placed: true, ticket: () => this.o.ticket(),
      ask: (g, t, signal) => retoken.ask(g, t, signal), sessionLost: (t) => { retoken.sessionLost(t); },
    }) : null;
    this.stopped = false;
    this.attempts = 0;
    this.quickAt = Number.NEGATIVE_INFINITY;
    this.reached = false;
    this.retokened = false;                                       // SA-41: a new game's seat has its own re-token
    this.connect(this.seat(ticket));
    return true;
  }

  /** SA-6b: the socket's seat -- the placed game's door and token, else the pinned socket and the login's ticket. */
  private seat(ticket: string): GameSeat { return this.door ?? { pinned: this.o.pinned, ticket }; }

  /**
   * VOICE-LATE-3's report for the lobby's voice (a devmode playtest instrument): the pinned socket's URL for a local game;
   * SA-7d: the placed game's pinned door (`PinnedGameDoor`, central's answer), whose game path the door forwards to the
   * game's process (the voice report's URL); a re-token answered local clears the door (`this.door`), so the report follows.
   */
  reportTo(): string | null { return this.door ? this.door.pinned.url : this.o.pinned.url; }

  private connect(open: GameSeat): void {
    const seat = gameSeatOpen(open, this.game);                   // SA-6b: the login's ticket never to a door
    const client = new NetClient({
      url: seat.url, map: '', name: this.o.name?.() ?? '', game: seat.game,
      ...(this.o.socket ? { socket: this.o.socket } : {}),
    }, idleWalk);
    this.client = client;
    this.helloSince = this.now(); this.helloLapsed = false; this.helloHost = socketHost(seat.url);   // SA-55: the hello's wait from here
    this.welcome = null;
    this.seats = null;
    this.roundStarted = null;                                     // a new socket: no round of an earlier game handed on
    this.roundEnded = null; this.scored = null;
    this.ownSpawn = null;                                         // LATE-SPAWN-HANDOFF: nor a spawn of an earlier game
    this.refusal = null;
    this.off = client.on((ev) => this.event(ev));
    this.listenVoice(client);
  }

  private event(ev: ServerEvent): void {
    const n = ++this.heard;
    switch (ev.type) {
      case 'welcome':
        this.welcome = ev; this.welcomeAt = this.now(); this.reached = true; this.attempts = 0;
        this.helloSince = null;                                   // SA-55: welcomed, never timed out by the hello's wait
        this.retokened = false;                                   // SA-41: a seat held, a later held hello's refusal re-tokens again
        this.roundNow = null;                                     // LATER 80: the welcome's own round stands until a round event
        this.hold(true);                                          // research 157 §6: the accepted hello holds the session
        this.feed?.welcomed(ev.id, ev.map);
        // ARMORY-SAVE: the lobby's choice again on the new seat, when it is the same side's (a reconnect, a reload).
        if (this.choice && ev.role === 'player' && ev.team === this.choice.side) this.sendChoice(this.choice);
        break;
      // Kept before the lobby's rows hear it: the launch's view starts the match (`handOff`) from inside the feed.
      case 'gameLobby': {
        this.seats = ev.seats;
        // ARMORY-SAVE: SWITCH TEAMS (or a swap) re-arms the seat from the record: a choice of the other side is forgotten.
        const own = this.welcome ? ev.seats.find((s) => s.id === this.welcome!.id) : undefined;
        if (this.choice && own && own.team !== this.choice.side) this.choice = null;
        // LATER 80 (the review's F1): the game's lobby not launched is a room at round 1 -- its construction (`round = 1`),
        // its abandon and its return after a game over (`room.ts` `abandon`, `returnToLobby`); a round starts only after a
        // launch (`startRound`) -- whether or not this socket heard the game's last `roundOver`.
        if (!ev.launched) this.roundNow = 1;
        this.feed?.gameLobby(ev);
        break;
      }
      // LATE-SPAWN-HANDOFF (LATER 56): the seat's own spawn kept, the latest only; another seat's is not.
      case 'spawn': if (this.welcome && ev.id === this.welcome.id) this.ownSpawn = { ev, n }; break;
      // The review's F2: the seat's own death (`room.ts` `kill`) or its move out to the queue (`demoted`, sent to the seat
      // alone: the idle kick's `demote`) ends the body that spawn stood -- nothing of it is handed on.
      case 'kill': if (this.welcome && ev.victim === this.welcome.id) this.ownSpawn = null; break;
      case 'demoted': this.ownSpawn = null; this.welcome = queuedWelcome(this.welcome, ev); break;
      // B138's BTL.R8: a promotion heard in the lobby -- a queued joiner put in a CPU's or a leaver's place -- is the seat's
      // welcome from now on (`queuedWelcome`), so the match does not replay the spectator's welcome over the seated walk.
      case 'promoted': this.welcome = queuedWelcome(this.welcome, ev); break;
      case 'roundStart':
        // LATE-SPAWN-HANDOFF: a new round after the kept spawn's round ended -- the spawn went with that round.
        if (this.ownSpawn && this.roundEnded && this.ownSpawn.n < this.roundEnded.n) this.ownSpawn = null;
        this.roundStarted = ev; this.roundStartedAt = this.now(); this.roundStartedN = n;
        this.roundNow = ev.round;                                 // LATER 80: `startRound`'s `round++`, told here
        this.feed?.roundStart();
        break;
      case 'roundOver':                                           // LATE-WATCH F1, N1: a round over, not handed on as begun
        this.roundEnded = { ev, at: this.now(), n };
        this.roundNow = ev.round;                                 // LATER 80: `endRound` leaves the counter; the event names it
        break;
      // The review's row (b): the room's abandon leaves the level (`room.ts` `abandon`: `resetMatch`, `round = 1`, the
      // waiting room, every seat spawned again after it) -- no round of it, its clock or its seat's spawn is handed on.
      case 'abandoned':
        this.roundNow = 1;                                        // LATER 80
        this.roundStarted = null; this.roundEnded = null; this.scored = null; this.ownSpawn = null;
        break;
      case 'score': this.scored = { ev, at: this.now() }; break;    // LATE-WATCH F1: the host's timer, for a late hand-off
      case 'voiceFloor': this.voice?.voiceFloor(ev); break;   // ONL-16b: the listener's own channel's entry (W20.R6)
      case 'chat': this.feed?.chatLine?.(ev); break;            // ONL-23: another seat's line (`FUN_002ba9d0`), where the feed has a panel
      case 'system': this.o.system?.(ev.text, ev.severity); break;   // SA-43c Part 2: the server's system message (`FUN_0030dce0`)
      case 'refused': this.refusal = ev.reason; break;          // SVC-23f: the reason, for the seat's end (MP_EJECT_SPECTATOR's "Too many spectators")
      // ONL-34 (W18.R7): the room's told pairs as the client's board now holds them (`SeatToldBoard`, which hears the
      // event first: its listener is the client's own, added at its construction), for the lists' medal column.
      case 'seatTold': if (this.client) this.feed?.seatTold?.(this.client.told.all()); break;
      case 'seatClans': if (this.client) this.feed?.seatClans?.(this.client.clans.all()); break;   // AD-13: the lists' tags and the bar's
      default: break;
    }
  }

  send(type: 'lobbyReady' | 'switchTeams' | 'launch' | 'clanSwap'): void {   // CLAN-SWAP: row 184's FINISH
    if (this.client?.state === 'open') this.client.send({ type });
  }

  /** FBA-2, browser adaptation: the authoritative room validates the current host and team target. */
  bots(team: LobbySide, setting: BotSetting): void {
    if (this.client?.state === 'open') this.client.send({ type: 'lobbyBots', team, setting });
  }

  /**
   * ONL-23: the seat's line (`{ type: 'chat', text }`, the bridge's relay, research 263 §1), on an open socket only.
   * SVC-19 (research 266 §3.1): `team`, the keyboard's TEAM (`ChatRecipient`), sent as `team: true`; ALL sends none.
   */
  chat(text: string, team = false): void {
    if (this.client?.state === 'open') this.client.send({ type: 'chat', text, ...(team ? { team: true } : {}) });
  }

  /**
   * ARMORY-SAVE (research 167 §7): the lobby ARMORY's choice -- the seat's next type (`char`, the column within the side)
   * and the picks that reach its kit -- as the seat's `loadout` request (protocol 9), which the room takes outside a
   * round for the next spawn and keeps over the stored record at the launch (`Room` `lobbyChoice`). On the console the
   * ARMORY's choices are the console's own kit (`OnMp{Seal,Terr}BtnPress` sets `IDFromBriefing` 1, research 95 §3.2);
   * STORE LOADOUT alone keeps them on the account. Sent on an open socket by a player of that side only; remembered
   * for a reconnect's seat either way.
   */
  loadout(side: NonNullable<NetClient['team']>, choice: { char: number; picks: readonly { slot: number; id: number }[] }): void {
    this.choice = { side, char: choice.char, picks: choice.picks.map((p) => ({ slot: p.slot, id: p.id })) };
    this.sendChoice(this.choice);
  }

  private sendChoice(c: LobbyChoice): void {
    const client = this.client;
    if (client?.state !== 'open' || client.role !== 'player' || client.team !== c.side) return;
    client.send({ type: 'loadout', picks: c.picks.map((p) => ({ ...p })), char: c.char });
  }

  /** BACK (`DisconnectFromGameServer`): the page's own close -- the session let go, no dialog; a placed game's door and provider forgotten. */
  close(): void { this.drop(); this.door = null; this.reseater = null; }

  private drop(): void {
    this.stopped = true;
    this.asking = false; this.asks++;                             // SA-6c: a re-token still out is answered to no one
    // ARMORY-SAVE F1: a game left (BACK, another game opened) forgets the lobby ARMORY's choice -- the BRIEFING ROOM's
    // start zeroes IDFromBriefing (P:L4293). The same game's reconnect (`frame` -> `connect`) never comes here.
    this.choice = null;
    this.off?.(); this.off = null;
    this.offVoice?.(); this.offVoice = null;
    this.voice?.release();
    this.client?.close(); this.client = null;
    this.hold(false);
  }

  /**
   * Once a frame (the session's `advance`): a close seen -- the session let go at every one; a final close
   * (`GAME_FINAL_CLOSES`) or a refused hello the seat's end, told once; any other a drop opened again after `NetPage`'s
   * backoff (`retryDelayMs`), the seat not counted until its next welcome. SA-55: a socket not welcomed since its connect,
   * `connecting` or `open`, past `GAME_HELLO_WAIT_MS_ADAPTATION` is such a drop (`helloLapse`).
   */
  frame(): void {
    const c = this.client;
    if (this.stopped || !c) return;
    if ((c.state === 'open' || c.state === 'connecting') && !this.helloLapsed) {
      if (this.helloSince !== null && this.now() - this.helloSince >= GAME_HELLO_WAIT_MS_ADAPTATION) this.helloLapse(c);
      return;
    }
    if (this.asking) return;                                      // SA-6c: one re-token at a time, the backoff paused
    if (this.retryAt === 0) {
      this.hold(false);
      const code = c.closeCode;
      // SA-41: a held hello refused before its admit re-tokens once between welcomes (as a room re-passes), not the seat's end
      if (c.state === 'refused' && this.reseater && !this.retokened && GAME_RETOKEN_REASONS.has(this.refusal ?? '')) {
        this.retokened = true; this.feed?.dropped();
        this.backoff();
        return;
      }
      if (c.state === 'refused' || (code !== null && GAME_FINAL_CLOSES.has(code))) {
        // OBF-4 (F4-1): the host's update ends the seat as the game's end does (4007: dlgNetAbandoned.rdr, as LobbyMatch's
        // return) -- never the #365 net error under the page's warning -- then the page's warning and reload
        const updated = c.state === 'closed' && code === SERVER_UPDATE_CLOSE.code;
        this.seatEnd(updated ? GAME_ENDED_CLOSE_CODE : code, c.state === 'refused' ? this.refusal : null);
        if (updated) this.o.serverUpdate?.();
        return;
      }
      this.feed?.dropped();
      this.backoff();
      return;
    }
    if (this.now() < this.retryAt) return;
    this.retryAt = 0;
    this.attempts++;
    this.off?.(); this.off = null;
    if (this.reseater) { this.reseat(this.reseater); return; }   // SA-6c (GAME_RETOKEN_ADAPTATION): no socket until central answers
    const ticket = this.o.ticket();
    if (ticket === null) { this.seatEnd(null); return; }
    this.connect(this.seat(ticket));
  }

  /** The next attempt's time on `NetPage`'s backoff (`dropRetry`: the at-once reconnect taken once in its window). */
  private backoff(): void {
    const now = this.now();
    const wait = dropRetry(this.attempts, this.reached, now, this.quickAt);
    this.quickAt = wait.quickAt;
    this.retryAt = retryDueAt(now, wait.delayMs);
  }

  /**
   * SA-55 (`GAME_HELLO_WAIT_MS_ADAPTATION`): the socket never welcomed, past the wait -- one console line (the game, the
   * state it hung in, the wait, the attempt -- 1 the open's own socket, counted since the open or the last welcome -- and
   * the URL's host; never a token or a ticket), then a drop as a close is: the socket closed and no more heard (its own
   * close may never come; `helloLapsed` stands for it), the session let go, `dropped()` told once, the next socket after
   * the backoff through `frame`'s own path (a placed seat's re-token, a local seat's ticket).
   */
  private helloLapse(c: NetClient): void {
    const state = c.state;
    console.warn(`game socket: game ${this.game} not welcomed within ${GAME_HELLO_WAIT_MS_ADAPTATION} ms, hung ${state} (${state === 'connecting' ? 'the upgrade never completed' : 'opened, no welcome'}) on ${this.helloHost}, attempt ${this.attempts + 1}: dropped, retried after the backoff`);
    this.helloLapsed = true; this.helloSince = null;
    this.off?.(); this.off = null;
    c.close();
    this.hold(false);
    this.feed?.dropped();
    this.backoff();
  }

  /** The seat's end, told once: no retry, the client let go, the lobby's voice released (a final close, a refusal, the session gone). */
  private seatEnd(code: number | null, refusal: string | null = null): void {
    this.stopped = true;
    this.off?.(); this.off = null; this.offVoice?.(); this.offVoice = null; this.voice?.release(); this.client = null;
    this.feed?.seatEnded(code, refusal);
  }

  /**
   * SA-6c (`GAME_RETOKEN_ADAPTATION`): the reconnect's re-token, awaited -- one at a time (`asking`), the backoff paused,
   * the wait cut at `GAME_RETOKEN_WAIT_MS_ADAPTATION` (answered the backoff; a later answer dropped, as one after BACK or
   * another game's open is). A seat answered opens only through the hand-off's guard by its own identity (`isSeatOf`,
   * this game's), else the seat ends as 4008; a refusal ends it as 4007 or 4008 (`seatEnded`, as those closes do); signed
   * out, as a ticket gone (`seatEnded(null)`); a failure waits the backoff's next step.
   */
  private reseat(p: GameSeatProvider): void {
    const n = ++this.asks;
    this.asking = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const answered = (r: Reseat): void => {
      if (n !== this.asks || !this.asking) return;
      clearTimeout(timer);
      this.asking = false;
      if (this.stopped) return;
      if (r.kind === 'open') {
        if (!isSeatOf(r.seat, this.game)) { this.seatEnd(4008); return; }   // a broken seat, or another game's: as 4008
        this.door = r.seat.token !== undefined ? { pinned: r.seat.pinned, token: r.seat.token } : null;
        this.connect(r.seat);
        return;
      }
      if (r.kind === 'ended') { this.seatEnd(r.close); return; }
      if (r.kind === 'signed-out') { this.seatEnd(null); return; }
      this.backoff();
    };
    timer = setTimeout(() => { answered({ kind: 'backoff' }); }, GAME_RETOKEN_WAIT_MS_ADAPTATION);
    p.reseat().then(answered, () => { answered({ kind: 'backoff' }); });
  }

  /**
   * `GameSocketAdopt`: the client back from the match, open and holding the session (web research 166 §4). SA-57's
   * review (low 1, defence in depth; `NetPage.release` answers null for one never welcomed): only a client the room
   * welcomed (its seat id set) is taken as welcomed -- reached, holding, never timed out; one with id 0 holds nothing
   * and is timed by the hello's wait from here (`GAME_HELLO_WAIT_MS_ADAPTATION`), as a socket of the lobby's own is.
   */
  adopt(client: NetClient): void {
    this.drop();
    client.rebind(idleWalk);
    this.client = client;
    this.off = client.on((ev) => this.event(ev));
    this.listenVoice(client);
    this.stopped = false;
    const welcomed = client.id !== 0;                             // SA-57's review: the room's welcome, its seat id
    this.reached = welcomed;
    this.attempts = 0;
    this.retryAt = 0;
    // SA-55: welcomed in the lobby before the match took it, never timed out; SA-57's review: else the wait from here.
    this.helloSince = welcomed ? null : this.now(); this.helloLapsed = false; this.helloHost = socketHost(this.reportTo() ?? '');
    this.held = client.state === 'open' && welcomed;              // held since the lobby's welcome; told only its release
    this.choice = null;                                           // ARMORY-SAVE: back from a match, the lobby re-arms from the record
    // OBF-3: the welcome kept is this lobby's socket's; a drop in the match seated the page's new socket, perhaps afresh
    // under another id -- the next match names this seat by the client's own (`adoptedWelcome`).
    this.welcome = adoptedWelcome(this.welcome, client);
    this.roundStarted = null;                                     // the match's rounds are over: none handed on with the next launch
    this.roundEnded = null; this.scored = null;
    this.ownSpawn = null;                                         // LATE-SPAWN-HANDOFF: nor the spawn of a round the match played
    this.roundNow = 1;                                            // LATER 80 (F1): the match's end is `returnToLobby`'s round 1
    this.feed?.seatTold?.(client.told.all());                     // ONL-34: the rounds' told pairs the match's client heard, back into the lists
    this.feed?.seatClans?.(client.clans.all());                   // AD-13: the tags told while the match held the client
  }

  /** The match starts (`GameLobbyCommands.matchStart`): the client handed on open, this host no longer its listener. */
  handOff(m: GameLobbyMatchStart): void {
    const client = this.client, ticket = this.o.ticket();
    if (!client || ticket === null) return;
    const talk = this.voice?.handOff();                            // ONL-16b: the lobby's voice let go, its talk input handed on (W20.R9)
    this.off?.(); this.off = null;
    this.offVoice?.(); this.offVoice = null;
    this.client = null;
    this.stopped = true;
    this.held = false;                                             // the hold passes with the client (`held: true`)
    this.choice = null;                                            // ARMORY-SAVE: the map's load drops IDFromBriefing (research 309 §2.3)
    // LATE-WATCH F1: a round the room has said over is an older round than the one under way -- its start would
    // restart the clock at full length and post its banner -- so it is not handed on; a late seat takes the kept score,
    // less its wait, after it (`GameLobbyHandOff.score`).
    // LATE-SPAWN-HANDOFF: "older" by the socket's order, not the round's number -- a respawn match is one round
    // (`isMatchOver`), so the next match's `roundStart` names round 1 again after the last one's `roundOver` of round 1.
    const ended = this.roundEnded;
    const roundStart = this.roundStarted && (ended === null || ended.n < this.roundStartedN) ? this.roundStarted : null;
    // N1: the round over handed on to a late seat (the re-review's F-2: as the score) when it came after the welcome and
    // after the round handed on (or with none).
    const roundOver = m.lateJoiner && ended && ended.at >= this.welcomeAt && !roundStart
      ? { event: ended.ev, seconds: (this.now() - ended.at) / 1000 } : null;
    // LATE-SPAWN-HANDOFF (LATER 56): the seat's own last spawn, to a late seat only; before the round handed on when it
    // is that round's own start spawn (heard before its `roundStart`; one of an ended round was dropped at it).
    const own = m.lateJoiner ? this.ownSpawn : null;
    const spawn = own ? { event: own.ev, beforeRoundStart: roundStart !== null && own.n < this.roundStartedN } : null;
    // A score older than the round handed on is an earlier round's clock: that round's total less its time run instead.
    const now = this.now();
    const scored = this.scored;
    const score = !m.lateJoiner || !scored ? null
      : roundStart && scored.at < this.roundStartedAt ? restartedScore(scored.ev, Math.max(0, roundStart.seconds - (now - this.roundStartedAt) / 1000))
        : lessWait(scored.ev, (now - scored.at) / 1000);
    this.o.matchStart?.({ ...m, client, ...this.seat(ticket), ...(this.reseater ? { reseat: this.reseater } : {}), held: true, welcome: roundWelcome(seatWelcome(this.welcome, client.team, this.seats), this.roundNow), roundStart, ...(score ? { score } : {}), ...(roundOver ? { roundOver } : {}), ...(spawn ? { spawn } : {}), ...(talk ? { talk } : {}) });
  }
}

/**
 * An earlier round's `score` handed on with the new round's clock `timeLeft` -- a running clock: never held (LATER 152's
 * review F1: the earlier round's `clockHeld`, a defuse's, must not freeze the new round's).
 */
export function restartedScore(ev: Extract<ServerEvent, { type: 'score' }>, timeLeft: number): Extract<ServerEvent, { type: 'score' }> {
  const { clockHeld: _held, ...rest } = ev;
  return { ...rest, timeLeft };
}

/**
 * A `score` heard `seconds` ago, its clock run on by them (floored at 0): the host's timer now (LATE-WATCH F1). LATER 152: a
 * held clock (`clockHeld`, a defuse) is not run on.
 */
export function lessWait(ev: Extract<ServerEvent, { type: 'score' }>, seconds: number): Extract<ServerEvent, { type: 'score' }> {
  return ev.timeLeft === null || ev.clockHeld ? ev : { ...ev, timeLeft: Math.max(0, ev.timeLeft - seconds) };
}

/**
 * LATER 80 (the gameplay seat's PAR-94d notice): the welcome the match replays names the room's round counter as it stands
 * -- as a welcome the room sent now would (`room.ts` `hello`: `round: this.round`) -- for the match's page posts the round
 * banner at the welcome from its `round` (`./netPage`), and the original's console posts its level init's banner with the
 * current round count (`FUN_002a7d40` D:L50946 -> `FUN_001fb420` D:L57632-57649). The counter as the room's events since
 * the welcome tell it (`GameSocketHost.roundNow`): a `roundStart`'s round (`startRound`: `round++`); a `roundOver`'s (its
 * round: `endRound` leaves the counter, so a welcome in the round screens names the round just ended); 1 after the room's
 * abandon (`abandon`, told by `abandoned`), at any view of the game's lobby not launched (the room's construction, its
 * abandon, its return after a game over: `returnToLobby`) and at the client's return from its match (`adopt`). `round`
 * null (nothing heard since): the welcome as it came.
 */
export function roundWelcome(welcome: GameLobbyHandOff['welcome'], round: number | null): GameLobbyHandOff['welcome'] {
  return !welcome || round === null || welcome.round === round ? welcome : { ...welcome, round };
}

/**
 * B138's BTL.R8 (botsLand.spec, 5 of 6 rendered runs on 2026-10-24): the welcome the match replays, as the room would
 * now welcome the seat, after a promotion or a demotion heard in the lobby. The room tells a queued spectator its seat
 * with `promoted` (its side, the welcome's `ghost`, `char` and `armory`; `room.ts` `broadcastChanges`) and a seat moved out to the
 * queue with `demoted`; neither is replayed into the match (`./lobbyMatch` keeps only the events heard after the
 * hand-off), so the match replayed the spectator's welcome over a promoted seat: the page flew the walk the client had
 * placed (`NetClient.rebind`, a death at the load heard before the mount) and the respawn was never ready (`NetPage`
 * `respawnReady` reads the walk's mode). Now a promoted seat's welcome is a player's -- the one #474's direct player
 * welcome replays (`menuRespawnJoin.spec`) -- and a demoted seat's a spectator's at its place in the queue. The launch
 * countdown and the waiting line are the lobby's and are not carried. None kept: none.
 */
export function queuedWelcome(
  welcome: GameLobbyHandOff['welcome'], ev: Extract<ServerEvent, { type: 'promoted' | 'demoted' }>,
): GameLobbyHandOff['welcome'] {
  if (!welcome) return welcome;
  const { char: _char, armory: _armory, ...rest } = welcome;
  if (ev.type === 'demoted') return { ...rest, role: 'spectator', team: null, queue: ev.position, ghost: false };
  return {
    ...rest, role: 'player', team: ev.team, queue: 0, ghost: ev.ghost,
    ...(ev.char !== undefined ? { char: ev.char } : {}), ...(ev.armory ? { armory: ev.armory } : {}),
  };
}

/**
 * OBF-3 (peterp's report, the FF respawn lobby on central, 2026-10-29: the kill feed named him for another's kills; a
 * browser adaptation of the transport, ONL-18's way back, changing nothing the room does): the welcome the lobby keeps,
 * named for the seat the client it takes back holds. The match answers a drop with a new socket (`NetPage`'s rejoin), which
 * the room may seat afresh under a new id (`Room.takeOver` when the body is not resumed; `freeId`), and the old id is
 * then the next joiner's. Handed on unchanged, the old welcome made the next match's page give its own name to the old
 * id (`NetPage`'s `names.set(welcome.id, welcome.name)`) and `seatWelcome` skip that id's holder as this seat: his kills
 * read as this player's. The client's own id and seat name (`NetClient.seatName`) replace the welcome's, and an entry
 * of the old list under the new id (another seat, at that welcome) goes; the rest -- the room's phase, round and
 * environment as the lobby heard them -- stays, and `seatWelcome` fills the others from the bridge's view at the launch.
 * The review's F3-1: the seat's role, side and queue are the client's too (its welcome's, then `promoted` / `queue`), as
 * `queuedWelcome` takes them from a promotion or a demotion -- a rejoin seated afresh in the line is a spectator's welcome
 * (no side, its place, no type, no ARMORY, no ghost), and an old spectator's welcome on a seat now playing is a player's
 * on the client's side. The type and the ARMORY flag stay only with the same seat in the same role (the type, on the same
 * side too).
 * Unchanged for a client never welcomed (id 0) or one still the welcome's seat as it holds it.
 */
export function adoptedWelcome(
  welcome: GameLobbyHandOff['welcome'],
  seat: Pick<NetClient, 'id' | 'seatName' | 'role' | 'team' | 'queue'>,
): GameLobbyHandOff['welcome'] {
  if (!welcome || seat.id === 0) return welcome;
  const name = seat.seatName ?? welcome.name;
  const sameSeat = welcome.id === seat.id && welcome.role === seat.role;
  if (sameSeat && welcome.name === name && welcome.team === seat.team && welcome.queue === seat.queue) return welcome;
  const { char: _char, armory: _armory, ...rest } = welcome;
  const players = welcome.players.filter((p) => p.id !== seat.id);
  if (seat.role !== 'player') return { ...rest, id: seat.id, name, players, role: seat.role, team: null, queue: seat.queue, ghost: false };
  // The same seat moved to the other side keeps its ARMORY flag and loses the old side's type, as `seatWelcome` does.
  const { char: _type, ...moved } = welcome;
  const kept = !sameSeat ? rest : welcome.team === seat.team ? welcome : moved;
  return { ...kept, id: seat.id, name, players, role: 'player', team: seat.team, queue: 0 };
}

/** The seats of the bridge's last `gameLobby` view (each one's room id, name and side; null a watcher's), or none yet. */
type SeatsView = readonly { id: number; name: string; team: NetClient['team'] }[] | null;

/**
 * MENU-SIDE (the owner's playtest of main 50a98582c: "the terrorist player spawned as a SEAL with SEAL weapons"): the
 * welcome the match replays (`NetPageDeps.game.adopt`), as the room now holds every seat. SWITCH TEAMS in the game lobby
 * moves a seat after the welcomes (`Room.switchTeam`), and the lobby's `left` / `joined` since are not replayed into the
 * match, so the welcome is corrected from the room's own last view (`seats`, the bridge's `gameLobby`):
 * - **its own side** -- the client's, which takes it off that view (`NetClient`'s `gameLobby`); the type the welcome
 *   named, the old side's seat's, goes with it (the new seat's is the room's spawn's, `spawn.char`);
 * - **the others** (the MENU-SIDE review) -- the view's players other than this seat, each on its side now: a body the
 *   page holds no side for is drawn a SEAL (`RemotePlayers`), so a switched one, or one seated after this welcome, would
 *   be. A player still on the side the welcome named keeps the kit and type it named; a switched one's go (its spawn's
 *   follow); one gone from the view is gone; a watcher (no side) is no player.
 * Without a view the welcome's own players are kept; a welcome whose seat and players all stand is handed on as sent.
 */
export function seatWelcome(welcome: GameLobbyHandOff['welcome'], team: NetClient['team'], seats: SeatsView = null): GameLobbyHandOff['welcome'] {
  if (!welcome || welcome.role !== 'player') return welcome;
  let out = welcome;
  if (team && welcome.team !== team) {
    const { char: _, ...seat } = welcome;
    out = { ...seat, team };
  }
  if (seats) {
    const was = new Map(welcome.players.map((p) => [p.id, p]));
    const players = seats.flatMap((s) => {
      if (s.id === welcome.id || !s.team) return [];
      const p = was.get(s.id);
      return [p && p.team === s.team ? { ...p, name: s.name } : { id: s.id, name: s.name, team: s.team }];
    });
    const same = players.length === welcome.players.length && players.every((p, i) => JSON.stringify(p) === JSON.stringify(welcome.players[i]));
    if (!same) out = { ...out, players };
  }
  return out;
}

/**
 * ONL-18's way back (web research 166 §4): at the match's end the same game's lobby takes its client back open
 * (`MATCH_END_RETURN_READING`, `./lobbyMatch`) -- listened to again, rebound to the idle walk, the session still held by
 * it (nothing told), its closes handled as before.
 */
export interface GameSocketAdopt { adopt(client: NetClient): void }

export interface GameLobbyMount {
  recoverLobby?: import('@s2u/ui').GameLobbyCommandsOptions['recoverLobby'];
  uiVars: UiVarManager;
  valves: () => ValveStore;
  lobby: (GameLobbyLobby & { ticket(): string | null; socketHolds(held: boolean): void; sessionLost(ticket: string): void }) | null;
  /** The briefing room's games and room (`BriefingRoomCommands.gamesHeld()`, `roomWorldId()`). */
  games: () => readonly GameListEntry[];
  roomWorldId: () => number;
  inputString: (cmd: ZAnimUiCommand) => string | null;
  event: (kind: number, text: string | null) => void;
  /** R4B-08: the built dialog's name (`GameLobbyCommandsOptions.dialog`, r0004's Team Switch Error); absent, none. */
  dialog?: () => string | null;
  switchMenu: (dialog: string) => void;
  /** The room service (`fetchGameLobbyService`); absent, never answered. */
  service?: GameLobbyTransport;
  /** The page's pinned match socket; absent, `ConnectToGameServer` answers 0 (#425). */
  pinned?: PinnedSocketUrl;
  socket?: (url: string) => WebSocketLike;
  matchStart?: (h: GameLobbyHandOff) => void;
  /** ONL-16b: the lobby's voice client's options (`LobbyVoiceDeps`; absent, the page's own); false, no voice in the lobby. */
  voice?: LobbyVoiceDeps | false;
  /** ONL-15: AUTOPLAY's chain under `JoinMPGame(RANDOM)` (`connectBriefingRoom`'s `autoplay.start`); absent, nothing sent. */
  randomGame?: () => void;
  /** ONL-23: the lobby server's chat (`connectBriefingRoom`'s `chat`): `SendChatText`'s whisper and usage line; absent, none. */
  chat?: LobbyTextChat;
  /** CLAN-ID-WIRE: the client's clan id (`DAT_0044f59c`, the session's `LobbyClan.clanId`) for `ClanGameClosed`'s `FUN_002e9940`; absent, -1. */
  clanId?: () => number;
  /** LOBBY-INVITE (INVITE_REFUSAL_ADAPTATION): a JoinGame refusal shown as the invite's own line when it answers true. */
  joinRefused?: (status: number, worldId: number) => boolean;
  /** SA-43c Part 2: the game socket's system message (`GameSocketHostOptions.system`); absent, dropped. */
  system?: (text: string, severity: number) => void;
  /** OBF-4: the host's update closed the game socket (`GameSocketHostOptions.serverUpdate`); absent, the seat's end alone. */
  serverUpdate?: () => void;
  /** P537-L2: `GameLobbyCommandsOptions.allBotGames` (the server's `CREATE_GAME_ALL_MAPS` word); absent, H314/H315's BOTS. */
  allBotGames?: () => boolean;
  /**
   * LOBBY-MAPNAME (research 165 §9): `GameLobbyCommandsOptions.missionVars` -- the mission's `mission.rdr` `UiVars`, which
   * `AdvanceMPMission` adds to the UI variables (`mission_title`, the title bar's `MPgamename`); absent, none.
   */
  missionVars?: import('@s2u/ui').GameLobbyCommandsOptions['missionVars'];
}

/** The mount (`FrontEndSession`'s one call): the rows, the gate, the lobby's states 15 and 17, the game socket; `frame` once a frame. */
export function connectGameLobby(host: UiCommandHost, m: GameLobbyMount): { commands: GameLobbyCommands; socket: GameSocketHost | null; profile: ArmoryProfileCommands; voice: GameLobbyVoice | null; frame(): void } {
  const lobby = m.lobby;
  const gameToken = m.service?.gameToken?.bind(m.service);
  const socket = m.pinned && lobby ? new GameSocketHost({
    pinned: m.pinned, ticket: () => lobby.ticket(), holds: (h) => { lobby.socketHolds(h); }, socket: m.socket, matchStart: m.matchStart,
    ...(m.system ? { system: m.system } : {}),                       // SA-43c Part 2: the room's system message, to the front end's routing
    ...(m.serverUpdate ? { serverUpdate: m.serverUpdate } : {}),     // OBF-4: the host's update, the page's warning and reload
    // SA-6c (GAME_RETOKEN_ADAPTATION): a placed seat's re-token over the room service's transport, its 401 the session lost
    ...(gameToken ? { retoken: { ask: (g: number, t: string, signal: AbortSignal) => gameToken(g, t, signal), sessionLost: (t: string) => { lobby.sessionLost(t); } } } : {}),
  }) : null;
  // ONL-16b (research 227 §1): the lobby's voice over the game socket, HEADSET VOLUME from the front end's uiVars.
  const voice = socket && m.voice !== false ? new GameLobbyVoice({
    // VOICE-LATE-3 (research 226 §3.3): `reportTo`, the game socket's server, where a development build's voice counters
    // are posted (a playtest instrument; nothing is posted in a release build or without `?devmode`); SA-7d: a placed
    // game's to its pinned door, forwarded to its process (`GameSocketHost.reportTo`)
    link: () => socket.link(), lateJoiner: () => m.valves().find('late_joiner')?.value === 1, deps: { reportTo: () => socket.reportTo(), ...(m.voice ?? {}) },
    inArmory: () => m.valves().find('GoneToArmory')?.value === 1,
    tuners: () => tunersOfVars(m.uiVars),
    // LOBBY_VOICE_LINE_ADAPTATION: the lobby's text panel, a line each.
    line: (text) => { appendGameLobbyChat(m.uiVars, `${text}\n`); },
  }) : null;
  if (voice) socket?.attachVoice(voice);
  const commands = new GameLobbyCommands({
    uiVars: m.uiVars, valves: m.valves, lobby, games: m.games, roomWorldId: m.roomWorldId, inputString: m.inputString, event: m.event,
    switchMenu: m.switchMenu, socket: socket ?? undefined, recoverLobby: m.recoverLobby,
    ...(m.dialog ? { dialog: m.dialog } : {}),                      // R4B-08: r0004's Team Switch Error asks the dialog's name
    service: m.service && lobby ? sessionGameLobby(m.service, () => lobby.ticket(), (t) => { lobby.sessionLost(t); }) : undefined,
    matchStart: (s) => { socket?.handOff(s); },
    ...(voice ? { voice } : {}),
    ...(m.randomGame ? { randomGame: m.randomGame } : {}),
    ...(m.chat ? { chat: m.chat } : {}),
    ...(m.clanId ? { clanId: m.clanId } : {}),
    ...(m.allBotGames ? { allBotGames: m.allBotGames } : {}),       // P537-L2: the server's all-maps word
    ...(m.joinRefused ? { joinRefused: m.joinRefused } : {}),
    ...(m.missionVars ? { missionVars: m.missionVars } : {}),     // LOBBY-MAPNAME: FUN_002acc10's UiVars half
  });
  socket?.attach(commands);
  commands.register(host);
  // ONL-17 on SVC-24 (research 167): the ARMORY's records, keyed by the game's mission, over the same transport.
  // The shared ARMORY on the lobby's page (`./lobbyArmory`) stores through the same rows.
  const profile = new ArmoryProfileCommands({
    valves: m.valves, mission: () => commands.missionName(),
    service: m.service && lobby ? sessionLoadouts(m.service, () => lobby.ticket(), (t) => { lobby.sessionLost(t); }) : undefined,
  });
  profile.register(host);
  // ONL-16b: the ARMORY's entry clears the lobby's talk flag first (`FUN_0027d8c0` D:L126098), then the records' row.
  if (voice) host.setHandler('InitializeOnlineArmory', (cmd, row, time) => { voice.armory(); return profile.InitializeOnlineArmory(cmd, row, time); });
  return { commands, socket, profile, voice, frame: () => { socket?.frame(); voice?.frame(); } };
}
