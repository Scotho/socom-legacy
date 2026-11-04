// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { buildGrid, isWallSurface, polygonNormal, probeGround, selectFloor, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import {
  BODY_RADIUS, groundGrid, groundPolygons, PRONE_FAN_READING, WALL_PROBE_READING, Walker, wallProbeHeights,
  type WalkInput,
} from '../src/mover';
import { simMapFromBytes } from '../src/simMap';
import { Traversal } from '../src/traversal';

/**
 * Thin disc faces (research 359). The original resolves a move by the segments `FUN_0054aa30` casts and
 * `FUN_005483d0` (D:L413533-413597) strips the velocity into a contact; it does not place the centre past the face.
 * A zero-area face has no interior, so a radial push from the nearest point toward a wish already past the face
 * points at the far side. These walks assert the centre stays on the side it started, at the class radius.
 * The synthetic crate is headless. The map walks use the committed ZDB fixtures and skip when a fixture is absent.
 */

const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };
const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const facing = (x: number, z: number, tx: number, tz: number): number => Math.atan2(-(tx - x), -(tz - z)) * 180 / Math.PI;

function floor(minX: number, minZ: number, maxX: number, maxZ: number, y: number): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([minX, y, minZ, maxX, y, minZ, maxX, y, maxZ, minX, y, maxZ]),
  };
}

/** A vertical wall across z at `x`, from y0 to y1 (bit 1, research 24 section 1.2). */
function wallX(x: number, z0: number, z1: number, y0: number, y1: number): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/wall', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([x, y0, z0, x, y0, z1, x, y1, z1, x, y1, z0]),
  };
}

function tri(path: string, xyz: number[]): WorldPoly {
  return {
    modelName: 'worldmodel', path, region: 0, ditype: 2, material: 25, ptcount: 3, cameratype: 0,
    points: Float32Array.from(xyz),
  };
}

function makeGrid(polys: WorldPoly[], cellDim = 100): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim, cellsX: 8, cellsZ: 8, originX: -4 * cellDim, originZ: -4 * cellDim };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}#${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

/** Signed distance of (x, z) from the plane through (px, pz) with horizontal normal (nx, nz), on the start's side. */
function keep(x: number, z: number, px: number, pz: number, nx: number, nz: number, sign: number): number {
  return sign * ((x - px) * nx + (z - pz) * nz);
}

