// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import {
  applyR0004MapPatch, bitsToFloat, collisionOwners, flattenScene, parseSceneGraph, R0004_CRATE_CAP_COUNT_READING, R0004_MAP_EDITS,
  R0004_WORLD_FRAME_BOXES_READING, worldCollision, type R0004Op, type SceneNode,
} from '../src/index';
import { chopF32 } from '../src/grid';

/**
 * R4B-09 (G1, research 383), dev-disc: r0004's per-map collision edits on r0001's own maps (`SOCOM_DISC`, skipped
 * without it, a skip being said). Per map: every node the routines look up is there; every snap box and index store
 * hits real r0001 vertices (the plan's first item) -- but for the three boxes written in world coordinates, which hit
 * nothing in the stored (node-local) points the code compares (`R0004_WORLD_FRAME_BOXES_READING`); the hull grows by
 * what the table adds; each edit's effect holds where it lands (a hidden node out of the probe, a moved prop at its
 * place, a rewritten word); and the disc has no switched-off node above a polygon, so `flattenScene`'s inherited switch
 * changes nothing on it.
 */
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC, 'RUN') : '';
const have = (stem: string): boolean => !!DISC && existsSync(resolve(DISC, `${stem}.ZDB`));

/** The hull's growth per map: new polygons, mp61's 11, MP72's two crate caps, and mp51's / mp62's list overwrites. */
const GROWTH: Record<string, number> = {
  mp11: 11, mp10: 1, mp12: 9, mp1: 5, mp51: 112, mp52: 5, mp5: 2, mp61: 75, mp62: 19, mp64: 3, mp6: 15, mp71: 1, mp72: 18,
  mp73: 4, mp81: 2, mp82: 18, mp83: 8, mp2: 3, mp8: 11, mp9: 6, m52: 8, m61: 0, m73: 1,
};

function graphs(stem: string): { base: SceneNode[]; models: SceneNode[] } {
  const bytes = new Uint8Array(readFileSync(resolve(DISC, `${stem}.ZDB`)));
  const toc = parseZdb(bytes);
  const read = (): SceneNode[] => parseSceneGraph(Zar.parse(zdbMember(bytes, toc, `${stem}_GEO.ZED`)));
  return { base: read(), models: read() };
}

