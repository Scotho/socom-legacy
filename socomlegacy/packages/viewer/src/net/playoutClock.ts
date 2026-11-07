import { INTERP_DELAY_MS, SNAPSHOT_HZ, TICK_HZ } from './protocol';

/**
 * INV-SPECTATE fix A (product track, the netcode lane; a browser adaptation with no original -- the original drove a
 * remote actor locally from its replicated stick and chased the received place, research 193 §12.5; the port
 * interpolates snapshots, its own netcode, and this is that netcode's clock): the page's playout clock for the remote
 * bodies, read by `NetClient.viewTick`.
 *
 * `NetClient.serverTick` restarts from the newest snapshot's arrival, so a clock built on it jumps at every arrival by
 * the snapshot period less the arrival's own interval -- backward for a late one (about 40 % of arrivals under jitter;
 * `agent-mail/evidence/spectate-smoothness/REPORT.md`, suspect 2b). This clock runs at the frame's pace instead: its
 * offset (arrival time less the tick's time, ms) moves toward the least-delayed arrival's offset over the last
 * `PLAYOUT_WINDOW_MS_ADAPTATION` by at most `PLAYOUT_SLEW_ADAPTATION` of the elapsed time -- the drawn time runs 95 % to
 * 105 % of real time, never backward -- and snaps forward when the line got faster by more than
 * `PLAYOUT_SNAP_MS_ADAPTATION`, back only past a jump the guard below cannot follow (a room whose ticks restart). With
 * every arrival on time it is exactly the re-anchored clock.
 *
 * The starvation guard (review A1, 2026-11-07): a lasting rise of the line -- a one-way latency step, or a room hitch
 * (its loop runs at most 5 catch-up steps and drops the rest, so the tick timeline moves for good) -- left the window's
 * floor a second stale and the 5 % slew seconds behind, the drawn tick running past the newest snapshot (the body held,
 * stepping at each arrival) for up to 5 s. Two rules, both from the delay and the snapshot period, no new constant:
 * - the clock never plays past the newest snapshot heard: the offset is at least `now` less the newest tick's time less
 *   `INTERP_DELAY_MS` (the drawn tick, `INTERP_DELAY_MS` behind, then stands on the newest snapshot -- frozen, never
 *   backward: that bound rises at most as fast as `now`). It binds only where the re-anchored clock was starved too;
 * - a floor entry earlier than the newest arrival's offset less what the delay covers (`INTERP_DELAY_MS` less a
 *   snapshot period) is dropped -- it would starve the line as it now runs -- and so is one older than the window at
 *   `now`, not only at the next arrival; the target is at least that bound. Under 30-80 ms jitter neither binds.
 */

/** The floor's window, ms: the least-delayed arrival over the last second sets the target offset. [adaptation] */
export const PLAYOUT_WINDOW_MS_ADAPTATION = 1000;
/** The most the offset moves, as a share of the elapsed time: a 5 % rate change, below what the eye reads. [adaptation] */
export const PLAYOUT_SLEW_ADAPTATION = 0.05;
/** Past this difference from the target, ms, the offset snaps to it rather than slewing (5 s at 5 %). [adaptation] */
export const PLAYOUT_SNAP_MS_ADAPTATION = 250;

const TICK_MS = 1000 / TICK_HZ;
/** What the interpolation delay covers past one snapshot period, ms: an arrival's offset less this is the least that
 * keeps the next on-time snapshot ahead of the drawn tick. */
const COVER_MS = INTERP_DELAY_MS - 1000 / SNAPSHOT_HZ;

export class PlayoutClock {
  /** The window's arrivals as a sliding minimum: offsets rising front to back, the front the floor. */
  private readonly floor: { at: number; off: number }[] = [];
  /** The offset the clock reads by, ms; null before the first read after an arrival. */
  private off: number | null = null;
  /** The latest time read; an earlier read slews nothing. */
  private last = -Infinity;
  /** The newest snapshot heard (the last: the socket is in order; a room whose ticks restart is followed at once). */
  private newest: { tick: number; off: number } | null = null;
  /** A snapshot older than the newest was heard: the room's ticks restarted on this socket, so the next read snaps back. */
  private restarted = false;

  /** A snapshot of `tick` heard at `at` (ms, the page's clock). */
  hear(at: number, tick: number): void {
    const off = at - tick * TICK_MS;
    if (this.newest && tick < this.newest.tick) this.restarted = true;
    while (this.floor.length && this.floor[this.floor.length - 1]!.off >= off) this.floor.pop();
    this.floor.push({ at, off });
    while (this.floor[0]!.at < at - PLAYOUT_WINDOW_MS_ADAPTATION) this.floor.shift();
    this.newest = { tick, off };                             // the last heard, as `NetClient.drawnAt` takes the newest
  }

  /** The room's tick at `now` (fractional) as this clock plays it out; 0 before any arrival. */
  tick(now: number): number {
    const newest = this.newest;
    if (!newest) return 0;
    if (this.off !== null && now <= this.last) return (now - this.off) / TICK_MS;   // an earlier read moves nothing
    // The guard: re-expire the floor against `now`, and drop what would starve the newest arrival (the newest kept).
    const need = newest.off - COVER_MS;
    while (this.floor.length > 1 && (this.floor[0]!.at < now - PLAYOUT_WINDOW_MS_ADAPTATION || this.floor[0]!.off < need)) this.floor.shift();
    const target = Math.max(this.floor[0]!.off, need);
    // The guard: the least offset that keeps the drawn tick (`INTERP_DELAY_MS` behind) on or before the newest snapshot.
    const hold = now - newest.tick * TICK_MS - INTERP_DELAY_MS;
    // A forward snap is measured from where the guard lets the clock be, so a held stall never snaps past the newest; a
    // snap back only past a jump the guard, rising with `now`, cannot have followed (a room whose ticks restart).
    if (this.off === null || this.off - Math.max(target, hold) > PLAYOUT_SNAP_MS_ADAPTATION
      || this.restarted || target - Math.max(this.off, hold) > PLAYOUT_SNAP_MS_ADAPTATION) this.off = target;   // re-review 1: back only on a restart, else from the guarded position
    else {
      const step = PLAYOUT_SLEW_ADAPTATION * (now - this.last);
      this.off += Math.max(-step, Math.min(step, target - this.off));
    }
    this.off = Math.max(this.off, hold);
    this.restarted = false;
    this.last = now;
    return (now - this.off) / TICK_MS;
  }
}
