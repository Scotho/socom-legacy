import type { GameListEntry } from '@s2u/ui';
import { timeDoorPing } from './doorPing';

/**
 * GAME-PING (product track, a browser adaptation; Craig's "go", 2026-10-31/11-01, relayed by controller 5d and recorded
 * in OWNER-WORDS): a listed game's PING drawn from the player's own round trip to its host's door, in place of the
 * original's band of GenericField2. The original never measures a game's ping: it sends GenericField2 = 65000
 * (`FUN_002ef590` D:L191395, set at `FUN_002e0030` D:L182645; research 343 R343.6) and its game list draws that field
 * by its bounds (`FUN_002e2ce0` D:L184438-184452: under 300 the first icon, under 600 the second, else the red dot), so
 * every game is red. The wire is unchanged -- the page still sends 65000 and the speed filter still reads GenericField2
 * (`@s2u/ui` `briefingRoomCommands.ts` `passes`) -- only the drawn band is the measured one, under the original's own
 * bounds. The probe is LATER 455's (`./doorPing.ts` `timeDoorPing`, `GET <door>/ping`); a game's door is its briefing
 * room's door (central's `/lobby/channel-list` `doors`), as the ROOMS list's PING reads it (`./briefingRoomPing.ts`,
 * `./worldOfSocomHost.ts` `RoomListPing`). **An approximation, the known limit:** central's `roomPingDoor`
 * (`packages/central/src/placement.ts`) names the host a NEW game made in the room would be placed on, not the host a
 * listed game runs on, so a game already running on another host is measured against the room's next host, not its
 * own; the list carries no per-game host (no wire change here). Nothing the game does changes.
 */

/** GAME-PING, an adaptation: a door's answer is held this long before the next read sends another probe (per door). */
export const GAME_PING_CACHE_MS_ADAPTATION = 5_000;

/** The original's bounds on GenericField2 (`FUN_002e2ce0` D:L184438-184452), applied here to the measured ms. */
export const GAME_PING_GOOD_UNDER_MS = 300;
export const GAME_PING_FAIR_UNDER_MS = 600;

/** The original's bands with players in the game: 1 green, 2 amber, 3 red. */
export type GamePingBand = 1 | 2 | 3;

/** A round trip in ms banded by the original's bounds: under 300 green (1), under 600 amber (2), else red (3). */
export function gamePingBand(ms: number): GamePingBand {
  return ms < GAME_PING_GOOD_UNDER_MS ? 1 : ms < GAME_PING_FAIR_UNDER_MS ? 2 : 3;
}

/** A door's reading: whole ms; null, the probe had no answer (unreachable); undefined, none answered yet. */
export type DoorPingReading = number | null | undefined;

export interface DoorPingCacheDeps {
  /** One probe of a door (`timeDoorPing` by default). */
  probe?: (door: string) => Promise<number | null>;
  /** The page's monotonic clock (`performance.now` by default). */
  now?: () => number;
  /** `GAME_PING_CACHE_MS_ADAPTATION` by default. */
  cacheMs?: number;
  /** Called when a probe's answer changes what a door reads (`before` the held reading, `after` the new), so the list is drawn again. */
  changed?: (door: string, before: DoorPingReading, after: number | null) => void;
}

/**
 * GAME-PING's throttle: per door, at most one probe out, and none sent within `cacheMs` of the last answer -- a read
 * inside that window answers the held value with no traffic. Reading never waits: it answers what is held and, when that
 * is stale, sends one probe whose answer is drawn on the next redraw (`changed`). `clear` drops everything (a session
 * change); an answer to a probe sent before it is dropped.
 */
export class DoorPingCache {
  private held = new Map<string, { ms: number | null; at: number }>();
  private out = new Set<string>();
  private epoch = 0;
  private readonly probe: (door: string) => Promise<number | null>;
  private readonly now: () => number;
  private readonly cacheMs: number;

  constructor(private readonly d: DoorPingCacheDeps = {}) {
    this.probe = d.probe ?? ((door) => timeDoorPing(door));
    this.now = d.now ?? (() => performance.now());
    this.cacheMs = d.cacheMs ?? GAME_PING_CACHE_MS_ADAPTATION;
  }

  read(door: string): DoorPingReading {
    const h = this.held.get(door);
    if ((!h || this.now() - h.at >= this.cacheMs) && !this.out.has(door)) void this.send(door);
    return h?.ms;
  }

  clear(): void {
    this.epoch++;
    this.held = new Map();
    this.out = new Set();
  }

  private async send(door: string): Promise<void> {
    const epoch = this.epoch;
    this.out.add(door);
    const ms = await this.probe(door).catch(() => null);
    if (epoch !== this.epoch) return;
    this.out.delete(door);
    const ok = ms !== null && Number.isFinite(ms) && ms >= 0 ? Math.round(ms) : null;
    const before = this.held.get(door);
    this.held.set(door, { ms: ok, at: this.now() });
    if (!before || before.ms !== ok) this.d.changed?.(door, before?.ms, ok);
  }
}

/**
 * A game's measured ping: undefined -- the original's band stands -- for a game with no players (no probe is sent) or
 * whose room has no door named (an older server, a local game: nothing to measure, as the ROOMS list keeps its earlier
 * number for a room with no door); null when its door has not answered, yet or at all -- drawn `--` (the ROOMS list's
 * look for a failed probe), never the red dot; else its door's round trip in ms.
 */
export function gamePingMs(cache: DoorPingCache, door: string | null | undefined, players: number): number | null | undefined {
  if (players === 0 || !door) return undefined;
  return cache.read(door) ?? null;
}

/**
 * The in-game game list's PING cell (`@s2u/ui` `BriefingRoomCommands`' `gamePing`): the original's icon index by the
 * measured ms; undefined (the original's band) where `gamePingMs` is. The disc's PING column is an IMAGE column (its
 * TEXTURES by the cell's index, `FUN_002e2ce0`'s 0-3), which draws no text, so a door that has not answered draws index
 * 0 -- the original's own no-ping cell, the one it gives a game with no players -- for `--`, never the red dot.
 */
export function gameListPingCell(cache: DoorPingCache, door: string | null | undefined, players: number): number | undefined {
  const ms = gamePingMs(cache, door, players);
  return ms === undefined ? undefined : ms === null ? 0 : gamePingBand(ms);
}

/** The icon a door's reading draws in the in-game list: its band, else 0 (not answered, or no answer). */
const drawnIcon = (r: DoorPingReading): number => (typeof r === 'number' ? gamePingBand(r) : 0);

/**
 * The in-game game list's hook (`./briefingRoomHost.ts` `connectBriefingRoom`, `gamePing`): `cell` for each drawn game
 * with players, its room's door by the room's name (`roomDoor`, the room list's `doors`, `./worldOfSocomHost.ts`);
 * `changed` (the list drawn again) only when a door's answer changes the icon its games draw -- a new ms within the same
 * band redraws nothing, so GAMELISTVAR is set again (and its OnGameListUpdateUIVar run) only for a changed cell (the
 * review's F2); `clear` at a session's change.
 */
export function gameListPing(roomDoor: (room: string) => string | null, deps: DoorPingCacheDeps = {}): { cell: (room: string, e: GameListEntry) => number | undefined; clear: () => void } {
  const cache = new DoorPingCache({
    ...deps,
    changed: (door, before, after) => { if (drawnIcon(before) !== drawnIcon(after)) deps.changed?.(door, before, after); },
  });
  return { cell: (room, e) => gameListPingCell(cache, roomDoor(room), e.playerCount & 0xffff), clear: () => { cache.clear(); } };
}
