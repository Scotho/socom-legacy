import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readKitTable, segmentHit } from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';
import { NetClient, type NetWalk } from '../src/net/client';
import { LoopbackMatch } from '../src/net/loopback';
import { simMapFromBytes } from '../src/simMap';
import { DoorPage } from '../src/doorPage';
import type { DoorSet } from '../src/doors';
import { groundGrid, type Command, type Knock } from '../src/sim';

/**
 * HOTFIX DOOR-RESET (the owner's Vigilance playtests, 2026-11-02: a player walked into a door drawn shut, the use icon
 * only far through it, the door never opening). The room shuts every door at a round's start (`Room.startRound`:
 * `DoorSet.reset`, ruling PF.R10, DOOR_ROUND_RESET_READING); the page's doors must stand as the room's do after it -- the
 * same reset, not a catch-up run of the door's program from the page's last state (`DoorSet.applyWire`'s run-out).
 * The page's real `NetClient` and `DoorPage` against the loopback room on Vigilance (MP51, the disc) with a one-way
 * delay (LOOPBACK_DELAY_ADAPTATION), each side on its own copy of the hull; door_ft_4 opened by another seat, then a new
 * round. Probed: the page's leaf polygons against the room's (within one swing of the room's history), and a segment
 * through the doorway both ways on each side's own hull (`segmentHit`, the movers' grid). Disc-backed: skipped without
 * `SOCOM_DISC` (MP51) and the fixtures.
 */

const DISC = process.env.SOCOM_DISC;
const READERC = fixture('RUN/READERC.ZAR'), ZWEAPON = fixture('RUN/ZWEAPON.ZAR');
const HAVE = !!DISC && existsSync(resolve(DISC, 'RUN/MP51.ZDB')) && READERC !== null && ZWEAPON !== null;
const DOOR = 3;                                                     // door_ft_4
const DELAY_MS = 50;
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

/** The walk as the net client drives it: the stick at rest. */
class Walk implements NetWalk {
  tap: ((cmd: Omit<Command, 'seq'>, feet: [number, number, number]) => void) | null = null;
  feet: [number, number, number] = [0, 0, 0];
  setNetTap(tap: Walk['tap']): void { this.tap = tap; }
  respawn(at: readonly [number, number, number]): boolean { this.feet = [at[0], at[1], at[2]]; return true; }
  nudge(dx: number, dy: number, dz: number): void { this.feet = [this.feet[0] + dx, this.feet[1] + dy, this.feet[2] + dz]; }
  setLocked(): void { /* none */ }
  knock(_k: Knock): boolean { return true; }
  tick(): void { this.tap?.({ forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 }, this.feet); }
}

type V3 = [number, number, number];

async function rig() {
  const load = () => simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC!, 'RUN/MP51.ZDB'))), 'RUN/MP51.ZDB', { table: readKitTable(ZWEAPON!), readerc: READERC! });
  const roomMap = load(), pageMap = load();
  let now = 0;
  const match = new LoopbackMatch(roomMap, null, { auto: false, now: () => now, launchCountdownS: 0, delayMs: DELAY_MS, rules: 'classic' });
  const walk = new Walk();
  const client = new NetClient({ url: 'loopback:', map: 'MP51', name: 'Solo', socket: match.socket }, walk);
  const doors = new DoorPage({
    grid: () => null, feet: () => null, aim: () => null, sound: () => undefined, move: () => undefined,
    net: () => (client.state === 'open' ? client : null),
  });
  doors.setMap(pageMap.doors, pageMap.ground);
  const pageSet = (): DoorSet => (doors as unknown as { set: DoorSet }).set;
  const roomSet = match.room.doors;
  expect(roomSet.specs.map((d) => d.node)).toEqual(['door_ft_1', 'door_ft_2', 'door_ft_3', 'door_ft_4']);
  // The doorway probe: through the leaf's middle at rest, along its first polygon's normal, 30 u each way.
  const rest = roomSet.leaf(DOOR);
  const all = rest.flatMap((p) => Array.from(p));
  const mid: V3 = [0, 0, 0];
  for (let k = 0; k < all.length; k += 3) for (let a = 0; a < 3; a++) mid[a]! += all[k + a]! / (all.length / 3);
  const p0 = rest[0]!;
  const e1: V3 = [p0[3]! - p0[0]!, p0[4]! - p0[1]!, p0[5]! - p0[2]!], e2: V3 = [p0[6]! - p0[0]!, p0[7]! - p0[1]!, p0[8]! - p0[2]!];
  const n: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const len = Math.hypot(...n);
  const a: V3 = [mid[0] - (30 * n[0]) / len, mid[1] - (30 * n[1]) / len, mid[2] - (30 * n[2]) / len];
  const b: V3 = [mid[0] + (30 * n[0]) / len, mid[1] + (30 * n[1]) / len, mid[2] + (30 * n[2]) / len];
  const roomGrid = groundGrid(roomMap.ground), pageGrid = groundGrid(pageMap.ground);
  const blocked = (grid: ReturnType<typeof groundGrid>, set: DoorSet, from: V3, to: V3): boolean =>
    segmentHit(grid, from, to, (p) => set.doorOf(p.path) === DOOR) !== null;
  const roomLeaves: Float32Array[][] = [];
  /** One frame: the page's tick and frame, the clock on by a tick, the room stepped, the delayed frames delivered. */
  const run = async (frames: number, each?: () => void): Promise<void> => {
    for (let i = 0; i < frames; i++) {
      walk.tick();
      doors.frame(1 / 60);
      now += 1000 / 60;
      match.step();
      roomLeaves.push(roomSet.leaf(DOOR));
      vi.advanceTimersByTime(1000 / 60);
      await flush();
      each?.();
    }
  };
  return {
    match, client, roomSet, pageSet, run, roomLeaves,
    roomBlocked: (): [boolean, boolean] => [blocked(roomGrid, roomSet, a, b), blocked(roomGrid, roomSet, b, a)],
    pageBlocked: (): [boolean, boolean] => [blocked(pageGrid, pageSet(), a, b), blocked(pageGrid, pageSet(), b, a)],
    startRound: (): void => { (match.room as unknown as { startRound(newMatch: boolean): void }).startRound(false); },
  };
}

