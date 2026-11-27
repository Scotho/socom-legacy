import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { flattenScene, hullModels, parseSceneGraph, parseWorldRoot, segmentHits, surfaceMaterial, turretSceneModels, worldCollision, type WorldPoly } from '@s2u/scene';
import { Walker } from '../src/mover';
import { fixture } from '../../archive/test/fixtures';
import { simMapFromBytes } from '../src/simMap';
import { roundAdmits } from '../src/round';

/**
 * LATER 1003 (seat 8a's census cc3, table X3; its skeptic's verdict `verdict-library-prototypes-turret-guns.md`): an instance
 * node whose model is not in the map's own GEO resolves, in the original, through every registered library
 * (`FUN_00310da0` D:L212317-212372 -> `FUN_00320f10` D:L221752-221773), and the instance is a full copy of that model, its
 * children's polygons with it (`FUN_00317d90` D:L216395-216438 -> `FUN_00316820` D:L215638-215791); the collision walk
 * reaches them (`FUN_002d3030` D:L175073-175074, D:L175383-175390). The port's hull is built from the map's own graph only,
 * so a placed turret keeps its instance node's 3 base polygons and loses the gun; a ledge turret keeps nothing.
 *
 * RED per class, the expectation taken from the production library join (`turretSceneModels`, the drawing's): every
 * polygon a ROUND stops on under the instance in the joined world -- admitted by the round's query (`roundAdmits`, as
 * `roundPath` asks it) and not INVISIBLE_DI, which a round passes by its penetration (the census's ROUND column) -- must be
 * met by a round's line through it on the map's own hull.
 */
function materialName(bytes: Uint8Array, stem: string): (m: number) => string {
  const toc = parseZdb(bytes);
  const def = parseWorldRoot(Zar.parse(zdbMember(bytes, toc, `${stem}.ZED`))).defaultMaterial;
  return (m) => surfaceMaterial(m, def).name;
}
function roundPolysUnder(bytes: Uint8Array, stem: string, prefix: string): WorldPoly[] {
  const toc = parseZdb(bytes), name = materialName(bytes, stem);
  const models = parseSceneGraph(Zar.parse(zdbMember(bytes, toc, `${stem}_GEO.ZED`)));
  const joined = turretSceneModels(bytes, toc, stem, models);
  return worldCollision(joined, 'worldmodel').filter((p) => p.path.startsWith(prefix) && roundAdmits(p) && name(p.material) !== 'INVISIBLE_DI');
}
/** A line through the polygon's centre along its normal, 20 u either side. */
function lineThrough(p: WorldPoly): [[number, number, number], [number, number, number]] {
  const n = p.points.length / 3, c = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) c[k] = c[k]! + p.points[i * 3 + k]! / n;
  const v = (i: number): number[] => [p.points[i * 3]!, p.points[i * 3 + 1]!, p.points[i * 3 + 2]!];
  const a = v(0), b = v(1), d = v(2);
  const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], w = [d[0]! - a[0]!, d[1]! - a[1]!, d[2]! - a[2]!];
  const nx = u[1]! * w[2]! - u[2]! * w[1]!, ny = u[2]! * w[0]! - u[0]! * w[2]!, nz = u[0]! * w[1]! - u[1]! * w[0]!;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [[c[0]! + 20 * nx / l, c[1]! + 20 * ny / l, c[2]! + 20 * nz / l], [c[0]! - 20 * nx / l, c[1]! - 20 * ny / l, c[2]! - 20 * nz / l]];
}

const cases = [
  // Class A, a placed turret: the gun's METAL_THICK parts (11 on RMG_turret) are in no hull; the base's 3 INVISIBLE_DI are.
  { stem: 'MP71', prefix: 'worldmodel/mp71_turret01/', what: 'class A: the placed RMG turret\'s gun', rounds: 11 },
  // Class B, a ledge turret: nothing of it is in the hull (13 METAL_THICK on LMG_turret_ledge). The disc only.
  { stem: 'MP53', prefix: 'worldmodel/mp53_turret1/', what: 'class B: the ledge LMG turret', rounds: 13 },
];
for (const c of cases) {
  const bytes = fixture(`RUN/${c.stem}.ZDB`);
  describe.skipIf(!bytes)(`LATER 1003 (dev-disc where not a committed fixture): ${c.stem} ${c.what}`, () => {
    it(`every polygon a round stops on under ${c.prefix} in the joined world is met by a round's line on the map's hull`, () => {
      const want = roundPolysUnder(bytes!, c.stem, c.prefix), name = materialName(bytes!, c.stem);
      expect(want.length, 'the library prototype\'s round-stopping polygons (its METAL_THICK parts)').toBe(c.rounds);
      const map = simMapFromBytes(bytes!, `RUN/${c.stem}.ZDB`);
      const missed = want.filter((p) => {
        const [a, b] = lineThrough(p);
        return !segmentHits(map.grid, a, b, roundAdmits).some((h) => h.poly.path.startsWith(c.prefix) && name(h.poly.material) !== 'INVISIBLE_DI');
      });
      expect(missed.length, `${c.stem}: round lines through ${c.prefix}'s parts that the hull lets pass`).toBe(0);
    });
  });
}

