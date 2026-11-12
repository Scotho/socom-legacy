import type { BodyState, Command, CraneWire, DoorWire, EnvWire, HostageWire, ServerEvent } from '../../../viewer/src/sim';
import { ReplayWriter, type ReplayHeader, type ReplayPlayer, type ReplayRefusal } from './format';

/**
 * The Room recorder (web sprint 33, PT-02 and PT-02b; spec 4.1; research 240 §4).
 *
 * REPLAY_ADAPTATION (`./format`): a playtest and replay instrument with no original in SOCOM II. The Room calls its
 * `RoomOptions.recorder` at five sites and nowhere else -- `snapshots()` (the omniscient snapshot: every body, no
 * recipient's own left out), `broadcast()` (each broadcast `ServerEvent`), `broadcastChanges()` (the lobby's members
 * after a change), `aim()` at `p.cone.tick(cmd, ...)`'s line (each command the room runs, W33.R1), and RE-2's
 * `hostages?` in `snapshots()` just before the snapshot (an EXTRACTION room's roster); SIMDROP-INSTR adds `refusal?` at
 * `fireAt`'s `fire: cone: *` refusal (format 3, never broadcast) -- and the room's
 * bytes to its connections are the same with it on (PT.R2). A per-recipient `send` (welcome, queue, promoted, hurt,
 * combat...) is not recorded: the replay is the room's broadcast view plus the omniscient snapshot.
 *
 * RE-2 (web sprint 38; W38.R2; research 249 §3): `hostages?` -- EXTRACTION's roster as the room's welcome carries it
 * (`ExtractionAuthority.wire()`, the welcome's `hostages`), handed beside each snapshot of a room with hostages (the
 * room's one line in `Room.snapshots`; no recorder, or none with `hostages`: `wire()` is not called). No other call reaches it: a
 * hostage's name and model ride only the welcome, a per-recipient `send` (research 244 §7.2). A recorder writes it at its
 * segment's open and again only when the roster changes (`FileRecorder.hostages`).
 */
export interface RoomRecorder {
  snapshot(tick: number, bodies: readonly BodyState[], doors: DoorWire[] | undefined, env: EnvWire, cranes?: CraneWire[]): void;
  event(tick: number, ev: ServerEvent): void;
  players(tick: number, players: ReplayPlayer[]): void;
  /** The commands the room runs (a playtest's, for investigators; PT-02b, W33.R1); absent, none are recorded. */
  command?(tick: number, id: number, command: Command): void;
  /** RE-2 (W38.R2): EXTRACTION's roster as the welcome carries it, at each snapshot of a room with hostages; absent, none recorded. */
  hostages?(tick: number, hostages: readonly HostageWire[]): void;
  /**
   * LATER 349: the room's match reset -- a held game's return to its lobby, or the next match's start (`startRound(true)`)
   * -- the end of a finished match's GAME COMPLETE hold. A recorder that splits by match (`RoomRecording`) closes the
   * finished match's file here, not at its `roundOver`, so the file keeps the hold and its final scoreboard. Not called
   * by an abandon: its `abandoned` closes the file at once (its scoreboard already zeroed). Absent: none.
   */
  matchReset?(tick: number): void;
  /**
   * SIMDROP-INSTR (format 3; an instrument, no original): a round the room refused `fire: cone: *`, with the claim and the
   * room's eye locus (`ReplayRefusal`) -- a sixth site, `Room.fireAt`'s cone refusal; replay-only, never broadcast. Absent: none.
   */
  refusal?(tick: number, refusal: ReplayRefusal): void;
  /**
   * PR #753's third pass P2-a (an adaptation, the match record's): the id of the server's replay file now -- told at the
   * file's open (`ReplayFiles.open`'s `onId`) and null at its close -- to an observer beside the file (`MatchRecorder`),
   * never by the room. Absent: none told.
   */
  replayId?(id: string | null): void;
  close(reason: string): void;
}

/**
 * A recorder that writes `.s2r` records through a `ReplayWriter`, the header first: the bytes go to `sink` every
 * `flushEvery` snapshots (30: about a second at `SNAPSHOT_HZ`) and at `close` (an `end` record, then the flush). After
 * `close` it records nothing more.
 *
 * Containment (PT.R2 whatever the recorder meets): an error in a record's encoding or in the sink never reaches the
 * room. The first one stops the recorder (`failed`; every method returns at once after it) and is reported once
 * through `onError`, if given -- nothing else, no console noise in the room. A throw out of `event()` would otherwise
 * keep a broadcast from every connection, and one out of `step()` would end the server's room (`stepRoom`).
 */
