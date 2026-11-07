import type { StreamPlay } from './audio';
import type { DecidedWire, EscortLine, Team } from './net/protocol';
import type { BombCueKind, BombStep, CueStep, HostageCueKind, RoundCues, TeamCode } from './roundCues';

/**
 * The round's streamed audio (socomlegacy/docs/research/124 §6; an interim slice of PLAT-22): the team intro, the
 * spoken result and the win music, played as the map's own `objectives` script plays them (`./roundCues`, read off the
 * disc). Ported from Chris's browser-beta-v5 (`packages/viewer/src/roundAudio.ts`, chris/browser-beta-integration
 * d578f347): his once-a-round result, his "no cue for a draw", his bounded retry on a locked page; his MP2-only music
 * table is replaced by the map's script, and his `roundOver` trigger by the script's own two (below).
 *
 * The events, as the room sends them (`packages/match/src/room.ts`):
 * - `roundStart`: a new round -- the slot's music stops (the round is a new mission load) and the intro is scheduled
 *   from `start` (`start2` in a respawn room) by the local `player_team`;
 * - `eliminated` (classic): the branch of `start`'s loop for that winner and the local team -- the line both sides hear
 *   and the winner's music, the script's WAIT between;
 * - `timeExpired` (respawn): `mission_timer2`'s cue, the SEALs' win music whoever leads, and no line;
 * - `roundOver`: closes the round and plays nothing -- classic's time-out (`abort`) and the respawn room's result
 *   (`success2`) have no sound on the disc; the elimination's cues came the map's hold before (`eliminatedHoldS`);
 * - `reset` (a close, an abandoned round) and `setCues` (a map change): what is pending goes, the slot stops. The first
 *   cues of a map whose round has already begun (its sound data came after the room's `roundStart`) give that round its
 *   intro, on the round's own clock: a step whose moment is still to come plays at it, one whose moment has passed is
 *   not played late (`LATE_STREAM_DATA_READING`).
 *
 * - `bomb` (XR-06, research 214 s3; DEMOLITION): the bomb's cue -- `pickup`, `drop`, `planted`, `defused`, `detonated` --
 *   by the bomb's side and the local team, its streams played and its lines handed to `post` (the HUD's message window)
 *   at the script's waits. The defuse and the detonation decide the round as an elimination does; a plant in a decided
 *   round plays nothing, but in MP61's and MP62's time-out hold (LATER 150: its cue, and a defuse its own branch).
 *
 * - `hostage` (HX-5, research 239 s6; EXTRACTION): a hostage one-shot's cue -- Lead, Rescue, a kill by either side --
 *   its stream at once and its lines handed to `post` at the script's waits, whether or not the round is decided (the
 *   one-shots are sequences of their own); `decidedBy`: the branch of `start` the room's `eliminated.reason` names (the
 *   rescue win, the hostage-kill win), its waits, lines and streams, deciding the round as an elimination does.
 *
 * Once a round: the first of `eliminated` / `timeExpired` / `roundOver` / a bomb's result decides it, and the rest are
 * ignored until the next `roundStart`. The intro too sounds at most once a round: once it has played (or been let go) no `setCues` brings it
 * back. The clock is the caller's, in seconds; `frame` runs what is due.
 */

/** The players the cues go to (`./roundAudioHost` binds them to `GameAudio`): whether the play sounded, or why not. */
export interface RoundAudioOut {
  /** A stream in the one-voice music slot (SOUND flag 0x800: `FUN_00348dc0`, research 81 §6). */
  music(name: string): StreamPlay;
  /** A stream on a voice of its own (the result line, a plain 0x80 play). */
  voice(name: string): StreamPlay;
  stopMusic(): void;
}

/**
 * PLACEHOLDER (a browser adaptation, not the game's): a cue the page could not play -- its audio not yet unlocked by a
 * gesture (the autoplay rules) -- is tried again every `every` seconds until `within` seconds after it was due, then
 * dropped; a cue more than `within` late (cues that came after the round's start) is not played. Only the lock is
 * retried: an unknown name, the mute or an output without the slot would refuse again. The console has no lock. Chris's values (browser-beta-v5 `roundAudio.ts`: 250 ms, 5 s), kept for the
 * music too, which his dropped at once.
 */
export const UNLOCK_RETRY_PLACEHOLDER = { every: 0.25, within: 5 } as const;

