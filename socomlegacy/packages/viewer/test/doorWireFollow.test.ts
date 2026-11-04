import { describe, expect, it } from 'vitest';
import { segmentHit } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { simMapFromBytes } from '../src/simMap';
import { DoorSet } from '../src/doors';
import { groundGrid, TICK } from '../src/mover';
import { SNAPSHOT_HZ, TICK_HZ, type DoorWire } from '../src/net/protocol';

/**
 * BOT-DOOR's second half (Craig's live game 2755, MP2): after he shut bdoor_4 a CPU reopened it at once, and he walked
 * through the door drawn shut and was pulled back. The room's doors and the page's run from the same uses: the room's
 * `DoorSet` stepped at `TICK_HZ`, its `wire()` sent every `TICK_HZ / SNAPSHOT_HZ` ticks, the page's `DoorSet` following
 * the snapshots a few ticks late (`applyWire`, then its own `step`, as `DoorPage.frame` runs them; the newest snapshot
 * arrived is the one read, as `net.doors()` gives). What collides is the leaf's polygons in each side's own hull
 * (`DoorSet.pose`), probed here by a segment through the doorway.
 *
 * A port rule, not a parity pin: the snapshot's door is the port's wire (no original value); the page must stand where the
 * room stood its latency ago, a swing begun the moment the last one ended included.
 */
const MP2 = fixture('RUN/MP2.ZDB');
const EVERY = Math.round(TICK_HZ / SNAPSHOT_HZ);

describe.skipIf(!MP2)(`the page follows the room's door through back-to-back uses${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  /** Two sides, each on its own copy of MP2's hull; `blocked` probes the doorway of bdoor_4 at chest height. */
  const sides = (latency: number) => {
    const make = () => {
      const map = simMapFromBytes(MP2!, 'RUN/MP2.ZDB');
      const sounds: string[] = [];
      const set = new DoorSet(map.doors ?? [], map.ground, { sound: (name) => sounds.push(name) });
      const grid = groundGrid(map.ground);
      const blocked = (): boolean => segmentHit(grid, [582.5, 152, 1135], [582.5, 152, 1100], (p) => set.doorOf(p.path) >= 0) !== null;
      return { set, sounds, blocked };
    };
    const room = make(), page = make();
    const door = room.set.specs.findIndex((d) => d.node === 'bdoor_4');
    let tick = 0;
    const inFlight: { at: number; wire: DoorWire[] }[] = [];
    const roomBlocked: boolean[] = [], pageBlocked: boolean[] = [];
    /** One tick: the room steps (and snapshots on its cadence); the page applies what has arrived, then steps. */
    const step = (): void => {
      room.set.step(1 / TICK_HZ);
      tick++;
      if (tick % EVERY === 0) inFlight.push({ at: tick + latency, wire: room.set.wire() });
      let latest: DoorWire[] | undefined;
      while (inFlight.length && inFlight[0]!.at <= tick) latest = inFlight.shift()!.wire;
      page.set.applyWire(latest);
      page.set.step(TICK);
      roomBlocked[tick] = room.blocked(); pageBlocked[tick] = page.blocked();
    };
    return { room, page, door, step, now: () => tick, roomBlocked, pageBlocked };
  };

  it.each([[2, 0], [2, 1], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1]])(
    'latency %i ticks, the close at %i past a snapshot: a reopen at the close end is followed as a swing, the doorway as the room had it', (latency, offset) => {
      const s = sides(latency);
      expect(s.room.blocked()).toBe(true);
      // Opened, and both sides at rest open.
      expect(s.room.set.use(s.door)).toBe(true);
      for (let k = 0; k < 2 * TICK_HZ; k++) s.step();
      expect(s.page.set.state(s.door)).toMatchObject({ open: true, busy: false });
      expect(s.room.blocked()).toBe(false);
      expect(s.page.blocked()).toBe(false);
      // The player shuts it; the tick after its run ends, a CPU's turn presses it before the room steps its doors
      // (`MatchBots.step`, then `Room.step`).
      while (s.now() % EVERY !== offset) s.step();
      expect(s.room.set.use(s.door)).toBe(true);
      const closed = s.now();
      while (s.room.set.state(s.door).busy) s.step();
      expect(s.room.set.use(s.door)).toBe(true);
      for (let k = 0; k < 3 * TICK_HZ; k++) s.step();
      expect(s.room.set.state(s.door)).toMatchObject({ open: true, busy: false });
      expect(s.page.set.state(s.door)).toMatchObject({ open: true, busy: false });
      // At every tick from the close on, the page's doorway stands as the room's did a few ticks before (its latency,
      // the snapshot's cadence, the head's frame count).
      const mismatched: number[] = [];
      for (let t = closed + 12; t <= s.now(); t++) {
        const lagged = [0, 1, 2, 3, 4, 5].map((k) => s.roomBlocked[t - latency - k]);
        if (!lagged.includes(s.pageBlocked[t]!)) mismatched.push(t - closed);
      }
      expect(mismatched).toEqual([]);
      // The page heard the reopen as a swing (a run-out at rest is silent).
      expect(s.page.sounds).toEqual(s.room.sounds);
    });
});
