import { DIALOG_EVENTS } from '../dialog';
import { gameStatsD, type GameListEntry, type GameListFilterQuery, type GameListQuery } from './briefingRoomCommands';
import type { ChannelListEntry } from './worldOfSocomCommands';

/**
 * AUTOPLAY (SOCOM II ONLINE's row, ONL-15, web sprint 22; web research 265 §2): "Automatically join a game based on your
 * filter settings" (#784). The row's CROSS runs the disc's `join_random_game` (`StartMusic`, `.DINK`, the kept popup
 * #801 "Searching For Game To Join", the progress strip, `JoinMPGame(RANDOM)`); this module is what `JoinMPGame` does
 * with RANDOM (`FUN_002f83b0` D:L197147-197155) and the four callbacks it chains. `D:L<line>` = a line of
 * `socom2_game.elf.decomp.c`; `S:0x...` a string of the retail ELF. Transcribed, cited, never pasted.
 *
 * **The chain** (each step the previous request's callback; a status is logged, never tested, until the list):
 * 1. `FUN_002f83b0` (D:L197147-197155): the candidates emptied (0x44fab0), ClearGameListFilter0 with FilterID 10 -- the
 *    room's lobby-world filter, so every room's games are asked -- and the row answers 1.
 * 2. `FUN_002f8e50` (D:L197533-197553): SetGameListFilter0, field 1 (PLAYER_COUNT), operator 3 (>=), baseline 1.
 * 3. `FUN_002f8ed0` (D:L197558-197586): five of the list's six filter globals read again from their valves --
 *    GameTypeFilter, GamePlayerFilter, GameSpeedFilter, FF_FILTER, LockedFilter (S:0x3f5a38 .. S:0x3f5a90; not
 *    GamePasswordFilter, which keeps the value of the last game list asked, or the start's 2, `FUN_003042b0`
 *    D:L204390-204395) -- and GameList_ExtraInfo0, PageID 1, PageSize 999 (D:L197579-197583).
 * 4. `FUN_002f8fd0` (D:L197591-197655), each entry: a non-success (S:0x3f5aa0) posts MP_MEDIUS_JOIN_GAME_FAILURE
 *    (S:0x3f5ac0) and clears FilterID 1 (D:L197610-197619); a success with a world id from 0 is made a record and kept
 *    as a candidate when (D:L197629-197639): its players are fewer than MaxPlayers less the spectator slots ('D'[4]),
 *    more than GamePlayerFilter and not 0; the list's own filter passes it (`FUN_002e3080` with the record in a0 --
 *    ELF 0x2f9050 / 0x2f9084 -- the briefing room's `admits`); its world status is not 3 (closed); it has no password
 *    (security bit 0 clear); its clan field admits the player (`FUN_002e9940`: not another clan's clan game, against
 *    the client's clan id `DAT_0044f59c`, `clanId`); its rank bits admit the tier (`FUN_002e3490`,
 *    `PLAYER_TIER_PARKED_READING`: no tier, no refusal); every map of its play list is held (`FUN_002e33e0`,
 *    `MISSION_AVAILABLE_READING`). The entry with EndOfList then picks (step 5) and clears FilterID 1
 *    (D:L197647-197652).
 * 5. `FUN_002f9220` (D:L197658-197715), the pick: none, MP_MEDIUS_JOIN_GAME_FAILURE. Else the candidate with the most
 *    room -- MaxPlayers less MinPlayers -- and, between equals, the smaller GenericField2 (the response time the list's
 *    PING column reads); between equals again the first in the list's order (D:L197678-197692). Its world id is kept
 *    (`DAT_0066a5f0`), its name into GAMENAMEVAR, PlayerGamePassword emptied (D:L197693-197698); then its room -- the
 *    client's room record whose world id is the game's GenericField1 (`FUN_002e4410`, D:L197699): none,
 *    MP_MEDIUS_JOIN_GAME_FAILURE; found, the random-join flag set (`DAT_0066a5e8`), MP_RANDOM_GAME_FOUND (S:0x3f5ae0) and
 *    `JoinMPRoom` with the room's name (`FUN_002e3790`, D:L197706-197710).
 *
 * **The join** is the path's own: the room's JoinChannel (state 19); its success, with the flag set, queues state 15 --
 * JoinGame for the kept world id -- instead of state 11 and MP_JOIN_ROOM (`FUN_002efc80` D:L191641-191652), and state
 * 15's entry clears the flag (D:L190399); JoinGame's success queues state 17, whose entry posts
 * MP_MEDIUS_READY_TO_CONNECT (the code at ELF 0x2ef3c0, phase 1: 0x2ef408-0x2ef454), which SOCOM II ONLINE binds to its
 * `join_game` -- the popup #806, `ConnectToGameServer`, `CheckJoinMP`, `JoinGameServer`, `SWITCHMENU(dlgGameLobby.rdr)`.
 *
 * The transport is the briefing room's (`/lobby/clear-filter`, `/lobby/set-filter`, `/lobby/game-list` with the
 * session's bearer, OT.R27); a request never answered ends the chain where it stands, as the console's would with a
 * silent server (its 33 s timeout on the list, `FUN_002f4080(.., 0x21)` D:L197582, is not read further).
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** Step 1's ClearGameListFilter0 (`FUN_002f83b0` D:L197152: FilterID 10, the lobby-world filter's). */
export const AUTOPLAY_CLEAR_ROOM_FILTER = { filterId: 10 } as const;
/** Step 2's SetGameListFilter0 (`FUN_002f8e50` D:L197547-197549: field 1, operator 3, baseline 1). */
export const AUTOPLAY_PLAYER_FILTER: GameListFilterQuery = { filterField: 1, comparisonOperator: 3, baselineValue: 1 };
/** Step 3's GameList_ExtraInfo0 (`FUN_002f8ed0` D:L197580-197581: PageID 1, PageSize 999). */
export const AUTOPLAY_LIST_QUERY: GameListQuery = { pageId: 1, pageSize: 999 };
/** The ClearGameListFilter0 that ends the chain (`FUN_002f8fd0` D:L197617, D:L197651: FilterID 1). */
export const AUTOPLAY_CLEAR_PLAYER_FILTER = { filterId: 1 } as const;