/**
 * READING (the page's own case, research 124 §12): the sound data reaches the page after the room's `roundStart` (the
 * VAGSTORE reads and the decode in the worker). The console has no such case -- the mission's sound blocks are in
 * before its script runs (`FUN_00344450` at the map's load, research 124 §3) and a stream is read from the disc as it
 * plays -- so no note establishes what a late cue would do. The conservative choice: a cue whose moment (the round's
 * start plus the script's WAIT) has passed when the data comes is not played; one still to come plays at its moment; a
 * result decided before the data is not played at all. What would settle a tolerance: the console's own start latency
 * of the intro after the round's start (a PS2X audio dump or a capture of the round's start, PLAT-36).
 */
export const LATE_STREAM_DATA_READING = 'not-late' as const;

const code = (team: Team | null): TeamCode => (team === 'seal' ? 0 : team === 'terrorist' ? 8 : 16);

interface Due {
  at: number; until: number; sound: string; slot: boolean; intro: boolean;
  /** XR-06: a line to post instead of a stream (the bomb's `MESSAGE`s), and where. */
  line?: { text: string; scale: number; post: (text: string, scale: number) => void };
  /** LATER 131: an ESCORT line's step -- RescueN's and EndRescueN's kept through a decision, VIPcheck's on the time-out alone. */
  escort?: 'kept' | 'vipcheck';
}

/**
 * The room's `eliminated.reason` a map's `decided` branch answers; LATER 125: `elimination`, ESCORT's SEAL elimination;
 * LATER 130: `terroristElimination`, BREACH's Terrorist elimination.
 */
export type DecidedReason = 'rescue' | 'hostageKills' | 'elimination' | 'terroristElimination' | 'timeout';   // LATER 127 / 138: 'timeout'

/**
 * LATER 155: the page's reason for the room's word on a decided round (`DecidedWire`, a welcome's `decided`), as the page
 * maps the room's events: a rescue's, the hostage kills' and a time-out's their own; an elimination by its winner -- the
 * SEALs' `elimination` (ESCORT's branch), the Terrorists' `terroristElimination` (BREACH's), as `./netPage`'s `eliminated`
 * handler names them; the bomb's result 'other' (`decide`'s, as `bomb` decides it).
 */
export function decidedReason(d: DecidedWire): DecidedReason | 'other' {
  if (d.reason === 'rescue' || d.reason === 'hostageKills' || d.reason === 'timeout') return d.reason;
  if (d.reason === 'bomb') return 'other';
  return d.winner === 'seal' ? 'elimination' : 'terroristElimination';
}

/**
 * FORGE_ESCORT_LINES_ADAPTATION (the owner, 2026-11-06; a browser adaptation, FG.R2): ESCORT's in-round lines are read
 * off the map's own script at run time (`./roundCues` `ESCORT_IN_ROUND_LINES_READING`), by the VIP's `<name>_valve_alive`
 * -- so a Forge escort (a map with no escort script, or VIPs placed under names its script does not test) posts none and
 * staging reads as nothing happening. There, RescueN's and EndRescueN's words are posted as the reading quotes them:
 * "A VIP IS IN THE EXTRACTION ZONE" at 0.7 (MP52 @3836); "A VIP HAS BEEN EXTRACTED" at `ESCORT_EXTRACTED_SCALE_PLACEHOLDER`
 * (its scale not quoted). No stream or music: those are each map's own. A disc escort map's VIPs keep their own lines.
 */
export const ESCORT_EXTRACTED_SCALE_PLACEHOLDER = 0.7;
export const FORGE_ESCORT_LINES_ADAPTATION = {
  staged: { text: 'A VIP IS IN THE EXTRACTION ZONE', scale: 0.7 },
  extracted: { text: 'A VIP HAS BEEN EXTRACTED', scale: ESCORT_EXTRACTED_SCALE_PLACEHOLDER },
} as const;

/**
 * ESCORT_KILL_COPY_FROM_JOIN_PLACEHOLDER (LATER 125, the review's F1): ESCORT's N-th kill one-shot of a side fires at
 * that side's count `>= N` (`mp_hostages_by_seals` / `_by_turds`: MP52 HostKill2 @2900), so each copy plays its own
 * music. The page counts the kills it is told from the round's start; a page that joined mid-round, which is not told
 * who killed the VIPs already dead (the welcome carries `alive`, not the killer's side), counts from its join and plays
 * a lower copy. And a VIP killed by a player who has since left counts nothing on the page (`netPage`'s kill handler
 * finds no side for a departed killer), where the original's valve still counts it, so that side's later kills play one
 * copy low (the narrow re-review's N2). Settled by the welcome carrying the two counts and the room telling the killer's
 * side with a hostage `kill`.
 */