describe('a synthetic crate of zero-thickness faces', () => {
  const WALL = 50;
  const crate = (): Grid => makeGrid([
    floor(-80, -80, 80, 80, 0),
    wallX(WALL, -20, 20, 0, 30),
    wallX(10, -20, 20, 0, 30),
    // the seam: two triangles sharing the vertical edge the travel aims at (z = 0)
  ]);
  const seam = (): Grid => makeGrid([
    floor(-80, -80, 80, 80, 0),
    tri('worldmodel/seam-a', [WALL, 0, -8, WALL, 0, 0, WALL, 30, 0]),
    tri('worldmodel/seam-b', [WALL, 0, 0, WALL, 0, 8, WALL, 30, 0]),
  ]);
  const face = (): Walker => {
    const w = new Walker(crate());
    w.place(20, 10, 0);
    w.state.yaw = facing(20, 0, WALL, 0);
    return w;
  };

  it('a run into a long thin face stops at the class radius and does not cross', () => {
    const w = face();
    for (let i = 0; i < 180; i++) w.tick(FORWARD);
    expect(w.state.x).toBeLessThan(WALL);
    expect(WALL - w.state.x).toBeGreaterThanOrEqual(BODY_RADIUS - 0.05);
    expect(WALL - w.state.x).toBeLessThan(BODY_RADIUS + 0.15);
    expect(w.state.y).toBeCloseTo(0, 3);
  });

  it('a dive into the same face keeps the centre on the near side', () => {
    const grid = crate();
    const polys = [floor(-80, -80, 80, 80, 0), wallX(WALL, -20, 20, 0, 30)];
    const w = new Walker(grid);
    const t = new Traversal(grid, polys);
    w.driver = t;
    w.place(20, 10, 0);
    w.state.yaw = facing(20, 0, WALL, 0);
    for (let i = 0; i < 90 && Math.hypot(w.state.vx, w.state.vz) < 40 && w.state.x < WALL - 16; i++) w.tick(FORWARD);
    expect(Math.hypot(w.state.vx, w.state.vz)).toBeGreaterThan(30);
    expect(t.dive(w)).toBe(true);
    let nearest = WALL - w.state.x;
    for (let i = 0; i < 400 && t.inDive(); i++) {
      w.tick(FORWARD);
      nearest = Math.min(nearest, WALL - w.state.x);
      expect(w.state.x, 'dive centre').toBeLessThan(WALL);
    }
    const across = WALL_PROBE_READING.prone.r * PRONE_FAN_READING.across;
    expect(nearest).toBeGreaterThanOrEqual(across - 0.25);
    expect(nearest).toBeLessThan(12);
  });

  it('one large tick (a tab stall) at run speed does not step through', () => {
    const w = face();
    for (let i = 0; i < 90 && w.state.x < WALL - 20; i++) w.tick(FORWARD);
    expect(Math.hypot(w.state.vx, w.state.vz)).toBeGreaterThan(60);
    // place() would zero the velocity. Stand the feet back and keep the run.
    w.state.x = WALL - 12;
    w.state.z = 0;
    w.tick(FORWARD, 0.5);
    expect(w.state.x).toBeLessThan(WALL);
    expect(WALL - w.state.x).toBeGreaterThanOrEqual(BODY_RADIUS - 0.05);
  });

  it('a knock at 100 units a second does not cross the face', () => {
    const w = face();
    w.state.x = WALL - 10;
    expect(w.knock([80, 0, 0], 'fallForward')).toBe(true);
    let nearest = WALL - w.state.x;
    for (let i = 0; i < 40; i++) {
      w.tick(STILL);
      nearest = Math.min(nearest, WALL - w.state.x);
      expect(w.state.x).toBeLessThan(WALL);
    }
    expect(nearest).toBeGreaterThanOrEqual(BODY_RADIUS - 0.25);
  });

  it('a centre already on the face is stood off on the side it was moving from, not pushed through', () => {
    const w = new Walker(crate());
    expect(w.place(WALL, 10, 0)).toBe(true);
    w.glide(2, 0);
    expect(w.state.x).toBeLessThan(WALL);
    expect(WALL - w.state.x).toBeGreaterThanOrEqual(BODY_RADIUS - 0.05);
  });

  it('a centre already inside the radius, whose step would finish past the face, is stood off', () => {
    const w = new Walker(crate());
    expect(w.place(WALL - 0.4, 10, 0)).toBe(true);
    w.glide(1, 0);
    expect(w.state.x).toBeLessThan(WALL);
    expect(WALL - w.state.x).toBeGreaterThanOrEqual(BODY_RADIUS - 0.05);
  });

  it('a step through the shared vertex of two triangles does not tunnel', () => {
    const w = new Walker(seam());
    expect(w.place(WALL - 0.4, 10, 0)).toBe(true);
    w.glide(1, 0);
    expect(w.state.x).toBeLessThan(WALL);
    expect(WALL - w.state.x).toBeGreaterThanOrEqual(BODY_RADIUS - 0.05);
  });

  it('a run aimed at that vertex stops on the near side', () => {
    const w = new Walker(seam());
    w.place(20, 10, 0);
    w.state.yaw = facing(20, 0, WALL, 0);
    for (let i = 0; i < 180; i++) w.tick(FORWARD);
    expect(w.state.x).toBeLessThan(WALL);
    expect(WALL - w.state.x).toBeGreaterThanOrEqual(BODY_RADIUS - 0.05);
  });

  it('a face that ends on the 6.5 line is climbed, not a wall: the kerb of exactly step_height (walk.test.ts)', () => {
    const w = new Walker(makeGrid([floor(-80, -80, 80, 80, 0), wallX(WALL, -20, 20, 0, wallProbeHeights('stand')[0]), floor(WALL, -20, 80, 20, wallProbeHeights('stand')[0])]));
    w.place(20, 10, 0);
    w.state.yaw = facing(20, 0, WALL, 0);
    for (let i = 0; i < 180; i++) w.tick(FORWARD);
    expect(w.state.x).toBeGreaterThan(WALL + 2);
    expect(w.state.y).toBeCloseTo(wallProbeHeights('stand')[0], 3);
  });

  it('a face that ends under the 6.5 line is walked through: the original segment misses it too (research 217 s2.2)', () => {
    const top = wallProbeHeights('stand')[0] - 0.5;
    const w = new Walker(makeGrid([floor(-80, -80, 80, 80, 0), wallX(WALL, -20, 20, 0, top)]));
    w.place(20, 10, 0);
    w.state.yaw = facing(20, 0, WALL, 0);
    for (let i = 0; i < 120; i++) w.tick(FORWARD);
    expect(w.state.x).toBeGreaterThan(WALL + 5);
  });

  it('slides along a thin face', () => {
    const w = new Walker(crate());
    w.place(WALL - BODY_RADIUS, 10, -8);
    w.state.yaw = facing(0, -8, 0, 8);
    for (let i = 0; i < 45; i++) w.tick(FORWARD);
    expect(w.state.z).toBeGreaterThan(-2);
    expect(w.state.x).toBeLessThan(WALL);
    expect(WALL - w.state.x).toBeGreaterThanOrEqual(BODY_RADIUS - 0.2);
  });

  it('a face on a grid-cell boundary is still in the ring the step queries', () => {
    const w = new Walker(makeGrid([floor(-80, -80, 80, 80, 0), wallX(0, -20, 20, 0, 30)], 100));
    w.place(-12, 10, 0);
    w.state.yaw = facing(-12, 0, 0, 0);
    for (let i = 0; i < 120; i++) w.tick(FORWARD);
    expect(w.state.x).toBeLessThan(0);
    expect(-w.state.x).toBeGreaterThanOrEqual(BODY_RADIUS - 0.05);
  });
});