/** The page's half of the chain's three requests (the briefing room's transport): a rejection is a request never answered. */
export interface AutoplayService {
  clearGameListFilter(q: { filterId: number }): Promise<{ status: number }>;
  setGameListFilter(q: GameListFilterQuery): Promise<{ status: number; filterId: number }>;
  gameList(q: GameListQuery): Promise<readonly GameListEntry[]>;
}

/** The briefing room's half the chain stands on: its filter globals and their test (`FUN_002e3080`), and its room join. */
export interface AutoplayBriefing {
  /** Step 3's read of the five valves into the list's filter globals (the password's kept). */
  readAutoplayFilters(): void;
  /** `FUN_002e3080` over the record made from the entry, at the globals held. */
  admits(e: GameListEntry): boolean;
  /** GamePlayerFilter as the globals hold it (`DAT_0044f530`). */
  playerFilter(): number;
  /** `FUN_002e3790` with the room's name and the random-join flag set (`DAT_0066a5e8`): 1 when state 19 was queued. */
  joinRoomForRandomGame(name: string): boolean;
}

export interface AutoplayOptions {
  service?: AutoplayService;
  briefing: AutoplayBriefing;
  /** The client's rooms (0x44f568), ONL-11's records. */
  rooms: () => readonly ChannelListEntry[];
  /** `DAT_0044f3c8(name, argument)`: a named event into the built dialog. */
  event: (kind: number, text: string | null) => void;
  /** The game found (D:L197693-197698): the lobby holds it for state 15's JoinGame (`GameLobbyCommands.randomGameFound`). */
  found: (game: GameListEntry) => void;
  /**
   * The client's clan id (`DAT_0044f59c`: GetMyClans' `FUN_002e8bd0` writes it, D:L187810-187812, and -1 on a no-clan
   * reply, D:L187790): the client clan's (`LobbyClan.clanId`, ONL-27); absent, -1 (in no clan).
   */
  clanId?: () => number;
}

/** `FUN_002e9940` (D:L188215-188244): a clan game (GenericField3's top nibble 0xC) admits only its own clan's members; any other field admits. */
export function clanFieldAdmits(genericField3: number, clanId: number): boolean {
  const g = genericField3 >>> 0;
  return (g & 0xf0000000) >>> 0 !== 0xc0000000 || (g & 0x0fffffff) === clanId;
}

/**
 * Whether a player joining `e` meets a full game. With no CPU it is the original's test (`FUN_002f8fd0` D:L197629-197639,
 * and the invite's, `InviteSearch`): PlayerCount -- every occupant, the spectators too -- against MaxPlayers less the
 * spectator slots (GameStats D[4]). B138 (dot's review 1 and its re-check; central's `CPU_SEAT_REPLACEABLE_ADAPTATION`):
 * with CPU seats such a player may take (`GameListEntry.replaceable`), central's own two tests (`RoomService.joinGame`):
 * the occupants less those seats under MaxPlayers, and the humans playing -- PlayerCount less the spectators watching
 * (D[3]) and the CPUs -- under the player seats. A product adaptation: the original's games held no CPUs. A spectator's
 * join never reads it, and the list's occupancy as drawn stays PlayerCount.
 */
