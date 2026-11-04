import { MAX_PLAYERS, MAX_SPECTATORS, type Role, type Team } from './protocol';

/**
 * The room's roster, headless (web sprint 3, multiplayer): who is a player on which team, who waits in the spectators'
 * queue, and what each is called. Rules from the game's decompilation (research 91) and the sprint's rulings:
 *
 * - Teams (research 91 section 7, `FUN_002bc620` L161359-161395): 8 a team; a joiner goes to the Terrorists if
 *   Terrorists < SEALs, or the SEALs are full, or both are empty; else to the SEALs (ties to the SEALs); refused when the
 *   chosen side is full (`assignTeam`). The game has no in-round auto-balance: each joiner is placed once.
 * - The queue (W3.R11, the owner's 16 players; the queue is the server's guard, not the game's): a join past the
 *   players' room waits in a FIFO of spectators, and a freed player slot promotes the head, placed by the same team rule.
 * - Watchers (the map viewer's Online setting, 2026-09-29): a join asking to watch is a spectator outside the queue --
 *   never promoted, never counted as waiting -- held to the same `maxSpectators` room as the queue, the two together.
 * - Names (research 91 section 13, W3.R12): at most 30 printable ASCII characters; a blank name is the game's
 *   `"Player%d"` with a random four-digit number; a duplicate takes the lowest free `(2)`, `(3)` suffix within the 30.
 *
 * No I/O, no clock: the caller passes `random` where a guest name may be drawn, so a test can seed it.
 */

/** Players a team holds (research 91 section 7: 8 a team). */
export const TEAM_SIZE = 8;
/**
 * The longest name kept (research 91 section 13, W3.R12: the in-game buffer). Not the online persona's cap, which is 14
 * (PC research 38, the login keyboard's MaxChars; ONL-06): corrected 2026-10-01, PLAT-35.
 */
export const NAME_MAX = 30;

/** A client in the room. */
export interface Member {
  id: number;
  name: string;
  role: Role;
  /** The side, for a player; null for a spectator. */
  team: Team | null;
  /** The join order counter (unique, rising): the order of `players()` and of the queue. */
  joinedAt: number;
}

/** What a `join` / `leave` / `rename` did to the roster, in a deterministic order. */
export type LobbyChange =
  | { kind: 'joined'; id: number; role: Role; team: Team | null }
  | { kind: 'left'; id: number }
  | { kind: 'promoted'; id: number; team: Team }
  /** A spectator's 1-based place in the queue changed. */
  | { kind: 'queue'; id: number; position: number }
  | { kind: 'renamed'; id: number; name: string };

/**
 * The game's team rule for a joiner (research 91 section 7, `FUN_002bc620`): Terrorists if Terrorists < SEALs, or the
 * SEALs are full (= `teamSize`), or both teams are empty; else SEALs. Null when the chosen side is full.
 */
export function assignTeam(seal: number, terrorist: number, teamSize: number = TEAM_SIZE): Team | null {
  const terror = terrorist < seal || seal >= teamSize || (seal === 0 && terrorist === 0);
  if (terror) return terrorist >= teamSize ? null : 'terrorist';
  return seal >= teamSize ? null : 'seal';
}

/**
 * W3.R12: printable ASCII only (0x20-0x7e), everything else removed, runs of spaces collapsed, trimmed, cut to
 * `NAME_MAX`. Empty after cleaning gives ''.
 */
export function sanitizeName(raw: string): string {
  let s = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c >= 0x20 && c <= 0x7e) s += raw[i];
  }
  s = s.replace(/ {2,}/g, ' ').trim();
  // The cut may leave a trailing space: trim again so the name never ends in one.
  return s.slice(0, NAME_MAX).trimEnd();
}

/** W3.R12: the game's `"Player%d"` default with a random four-digit number, `Player1000`..`Player9999`. */
export function guestName(random: () => number = Math.random): string {
  const n = 1000 + Math.floor(random() * 9000);
  return `Player${Math.min(9999, Math.max(1000, n))}`;
}

/**
 * W3.R12: the name itself if no other member has it (`taken` holds the lower-cased names), else the lowest free
 * `name(2)`, `name(3)`... with the base cut so the whole stays within `NAME_MAX`.
 */
