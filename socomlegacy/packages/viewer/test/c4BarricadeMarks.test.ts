// @vitest-environment node
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { InstancedMesh, Matrix4, Mesh, Vector3, type BufferAttribute, type Object3D } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import { parseRdr, Zar } from '@s2u/archive';
import { gridCast, throwableRecord, type ThrowableRecord, type V3 } from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';
import { aimPick } from '../src/equipment';
import { Fire } from '../src/fire';
import { GrenadeThrower } from '../src/grenade';
import { loadMap, type LoadedMap } from '../src/loadMap';
import { groundGrid, groundPolygons } from '../src/mover';
import { under } from '../src/mapMeta';
import { MarkClipper } from '../src/markClip';
import { buildPageWorld } from '../src/matchWorld';
import { placeGround } from '../src/net/placing';
import { loadSimMap } from '../src/simMap';
import { buildWorld, type WorldView } from '../src/world';
import { forkGround, WorldState } from '../src/worldState';
import type { PlaySnapshot } from '../src/walk';

/**
 * OBF-22 (the owner, 2026-10-30: "have we tested c4 wall explosions"): on every MP map of the dev disc with a C4-breachable
 * access barricade (found as `c4Barricades.test.ts` finds them: the scene destructibles whose program names `access` and
 * which take C4's damage, `WorldState.health`), the page's own wiring -- the drawn world (`buildWorld`), the page's world
 * on its hull (`buildPageWorld`, its `visible` hook `WorldView.setNodeActive`), a bullet mark through `Fire` and the clip
 * -- and the C4 planted and fused through `GrenadeThrower` (`plantC4`, its fuse, the blast into `health.blastAt`): a mark
 * on the barricade's drawn piece goes when the piece does (LATER 277; `holdOnNode`), a mark on the world's wall beside it
 * stays. Dev-disc only (`SOCOM_DISC`; skipped -- and said so -- without it).
 */

const disc = process.env.SOCOM_DISC;
const MAPS = disc && existsSync(resolve(disc, 'RUN'))
  ? readdirSync(resolve(disc, 'RUN')).filter((n) => /^MP\d+\.ZDB$/i.test(n)).sort() : [];
const weapon = fixture('RUN/ZWEAPON.ZAR');
const step = (g: GrenadeThrower, seconds: number): void => { for (let t = 0; t < seconds; t += 1 / 60) g.update(1 / 60); };

interface Tri { centre: V3; normal: V3; area: number; path: string | null }

/** Each visible drawn triangle (world space) with its draw's path: a placement's, a switched chunk's, or null (the world). */
function triangles(group: Object3D, keep: (path: string | null, world: boolean) => boolean): Tri[] {
  const out: Tri[] = [];
  const v = [new Vector3(), new Vector3(), new Vector3()];
  const add = (mesh: Mesh, matrix: Matrix4, path: string | null): void => {
    const pos = mesh.geometry.getAttribute('position') as BufferAttribute | undefined;
    if (!pos || !mesh.geometry.getAttribute('color')) return;
    const idx = mesh.geometry.getIndex();
    const flip = matrix.determinant() < 0 ? -1 : 1;
    for (let t = 0; t < (idx ? idx.count : pos.count) / 3; t++) {
      for (let k = 0; k < 3; k++) v[k]!.fromBufferAttribute(pos, idx ? idx.getX(t * 3 + k) : t * 3 + k).applyMatrix4(matrix);
      const n = new Vector3().subVectors(v[1]!, v[0]!).cross(new Vector3().subVectors(v[2]!, v[0]!));
      const area = n.length() / 2;
      if (area < 1) continue;
      n.multiplyScalar(flip / (2 * area));
      const c = v[0]!.clone().add(v[1]!).add(v[2]!).divideScalar(3);
      out.push({ centre: [c.x, c.y, c.z], normal: [n.x, n.y, n.z], area, path });
    }
  };
  group.traverse((o) => {
    if (!(o instanceof Mesh) || !o.visible || o.name.endsWith('(flare)')) return;
    const parent = o.parent;
    if (parent instanceof Mesh && parent.geometry === o.geometry) return;           // a detail or reflection pass
    if (o instanceof InstancedMesh) {
      ((o.userData.nodePaths as string[] | undefined) ?? []).forEach((p, i) => {
        if (!keep(p, false)) return;
        const m = new Matrix4();
        o.getMatrixAt(i, m);
        if (m.elements[0] === 0 && m.elements[5] === 0 && m.elements[10] === 0) return;   // a hidden instance
        add(o, m.premultiply(o.matrixWorld), p);
      });
      return;
    }
    const path = (o.userData.nodePath ?? o.userData.switchPath ?? null) as string | null;
    const world = path === null && o.frustumCulled === false;
    if (keep(path, world)) add(o, o.matrixWorld, path);
  });
  return out;
}

interface Rig { map: LoadedMap; view: WorldView; world: WorldState; fire: Fire; clipper: MarkClipper; offs: string[]; aim: { eye: V3; far: V3 } }