export const ESCORT_KILL_COPY_FROM_JOIN_PLACEHOLDER = 'counted from the round start the page saw';

export class RoundAudio {
  /**
   * FORGE_ESCORT_LINES_ADAPTATION's switch: on only for a Forge layout's match (`./matchMount`, a map the Forge composed),
   * so a disc map whose script names no line for a VIP posts nothing, as the original does.
   */
  forgeEscortLines = false;
  private cues: RoundCues | null = null;
  private queue: Due[] = [];
  private decided = false;
  /** LATER 125 (F1): each kill one-shot's count this round -- the copy it plays (`HostageCue.copies`). */
  private kills = new Map<HostageCueKind, number>();
  /**
   * LATER 125 (F2): the path that decided the round and the local side, for whether it stopped the kill one-shots
   * (`DecidedCues.stopsKills`; null: none named). LATER 159: read when a one-shot fires (`killsStopped`), as `bomb` reads
   * `timeoutPlantLive` -- a page marked decided at its welcome (`markDecided`) usually has no cues yet.
   */
  private killsBy: { path: DecidedReason; team: Team | null } | null = null;
  /** LATER 150: what decided the round -- `decidedBy`'s reason, else 'other' (an elimination, a bomb result, the round's end). */
  private reason: DecidedReason | 'other' | null = null;
  /**
   * The round in play: the local side, the room's kind, its start and whether its intro has sounded -- taken by the
   * output or let go (null: none, or closed by `reset`). The record is the round's own: cues that go and come back
   * (`setCues(null)` then cues) never give a round a second intro, whatever the page's wiring.
   */
  private round: { team: Team | null; respawn: boolean; at: number; introDone: boolean } | null = null;

  constructor(private readonly out: RoundAudioOut, private readonly retry: { every: number; within: number } = UNLOCK_RETRY_PLACEHOLDER) {}

  /**
   * The map's cues (null: none to play); a map change -- the slot stops, nothing pending survives. Cues where there
   * were none, in a round begun, not yet decided and whose intro has not sounded, schedule that intro from the round's
   * start (`now` given); a step whose moment has passed by `now` is let go (`LATE_STREAM_DATA_READING`).
   */
  setCues(cues: RoundCues | null, now?: number): void {
    const first = this.cues === null;
    this.cues = cues;
    this.queue = [];
    this.out.stopMusic();
    const r = this.round;
    if (first && cues && r && !this.decided && !r.introDone && now !== undefined) {
      this.schedule(this.intro(cues, r.team, r.respawn), r.at, true);
      this.queue = this.queue.filter((d) => { if (d.at >= now) return true; this.introOver(d); return false; });
      this.frame(now);
    }
  }

  /** A round begins: the last round's music stops and this one's intro is scheduled for the local team (null: a spectator). */
  roundStart(team: Team | null, respawn: boolean, now: number): void {
    this.queue = [];
    this.decided = false; this.reason = null;
    this.kills.clear(); this.killsBy = null;
    this.round = { team, respawn, at: now, introDone: false };
    this.out.stopMusic();
    const c = this.cues;
    if (c) this.schedule(this.intro(c, team, respawn), now, true);
    this.frame(now);
  }

  /** Classic: a side has no living player -- the result, as the local team's branch of the script plays it. */
  eliminated(winner: Team, team: Team | null, now: number): void {
    if (!this.decide()) return;
    if (winner === 'terrorist') this.killsBy = { path: 'terroristElimination', team };   // LATER 125 (F2)
    this.schedule(this.cues?.elimination[winner][code(team)], now);
    this.frame(now);
  }

  /** Respawn: the clock reached 00:00 -- `mission_timer2`'s cue. */
  timeExpired(now: number): void {
    if (!this.decide()) return;
    this.schedule(this.cues?.timeExpired, now);
    this.frame(now);
  }