interface Spot {
  path: string;
  nx: number; nz: number;
  /** Unit tangent of the face in xz, and the face's extent along it about (px, pz). */
  tx: number; tz: number;
  minT: number; maxT: number;
  px: number; pz: number;
  y: number;
  x: number; z: number;
  span: number;
}

/** A tall, single-plane wall with a flat run-up, so the walk meets the face and not a crack or a step. */
function findThin(grid: Grid, polys: readonly WorldPoly[], ban: RegExp): Spot {
  const spots: Spot[] = [];
  const why = { walls: 0, steep: 0, thick: 0, short: 0, narrow: 0, floor: 0 };
  for (const p of polys) {
    if (!isWallSurface(p) || ban.test(p.path)) continue;
    why.walls++;
    const n = polygonNormal(p.points);
    if (!n || Math.abs(n[1]) > 0.35) { why.steep++; continue; }
    const h = Math.hypot(n[0], n[2]);
    if (h < 1e-6) { why.steep++; continue; }
    const nx = n[0] / h, nz = n[2] / h;
    let minS = Infinity, maxS = -Infinity, minY = Infinity, maxY = -Infinity, px = 0, pz = 0, span = 0;
    const count = p.points.length / 3;
    for (let i = 0; i < count; i++) {
      const x = p.points[i * 3]!, y = p.points[i * 3 + 1]!, z = p.points[i * 3 + 2]!;
      const s = x * nx + z * nz;
      if (s < minS) minS = s;
      if (s > maxS) maxS = s;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      px += x; pz += z;
    }
    px /= count; pz /= count;
    if (maxS - minS > 0.2) { why.thick++; continue; }
    if (maxY - minY < 12) { why.short++; continue; }
    const tx = -nz, tz = nx;
    let minT = Infinity, maxT = -Infinity;
    for (let i = 0; i < count; i++) {
      const x = p.points[i * 3]!, z = p.points[i * 3 + 2]!;
      const t = (x - px) * tx + (z - pz) * tz;
      if (t < minT) minT = t;
      if (t > maxT) maxT = t;
      span = Math.max(span, Math.hypot(x - px, z - pz));
    }
    if (maxT - minT < 8) { why.narrow++; continue; }
    let placed = false;
    for (const s of [1, -1] as const) {
      for (const dist of [8, 12, 18]) {
        const x = px + s * nx * dist, z = pz + s * nz * dist;
        const x2 = px + s * nx * 3, z2 = pz + s * nz * 3;
        const a = selectFloor(probeGround(grid, x, z), minY + 8, minY);
        const b = selectFloor(probeGround(grid, x2, z2), minY + 8, minY);
        if (!a || !b || Math.abs(a.y - b.y) > 2) continue;
        // The low probe (feet + 6.5) has to meet the face; the head line too when the face is tall enough.
        if (minY > a.y + 6.5 || maxY < a.y + 6.5) continue;
        spots.push({ path: p.path, nx: s * nx, nz: s * nz, tx, tz, minT, maxT, px, pz, y: a.y, x, z, span });
        placed = true;
        break;
      }
      if (placed) break;
    }
    if (!placed) why.floor++;
  }
  // The longest face, then the path, so the walk is into a wall and not around a sliver. Stable.
  spots.sort((a, b) => b.span - a.span || a.path.localeCompare(b.path) || a.px - b.px || a.pz - b.pz);
  const spot = spots[0];
  if (!spot) throw new Error(`no tall thin face with a flat run-up (${JSON.stringify(why)}, polys ${polys.length})`);
  return spot;
}

