import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { ladderSegments, ladderTriangles, swingOf, swingTriangles } from '../../src/forge/interactOverlay';

/**
 * Which way a door swings and a ladder is climbed, drawn in the editor (the owner, 2026-11-06; a browser adaptation,
 * FG.R2): a door's arc from its closed leaf to its open one, read by running the door's own swing program; a ladder's
 * arrow out of its foot to the side it is climbed from (`findLadders`' normal).
 */
describe('a ladder\'s climb arrow', () => {
  it('a bar across its foot and an arrow out along its normal, just above its floor', () => {
    const s = ladderSegments({ x: 10, z: 20, bottom: 5, top: 40, capTop: 50, nx: 1, nz: 0, halfWidth: 8, sided: true, path: 'l' });
    expect(s.length % 6).toBe(0);
    const ys = s.filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBeGreaterThan(5);
    const xs = s.filter((_, i) => i % 3 === 0);
    expect(Math.max(...xs)).toBeGreaterThan(10 + 8);              // the arrow reaches out along +x, past the bar
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(10 - 0.001);   // never behind the ladder
    const zs = s.filter((_, i) => i % 3 === 2);
    expect([Math.min(...zs), Math.max(...zs)]).toEqual([12, 28]);   // the bar its width across
  });
});

describe('the guides filled, as the spawn discs are', () => {
  it("a door's swept wedge: triangles from the hinge out to its arc, at the floor, within the leaf's reach", async () => {
    const { Vector3 } = await import('three');
    const t = swingTriangles({ hinge: [0, 10, 0], from: new Vector3(20, 30, 0), to: new Vector3(0, 30, 20), y: 11, angle: Math.PI / 2 });
    expect(t.length % 9).toBe(0);
    expect(t.length / 9).toBeGreaterThanOrEqual(8);
    for (let i = 0; i < t.length; i += 3) {
      expect(t[i + 1]).toBe(11);
      expect(Math.hypot(t[i]!, t[i + 2]!)).toBeLessThanOrEqual(20 + 1e-6);
      expect(t[i]! >= -1e-6 && t[i + 2]! >= -1e-6).toBe(true);   // the quarter it swings through, none behind
    }
  });

  it("a ladder's arrow filled: its shaft and head out of its foot along its climb side", () => {
    const t = ladderTriangles({ x: 0, z: 0, bottom: 0, top: 30, capTop: 40, nx: 0, nz: -1, halfWidth: 6, sided: true, path: 'l' });
    expect(t.length % 9).toBe(0);
    const zs = t.filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs)).toBeLessThan(-10);                   // out along -z
    expect(Math.max(...zs)).toBeLessThanOrEqual(1e-6);
  });
});

const ISO = process.env['SOCOM_ISO'];
describe.skipIf(!ISO || !existsSync(ISO))('door swings on the disc (SOCOM_ISO)', () => {
  it("Frostfire's three doors (bdoor_4, wdoor_1, wdoor_2) each swing about a quarter turn, all the same way by singleDoor_right", async () => {
    const { IsoAssetSource } = await import('@s2u/archive');
    const { fsBlob } = await import('../../../../tools/fmv-spike');
    const { loadMap } = await import('../../src/loadMap');
    const { groundPolygons } = await import('../../src/mover');
    const map = await loadMap(new IsoAssetSource(fsBlob(ISO!)), 'RUN/MP2.ZDB');
    const polys = groundPolygons(map.ground!);
    const swings = map.doors!.map((d) => {
      const leaf = d.owners.flatMap((o) => { const w = map.ground!.owners[o]!; return polys.slice(w.first, w.first + w.count).map((p) => p.points); });
      return { name: d.programs[0]!.name, swing: swingOf(d, leaf) };
    });
    for (const s of swings) {
      expect(s.swing, s.name).not.toBeNull();
      expect(Math.abs(s.swing!.angle), s.name).toBeGreaterThan(Math.PI / 4);
      expect(Math.abs(s.swing!.angle), s.name).toBeLessThan(Math.PI);
    }
    // FP-1b (the review's F3), measured off the disc: Frostfire has three doors, each swinging by the one program
    // `singleDoor_right`, all the same way (a positive turn, about 100 degrees) -- no left door to swing against them.
    expect(swings.map((s, i) => [map.doors![i]!.node, s.name, Math.sign(s.swing!.angle)])).toEqual([
      ['bdoor_4', 'singleDoor_right', 1], ['wdoor_1', 'singleDoor_right', 1], ['wdoor_2', 'singleDoor_right', 1],
    ]);
  }, 120_000);
});

/**
 * A turret's facing and the arc its gun turns through, and a hostage's facing (the owner, 2026-11-06): a yaw in degrees,
 * 0 looking down -z, left positive (`../../src/yaw`); a turret's limits measured from its facing (`TurretPlacement`).
 */