// Class B, the body: a ledge turret's base (3 INVISIBLE_DI polygons, which stop a body: the census's BODY column) is in no
// hull, so a body walks through it. From each side of the base on the base's own floor, a Walker walked at its centre must
// stop outside its box. Every ledge placement on the disc (census cc3 X3); a side whose floor is not the base's is skipped.
// Only MP52's second (from -z) is entered without the join; on the other seven something else stops the walk (unread).
const LEDGES: [string, string][] = [
  ['MP5', 'worldmodel/mp5_turret_rmg/'], ['MP52', 'worldmodel/mp52gren_turret_1/'], ['MP52', 'worldmodel/mp52gren_turret_2/'],
  ['MP53', 'worldmodel/mp53_turret1/'], ['MP53', 'worldmodel/mp53_turret2/'], ['MP53', 'worldmodel/mp53_turret3/'],
  ['MP61', 'worldmodel/mp61turret_1/'], ['MP73', 'worldmodel/mp73turret_1/'],
];
describe('LATER 1003 (dev-disc): class B: a body walked into a ledge turret’s base stops at it', () => {
  for (const [stem, prefix] of LEDGES) {
    const bytes = fixture(`RUN/${stem}.ZDB`);
    it.skipIf(!bytes)(`${stem} ${prefix}: the Walker never enters the base’s box`, () => {
      const name = materialName(bytes!, stem), toc = parseZdb(bytes!);
      const models = parseSceneGraph(Zar.parse(zdbMember(bytes!, toc, `${stem}_GEO.ZED`)));
      const base = worldCollision(turretSceneModels(bytes!, toc, stem, models), 'worldmodel')
        .filter((p) => p.path.startsWith(prefix) && name(p.material) === 'INVISIBLE_DI');
      expect(base.length).toBe(3);
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const p of base) for (let i = 0; i < p.points.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, p.points[i + k]!); hi[k] = Math.max(hi[k]!, p.points[i + k]!); }
      const cx = (lo[0]! + hi[0]!) / 2, cz = (lo[2]! + hi[2]!) / 2, reach = Math.max(hi[0]! - lo[0]!, hi[2]! - lo[2]!) / 2 + 15;
      const map = simMapFromBytes(bytes!, `RUN/${stem}.ZDB`);
      const entered: string[] = [], walked: string[] = [];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const w = new Walker(map.grid);
        if (!w.place(cx + dx! * reach, hi[1]! + 5, cz + dz! * reach) || Math.abs(w.state.y - lo[1]!) > 6) continue;
        walked.push(`${dx},${dz}`);
        for (let t = 0; t < 150; t++) {
          const ddx = cx - w.state.x, ddz = cz - w.state.z;
          w.state.yaw = Math.atan2(-ddx, -ddz) * 180 / Math.PI;
          w.tick({ forward: 1, right: 0, boost: false }, 1 / 30);
          if (w.state.x > lo[0]! + 0.5 && w.state.x < hi[0]! - 0.5 && w.state.z > lo[2]! + 0.5 && w.state.z < hi[2]! - 0.5) { entered.push(`${dx},${dz}`); break; }
        }
      }
      console.log(`LEDGE ${stem} ${prefix}: sides on the base's floor ${walked.join(' ') || 'none'}; entered ${entered.join(' ') || 'none'}`);
      expect(entered, `${stem} ${prefix}: sides from which the body entered the base's box`).toEqual([]);
    });
  }
});

// The census check (cc3 table X3, all 22 maps): the polygons the hull now holds under the library instances, beyond the
// instance nodes' own, are the census's "joining the libraries adds" figure, map by map -- 697 in all.
const CENSUS_ADDED: Record<string, number> = {
  MP1: 0, MP2: 0, MP5: 30, MP6: 0, MP7: 0, MP8: 0, MP9: 56, MP10: 28, MP11: 42, MP12: 0, MP51: 56, MP52: 143, MP53: 48,
  MP61: 42, MP62: 40, MP64: 42, MP71: 28, MP72: 30, MP73: 40, MP81: 0, MP82: 42, MP83: 30,
};
describe('LATER 1003 (dev-disc where not committed): the hull adds the census’s library polygons on every map', () => {
  for (const [stem, added] of Object.entries(CENSUS_ADDED)) {
    const bytes = fixture(`RUN/${stem}.ZDB`);
    it.skipIf(!bytes)(`${stem}: ${added} polygons joined under its library instances`, () => {
      const toc = parseZdb(bytes!);
      const models = parseSceneGraph(Zar.parse(zdbMember(bytes!, toc, `${stem}_GEO.ZED`)));
      const own = new Set(models.map((m) => m.name));
      const roots = flattenScene(models, 'worldmodel').filter((f) => f.node.modelName !== null && !own.has(f.node.modelName)).map((f) => f.path);
      const under = (path: string): boolean => roots.some((r) => path === r || path.startsWith(`${r}/`) || path.startsWith(`${r}=`));
      const before = worldCollision(models, 'worldmodel').filter((p) => under(p.path)).length;
      const after = worldCollision(hullModels(bytes!, toc, stem, models), 'worldmodel').filter((p) => under(p.path)).length;
      expect(after - before, `${stem}: the library polygons the hull gains`).toBe(added);
      const map = simMapFromBytes(bytes!, `RUN/${stem}.ZDB`);
      expect(map.ground.owners.filter((o) => under(o.path)).reduce((n, o) => n + o.count, 0), `${stem}: the room's hull holds them`).toBe(after);
    }, 120000);
  }
});