async function rig(name: string): Promise<Rig> {
  const map = await loadMap(new FsAssetSource(disc!), `RUN/${name}`);
  const view = buildWorld(map);
  for (const task of [...view.revealWorld, ...view.revealProps]) task();
  view.group.updateMatrixWorld(true);
  const offs: string[] = [];
  const page = buildPageWorld(map, {
    setNodeActive: (path, on) => { if (!on) offs.push(path); view.setNodeActive(path, on); },
    sound: () => {}, effect: () => {}, log: () => {},
  })!;
  view.group.updateMatrixWorld(true);
  const clipper = new MarkClipper(view.group);
  const aim = { eye: [0, 0, 0] as V3, far: [0, 0, -1] as V3 };
  const fire = new Fire({
    grid: () => page.grid, aim: () => aim,
    attachToNode: (path, mark) => view.attachToNode(path, mark),
    holdOnNode: (path, gone) => view.holdOnNode(path, gone),
  }, undefined, undefined, () => 0.5);
  fire.setClip(clipper);
  return { map, view, world: page.world, fire, clipper, offs, aim };
}

/** A round square onto `t` from 20 units out: the mark made, where it hit and the node the clip filed it on; or null. */
function markOn(r: Rig, t: Tri): { mesh: Mesh; path: string | null } | null {
  const n = t.normal;
  r.aim.eye = [t.centre[0] + n[0] * 20, t.centre[1] + n[1] * 20, t.centre[2] + n[2] * 20];
  r.aim.far = [t.centre[0] - n[0] * 1000, t.centre[1] - n[1] * 1000, t.centre[2] - n[2] * 1000];
  const before = r.fire.state().decals;
  r.fire.update(1);
  if (!r.fire.shoot()) return null;
  const hit = r.fire.state().lastHit;
  if (!hit || Math.hypot(hit.point[0] - t.centre[0], hit.point[1] - t.centre[1], hit.point[2] - t.centre[2]) > 1.5) return null;
  if (r.fire.state().decals !== before + 1) return null;
  const shown = r.fire.decalMeshes();
  return { mesh: shown[shown.length - 1]!, path: r.clipper.lastNodePath };
}

/**
 * `c4Barricades.test.ts`'s centred breach: the first legal plant within half the blast radius of the barricade's hull
 * middle, approached towards that middle or one of its polygons' (the same search, its first accepted plant). The
 * map's default material is the sim map's (`LoadedMap` carries none), as `c4Barricades.test.ts` reads it.
 */
function plantAndFuse(r: Rig, record: ThrowableRecord, id: number, targetPath: string, defaultMaterial: string): V3 | null {
  const grid = r.world.grid, ground = r.world.ground, polys = groundPolygons(ground);
  const mine = ground.owners.filter((o) => under(o.path, targetPath)).flatMap((o) => polys.slice(o.first, o.first + o.count));
  const vertices = mine.flatMap((p) => Array.from(p.points));
  const centre = [0, 1, 2].map((a) => {
    const v = vertices.filter((_, i) => i % 3 === a);
    return (Math.min(...v) + Math.max(...v)) / 2;
  }) as V3;
  const targets = [centre, ...mine.map((p) => [0, 1, 2].map((a) => Array.from(p.points).filter((_, i) => i % 3 === a).reduce((x, y) => x + y, 0) / (p.points.length / 3)) as V3)];
  for (const distance of [15, 25, 30]) {
    for (let i = 0; i < targets.length * 32; i++) {
      const mid = targets[Math.floor(i / 32)]!;
      const angle = (i % 32) * Math.PI / 16, dx = Math.cos(angle), dz = Math.sin(angle);
      const eye: V3 = [mid[0] + dx * distance, mid[1], mid[2] + dz * distance];
      const floor = placeGround(gridCast(grid, defaultMaterial), eye);
      if (!floor) continue;
      const feet: V3 = [eye[0], floor.point[1], eye[2]];
      const far: V3 = [mid[0] - dx * 30, mid[1], mid[2] - dz * 30];
      const pick = aimPick(grid, eye, far, defaultMaterial);
      if (!pick || Math.hypot(...pick.point.map((v, a) => v - centre[a]!)) > record.explosionRadius / 2) continue;
      const g = new GrenadeThrower({
        grid: () => grid, view: () => 'third',
        snapshot: () => ({ feet, yaw: Math.atan2(dx, dz) * 180 / Math.PI, pitch: 0, stance: 'stand', airborne: false } as PlaySnapshot),
        aim: () => ({ eye, far }), handPoint: () => eye,
      });
      g.setRecords([record]); g.setWorld(() => r.world); g.setKit(['M67', 'AN-M8', 'C4']);
      step(g, 0.3);
      if (g.c4Target() !== id || !g.plantC4()) { g.clearAir(); continue; }
      const explosions: V3[] = [];
      g.on('explode', (e) => explosions.push(e.pos));
      step(g, record.fuse + 2);
      g.clearAir();
      for (let t = 0; t < 5; t += 1 / 60) r.world.step(1 / 60);       // the destroy program to its end
      return explosions[0] ?? null;
    }
  }
  return null;
}

