import { PlayoutClock } from './playoutClock';
import { INTERP_DELAY_MS, TICK_HZ } from './protocol';
import { shortTurn, wrapYaw } from '../yaw';

/**
 * PV-4a (the player's-view lane; product track, a browser adaptation with no original -- the port's own netcode, LATER
 * 735 "fix B1", research 402 s3-s4): the command clock of ONE watched body, its owner's. A pure module: it takes every
 * time as an argument (no `performance.now()`), touches no DOM, network or three.js, and is not wired yet (the seam is
 * `NetClient.receive`/`bodies()` and `ReplayClient`'s seek, a later task).
 *
 * Why. The room runs a seat's commands 0, 1 or 2 a 60 Hz tick on its credit (after a stall about 60 in one step) and
 * sends a snapshot every second tick, so successive snapshots show a body after 1x-3x a tick's worth of its owner's
 * commands; drawn on the room's tick clock (`NetClient.viewTick`, `./playoutClock`) an evenly moving owner is drawn
 * unevenly (INV-SPECTATE, `agent-mail/evidence/spectate-smoothness/`). From protocol 16 each body carries the low four
 * bits of its seat's last run command number (`sim.seq & 15`, research 402 s3), and this clock draws the body on that
 * number: the number unwrapped here, then played out by a second `PlayoutClock` fed the number in place of the tick, with
 * the same `INTERP_DELAY_MS` behind it as `viewTick`. The owner's commands are one a 60 Hz frame of his page, so the
 * number advances at the tick's rate on average and the playout clock's rate, slew and snap rules carry over unchanged.
 *
 * - **Unwrapping.** The first sample is numbered `COMMAND_CLOCK_BASE_ADAPTATION + nibble`; each later one advances by
 *   `d = (nibble - last) & 15`. An advance of 0 is a stall (no command of the seat ran): the later sample replaces the
 *   earlier at that number, "the body after command k" being the newest state heard with that number.
 * - **A burst of 16 or more.** Three things make one: an uplink stall (the owner's commands stop reaching the room --
 *   one TCP retransmit, 200 ms or more -- and then run in one step on the credit the stall saved); a page hitch (the
 *   owner's page stalls for one long frame); a room hitch (the room's loop drops ticks past its catch-up steps but
 *   credits the wall time, `room.ts` `creditStep`, so more commands than ticks can run). Through the first two the
 *   room's ticks -- and its snapshots, every 2 ticks -- run on, so neither the gap rule nor the playout clock (whose
 *   starvation guard pins it on the newest: it holds, it does not snap) sees anything but a stall and a jump, and the low
 *   four bits read 16 too few for each 16 (20 as 4). The two differ in what the jump holds. An uplink stall runs about
 *   the T ticks it lasted (the credit it saved). A page hitch runs FEWER: both pages that send commands -- the test
 *   room's frame (`main.ts`, the step `Math.min(frameTime.frame(...), 0.1)`) and the match's (`matchMount.ts`, the same
 *   cap) -- step the walk at most 0.1 s a frame, so a frame of H ms runs at most 6 walk ticks, one command each, and the
 *   rest of H is dropped (the walk's own `mover.ts` `MAX_TICKS`, 30, is never reached under that cap): in the second
 *   rendered run (research 402 s2) no owner frame ran more than 6 commands -- of his 56 frames over 100.5 ms, 26 ran
 *   exactly 6 and the rest fewer -- and a 251 ms hitch ran 6 where the room ran about 15 ticks. So a changed nibble (raw
 *   d > 0) after T room ticks without an advance is read by T:
 *   - T at most `COMMAND_CLOCK_STALL_TICKS_ADAPTATION` (30): no more commands ran than the ticks that passed plus
 *     `COMMAND_CLOCK_BURST_SLACK_ADAPTATION` (4; its doc derives it), and up to that bound as many as the ticks: d is the
 *     candidate `raw + 16 j` (j >= 0) nearest to T that does not exceed T + 4, and `raw` when none does. In steady play
 *     T is 2-4 and d 0-6, so the correction is 0 (`test/commandClock.test.ts` holds it over long ordinary runs of every
 *     room model);
 *   - T over 30: the count is unknowable -- a capped page's hitch runs at most 6 commands however long it lasts, a
 *     hidden or throttled tab sends one command a wake, an uplink stall past the credit drains at 2 a tick after
 *     `CREDIT_MAX` + 1 (`room.ts` `CREDIT_MAX`) -- so the clock resets (`epoch` rises) and starts again from this sample;
 *     the watcher's picture has been held for half a second already.
 *   What remains: an UNCHANGED nibble stays a stall, so a burst of exactly 16 or 32 reads 0 (the body jumps at one
 *   number, no worse than the tick clock draws it). A burst of `raw` after T ticks reads `raw + 16` when T >= raw + 12
 *   (`raw + 16` within T + 4 and nearer T than raw): the four bits cannot tell a page hitch's few commands from an uplink
 *   stall's T. For a capped page's hitch (raw 6, a few more when the frames after it ran before the room's next sample)
 *   that is T from about 18 to 30, a hitch of about 300 to 500 ms: read 16 high; one command after 13 to 28 ticks reads
 *   17, after 29 or 30 reads 33. A hitch of T up to raw + 11 (the second run's: T 14-16, raw 6) reads right, where the
 *   rule before PV-10f (the candidate nearest T on either side) read it 16 high from T >= raw + 8. An uplink burst that
 *   runs more than T + 4 commands (a delay spread past the slack's) reads 16 low once it is 16 or more, and a room
 *   hitch (more commands than ticks) reads 16 short (the old alias). A subject that advances less often than every 30
 *   ticks (a throttled or hidden tab) resets at every advance and so has no command clock at all: the caller draws it on
 *   the tick clock, as today. A mis-count by 16 moves the playout clock's arrival offset by 16 commands (267 ms), past
 *   `PLAYOUT_SNAP_MS_ADAPTATION` (250 ms, 15 commands): it snaps once -- a skip of the picture -- and every number after
 *   it stands 16 off until the next reset, the picture the owner's sequence with its numbers shifted (what a measure
 *   pairing by command must look for inside an epoch). A smaller mis-count slews.
 * - **The order of the rules** in `hear`, so they cannot fight: (1) a tick backward or a gap past
 *   `COMMAND_CLOCK_GAP_TICKS_ADAPTATION` (15, no samples between) resets first; (2) an unchanged nibble is a stall;
 *   (3) a changed one after more than `COMMAND_CLOCK_STALL_TICKS_ADAPTATION` (30) ticks of samples resets; (4) else the
 *   burst rule above. `COMMAND_CLOCK_IDLE_TICKS_ADAPTATION` (60) is read only by `cmd()`: between 30 and 60 ticks of a
 *   stall the clock holds on the newest, past 60 it is null, and the advance that ends either resets by (3).
 * - **A gap in the room's ticks** past `COMMAND_CLOCK_GAP_TICKS_ADAPTATION`, or a tick going backward (a reconnect, a
 *   held or withheld body, a room restarted): the clock resets and starts again from that sample.
 * - **A reset** (those two rules, or `reset()`) restarts the numbers at the base, so `cmd()` steps back: `epoch` counts
 *   the resets, and the caller compares it each frame and rebuilds what it built on the old numbers (the rig) on a
 *   change -- a page slower than 30 Hz can otherwise miss the null between a reset's first and second sample.
 * - **A respawn** between two samples (the seat's spawn count, `NetClient.spawnsAt(id, tick)`, differs): `at()` draws
 *   the newer body whole there, as `bodies()` does (NU-12 D6) -- the number runs on through a death and a spawn, and a
 *   lerp would slide the body across the map.
 * - **A dead subject** is drawn on the tick clock by the caller, not on this one: a corpse moves on the room's ticks
 *   (its fall), while its seat's commands still advance the number (research 402 s3).
 * - **A replay** feeds media time, not page time, as `at` and `now` (the replay's tick at `TICK_HZ`): the playout clock
 *   slews at most 5 %, so a 2x or paused replay on page time would pin on the newest or snap.
 * - **No usable clock** (`cmd()` null): fewer than two numbers in hand, or no advance over the last
 *   `COMMAND_CLOCK_IDLE_TICKS_ADAPTATION` room ticks of samples (a hostage, a protocol-15 recording whose nibble is
 *   always 0, a seat whose commands stopped). The caller then draws the body on the tick clock, as today.
 * - **History.** At least `COMMAND_CLOCK_HISTORY_TICKS_ADAPTATION` room ticks of samples by their ticks (the rig warms a
 *   rebuild from 90 commands back: `povCamera.ts` `POV_WARM_TICKS_ADAPTATION`); `at(k)` on a miss costs two compares
 *   and allocates nothing, on a hit a binary search over the kept samples.
 */