export function playerJoinFull(e: GameListEntry): boolean {
  const total = e.playerCount & 0xffff, max = e.maxPlayers & 0xffff, d = gameStatsD(e.gameStats), seats = max - d[4]!;
  const cpus = e.replaceable ?? 0;
  if (cpus <= 0) return total >= seats;
  return total - cpus >= max || total - Math.min(total, d[3]!) - cpus >= seats;
}

/** Step 4's candidate test (`FUN_002f8fd0` D:L197629-197639) over one success entry with a world id from 0. */
export function autoplayCandidate(e: GameListEntry, o: { playerFilter: number; admits: (e: GameListEntry) => boolean; clanId: number }): boolean {
  const players = e.playerCount & 0xffff;
  // The seat test meets a CPU's seat as free (B138, `playerJoinFull`); GamePlayerFilter and the empty game read the list's count.
  return !playerJoinFull(e) && o.playerFilter < players && players !== 0
    && o.admits(e) && e.worldStatus !== 3 && (e.securityLevel & 1) === 0 && clanFieldAdmits(e.genericField3, o.clanId);
  // FUN_002e3490 (the rank bits, PLAYER_TIER_PARKED_READING) and FUN_002e33e0 (the play list held, MISSION_AVAILABLE_READING) admit every game here.
}

/** Step 5's choice (`FUN_002f9220` D:L197678-197692): the most MaxPlayers less MinPlayers, then the smaller GenericField2, then the first. */
export function autoplayPick(candidates: readonly GameListEntry[]): GameListEntry | null {
  let best: GameListEntry | null = candidates[0] ?? null;
  const room = (g: GameListEntry): number => (g.maxPlayers & 0xffff) - (g.minPlayers & 0xffff);
  for (const c of candidates) {
    if (room(c) > room(best!) || (room(c) === room(best!) && c.genericField2 < best!.genericField2)) best = c;
  }
  return best;
}

export class AutoplaySearch {
  /** 0x44fab0: the candidates kept from the list's entries. */
  private candidates: GameListEntry[] = [];
  /** The latest search: a reply to an earlier one is dropped (the console's one connection answers in order). */
  private seq = 0;

  constructor(private readonly o: AutoplayOptions) {}

  private post(event: string): void { this.o.event(DIALOG_EVENTS[event]!, null); }
  private clear(q: { filterId: number }): Promise<unknown> | undefined { return this.o.service?.clearGameListFilter({ ...q }); }

  /** Step 1 (`FUN_002f83b0`'s RANDOM, D:L197147-197155): the candidates emptied, FilterID 10 cleared; the row's answer, 1, is the caller's. */
  start(): void {
    this.candidates = [];
    const seq = ++this.seq, svc = this.o.service;
    if (!svc) return;
    const live = (): boolean => seq === this.seq;
    const never = (): void => { /* never answered: the chain stands */ };
    svc.clearGameListFilter({ ...AUTOPLAY_CLEAR_ROOM_FILTER }).then(() => {
      if (!live()) return;
      return svc.setGameListFilter({ ...AUTOPLAY_PLAYER_FILTER }).then(() => {   // step 2
        if (!live()) return;
        this.o.briefing.readAutoplayFilters();                                     // step 3
        return svc.gameList({ ...AUTOPLAY_LIST_QUERY }).then((entries) => { if (live()) for (const e of entries) this.entry(e); });
      });
    }).catch(never);
  }

  /** Step 4 (`FUN_002f8fd0`), one entry. */
  private entry(e: GameListEntry): void {
    if (e.status !== 0) {
      this.post('MP_MEDIUS_JOIN_GAME_FAILURE');
      this.clear(AUTOPLAY_CLEAR_PLAYER_FILTER)?.catch(() => {});
      return;
    }
    if (e.mediusWorldId >= 0 && autoplayCandidate(e, { playerFilter: this.o.briefing.playerFilter(), admits: (x) => this.o.briefing.admits(x), clanId: this.o.clanId?.() ?? -1 })) {
      this.candidates.push(e);
    }
    if (e.endOfList) {
      this.pick();
      this.clear(AUTOPLAY_CLEAR_PLAYER_FILTER)?.catch(() => {});
    }
  }

  /** Step 5 (`FUN_002f9220` D:L197658-197715). */
  private pick(): void {
    const best = autoplayPick(this.candidates);
    this.candidates = [];
    if (!best) { this.post('MP_MEDIUS_JOIN_GAME_FAILURE'); return; }
    this.o.found(best);
    const room = this.o.rooms().find((r) => r.mediusWorldId === best.genericField1);
    if (!room) { this.post('MP_MEDIUS_JOIN_GAME_FAILURE'); return; }
    this.post('MP_RANDOM_GAME_FOUND');
    this.o.briefing.joinRoomForRandomGame(room.lobbyName);
  }
}
