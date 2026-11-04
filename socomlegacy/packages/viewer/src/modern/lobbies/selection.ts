/**
 * The lobby browser's selected room (MU-3 of `docs/plans/2026-10-09-modern-ui-parallel.md`): what the player picked in
 * the Lobbies section, which the launch (MU-6) reads to know where to go. A browser adaptation (MU.R1): the original
 * has no such store -- its menu path joins a room by its own screens.
 *
 * The ids are the routes' own: a briefing room's and a game's `mediusWorldId` as `/lobby/channel-list`,
 * `/lobby/game-list` and `/modern/lobby-members` send them (`packages/central/src/lobbyHttp.ts`, `modernHttp.ts`), and
 * a game's room (its GenericField1, the room it was made in: `CreateGameRequest`, `central/src/lobby.ts`). The name is
 * the one the list drew, for the launch bar's words only -- never a key. The store holds memory only: no storage, no
 * address, no cookie (a selection is not a save, MU.R2).
 */
export type LobbySelection =
  | Readonly<{ kind: 'room'; mediusWorldId: number; name: string }>
  | Readonly<{ kind: 'game'; mediusWorldId: number; room: number | null; name: string }>;

export interface SelectionStore {
  /** The selected room or game, or null. */
  selected(): LobbySelection | null;
  /** Calls `cb` with the new selection on each change; answers the unsubscribe. */
  onChange(cb: (s: LobbySelection | null) => void): () => void;
  /** Selects one (null: none); a selection equal to the current one changes nothing. */
  select(s: LobbySelection | null): void;
}

const same = (a: LobbySelection | null, b: LobbySelection | null): boolean => {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind || a.mediusWorldId !== b.mediusWorldId || a.name !== b.name) return false;
  return a.kind === 'room' || (b.kind === 'game' && a.room === b.room);
};

const copy = (s: LobbySelection): LobbySelection => Object.freeze(s.kind === 'room'
  ? { kind: 'room', mediusWorldId: s.mediusWorldId, name: s.name }
  : { kind: 'game', mediusWorldId: s.mediusWorldId, room: s.room, name: s.name });

export function createSelection(): SelectionStore {
  let current: LobbySelection | null = null;
  const subs = new Set<(s: LobbySelection | null) => void>();
  return {
    selected: () => current,
    onChange(cb) { subs.add(cb); return () => { subs.delete(cb); }; },
    select(s) {
      if (same(current, s)) return;
      current = s === null ? null : copy(s);
      for (const cb of [...subs]) cb(current);
    },
  };
}

/** The page's one selection: the Lobbies section writes it, the launch (MU-6) reads it. */
export const lobbySelection: SelectionStore = createSelection();
