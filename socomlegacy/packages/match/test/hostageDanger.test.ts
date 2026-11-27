import { describe, expect, it } from 'vitest';
import type { AiLoc } from '@s2u/scene';
import {
  dangerKind, fleeCell, fleeDepth, scanDangers, HOSTAGE_DANGER_REMOTE_SATCHEL_READING, HOSTAGE_DANGER_SCAN_READING, HOSTAGE_SIGHT_PLACEHOLDER,
  type Danger, type DangerMarks, type DangerWatcher, type DangerWorld,
} from '../src/hostageDanger';

/**
 * LATER 1170 (research 445; reading, pending review): the hostage's danger scan (`FUN_005cb870` D:L482923-482967) and its
 * decision (`FUN_005cac00` D:L482578-482790), pure; and the flight's cell (`FUN_00559580` D:L422344, research 445 s5).
 */

type V3 = [number, number, number];
const SEAL = 0x40000001, TERRORIST = 0x80000100, HOSTAGE = 0xc0020000;

/** A hostage at the origin facing +x. */
const watcher = (over: Partial<DangerWatcher> = {}): DangerWatcher => ({ id: 240, feet: [0, 0, 0], eye: [0, 18, 0], forward: [1, 0, 0], team: HOSTAGE, inFlight: false, ...over });
const danger = (over: Partial<Danger> = {}): Danger => ({ pid: 1, kind: 'frag', pos: [30, 1, 0], fuse: 3, radius: 150, owner: 2, ownerTeam: SEAL, ...over });
/** Every actor resolves (the neighbour list is every actor, research 445 s3); everything in sight; no local human (the room). */
const world = (over: Partial<DangerWorld> = {}): DangerWorld => ({ actor: () => true, visible: () => 1, localHuman: () => false, ...over });
const fresh = (): DangerMarks => ({ marks: new Set(), seen: new Set() });

describe('the kinds the scan takes (research 445 s2; FUN_005c5340, FUN_005bc730)', () => {
  it('M67 (0x79) and HE (0x7e) are frags; C4 (0x97) and the satchel (0x98); a flashbang, a smoke, a claymore or the PMN nothing', () => {
    expect([121, 126, 151, 152].map(dangerKind)).toEqual(['frag', 'frag', 'c4', 'satchel']);
    expect([123, 122, 153, 158, 154].map(dangerKind)).toEqual([null, null, null, null, null]);
  });
});