const same = (x: readonly Float32Array[], y: readonly Float32Array[]): boolean =>
  x.length === y.length && x.every((p, i) => p.length === y[i]!.length && p.every((v, k) => Math.abs(v - y[i]![k]!) < 0.05));

/** The ticks a swing and its head take (the doors' 0.7 s swing after the 0.3 s head) and the round trip, as frames. */
const WINDOW = 60 + Math.ceil((2 * DELAY_MS) / (1000 / 60)) + 6;

describe.skipIf(!HAVE)('HOTFIX DOOR-RESET: the page shuts its doors at the round start as the room does (MP51, door_ft_4)', () => {
  afterEach(() => { vi.useRealTimers(); });

  /** From frame `from` on, the page's leaf at each frame equals the room's at one of the last `WINDOW` frames. */
  const follows = (r: Awaited<ReturnType<typeof rig>>, from: number) => {
    const off: number[] = [];
    return {
      check: (): void => {
        const t = r.roomLeaves.length - 1;
        if (t < from) return;
        const page = r.pageSet().leaf(DOOR);
        let ok = false;
        for (let k = Math.max(0, t - WINDOW); k <= t && !ok; k++) ok = same(page, r.roomLeaves[k]!);
        if (!ok) off.push(t - from);
      },
      off,
    };
  };

  it('opened by another seat, then a new round: the page leaf follows the room shut, blocked from both sides', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const r = await rig();
    await r.run(30);
    expect(r.client.state).toBe('open');
    expect(r.roomSet.use(DOOR, null, 2)).toBe(true);                // seat B's press
    await r.run(150);
    expect(r.roomSet.state(DOOR).open).toBe(true);
    expect(r.pageSet().state(DOOR).open).toBe(true);
    expect(r.roomBlocked()).toEqual([false, false]);
    expect(r.pageBlocked()).toEqual([false, false]);
    r.startRound();
    const f = follows(r, r.roomLeaves.length);
    await r.run(150, f.check);
    expect(f.off).toEqual([]);
    expect(r.roomBlocked()).toEqual([true, true]);
    expect(r.pageBlocked()).toEqual([true, true]);
    expect(r.pageSet().state(DOOR)).toMatchObject({ open: false, busy: false });
    r.match.stop();
  }, 120_000);

  it('a new round with the door pressed again at once: the page opens it as the room does, never runs the last round\'s close', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const r = await rig();
    await r.run(30);
    expect(r.roomSet.use(DOOR, null, 2)).toBe(true);
    await r.run(150);
    expect(r.pageSet().state(DOOR).open).toBe(true);
    r.startRound();
    expect(r.roomSet.use(DOOR, null, 2)).toBe(true);                // the new round's first press, before a snapshot
    const f = follows(r, r.roomLeaves.length);
    await r.run(150, f.check);
    expect(f.off).toEqual([]);
    expect(r.roomSet.state(DOOR)).toMatchObject({ open: true, busy: false });
    expect(r.pageSet().state(DOOR)).toMatchObject({ open: true, busy: false });
    expect(r.pageBlocked()).toEqual(r.roomBlocked());
    r.match.stop();
  }, 120_000);

  it('mid-swing at the round start: the page stands shut with the room, not at the end of the old swing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const r = await rig();
    await r.run(30);
    expect(r.roomSet.use(DOOR, null, 2)).toBe(true);
    await r.run(40);                                               // the swing under way on both sides
    r.startRound();
    const f = follows(r, r.roomLeaves.length);
    await r.run(150, f.check);
    expect(f.off).toEqual([]);
    expect(r.pageSet().state(DOOR)).toMatchObject({ open: false, busy: false });
    expect(r.pageBlocked()).toEqual([true, true]);
    r.match.stop();
  }, 120_000);
});