export function uniqueName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) {
    const suffix = `(${n})`;
    const candidate = name.slice(0, Math.max(0, NAME_MAX - suffix.length)) + suffix;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** The roster: players by join order, spectators in the FIFO queue. */
export class Lobby {
  private readonly maxPlayers: number;
  private readonly maxSpectators: number;
  private readonly teamSize: number;
  private readonly byId = new Map<number, Member>();
  /** Ids of the queued spectators, head first. */
  private queue: number[] = [];
  /** FBA: a human waiting for a CPU on a clan-required side keeps that side. */
  private readonly queuedSides = new Map<number, Team>();
  /** Ids of the watchers (spectators by choice, outside the queue), in join order. */
  private readonly watchers = new Set<number>();
  private counter = 0;

  constructor(opts: { maxPlayers?: number; maxSpectators?: number; teamSize?: number } = {}) {
    this.maxPlayers = opts.maxPlayers ?? MAX_PLAYERS;
    this.maxSpectators = opts.maxSpectators ?? MAX_SPECTATORS;
    this.teamSize = opts.teamSize ?? TEAM_SIZE;
  }

  /**
   * Adds a client; null when full (players and queue) or when `id` is already in the room. Players first while
   * there is room, else the FIFO queue.
   *
   * `forced` (CLAN-JOIN, research 308 §4.2): the side a clan game's rule forces on a playing joiner (`FUN_002bc620`
   * D:L161355-161395) -- taken while it has fewer than `teamSize`; full, no seat (null: the host refuses the join with
   * reason 3, "Too many players", D:L161357-161388), never the other side. A watch takes no side. Not held for a queued
   * joiner: with the players' total full but the forced side short of `teamSize` the joiner is queued and later promoted
   * by the balance (`assignTeam`), not the clan rule -- the older deviation research 308 §9a records (the lobby server's
   * `joinGame` refuses WorldIsFull before the hello, so the bridge rarely reaches it). FBA's authored bot extension
   * reserves CPU replacements per side; a queued clan join in a bot-filled room keeps its required side.
   */
  join(id: number, wantedName: string, random: () => number = Math.random, watch = false, host?: Team, forced?: Team, botReplacementSlots: Partial<Record<Team, number>> = {}): { member: Member; changes: LobbyChange[] } | null {
    if (this.byId.has(id)) return null;
    const counts = this.teamCounts();
    const slots = this.replacementCounts(botReplacementSlots);
    const forcedFull = forced && !watch && counts[forced] >= this.teamSize;
    if (forcedFull && !this.canReplaceBot(forced, slots)) return null;
    // `host`: the game's host takes its side outright (SEALs; TERRORISTS in a clan game of affiliation 1: `FUN_002c5450`
    // D:L166238-166262), not by the joiner's rule.
    const team = watch || forcedFull ? null : counts.seal + counts.terrorist < this.maxPlayers
      ? (forced ?? (host && counts[host] < this.teamSize ? host : assignTeam(counts.seal, counts.terrorist, this.teamSize))) : null;
    // FBA.R4: queued humans replacing bots do not consume the room's watcher allocation.
    const queued = this.queue.length + (team === null && !watch ? 1 : 0);
    const watchers = this.watchers.size + (team === null && watch ? 1 : 0);
    const queueSide = !watch && team === null && slots.seal + slots.terrorist > 0 ? forced : undefined;
    const required = this.queuedSideCounts();
    if (queueSide) required[queueSide]++;
    // A smaller room can be full while the required team has empty places: an opposite-side CPU may yield its
    // overall room place then. Only a full team specifically requires a CPU on that same team.
    const capacity = { seal: this.teamSize - counts.seal + slots.seal, terrorist: this.teamSize - counts.terrorist + slots.terrorist };
    const sideReservations = Math.min(required.seal, capacity.seal) + Math.min(required.terrorist, capacity.terrorist);
    const flexible = queued - required.seal - required.terrorist;
    const reserved = Math.min(slots.seal + slots.terrorist, sideReservations
      + Math.min(flexible, Math.max(0, capacity.seal - required.seal) + Math.max(0, capacity.terrorist - required.terrorist)));
    if (team === null && queued + watchers - reserved > this.maxSpectators) return null;
    const clean = sanitizeName(wantedName);
    const name = uniqueName(clean === '' ? guestName(random) : clean, this.namesExcept(-1));
    const member: Member = { id, name, role: team === null ? 'spectator' : 'player', team, joinedAt: this.counter++ };
    this.byId.set(id, member);
    if (watch) this.watchers.add(id);
    else if (team === null) { this.queue.push(id); if (queueSide) this.queuedSides.set(id, queueSide); }
    return { member: { ...member }, changes: [{ kind: 'joined', id, role: member.role, team }] };
  }

  /** Removes a client; a freed player slot promotes the queue's head (FIFO), placed by the team rule. */
  leave(id: number): LobbyChange[] {
    const m = this.byId.get(id);
    if (!m) return [];
    this.byId.delete(id);
    this.queuedSides.delete(id);
    const changes: LobbyChange[] = [{ kind: 'left', id }];
    if (this.watchers.delete(id)) return changes;
    if (m.role === 'spectator') {
      const at = this.queue.indexOf(id);
      this.queue.splice(at, 1);
      this.pushQueue(changes, at);
      return changes;
    }
    // A forced queue head may have waited while the other side freed places. Drain those places once it can move.
    while (this.queue.length) {
      const headId = this.queue[0]!;
      const counts = this.teamCounts();
      if (counts.seal + counts.terrorist >= this.maxPlayers) break;
      const forced = this.queuedSides.get(headId);
      const required = this.queuedSideCounts();
      const team = forced ? counts[forced] < this.teamSize ? forced : null
        : assignTeam(counts.seal + required.seal, counts.terrorist + required.terrorist, this.teamSize);
      const head = this.byId.get(headId);
      if (team === null || !head) break;
      this.queue.shift();
      this.queuedSides.delete(headId);
      head.role = 'player';
      head.team = team;
      changes.push({ kind: 'promoted', id: headId, team });
    }
    this.pushQueue(changes, 0);
    return changes;
  }

  /**
   * A member's place handed to a new id (S2 round 4, the session takeover: a page's newer connection replaces its
   * older one): the name, the role, the side, the join order and the place in the queue kept, nothing promoted. The
   * changes: the old id `left`, the new one `joined`. Empty when `from` is not in the room or `to` already is.
   */
  rekey(from: number, to: number): LobbyChange[] {
    const m = this.byId.get(from);
    if (!m || this.byId.has(to)) return [];
    this.byId.delete(from);
    m.id = to;
    this.byId.set(to, m);
    const at = this.queue.indexOf(from);
    if (at >= 0) this.queue[at] = to;
    const required = this.queuedSides.get(from);
    if (required) { this.queuedSides.delete(from); this.queuedSides.set(to, required); }
    if (this.watchers.delete(from)) this.watchers.add(to);
    return [{ kind: 'left', id: from }, { kind: 'joined', id: to, role: m.role, team: m.team }];
  }

  /**
   * W3.R13's idle kick with someone waiting: the player goes to the back of the queue and the queue's head takes the
   * slot (by the team rule). Returns the changes, or null when nobody waits (the caller disconnects the idler instead).
   */
  demote(id: number): LobbyChange[] | null {
    const m = this.byId.get(id);
    if (!m || m.role !== 'player' || this.queue.length === 0) return null;
    const changes = this.leave(id);
    const promoted = changes.some((c) => c.kind === 'promoted');
    if (!promoted) {
      // The freed slot could not take the head (a full side): put the player back where it was.
      this.byId.set(id, m);
      return null;
    }
    m.role = 'spectator';
    m.team = null;
    this.byId.set(id, m);
    this.queue.push(id);
    changes.splice(changes.findIndex((c) => c.kind === 'left'), 1);
    changes.push({ kind: 'queue', id, position: this.queue.length });
    return changes;
  }

  /** Renames a member: sanitised, unique against the others; nothing when it is blank or unchanged. */
  rename(id: number, wanted: string, random: () => number = Math.random): LobbyChange[] {
    void random; // a blank name is kept as is (no guest redraw), the argument keeps the shape of `join`
    const m = this.byId.get(id);
    if (!m) return [];
    const clean = sanitizeName(wanted);
    if (clean === '') return [];
    const name = uniqueName(clean, this.namesExcept(id));
    if (name === m.name) return [];
    m.name = name;
    return [{ kind: 'renamed', id, name }];
  }

  /**
   * A takeover's name (the S2 review's round-4 lows): the new hello's name when it is not blank, differs from the
   * member's and no other member holds it -- never a "(2)" suffix, the seat keeps its own name then. Nothing otherwise.
   */
  renameIfFree(id: number, wanted: string): LobbyChange[] {
    const m = this.byId.get(id);
    const clean = sanitizeName(wanted);
    if (!m || clean === '' || clean === m.name || this.namesExcept(id).has(clean.toLowerCase())) return [];
    m.name = clean;
    return [{ kind: 'renamed', id, name: clean }];
  }

  /**
   * SWITCH TEAMS (SVC-07a, a game's room before its launch): a player to the other side when that side has fewer than
   * `teamSize` (`FUN_002c4290` D:L165538-165568, the host's own check: 8). Returns the new side, or null.
   */
  switchTeam(id: number): Team | null {
    const m = this.byId.get(id);
    if (!m || m.role !== 'player' || m.team === null) return null;
    const to: Team = m.team === 'seal' ? 'terrorist' : 'seal';
    if (this.teamCounts()[to] >= this.teamSize) return null;
    m.team = to;
    return to;
  }

  /**
   * CLAN-SWAP (research 309 §5.1): "Alternate teams"' swap after a full game -- every player to the other side together
   * (the host's flag `DAT_004412d8` flipped, `FUN_002c0040` D:L162973-162982: the team words stay and what flips is which
   * one is the SEALs', `FUN_002c3330` D:L164814-), so the counts are exchanged and no side limit is tested; a queued
   * spectator and a watcher keep their places (word bit 0x10000). Returns each player's new side, in join order.
   */
  swapSides(): { id: number; team: Team }[] {
    const out: { id: number; team: Team }[] = [];
    for (const m of [...this.byId.values()].sort((a, b) => a.joinedAt - b.joinedAt)) {
      if (m.role !== 'player' || m.team === null) continue;
      m.team = m.team === 'seal' ? 'terrorist' : 'seal';
      out.push({ id: m.id, team: m.team });
    }
    for (const [id, side] of this.queuedSides) this.queuedSides.set(id, side === 'seal' ? 'terrorist' : 'seal');
    return out;
  }

  /** A member by id (a copy). */
  member(id: number): Member | undefined {
    const m = this.byId.get(id);
    return m ? { ...m } : undefined;
  }

  /** The players, in join order. */
  players(): Member[] {
    return [...this.byId.values()].filter((m) => m.role === 'player').sort((a, b) => a.joinedAt - b.joinedAt).map((m) => ({ ...m }));
  }

  /** The spectators: the queue in its order (head first), then the watchers in join order. */
  spectators(): Member[] {
    const out: Member[] = [];
    for (const id of [...this.queue, ...this.watchers]) {
      const m = this.byId.get(id);
      if (m) out.push({ ...m });
    }
    return out;
  }

  /** Whether a member is a watcher (a spectator by choice, never queued). */
  watching(id: number): boolean {
    return this.watchers.has(id);
  }

  /** A spectator's 1-based place in the queue; 0 when not queued (a player, or a watcher). */
  queuePosition(id: number): number {
    return this.queue.indexOf(id) + 1;
  }

  /** FBA: the side required by a queued human replacing a clan CPU; ordinary queued joiners have no fixed side. */
  queuedSide(id: number): Team | undefined { return this.queuedSides.get(id); }

  /** FBA: only CPUs on this side can make a full clan side admit another human. */
  canReplaceBot(side: Team, slots: Partial<Record<Team, number>>): boolean {
    const counts = this.replacementCounts(slots);
    return counts.seal + counts.terrorist > 0
      && this.teamSize - this.teamCounts()[side] + counts[side] > this.queuedSideCounts()[side];
  }

  /** Whether a side holds `teamSize` players: a join forced onto it is refused (CLAN-JOIN, `join`'s `forced`). */
  sideFull(team: Team): boolean {
    return this.teamCounts()[team] >= this.teamSize;
  }

  /** Players on each team. */
  teamCounts(): { seal: number; terrorist: number } {
    let seal = 0;
    let terrorist = 0;
    for (const m of this.byId.values()) {
      if (m.team === 'seal') seal++;
      else if (m.team === 'terrorist') terrorist++;
    }
    return { seal, terrorist };
  }

  /** The lower-cased names of every member but `except`. */
  private namesExcept(except: number): Set<string> {
    const s = new Set<string>();
    for (const m of this.byId.values()) if (m.id !== except) s.add(m.name.toLowerCase());
    return s;
  }

  private queuedSideCounts(): Record<Team, number> {
    const counts = { seal: 0, terrorist: 0 };
    for (const side of this.queuedSides.values()) counts[side]++;
    return counts;
  }

  private replacementCounts(raw: Partial<Record<Team, number>>): Record<Team, number> {
    const count = (side: Team) => Number.isFinite(raw[side]) ? Math.max(0, Math.min(this.teamSize, Math.floor(raw[side]!))) : 0;
    return { seal: count('seal'), terrorist: count('terrorist') };
  }

  /** A `queue` change for every spectator from index `from` on. */
  private pushQueue(changes: LobbyChange[], from: number): void {
    for (let i = from; i < this.queue.length; i++) {
      const id = this.queue[i];
      if (id !== undefined) changes.push({ kind: 'queue', id, position: i + 1 });
    }
  }
}