describe('facing guides', () => {
  it('an arrow along a yaw: 0 down -z, 90 down -x (left positive)', async () => {
    const { facingShapes } = await import('../../src/forge/interactOverlay');
    const reach = (yaw: number) => {
      const t = facingShapes([0, 0, 0], yaw, 20).triangles;
      const xs = t.filter((_, i) => i % 3 === 0), zs = t.filter((_, i) => i % 3 === 2);
      return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)].map((v) => Math.round(v));
    };
    const [, , zmin0, zmax0] = reach(0);
    expect([zmin0, zmax0! <= 0]).toEqual([-20, true]);
    const [xmin90, xmax90] = reach(90);
    expect([xmin90, xmax90! <= 0]).toEqual([-20, true]);
  });

  it("a turret's arc: a wedge from its facing's lower limit to its upper, and its facing's arrow", async () => {
    const { turretShapes } = await import('../../src/forge/interactOverlay');
    const s = turretShapes([0, 0, 0], 0, [-45, 45], 30);
    const t = s.triangles;
    for (let i = 0; i < t.length; i += 3) {
      expect(t[i + 2]!).toBeLessThanOrEqual(1e-6);                // all ahead of it, down -z
      if (Math.hypot(t[i]!, t[i + 2]!) > 5) expect(Math.abs(Math.atan2(-t[i]!, -t[i + 2]!))).toBeLessThanOrEqual(Math.PI / 4 + 1e-6);
    }
    expect(s.segments.length % 6).toBe(0);
    // No limits: a full turn, a ring all round.
    const free = turretShapes([0, 0, 0], 0, null, 30).triangles;
    const zs = free.filter((_, i) => i % 3 === 2);
    expect(Math.max(...zs)).toBeGreaterThan(20);
  });
});

/** A hostage's gizmo (the owner, 2026-11-06): a spawn's own cell box, in the hostage's yellow -- no arrow, its facing no matter. */
describe("a hostage's gizmo", () => {
  it("is the spawn's box alone, yellow, square on the world at the marker's place, whatever the marker's turn", async () => {
    const { LineSegments, Vector3 } = await import('three');
    const { hostageMarker } = await import('../../src/forge/pieces');
    const { SLOT_CELL } = await import('../../src/overlays');
    const g = hostageMarker();
    const lines = g.children.find((c): c is InstanceType<typeof LineSegments> => c instanceof LineSegments)!;
    expect(lines).toBeDefined();
    expect((lines.material as unknown as { color: { getHex(): number } }).color.getHex()).toBe(0xf2d14b);
    expect(lines.geometry.getAttribute('position').count).toBe(8);           // four sides, no arrow
    g.rotation.y = Math.PI / 4;
    g.position.set(5, 0, 7);
    g.updateMatrixWorld(true);
    const corner = new Vector3(SLOT_CELL / 2, 0, SLOT_CELL / 2).applyMatrix4(lines.matrixWorld);
    expect([corner.x, corner.z]).toEqual([5 + SLOT_CELL / 2, 7 + SLOT_CELL / 2]);   // not turned
  });
});

/** A spectator view's look (the owner, 2026-11-06): an arrow from its place along its yaw and pitch (down negative). */
describe("a spectator view's arrow", () => {
  it('runs from the view along its look: yaw 0 down -z, a pitch of -30 tilting it down', async () => {
    const { viewShapes } = await import('../../src/forge/interactOverlay');
    const s = viewShapes([0, 100, 0], 0, -30, 40);
    const end = (list: number[]) => list.slice(3, 6);
    const [x, y, z] = end(s.segments);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(100 - 40 * Math.sin(Math.PI / 6));
    expect(z).toBeCloseTo(-40 * Math.cos(Math.PI / 6));
    expect(s.triangles.length % 9).toBe(0);
    const sideways = viewShapes([0, 0, 0], 90, 0, 40);
    expect(end(sideways.segments)[0]).toBeCloseTo(-40);          // left positive: 90 looks down -x
  });
});

/**
 * A gate's and a C4 barrier's gizmo (the owner, 2026-11-06): where each is used from -- its prompt's reach, a ring of
 * its action's range on the floor -- and which way: a barrier's arrow from its middle out to its prompt's side, a gate's
 * arrow along its slide.
 */
describe('gate and barrier gizmos', () => {
  it("a barrier: a ring of its prompt's range round the prompt, and no arrow (the owner: the circle alone)", async () => {
    const { accessShapes } = await import('../../src/forge/interactOverlay');
    const s = accessShapes([0, 0, 0], [0, 0, -10], 32);
    expect(s.triangles).toEqual([]);
    for (let i = 0; i < s.segments.length; i += 3) expect(Math.hypot(s.segments[i]!, s.segments[i + 2]! + 10)).toBeCloseTo(32, 6);
  });

  it("a gate: a ring of its lever's range at the lever, and no slide arrow", async () => {
    const { gateShapes } = await import('../../src/forge/interactOverlay');
    const g = gateShapes([0, 10, 0], [0, 35, 0], [5, 0, 0], 20);
    expect(g.triangles).toEqual([]);
    for (let i = 0; i < g.segments.length; i += 3) expect(Math.hypot(g.segments[i]! - 5, g.segments[i + 2]!)).toBeCloseTo(20, 6);
  });
});