describe('scanDangers: the decision, test by test (FUN_005cac00)', () => {
  it('a frag 30 u off, in sight: noticed (the 50 u near test), within its blast radius: flee; handled from then on', () => {
    const m = fresh();
    const r = scanDangers(watcher(), [danger()], m, world());
    expect(r).toEqual({ stop: true, flee: expect.objectContaining({ pid: 1 }) });
    expect([m.marks.has(1), m.seen.has(1)]).toEqual([true, true]);    // marked, and its side's seen bits set
  });

  it('the scan\'s filters: past 200 u, a fuse over 16 s (an untimed satchel): skipped, nothing handled', () => {
    const m = fresh();
    expect(scanDangers(watcher(), [danger({ pos: [201, 1, 0], radius: 250 })], m, world())).toEqual({ stop: false, flee: null });
    expect(scanDangers(watcher(), [danger({ fuse: 16.5 })], m, world())).toEqual({ stop: false, flee: null });
    expect(scanDangers(watcher(), [danger({ kind: 'satchel', fuse: 3 })], m, world())).toEqual({ stop: false, flee: null });
    expect(HOSTAGE_DANGER_SCAN_READING).toEqual({ range: 200, fuse: 16, near: 50, visible: 0.25 });
    expect(m.marks.size).toBe(0);
  });

  it('noticed but outside its blast radius (an HE, 100 u, at 120 u, in the cone): handled and the scan stops, no flight', () => {
    const m = fresh();
    expect(scanDangers(watcher(), [danger({ pos: [120, 1, 0], radius: 100 })], m, world())).toEqual({ stop: true, flee: null });
    expect(m.marks.has(1)).toBe(true);
    expect(scanDangers(watcher(), [danger({ pos: [-60, 1, 0], radius: 100 })], m, world({ visible: () => 0 })).flee).not.toBeNull();
  });

  it('out of sight (the visibility at 0.25 or under), not in the cone: no reaction, retried next tick (not handled)', () => {
    const m = fresh();
    expect(scanDangers(watcher(), [danger()], m, world({ visible: () => 0.25 }))).toEqual({ stop: false, flee: null });
    expect(m.marks.size).toBe(0);
  });

  it('the view cone: a frag 120 u ahead (radius 150) is noticed; the same frag 120 u behind is not (notice only: no local human, way (A))', () => {
    expect(scanDangers(watcher(), [danger({ pos: [120, 1, 0] })], fresh(), world()).flee).not.toBeNull();
    expect(scanDangers(watcher(), [danger({ pos: [-120, 1, 0] })], fresh(), world()).flee).toBeNull();
    expect(HOSTAGE_SIGHT_PLACEHOLDER.range).toBe(1000);
  });

  it('test 4: an unnoticed charge whose planter shares a team bit AND is a local human sends it running (the host\'s own; (B) is not built)', () => {
    const behind = danger({ pos: [-40, 1, 0], radius: 150 });
    const far = { ...behind, pos: [-60, 1, 0] as V3 };
    expect(scanDangers(watcher(), [far], fresh(), world({ localHuman: (id) => id === 2 })).flee).not.toBeNull();
    expect(scanDangers(watcher(), [far], fresh(), world()).flee).toBeNull();
    expect(scanDangers(watcher({ team: 0x20000 }), [far], fresh(), world({ localHuman: () => true })).flee).toBeNull();   // no shared bit
  });

  it('a thrower that no longer resolves is reacted to without a test (marked, not seen); one resolved but not listed is not, and not marked', () => {
    const behind = danger({ pos: [-60, 1, 0] });
    const m = fresh();
    expect(scanDangers(watcher(), [{ ...behind, owner: null }], m, world()).flee).not.toBeNull();
    expect([m.marks.has(1), m.seen.has(1)]).toEqual([true, false]);
    const n = fresh();
    expect(scanDangers(watcher(), [behind], n, world({ actor: () => false }))).toEqual({ stop: false, flee: null });
    expect(n.marks.size).toBe(0);
  });

  it('handled and noticed: re-pushed whenever not in flight, with no test; in flight, not', () => {
    const m: DangerMarks = { marks: new Set([1]), seen: new Set([1]) };
    expect(scanDangers(watcher({ inFlight: true }), [danger({ pos: [-60, 1, 0] })], m, world({ visible: () => 0 })).flee).toBeNull();
    expect(scanDangers(watcher(), [danger({ pos: [-60, 1, 0] })], m, world({ visible: () => 0 })).flee).not.toBeNull();
  });

  it('handled but never noticed (test 4): a frag is re-pushed, C4 is not (D:L482614-482636)', () => {
    const m: DangerMarks = { marks: new Set([1]), seen: new Set() };
    expect(scanDangers(watcher(), [danger({ pos: [-60, 1, 0] })], m, world()).flee).not.toBeNull();
    expect(scanDangers(watcher(), [danger({ kind: 'c4', pos: [-30, 1, 0], radius: 50 })], m, world()).flee).toBeNull();
  });

  it('the first object that answers stops the scan: a nearer noticed one out of radius stops it before a further one in radius', () => {
    const r = scanDangers(watcher(), [danger({ pid: 1, pos: [120, 1, 0], radius: 100 }), danger({ pid: 2, pos: [30, 1, 0] })], fresh(), world());
    expect(r).toEqual({ stop: true, flee: null });
  });
});