function assertAgainst(grid: Grid, polys: readonly WorldPoly[], spot: Spot, label: string): void {
  const sign = Math.sign((spot.x - spot.px) * spot.nx + (spot.z - spot.pz) * spot.nz);
  expect(sign, label).not.toBe(0);
  const w = new Walker(grid);
  expect(w.place(spot.x, spot.y + 30, spot.z), `${label} place`).toBe(true);
  w.state.yaw = facing(spot.x, spot.z, spot.px, spot.pz);
  let nearest = Infinity;
  const inFace = (x: number, z: number): boolean => {
    const along = (x - spot.px) * spot.tx + (z - spot.pz) * spot.tz;
    return along >= spot.minT - 0.5 && along <= spot.maxT + 0.5;
  };
  for (let i = 0; i < 200; i++) {
    w.tick(FORWARD);
    const d = keep(w.state.x, w.state.z, spot.px, spot.pz, spot.nx, spot.nz, sign);
    // Past either end the body may walk around the finite face. In front of it, the centre stays off the plane.
    if (!inFace(w.state.x, w.state.z)) continue;
    nearest = Math.min(nearest, d);
    expect(d, `${label} run ${spot.path}`).toBeGreaterThan(0.05);
  }
  expect(nearest, `${label} reached ${spot.path} at (${spot.x.toFixed(1)}, ${spot.y.toFixed(1)}, ${spot.z.toFixed(1)})`).toBeLessThan(BODY_RADIUS + 1.5);
  expect(nearest).toBeGreaterThanOrEqual(BODY_RADIUS - 0.3);

  const stall = new Walker(grid);
  expect(stall.place(spot.x, spot.y + 30, spot.z)).toBe(true);
  stall.state.yaw = w.state.yaw;
  // Eight units off the face, one half-second tick: a tab stall at the stick.
  const ux = spot.nx * sign, uz = spot.nz * sign;
  stall.state.x = spot.px + ux * 8;
  stall.state.z = spot.pz + uz * 8;
  stall.tick(FORWARD, 0.5);
  const stalled = keep(stall.state.x, stall.state.z, spot.px, spot.pz, spot.nx, spot.nz, sign);
  expect(stalled, `${label} large dt`).toBeGreaterThan(0.05);

  const gridDive = grid;
  const diver = new Walker(gridDive);
  const traversal = new Traversal(gridDive, polys);
  diver.driver = traversal;
  expect(diver.place(spot.x, spot.y + 30, spot.z)).toBe(true);
  diver.state.yaw = facing(spot.x, spot.z, spot.px, spot.pz);
  for (let i = 0; i < 80 && Math.hypot(diver.state.vx, diver.state.vz) < 36; i++) diver.tick(FORWARD);
  expect(traversal.dive(diver), `${label} dive`).toBe(true);
  let diveNear = Infinity;
  for (let i = 0; i < 400 && traversal.inDive(); i++) {
    diver.tick(FORWARD);
    const d = keep(diver.state.x, diver.state.z, spot.px, spot.pz, spot.nx, spot.nz, sign);
    if (!inFace(diver.state.x, diver.state.z)) continue;
    diveNear = Math.min(diveNear, d);
    expect(d, `${label} dive ${spot.path}`).toBeGreaterThan(0.05);
  }
  expect(diveNear, `${label} dive reached`).toBeLessThan(12);
  expect(diveNear).toBeGreaterThanOrEqual(WALL_PROBE_READING.prone.r * PRONE_FAN_READING.across - 0.4);
}