/** The number the first sample's nibble is added to (a reset starts here again): a multiple of 16, non-negative and
 * well above the rig's 90-command warm-up, so no history window asks below 0. Only differences mean anything.
 * [adaptation, no original; LATER 735, research 402 s4] */
export const COMMAND_CLOCK_BASE_ADAPTATION = 1024;
/** A jump of the room's tick between two samples past this resets the clock: a body absent that long is a held,
 * withheld or reconnected seat, and the nibble resolves at most 15 commands with nothing heard between (the burst rule
 * reads a stall's ticks off samples that kept coming, which a gap has not); at the mean one command a tick a gap of 16
 * ticks or more is expected to carry 16 commands or more. A body heard every 2 ticks (`SNAPSHOT_HZ`) leaves room for
 * several lost snapshots below it. [adaptation, no original; LATER 735, research 402 s4] */
export const COMMAND_CLOCK_GAP_TICKS_ADAPTATION = 15;
/** A changed nibble after more than this many room ticks without an advance resets the clock rather than unwrapping:
 * half a second, inside the room's credit (`CREDIT_MAX` 60), so up to it an uplink stall's burst is about the ticks it
 * lasted and a page hitch's is at most 6 (its frame's 0.1 s cap, the header) -- the burst rule reads both, but for the
 * alias the header names; past it the count is unknowable (a hidden tab's one command a wake, an uplink stall past the
 * credit draining at 2 a tick). [adaptation, no original; LATER 735, research 402 s4; PV-10f] */