  /**
   * XR-06 (research 214 s3): the bomb's cue `kind` for the bomb's side `owner` (the carrier's, the planting side's, the
   * defuser's) and the local team (null: a spectator), its lines to `post` as they come. A result (`defused`, `detonated`)
   * decides the round. In a round already decided (LATER 145, the bomb live through its hold): a pickup's and a drop's
   * cues play (`bomb_pickup` / `bomb_drop` are never stopped, the nine bomb maps), a plant's does not (`switch_timer`,
   * stopped by `start`'s every elimination branch on all nine, and by MP73's `breach_success`). LATER 150: in a round the
   * BREACH time-out decided where its path leaves `switch_timer` running (`DecidedCues.timeoutPlantLive`: MP61, MP62) a
   * plant plays its cue, and a defuse the `defuse` branch's own steps, the round already decided.
   */
  bomb(kind: BombCueKind, owner: Team, team: Team | null, now: number, post?: (text: string, scale: number) => void): void {
    const live = this.decided && this.reason === 'timeout' ? this.cues?.decided?.timeoutPlantLive : undefined;   // LATER 150
    if (live && kind === 'defused') {
      this.schedule(live.defused[owner][code(team)], now, false, post);
      this.frame(now);
      return;
    }
    if (kind === 'defused' || kind === 'detonated') { if (!this.decide()) return; } else if (this.decided && kind === 'planted' && !live) return;
    this.schedule(this.cues?.bomb?.[kind][owner][code(team)], now, false, post);
    this.frame(now);
  }

  /**
   * HX-5 (research 239 s6): a hostage one-shot's cue (`RoundCues.hostages`), its stream now and its lines to `post` at the
   * script's waits; played in a decided round too (the one-shots run beside `start`).
   */
  hostage(kind: HostageCueKind, now: number, post?: (text: string, scale: number) => void): void {
    const c = this.cues?.hostages?.[kind];
    if (!c) return;
    // LATER 125: a cue with copies (ESCORT's kill one-shots) plays the copy its count this round names (F1), and none
    // once the deciding path stopped them (F2); EXTRACTION's play `sound` then `lines` in any round, as before.
    let steps: BombStep[];
    if (c.copies && c.copies.length > 0) {
      if (this.decided && this.killsStopped()) return;
      const n = (this.kills.get(kind) ?? 0) + 1;
      this.kills.set(kind, n);
      steps = [...c.copies[Math.min(n, c.copies.length) - 1]!];
    } else {
      steps = c.sound ? [{ sound: c.sound, slot: false }] : [];
      for (const l of c.lines) steps.push({ wait: l.waitBefore }, { message: l.text, locId: l.locId, scale: l.scale });
    }
    this.schedule(steps, now, false, post);
    this.frame(now);
  }

  /**
   * HX-5: the round decided by the room's `eliminated.reason` -- `start`'s rescue-win or hostage-kill branch for the local
   * team (`RoundCues.decided`), its lines to `post`. Whether the map's cues hold that branch (false: the page posts the
   * elimination's lines instead).
   */
  decidedBy(reason: DecidedReason, team: Team | null, now: number, post?: (text: string, scale: number) => void): boolean {
    const steps = this.cues?.decided?.[reason]?.[code(team)];   // LATER 125: `elimination` is ESCORT's alone
    if (!steps) return false;
    if (!this.decide(reason)) return true;
    this.reason = reason;                                                                    // LATER 150
    this.killsBy = { path: reason, team };                                                // LATER 125 (F2)
    this.schedule(steps, now, false, post);
    this.frame(now);
    return true;
  }

  /**
   * LATER 155: a page that joins or reconnects in a decided hold (the welcome's `decided`, through `decidedReason`): the
   * round marked decided by `reason`, nothing scheduled -- its lines and music sounded before this page was there (a
   * joiner's welcome plays none) -- so the hold's rules follow as on a page that saw the decision: a plant's and a defuse's
   * (`bomb`: after MP61's and MP62's time-out the plant's cue and the defuse branch's own steps, else nothing; never a
   * second result) and the kill one-shots' (`killsStopped`, read when one fires: LATER 159). Already decided: nothing.
   */
  markDecided(reason: DecidedReason | 'other', team: Team | null): void {
    if (!this.decide(reason)) return;
    this.reason = reason;
    this.killsBy = reason !== 'other' ? { path: reason, team } : null;
  }

