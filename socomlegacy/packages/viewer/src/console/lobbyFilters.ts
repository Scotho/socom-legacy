/**
 * The lobby lists' filters (MU-13g of `docs/plans/2026-10-09-modern-ui-parallel.md`; the parity audit's F33), Browse
 * rooms' L2 / R2 roller (`./adapters/rooms`: All, Has room, No password -- one at a time, never combined; the name search
 * is the screen's own, `./state` `visibleRooms`). A browser convenience on top of the original's lists (MU.R12, "on
 * top"), labelled as one: the original's lists have no filter. It is client-side only -- it never changes the request,
 * the counts, or the order (`roomOrder`, `FUN_002e3f80`; the games' order is the server's): a row is kept or dropped,
 * never moved. Nothing is stored. Moved here from `../modern/lobbies/filters.ts` with CX-LOBBIES (the modern Lobbies
 * section, its chips' other reader, retired; nothing else in `../modern` read it), and trimmed to what the console reads
 * (`keeps`; the review's F6).
 */

/** The roller's one filter: Has room, or No password (All keeps every row and asks nothing here). */
interface LobbyFilter { hasRoom: boolean; noPassword: boolean }

/**
 * MU_FILTER_RANK_CHIP: the "my rank is eligible" filter is omitted -- the session holds the account's name and its
 * ticket and nothing of the player's rank (`../modern/session` `SessionAccount { name }`), and the lobby's own lists
 * carry only the tiers a room allows (`roomEligibleRanks`). A filter would have to guess the rank, so there is none until
 * a rank is held. Kept: the modern UI polish plan names it (`docs/plans/2026-10-13-modern-ui-polish-and-overlay.md`).
 */
export const MU_FILTER_RANK_CHIP = 'the rank chip is omitted: the session holds no rank for the player' as const;

/** The row fields a filter reads: a room's or a game's seats and password. */
interface Filterable { seats: number; max: number; locked: boolean }

/** Whether the roller's filter `f` keeps the row. */
export function keeps(f: LobbyFilter, r: Filterable): boolean {
  if (f.hasRoom && r.seats >= r.max) return false;
  return !(f.noPassword && r.locked);
}