export const COMMAND_CLOCK_STALL_TICKS_ADAPTATION = 30;
/** PV-10f (research 402 s2): how many commands more than the room's ticks can run between the last advance's sample and
 * the next, in an ordinary stream -- the bound the burst rule never counts past. The room runs a seat's command only once
 * it has arrived, on a credit of a tick's worth each tick (`room.ts` `CREDIT_MAX`), and a page sends no faster than real
 * time (a command a 60 Hz walk tick, its frame's commands sent together at the frame). So over the ticks (A, B] the
 * commands run are at most those that reached the room by B less those that had surely reached it by A: T, plus the
 * uplink delay's spread in ticks (a command delayed least at B, one delayed most at A), plus 1 for the page's frame (its
 * commands leave at the frame, up to a tick after their own tick at 30 frames a second or more). The spread is the field
 * case this clock is modelled for (research 402 s4; `test/commandClock.test.ts`'s `tcp`: 30-80 ms, in order): 50 ms, 3
 * ticks, so 3 + 1 = 4. The samples' own ticks add nothing: A and B are the samples' ticks and the commands counted are
 * those run between them. Not covered: a room hitch (the credit's wall time, more commands than ticks) and a slower
 * page or a wider spread; each is said in the header. [adaptation, no original; research 402 s2, s4] */
export const COMMAND_CLOCK_BURST_SLACK_ADAPTATION = 4;
/** No advance of the number over this many room ticks of samples (one second at `TICK_HZ`): no usable clock (`cmd()`
 * null), the body drawn on the tick clock. A body that does not move is drawn identically on either clock, so the
 * fallback costs nothing visible; a stall under it (the credit's catch-up) holds on the newest.
 * [adaptation, no original; LATER 735, research 402 s4] */