describe('the flight\'s cell (FUN_00559580; research 445 s5)', () => {
  /** An open square of cells -20..20 on map 0, 10 u a cell, a wall of blocked cells at x = 3. */
  const open = (blocked: (loc: AiLoc) => boolean) => ({
    traversable: (loc: AiLoc) => loc.map === 0 && Math.abs(loc.x) <= 20 && Math.abs(loc.z) <= 20 && !blocked(loc),
    point: (loc: AiLoc): V3 => [loc.x * 10, 0, loc.z * 10],
  });

  it('the depth n = int(R x 1.2 x 0.1): 18 for the M67 (150), 12 for the HE (100), 6 for C4 (50)', () => {
    expect([150, 100, 50].map(fleeDepth)).toEqual([18, 12, 6]);
  });

  it('C4: the octant facing away, walked to n + 2 cells, when nothing blocks it', () => {
    const c = fleeCell(open(() => false), { map: 0, x: 0, z: 0 }, [-1, 0], 6, 'c4');
    expect(c).toEqual({ map: 0, x: -8, z: 0 });
  });

  it('C4 with the way away walled (x = -3): the deepest of the eight in the order d, d-1, d+1 ... -- a diagonal, 8 cells', () => {
    const c = fleeCell(open((l) => l.x === -3), { map: 0, x: 0, z: 0 }, [-1, 0], 6, 'c4');
    expect(c).not.toBeNull();
    expect(Math.max(Math.abs(c!.x), Math.abs(c!.z))).toBe(8);
    expect(c!.x).toBeGreaterThanOrEqual(0);
  });

  it('the review F1: a frag scores its three candidates (d, d-1, d+1) by their OWN depth, as C4 does its eight (0x30000 has bit 0x10000: no sum, D:L422375)', () => {
    // Away = direction 4 (-x). Depths: d2 0, d3 10, d4 8, d5 9, d6 20 (the rest 0). The original's d3 (10); a summed rule would take d5.
    const want = [0, 0, 0, 10, 8, 9, 20, 0];
    const dirs: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const rays = { traversable: (l: AiLoc) => {
      const k = Math.max(Math.abs(l.x), Math.abs(l.z));
      const i = dirs.findIndex(([dx, dz]) => l.x === dx * k && l.z === dz * k);
      return l.map === 0 && i >= 0 && k <= want[i]!;
    } };
    expect(fleeCell(rays, { map: 0, x: 0, z: 0 }, [-1, 0], 18, 'frag')).toEqual({ map: 0, x: -10, z: 10 });
    expect(fleeCell(rays, { map: 0, x: 0, z: 0 }, [-1, 0], 18, 'c4')).toEqual({ map: 0, x: 0, z: -20 });   // C4: all eight, d6 the deepest
  });

  it('a frag in the open: straight away', () => {
    expect(fleeCell(open(() => false), { map: 0, x: 0, z: 0 }, [-1, 0], 18, 'frag')).toEqual({ map: 0, x: -20, z: 0 });
  });

  it('every direction blocked within n - 2: the walk cell at any depth (research 445 s5, the re-read F6); boxed in, none', () => {
    expect(fleeCell(open((l) => Math.max(Math.abs(l.x), Math.abs(l.z)) === 2), { map: 0, x: 0, z: 0 }, [-1, 0], 6, 'c4')).toEqual({ map: 0, x: -1, z: 0 });
    expect(fleeCell(open((l) => Math.max(Math.abs(l.x), Math.abs(l.z)) === 1), { map: 0, x: 0, z: 0 }, [-1, 0], 6, 'c4')).toBeNull();
  });
});

describe("a remote player's satchel (research 445 s6; reading, pending review)", () => {
  it("is not in the host's danger list: the item-use tick returns at the remote gate before its place path", () => {
    // r0001 FUN_005c1970: the controller's +0x34 gate D:L476875, the remote branch returns 1 at D:L477147-477149; the place
    // path FUN_005bc730 is called only on the local branch (D:L476985, D:L477010). r0004 FUN_005c8860: gate D4:L518716,
    // remote return D4:L519150-519151; FUN_005c32e0 (= FUN_005bc730) at D4:L518828, D4:L518853, local branch only.
    expect(HOSTAGE_DANGER_REMOTE_SATCHEL_READING).toBe('not in the host list');
  });
});
