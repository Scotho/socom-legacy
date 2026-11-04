/**
 * Local geometry/timeline measurements for the Suppression-map audit (research 101).
 * npx tsx tools/probe-suppression-mechanics.ts
 * No asset extraction. Segment openings are not player-capsule or original-game parity tests.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Zar, parseZdb, zdbMember } from '@s2u/archive';
import {
  buildGrid, collisionOwners, flattenScene, parseAnimSets, parseGridParams, parseSceneGraph,
  segmentHits, surfaceWord, SURFACE_SKIP, worldCollision, type Vec3,
} from '@s2u/scene';

const web = resolve(import.meta.dirname, '..');
const rounded = (v: Vec3): number[] => v.map((x) => Math.round(x * 1000) / 1000);
const beneath = (path: string, root: string): boolean => path === root || path.startsWith(`${root}/`);
for (const stem of ['MP2', 'MP51', 'MP81']) {
  const path = ['public/maps/RUN', 'test-fixtures/RUN'].map((d) => resolve(web, d, `${stem}.ZDB`)).find(existsSync);
  if (!path) throw new Error(`Missing local ${stem}.ZDB.`);
  const bytes = new Uint8Array(readFileSync(path)), toc = parseZdb(bytes);
  const member = (name: string): Zar => Zar.parse(zdbMember(bytes, toc, name));
  const models = parseSceneGraph(member(`${stem}_GEO.ZED`));
  const flat = flattenScene(models), polys = worldCollision(models), owners = collisionOwners(models);
  const grid = buildGrid(parseGridParams(member(`${stem}.ZED`)), [], [], polys, owners);
  const animations = parseAnimSets(member('MZANIM.ZAR')).sets.flatMap((s) => s.anims);
  const set = (root: string, active: boolean): void => {
    for (const o of owners) if (beneath(o.path, root)) o.flags = active ? (o.flags ?? 0) | 1 : (o.flags ?? 0) & ~1;
  };
  const barriers = stem === 'MP2'
    ? owners.filter((o) => o.path.endsWith('/door_slab/pane1')).map((o) => ({ root: o.path, good: o.path, bad: null }))
    : stem === 'MP51' ? flat.filter((f) => /^worldmodel\/access[1-5]=access[1-5]$/.test(f.path))
      .map((f) => ({ root: f.path, good: `${f.path}/good_parts`, bad: `${f.path}/whats_left` })) : [];
  for (const b of barriers) { set(b.good, true); if (b.bad) set(b.bad, false); set(`${b.root}/bad_parts`, false); }

  for (const b of barriers) {
    const targetOwners = owners.filter((o) => beneath(o.path, b.good));
    let witness: { from: number[]; to: number[]; intactHits: number; destroyedHits: number } | null = null;
    // Find a short segment crossing an authored vertical face that becomes clear after the state swap.
    // Searching each face avoids assuming the node's origin sits in the opening.
    outer: for (const o of targetOwners) for (let i = o.first; i < o.first + o.count; i++) {
      const p = polys[i]!;
      if ((surfaceWord(p) & SURFACE_SKIP) !== 0 || p.points.length < 9) continue;
      const a: Vec3 = [p.points[0]!, p.points[1]!, p.points[2]!];
      const u: Vec3 = [p.points[3]! - a[0], p.points[4]! - a[1], p.points[5]! - a[2]];
      const v: Vec3 = [p.points[6]! - a[0], p.points[7]! - a[1], p.points[8]! - a[2]];
      const cross: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const length = Math.hypot(...cross);
      if (length < 1e-6 || Math.abs(cross[1] / length) > 0.5) continue;
      const n = cross.map((x) => x / length) as Vec3;
      const centre: Vec3 = [0, 0, 0];
      for (let j = 0; j < p.points.length; j++) centre[j % 3]! += p.points[j]! / (p.points.length / 3);
      for (const distance of [8, 4, 12, 2]) {
        const from = centre.map((x, j) => x - n[j]! * distance) as Vec3;
        const to = centre.map((x, j) => x + n[j]! * distance) as Vec3;
        set(b.good, true); if (b.bad) set(b.bad, false);
        const intact = segmentHits(grid, from, to, (q) => (surfaceWord(q) & SURFACE_SKIP) === 0);
        set(b.good, false); if (b.bad) set(b.bad, true);
        const destroyed = segmentHits(grid, from, to, (q) => (surfaceWord(q) & SURFACE_SKIP) === 0);
        if (intact.some((h) => beneath(h.owner.path, b.good)) && destroyed.length === 0) {
          witness = { from: rounded(from), to: rounded(to), intactHits: intact.length, destroyedHits: destroyed.length };
          break outer;
        }
      }
    }
    console.log(JSON.stringify({ archive: stem, root: b.root,
      healthyPolygons: targetOwners.reduce((n, o) => n + o.count, 0),
      destroyedPolygons: b.bad ? owners.filter((o) => beneath(o.path, b.bad!)).reduce((n, o) => n + o.count, 0) : 0,
      localOpeningWitness: witness,
    }));
    set(b.good, true); if (b.bad) set(b.bad, false);
  }
  if (stem === 'MP81') for (let i = 1; i <= 3; i++) {
    const name = `translate_hook_${i}`, animation = animations.find((a) => a.name === name);
    if (!animation) throw new Error(`Missing ${name}.`);
    const commands = animation.sequences.flatMap((s) => s.commands).filter((c) => c.set === 0 && c.cmd === 22);
    console.log(JSON.stringify({ archive: stem, root: `worldmodel/hook${i}`,
      storedCollisionPolygons: owners.filter((o) => beneath(o.path, `worldmodel/hook${i}`)).reduce((n, o) => n + o.count, 0),
      // Retail FUN_0025fe70: offset at +0xc points to translation data, not the scale fields at +0x38/+0x44.
      translations: commands.map((c) => {
        const d = new DataView(c.bytes.buffer, c.bytes.byteOffset, c.bytes.byteLength), offset = d.getUint16(12, true);
        return { sequenceOffset: c.offset, flags: d.getUint16(4, true), seconds: d.getFloat32(52, true),
          translationOffset: offset,
          delta: [16, 20, 24].map((o) => d.getFloat32(offset + o, true)),
          rate: [28, 32, 36].map((o) => d.getFloat32(offset + o, true)),
        };
      }),
    }));
  }
}