export const COMMAND_CLOCK_IDLE_TICKS_ADAPTATION = 60;
/** The history kept, room ticks by the samples' own ticks (two seconds at `TICK_HZ`): over the rig's 90-command
 * warm-up at the mean of one command a tick. [adaptation, no original; LATER 735, research 402 s4] */
export const COMMAND_CLOCK_HISTORY_TICKS_ADAPTATION = 120;

/** What the clock keeps of the subject at one snapshot. */
export interface ClockSample<B> {
  /** The unwrapped command number: the body is the state after this command. */
  n: number;
  /** The room's tick of the snapshot it came in (the newest heard with `n`). */
  tick: number;
  body: B;
  /** The seat's spawn count at that snapshot (`NetClient.spawnsAt`); 0 when the caller has none. */
  spawns: number;
}

/** A body the clock can interpolate: the feet, the yaw (degrees) and the pitch; the rest is carried from the newer. */
export interface ClockBody { feet: readonly [number, number, number]; yaw: number; pitch: number }

/** The interpolation delay, in commands (one a tick): `NetClient.viewTick`'s, `INTERP_DELAY_MS` at `TICK_HZ`. */
const DELAY_CMDS = (INTERP_DELAY_MS / 1000) * TICK_HZ;

export class CommandClock<B extends ClockBody> {
  /** The kept samples, oldest first, numbers strictly rising. */
  private samples: ClockSample<B>[] = [];
  private clock = new PlayoutClock();
  private lastNibble = 0;
  /** The tick of the sample at which the number last advanced (the first sample's, before any advance). */
  private advancedTick = 0;
  private resets = 0;

  /** How many resets so far (the gap rule, a tick backward, `reset()`): the caller rebuilds on a change. */
  get epoch(): number { return this.resets; }

  /**
   * The subject's body in a snapshot of room tick `tick`, heard at `at` (ms, the page's clock; a replay's media time),
   * with the wire's 4-bit command nibble and the seat's spawn count at that snapshot (0 when the caller has none).
   */
  hear(at: number, tick: number, nibble: number, body: B, spawns = 0): void {
    const nib = nibble & 15;
    const newest = this.samples[this.samples.length - 1];
    // The rules' order (the header): (1) a tick backward or a gap; (2) a stall; (3) a long stall's advance; (4) a burst.
    if (newest && (tick < newest.tick || tick - newest.tick > COMMAND_CLOCK_GAP_TICKS_ADAPTATION)) this.reset();
    else if (newest && nib !== this.lastNibble && tick - this.advancedTick > COMMAND_CLOCK_STALL_TICKS_ADAPTATION) this.reset();
    const last = this.samples[this.samples.length - 1];
    if (!last) {
      this.samples.push({ n: COMMAND_CLOCK_BASE_ADAPTATION + nib, tick, body, spawns });
      this.advancedTick = tick;
    } else {
      const raw = (nib - this.lastNibble) & 15;
      if (raw === 0) { last.tick = tick; last.body = body; last.spawns = spawns; }   // a stall: the newest state with that number
      else {
        // A burst after a stall of at most 30 ticks (the header): the candidate raw + 16 j nearest to T that does not exceed
        // T + COMMAND_CLOCK_BURST_SLACK_ADAPTATION -- never more commands than the ticks that passed allow -- else raw.
        const t = tick - this.advancedTick;
        let d = raw;
        for (let c = raw + 16; c <= t + COMMAND_CLOCK_BURST_SLACK_ADAPTATION; c += 16) if (Math.abs(c - t) < Math.abs(d - t)) d = c;
        this.samples.push({ n: last.n + d, tick, body, spawns });
        this.advancedTick = tick;
      }
    }
    this.lastNibble = nib;
    const top = this.samples[this.samples.length - 1]!;
    this.clock.hear(at, top.n);
    // History: drop what is older than the kept window by its tick (never the newest two).
    let drop = 0;
    while (this.samples.length - drop > 2 && this.samples[drop]!.tick < top.tick - COMMAND_CLOCK_HISTORY_TICKS_ADAPTATION) drop++;
    if (drop) this.samples.splice(0, drop);
  }