for (const [id, edits] of Object.entries(R0004_MAP_EDITS)) {
  const stem = id.toUpperCase();
  const ops = edits.ops;   // the entry from the loop, not `R0004_MAP_EDITS[id]!` in the factory (BL-7, skipIfFactories)
  describe.skipIf(!have(stem))(`R4B-09 on ${stem}${have(stem) ? '' : ' (SOCOM_DISC absent: skipped)'}`, () => {
    const { base, models } = have(stem) ? graphs(stem) : { base: [], models: [] };
    const report = have(stem) ? applyR0004MapPatch(models, stem) : { level: id, id: null, applied: [] };

    it('matches its own entry of the chain', () => {
      expect(report.id).toBe(id);
      expect(report.applied).toHaveLength(ops.length);
    });

    it('finds every node it names (MP82\'s two nodes under "mp5" aside: a weapon model, not in the map\'s graph)', () => {
      const missing = report.applied.filter((a) => a.nodes.length === 0 && !['stray', 'noop', 'render'].includes(a.op)).map((a) => `${a.op}@${a.pcs[0]}`);
      expect(missing).toEqual(id === 'mp82' ? ['addNode@0x2e6e90', 'addNode@0x2e71fc'] : []);
    });

    it('each snap box and index store moves real r0001 vertices, but for the world-coordinate boxes', () => {
      const idle = report.applied.filter((a) => (a.op === 'snap' || a.op === 'point') && a.changed === 0).map((a) => a.pcs[0]);
      expect(idle).toEqual(R0004_WORLD_FRAME_BOXES_READING.filter((b) => b.map === id).map((b) => b.pc));
    });

    it('grows the hull by what the table adds', () => {
      expect(worldCollision(models).length - worldCollision(base).length).toBe(GROWTH[id]);
    });

    it('has no switched-off node above a polygon as read (the inherited switch is a no-op on the disc)', () => {
      expect(flattenScene(base).filter((f) => f.flags !== f.node.flags)).toEqual([]);
    });

    it('puts every new polygon where the table says, in its parent\'s frame', () => {
      const placed = new Map<string, Float32Array[]>();
      for (const f of flattenScene(models)) if (/r0004@/.test(f.node.name)) placed.set(f.path, f.node.collision.map((p) => p.points));
      const want = ops.flatMap((o) => (o.op === 'addNode' && 'name' in o.parent && !(id === 'mp82' && o.parent.name === 'mp5') ? o.polys : []));
      const got = [...placed].filter(([path]) => !/crate_bananas_stacked4\/r0004@/.test(path)).flatMap(([, p]) => p);
      const key = (p: number[]): string => p.join(',');
      expect(got.map((p) => key(Array.from(p))).sort()).toEqual(want.map((p) => key(p.points.map(bitsToFloat))).sort());
    });

    if (id === 'mp2') {
      it('hangs its new node in the world\'s frame, not its terrain model\'s (960, 0, 800): a corner meets the barracks\' (617, 142, 961)', () => {
        const corner = worldCollision(models).find((p) => /r0004@/.test(p.path))!.points.slice(0, 3);
        expect(Array.from(corner)).toEqual([617, 142, 961]);
        const barracks = worldCollision(base).filter((p) => p.path.startsWith('worldmodel/barracks'));
        expect(barracks.some((p) => { for (let i = 0; i < p.points.length; i += 3) if (p.points[i] === 617 && p.points[i + 1] === 142 && p.points[i + 2] === 961) return true; return false; })).toBe(true);
      });
    }

    if (id === 'mp72') {
      it(`caps each of the world root's direct crate_bananas_stacked4 children: ${R0004_CRATE_CAP_COUNT_READING} on r0001's MP72`, () => {
        // Under each crate (r4 0x2d719c: `AddChild` on the crate), at the identity in its frame: the crate's world.
        const caps = flattenScene(models).filter((f) => f.path === 'worldmodel/crate_bananas_stacked4/r0004@0x2d7180');
        expect(caps).toHaveLength(R0004_CRATE_CAP_COUNT_READING);
        const crates = base.find((m) => m.name === 'worldmodel')!.children.filter((c) => c.name === 'crate_bananas_stacked4');
        caps.forEach((cap, i) => expect(Array.from(cap.world, (v) => v + 0)).toEqual(Array.from(crates[i]!.matrix, (v) => v + 0)));
      });
      it('switches off the one basket_open_up at (825.74, 46.02, 2038.16), and di_roof22 is no longer a floor (ditype 2)', () => {
        const off = collisionOwners(models).filter((o) => (o.flags! & 1) === 0).map((o) => o.path);
        expect(off).toEqual(['worldmodel/basket_open_up', 'worldmodel/basket_open_up=basket_open_up']);
        expect(worldCollision(models).filter((p) => p.path === 'worldmodel/wc22/di_roof22').every((p) => p.ditype === 2)).toBe(true);
      });
    }

    if (id === 'mp71') {
      it('switches off b1 and the two barrels under it', () => {
        const off = collisionOwners(models).filter((o) => (o.flags! & 1) === 0).map((o) => o.path);
        expect(off.length).toBeGreaterThan(0);
        expect(off.every((p) => p.startsWith('worldmodel/b1/'))).toBe(true);
        expect(collisionOwners(base).filter((o) => o.path.startsWith('worldmodel/b1/')).map((o) => o.path)).toEqual(off);
      });
    }

    if (id === 'mp73') {
      it('switches off the six room_chair01 under comm_low, mywc20 and wall_breaker/good -- not comm_hi\'s two', () => {
        const off = new Set(collisionOwners(models).filter((o) => (o.flags! & 1) === 0).map((o) => o.path.replace(/=.*$/, '')));
        expect([...off].sort()).toEqual(['worldmodel/comm_low/room_chair01', 'worldmodel/mywc20/room_chair01', 'worldmodel/wall_breaker/good/room_chair01']);
        const hidden = report.applied.filter((a) => a.op === 'hide').flatMap((a) => a.nodes);
        expect(hidden).toHaveLength(6);
      });
    }

    if (id === 'mp51') {
      it('moves the sandbag turret by (-3.331, -0.083, +3.854) and sets the two barrels\' places; the roof lists ground_wc06\'s polygons', () => {
        const at = (g: SceneNode[], path: string): number[] => Array.from(flattenScene(g).find((f) => f.path === path)!.world.slice(12, 15));
        const was = at(base, 'worldmodel/wc06/sandbag_turret'), now = at(models, 'worldmodel/wc06/sandbag_turret');
        expect(now.map((v, i) => Math.round((v - was[i]!) * 1000) / 1000)).toEqual([-3.331, -0.083, 3.854]);
        expect(at(models, 'worldmodel/wc13/wood_barrel')).toEqual([0x4460fea8, 0x42216c8b, 0x443a8fcf].map(bitsToFloat));
        expect(at(models, 'worldmodel/wc24/wood_barrel')).toEqual([0x4393770a, 0x42f10000, 0x44a8a385].map(bitsToFloat));
        const node = (path: string[]): SceneNode => path.reduce<SceneNode>((n, name) => n.children.find((c) => c.name === name)!, models.find((m) => m.name === 'worldmodel')!);
        const roof = node(['wc18', 'di_roof_h02_2']), ground = node(['wc06', 'ground_wc06']);
        expect(roof.collision).toHaveLength(ground.collision.length);
        expect(roof.collision.every((p, i) => p === ground.collision[i])).toBe(true);
        expect(roof.stopAtFirstHit).toBe(true);                                  // ground_wc06's byte, the constructor's 1
      });
    }

    if (id === 'mp61') {
      it('appends the 11 polygons to di_ext01 after its own, bit for bit', () => {
        const di = flattenScene(models).find((f) => f.node.name === 'di_ext01')!.node.collision;
        const added = ops.flatMap((o) => (o.op === 'addPolys' ? o.polys : []));
        expect(di.slice(-11).map((p) => Array.from(p.points))).toEqual(added.map((p) => p.points.map(bitsToFloat)));
      });
    }

    if (id === 'mp1' || id === 'mp82' || id === 'mp8' || id === 'mp62') {
      it('rewrites the surface words with the code\'s masks', () => {
        const words = ops.filter((o): o is Extract<R0004Op, { op: 'word' }> => o.op === 'word');
        for (const w of words) {
          const a = report.applied.find((x) => x.pcs[0] === w.pcs[0] && x.op === 'word')!;
          expect(a.changed).toBeGreaterThan(0);
        }
        const polys = worldCollision(models);
        // The "before" the cluster note left unread, from the disc: the doors' WOOD_THICK (19), g11986's map default (0),
        // climber1's appflags 4, di3's inside 1, di_roof22's eight ditype-3 floors.
        if (id === 'mp1') expect(polys.filter((p) => /alaska4d_outhouse_door\/dipoly$/.test(p.path)).map((p) => p.material)).toEqual(Array(10).fill(20));
        if (id === 'mp82') expect(polys.filter((p) => p.path === 'worldmodel/g11986').map((p) => p.material)).toEqual([3, 3, 3, 3]);
        if (id === 'mp8') expect(polys.filter((p) => p.path === 'worldmodel/land43/climber1').every((p) => p.appflags === 0)).toBe(true);
        if (id === 'mp62') expect(polys.filter((p) => p.path === 'worldmodel/di3' || p.path === 'worldmodel/di2').every((p) => p.inside === 0)).toBe(true);
      });
    }

    if (id === 'm52') {
      it('lowers one vertex by each of its two boxes, the else-if\'s included (r4 0x2e694c, 0x2e69c0): both match on r0001', () => {
        const node = flattenScene(models).find((f) => f.path === 'worldmodel/wc3/g21955')!.node;
        const was = flattenScene(base).find((f) => f.path === 'worldmodel/wc3/g21955')!.node;
        const moved: number[][] = [];
        node.collision.forEach((p, i) => { for (let v = 0; v < p.points.length; v += 3) if (p.points[v + 2] !== was.collision[i]!.points[v + 2]) moved.push([p.points[v]!, was.collision[i]!.points[v + 2]!, p.points[v + 2]!]); });
        const xs = [...new Set(moved.map((m) => Math.round(m[0]!)))].sort();
        expect(xs).toEqual([4529, 4543]);
        for (const [, z0, z1] of moved) expect(z1).toBe(chopF32(z0! - Math.fround(0.1)));
      });
    }

    if (id === 'mp82') {
      it('rewrites only the first cam_di (FindByName\'s first match), already camera-only on r0001: a no-op on the disc', () => {
        const was = worldCollision(base).filter((p) => p.path === 'worldmodel/wc/cam_di').map((p) => p.cameratype);
        const now = worldCollision(models).filter((p) => p.path === 'worldmodel/wc/cam_di').map((p) => p.cameratype);
        expect(was).toEqual([...Array(6).fill(1), ...Array(6).fill(0), ...Array(6).fill(1), ...Array(6).fill(0)]);
        expect(now).toEqual(was);
        expect(report.applied.find((a) => a.pcs[0] === '0x2e6d44')!.nodes).toEqual(['worldmodel/wc/cam_di']);
      });
    }

  });
}