const MAPS: { archive: string; name: string; ban: RegExp }[] = [
  { archive: 'MP6', name: 'Desert Glory', ban: /door/i },
  { archive: 'MP72', name: 'Crossroads', ban: /door|di_ext16_19|di_stair/i },
  { archive: 'MP2', name: 'Frostfire', ban: /door/i },
];

for (const map of MAPS) {
  const bytes = fixture(`RUN/${map.archive}.ZDB`);
  describe.skipIf(!bytes)(`${map.name} (${map.archive}) thin face${bytes ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
    let grid: Grid;
    let polys: WorldPoly[];
    let spot: Spot;
    beforeAll(() => {
      const sim = simMapFromBytes(bytes!, `RUN/${map.archive}.ZDB`);
      polys = groundPolygons(sim.ground);
      grid = groundGrid(sim.ground);
      spot = findThin(grid, polys, map.ban);
      // The report's browser steps quote this line.
      console.info(`THIN ${map.archive} ${spot.path} face=(${spot.px.toFixed(2)}, ${spot.pz.toFixed(2)}) stand=(${spot.x.toFixed(2)}, ${spot.y.toFixed(2)}, ${spot.z.toFixed(2)}) n=(${spot.nx.toFixed(3)}, ${spot.nz.toFixed(3)})`);
    }, 180_000);

    it('a run, a half-second tick and a dive do not cross the face', () => {
      // Locked so the browser steps stay the spot this test walks. A longer face would be a different wall.
      const locked: Record<string, { path: string; x: number; y: number; z: number }> = {
        MP6: { path: 'worldmodel/garage', x: 2089, y: 60, z: 1890.5 },
        MP72: { path: 'worldmodel/wc39/di_all39', x: 516.36, y: 122.79, z: 1692 },
        MP2: { path: 'worldmodel/warehouse/wintdi', x: 773, y: 100, z: 942.25 },
      };
      const want = locked[map.archive]!;
      expect(spot.path).toBe(want.path);
      expect(spot.x).toBeCloseTo(want.x, 1);
      expect(spot.y).toBeCloseTo(want.y, 1);
      expect(spot.z).toBeCloseTo(want.z, 1);
      assertAgainst(grid, polys, spot, map.archive);
    }, 180_000);
  });
}

const MP7 = fixture('RUN/MP7.ZDB');
describe.skipIf(!MP7)(`Night Stalker (MP7) thin face${MP7 ? '' : ` (needs disc reading: RUN/MP7.ZDB is not in test-fixtures; re-read one tall isWallSurface face in groundPolygons / FUN_0054aa30 D:L414515 and FUN_005483d0 D:L413380 once the disc is present)`}`, () => {
  it('walks a tall thin face from the disc', () => {
    const sim = simMapFromBytes(MP7!, 'RUN/MP7.ZDB');
    const polys = groundPolygons(sim.ground);
    const grid = groundGrid(sim.ground);
    assertAgainst(grid, polys, findThin(grid, polys, /door/i), 'MP7');
  }, 180_000);
});