  /**
   * The subject's command time to draw at `now` (fractional, unwrapped): `INTERP_DELAY_MS` behind the playout clock fed
   * the unwrapped numbers, as `NetClient.viewTick` is behind the tick clock; never below the oldest kept sample's number,
   * and never above `newest()` -- that is the playout clock's own starvation guard (its offset is at least `now` less the
   * newest number's time less `INTERP_DELAY_MS`, so this time stands at most on the newest), relied on, not repeated.
   * Null = no usable command clock (see the header): the caller draws on the tick clock.
   */
  cmd(now: number): number | null {
    const n = this.samples.length;
    if (n === 0) return null;
    const t = this.clock.tick(now) - DELAY_CMDS;   // read even when idle, so the clock keeps the frame's pace
    if (n < 2) return null;
    if (this.samples[n - 1]!.tick - this.advancedTick > COMMAND_CLOCK_IDLE_TICKS_ADAPTATION) return null;
    return Math.max(this.samples[0]!.n, t);
  }

  /**
   * The body after whole command `k`: the feet, yaw (the shortest turn) and pitch interpolated between the two kept
   * samples whose numbers bracket k, the rest from the newer -- `NetClient.bodies()`'s rule with the command number in
   * place of the tick; the sample itself at its number. Null ahead of the newest or older than the oldest kept (no
   * allocation, no search).
   */
  at(k: number): B | null {
    const s = this.samples;
    const n = s.length;
    if (n === 0 || k > s[n - 1]!.n || k < s[0]!.n) return null;
    let lo = 0, hi = n - 1;                                // the first sample with n >= k
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (s[mid]!.n < k) lo = mid + 1; else hi = mid;
    }
    const newer = s[lo]!;
    if (newer.n === k || lo === 0) return newer.body;
    const older = s[lo - 1]!;
    if (older.spawns !== newer.spawns) return newer.body;     // a respawn between them: the newer whole (NU-12 D6)
    const f = (k - older.n) / (newer.n - older.n);
    const o = older.body, x = newer.body;
    return {
      ...x,
      feet: [o.feet[0] + (x.feet[0] - o.feet[0]) * f, o.feet[1] + (x.feet[1] - o.feet[1]) * f, o.feet[2] + (x.feet[2] - o.feet[2]) * f],
      yaw: wrapYaw(o.yaw + shortTurn(o.yaw, x.yaw) * f), pitch: o.pitch + (x.pitch - o.pitch) * f,
    };
  }

  /**
   * PV-15: the seat's spawn count of the body `at(k)` gives -- the newer of the two samples that bracket k (`at` lerps
   * only inside one life and draws a respawn's newer body whole), the sample's own at its number; null where `at(k)` is
   * null. The rig's history stops where this changes (`../povCamera` `PovBody.life`).
   */
  lifeAt(k: number): number | null {
    const s = this.samples;
    const n = s.length;
    if (n === 0 || k > s[n - 1]!.n || k < s[0]!.n) return null;
    let lo = 0, hi = n - 1;                                // the first sample with n >= k, as `at`
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (s[mid]!.n < k) lo = mid + 1; else hi = mid;
    }
    return s[lo]!.spawns;
  }

  /** The newest whole command a sample exists for; null before any. */
  newest(): number | null {
    const s = this.samples;
    return s.length ? s[s.length - 1]!.n : null;
  }

  /** The oldest whole command a sample is kept for; null before any. */
  oldest(): number | null {
    return this.samples.length ? this.samples[0]!.n : null;
  }

  /** Feed history at once (a replay's seek, a bind): samples oldest first, each with its own `at`; `hear` for each. */
  prime(samples: readonly { at: number; tick: number; nibble: number; body: B; spawns?: number }[]): void {
    for (const x of samples) this.hear(x.at, x.tick, x.nibble, x.body, x.spawns ?? 0);
  }

  /** Forget everything: the next sample starts a fresh count at `COMMAND_CLOCK_BASE_ADAPTATION` and a fresh playout
   * clock; `epoch` rises by one. */
  reset(): void {
    this.resets++;
    this.samples = [];
    this.clock = new PlayoutClock();
    this.lastNibble = 0;
    this.advancedTick = 0;
  }
}