export class FileRecorder implements RoomRecorder {
  private readonly writer: ReplayWriter;
  private snaps = 0;
  private last = 0;
  private closed = false;
  private broken = false;
  /** RE-2: the roster last written (each hostage's id, name and model), or null before the first. */
  private roster: string | null = null;

  constructor(
    header: ReplayHeader, sink: (bytes: Uint8Array) => void, private readonly flushEvery = 30 /* snapshots: ~1 s */,
    private readonly onError?: (err: unknown) => void,
  ) {
    this.writer = new ReplayWriter(sink);
    this.guard(() => this.writer.write({ kind: 'header', header }));
  }

  /** Whether a failure stopped the recorder (the first error, reported once through `onError`). */
  get failed(): boolean {
    return this.broken;
  }

  snapshot(tick: number, bodies: readonly BodyState[], doors: DoorWire[] | undefined, env: EnvWire, cranes?: CraneWire[]): void {
    this.guard(() => {
      this.last = tick;
      this.writer.write({ kind: 'snap', tick, bodies: [...bodies], ...(doors ? { doors } : {}), ...(cranes?.length ? { cranes } : {}), env });
      if (++this.snaps % this.flushEvery === 0) this.writer.flush();
    });
  }

  event(tick: number, ev: ServerEvent): void {
    this.guard(() => {
      this.last = tick;
      this.writer.write({ kind: 'event', tick, event: ev });
    });
  }

  players(tick: number, players: ReplayPlayer[]): void {
    this.guard(() => {
      this.last = tick;
      this.writer.write({ kind: 'players', tick, players });
    });
  }

  command(tick: number, id: number, command: Command): void {
    this.guard(() => {
      this.last = tick;
      this.writer.write({ kind: 'cmd', tick, id, command });
    });
  }

  /**
   * RE-2 (W38.R2): a `hostages` record at the first call (the segment's open: this file's) and whenever the roster -- each
   * hostage's id, name and model, in order -- differs from the one written; else nothing. A hostage's state rides the
   * recorded `hostageState` and `kill` events and its place the snapshot's body, so neither writes the record again.
   */
  hostages(tick: number, hostages: readonly HostageWire[]): void {
    this.guard(() => {
      const roster = JSON.stringify(hostages.map((h) => [h.id, h.name, h.character]));
      if (roster === this.roster) return;
      this.last = tick;
      this.writer.write({ kind: 'hostages', tick, hostages: hostages.map((h) => ({ ...h, at: [h.at[0], h.at[1], h.at[2]] })) });
      this.roster = roster;
    });
  }

  /** SIMDROP-INSTR: a `refusal` record (format 3). */
  refusal(tick: number, refusal: ReplayRefusal): void {
    this.guard(() => {
      this.last = tick;
      this.writer.write({ kind: 'refusal', tick, ...refusal });
    });
  }

  /** A playtest mark (PT-03's and the session service's): its observation id and its wall clock. */
  mark(tick: number, observation: string, at: string): void {
    this.guard(() => {
      this.last = tick;
      this.writer.write({ kind: 'mark', tick, observation, at });
    });
  }

  /** The `end` record at the last tick recorded, then the flush; once. */
  close(reason: string): void {
    this.guard(() => {
      this.closed = true;
      this.writer.write({ kind: 'end', tick: this.last, reason });
      this.writer.flush();
    });
  }

  /**
   * A failure met after the sink returned -- an asynchronous sink's write (`ReplayFiles`' queued append) -- stops the
   * recorder as a thrown one does: the first error is reported once through `onError`, a later one is not. Also after
   * `close`: the close's own flush may be the write that fails, and whoever finishes the file reads `failed` after it.
   */
  fail(err: unknown): void {
    if (this.broken) return;
    this.broken = true;
    try { this.onError?.(err); } catch { /* the report's own failure stays here too */ }
  }

  /** Runs one record's work unless closed or failed; the first error stops the recorder and is reported once. */
  private guard(work: () => void): void {
    if (this.closed || this.broken) return;
    try {
      work();
    } catch (err) {
      this.fail(err);
    }
  }
}