  /**
   * LATER 131 (`ESCORT_IN_ROUND_LINES_READING`): the room's `escort` -- RescueN's or EndRescueN's steps for the VIP it names,
   * or VIPcheck's for the local team, its lines to `post`; in any round, decided or not (the room tells VIPcheck's only
   * while it runs). A VIP or a team the cues lack: nothing.
   */
  escort(kind: EscortLine, vip: string | null, team: Team | null, now: number, post?: (text: string, scale: number) => void): void {
    const e = this.cues?.escort;
    const by = !e || kind === 'aborted' ? null : kind === 'staged' ? e.staged : e.extracted;
    const steps = kind === 'aborted' ? e?.aborted[code(team)] : by && vip !== null && Object.prototype.hasOwnProperty.call(by, vip) ? by[vip] : undefined;
    if (!steps) {
      // A Forge escort (no script of its own, or VIPs it does not name): the script's words posted (FORGE_ESCORT_LINES_ADAPTATION).
      if (this.forgeEscortLines && kind !== 'aborted' && post) post(FORGE_ESCORT_LINES_ADAPTATION[kind].text, FORGE_ESCORT_LINES_ADAPTATION[kind].scale);
      return;
    }
    this.schedule(steps, now, false, post, kind === 'aborted' ? 'vipcheck' : 'kept');
    this.frame(now);
  }

  /** The round's result screens: the round is over; nothing of its own plays (`abort`, `success2`). */
  roundOver(now: number): void {
    if (this.decide()) this.queue = [];
    this.frame(now);
  }

  /** A close, an abandoned round: nothing pending, the slot stopped. */
  reset(): void {
    this.queue = [];
    this.decided = false; this.reason = null;
    this.kills.clear(); this.killsBy = null;
    this.round = null;
    this.out.stopMusic();
  }

  /** Runs what is due, in order; a play the lock refused is tried again (`UNLOCK_RETRY_PLACEHOLDER`), a stale one dropped. */
  frame(now: number): void {
    const keep: Due[] = [];
    for (const d of this.queue) {
      if (d.at > now) { keep.push(d); continue; }
      if (now > d.until) { this.introOver(d); continue; }
      if (d.line) { d.line.post(d.line.text, d.line.scale); continue; }
      const got = d.slot ? this.out.music(d.sound) : this.out.voice(d.sound);
      if (got === 'locked' && now + this.retry.every <= d.until) keep.push({ ...d, at: now + this.retry.every });
      else this.introOver(d);
    }
    this.queue = keep;
  }

  /** `start`'s cue for the local team, `start2`'s in a respawn room (the classic one where a map has no start2). */
  private intro(c: RoundCues, team: Team | null, respawn: boolean): readonly CueStep[] | undefined {
    return (respawn ? c.introRespawn ?? c.intro : c.intro)[code(team)];
  }

  /**
   * LATER 125 (F2) / LATER 159: whether the path that decided the round stopped the kill one-shots, on the cues as they are
   * now (`killsBy`): the map's `stopsKills` for that path and side.
   */
  private killsStopped(): boolean {
    const by = this.killsBy;
    return by !== null && this.cues?.decided?.stopsKills?.[by.path]?.[code(by.team)] === true;
  }

  /**
   * The first decision of a round clears what is pending (an intro not yet heard) and is the only one. LATER 131: ESCORT's
   * RescueN and EndRescueN run beside `start` (no branch stops them), and VIPcheck past the time-out alone (neither
   * `mission_timer` nor `escort_success` stops it; every branch of `start` does): their pending steps stay.
   */
  private decide(reason: DecidedReason | 'other' = 'other'): boolean {
    if (this.decided) return false;
    this.decided = true; this.reason = 'other';
    this.queue = this.queue.filter((d) => d.escort === 'kept' || (d.escort === 'vipcheck' && reason === 'timeout'));
    return true;
  }

  /** An intro step taken by the output, refused for good or let go: the round's intro is over (it is not scheduled again). */
  private introOver(d: Due): void {
    if (d.intro && this.round) this.round.introDone = true;
  }

  private schedule(steps: readonly BombStep[] | undefined, now: number, intro = false, post?: (text: string, scale: number) => void, escort?: Due['escort']): void {
    let t = now;
    const kept = escort ? { escort } : {};                                          // LATER 131
    for (const s of steps ?? []) {
      if ('wait' in s) t += s.wait;
      else if ('message' in s) {
        // A line its map's strings did not fill, or no window to post it to: nothing.
        if (s.message !== null && post) this.queue.push({ at: t, until: t + this.retry.within, sound: '', slot: false, intro, line: { text: s.message, scale: s.scale, post }, ...kept });
      } else this.queue.push({ at: t, until: t + this.retry.within, sound: s.sound, slot: s.slot, intro, ...kept });
    }
  }
}