describe.skipIf(!MAPS.length || !weapon)(`OBF-22: marks on C4-breached barricades, every MP map (dev disc)${MAPS.length ? '' : ' -- no SOCOM_DISC, skipped'}`, () => {
  it('a mark on the breached piece goes with it; a mark on the wall beside it stays', async () => {
    const zar = Zar.parse(weapon!);
    const record = throwableRecord(parseRdr(zar.data(zar.root.children.find((k) => k.name.toLowerCase() === 'zweapon.rdr')!)), 'C4');
    const results: string[] = [], failures: string[] = [];
    let mapsWith = 0, barricades = 0;
    for (const name of MAPS) {
      // Which maps hold a barricade: the hull alone, as `c4Barricades.test.ts` reads them.
      const sim = await loadSimMap(new FsAssetSource(disc!), `RUN/${name}`);
      const simGround = forkGround(sim.ground);
      const simWorld = new WorldState(sim.meta!, simGround, groundGrid(simGround));
      simWorld.applyInitial();
      const anims = simWorld.health.list.filter((d) => /access/i.test(d.anim) && simWorld.health.accepts(d.id, record.explosionDamage)).map((d) => d.anim);
      if (!anims.length) continue;
      mapsWith++;
      for (const anim of anims) {
        barricades++;
        const r = await rig(name);                                       // a fresh world for each barricade
        const d = r.world.health.list.find((x) => x.anim === anim)!;
        const label = `${name}:${anim}`;
        // The drawn piece: the hull's node (`targetPath`, the `di_good` collision node) is drawn by its siblings -- the
        // piece is what is drawn under its parent (`good_parts`).
        const piece = d.targetPath.slice(0, d.targetPath.lastIndexOf('/'));
        const pieceTris = triangles(r.view.group, (p) => p !== null && under(p, piece)).sort((a, b) => b.area - a.area);
        if (!pieceTris.length) { failures.push(`${label}: no drawn piece under ${piece}`); continue; }
        let onPiece: { mesh: Mesh; path: string | null } | null = null;
        for (const t of pieceTris.slice(0, 40)) {
          const m = markOn(r, t);
          if (m && m.path !== null && under(m.path, piece)) { onPiece = m; break; }
        }
        if (!onPiece) { failures.push(`${label}: no round reached the drawn piece`); continue; }
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (const t of pieceTris) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a]!, t.centre[a]!); hi[a] = Math.max(hi[a]!, t.centre[a]!); }
        const centre = [0, 1, 2].map((a) => (lo[a]! + hi[a]!) / 2) as V3;
        // The wall around the hole: the world's own surface near the piece, square to the ground, out of the piece's box.
        const outside = (c: V3): boolean => [0, 1, 2].some((a) => c[a]! < lo[a]! - 2 || c[a]! > hi[a]! + 2);
        const wallTris = triangles(r.view.group, (_p, world) => world)
          .filter((t) => Math.abs(t.normal[1]) < 0.3 && outside(t.centre))
          .map((t) => ({ t, at: Math.hypot(t.centre[0] - centre[0], t.centre[1] - centre[1], t.centre[2] - centre[2]) }))
          .filter((x) => x.at < 80).sort((a, b) => a.at - b.at);
        let onWall: { mesh: Mesh; path: string | null } | null = null;
        for (const { t } of wallTris.slice(0, 60)) {
          const m = markOn(r, t);
          if (m && m.path === null) { onWall = m; break; }
        }
        const charge = plantAndFuse(r, record, d.id, d.targetPath, sim.defaultMaterial ?? '');
        if (!charge) { failures.push(`${label}: no legal centred plant`); continue; }
        const breached = r.world.health.hp(d.id) === 0 && !r.world.isActive(d.targetPath);
        const pieceGone = r.offs.some((off) => under(onPiece!.path!, off));
        const line = `${label}: breached ${breached}, piece ${onPiece.path} switched off ${pieceGone}, its mark shown ${onPiece.mesh.visible}`
          + `, wall mark ${onWall ? `shown ${onWall.mesh.visible}` : 'none found within 80'}`;
        results.push(line);
        if (!breached) failures.push(`${line} -- not breached`);
        if (pieceGone === onPiece.mesh.visible) failures.push(`${line} -- the piece's mark does not follow its piece`);
        if (!pieceGone) failures.push(`${line} -- the breach drew no switch-off over the marked piece`);
        if (onWall && !onWall.mesh.visible) failures.push(`${line} -- the wall's mark went`);
        if (!onWall) failures.push(`${line} -- no wall mark placed`);
      }
    }
    console.info(`OBF-22 C4 marks: ${MAPS.length} maps read, ${mapsWith} with access barricades, ${barricades} barricades\n${results.join('\n')}`);
    expect(barricades).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  }, 590_000);
});
