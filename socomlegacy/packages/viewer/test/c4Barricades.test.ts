// @vitest-environment node
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { parseRdr, rdrGet, Zar, type RdrNode } from '@s2u/archive';
import { gridCast, throwableRecord, type V3 } from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';
import { aimPick, c4InReach } from '../src/equipment';
import { GrenadeThrower } from '../src/grenade';
import { groundGrid, groundPolygons } from '../src/mover';
import { under } from '../src/mapMeta';
import { placeGround } from '../src/net/placing';
import { hipPoint } from '../src/net/shotCone';
import { loadSimMap } from '../src/simMap';
import { forkGround, WorldState } from '../src/worldState';
import type { PlaySnapshot } from '../src/walk';

// Dev-disc coverage: files remain local, copied to the worktree, never committed.
const disc = process.env.SOCOM_DISC;
const maps = disc && existsSync(resolve(disc, 'RUN'))
  ? readdirSync(resolve(disc, 'RUN')).filter(n => /^MP\d+\.ZDB$/i.test(n)).sort() : [];
const weapon = fixture('RUN/ZWEAPON.ZAR');
const run = (g: GrenadeThrower, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) g.update(1 / 60);
};

describe.skipIf(!maps.length || !weapon)('C4 plant/fuse across the available retail maps (dev-disc)', () => {
  it.each(['centred breach', 'edge survey'] as const)('%s: one charge at each saved surface over all access barricades', async (mode) => {
    const zar = Zar.parse(weapon!);
    const rdr = parseRdr(zar.data(zar.root.children.find(k => k.name.toLowerCase() === 'zweapon.rdr')!));
    const record = throwableRecord(rdr, 'C4');
    const ammo = (rdrGet(rdr, 'ZAMMO') as RdrNode[]).find(r => rdrGet(r, 'InternalName') === record.ammo)!;
    expect(Number(rdrGet(ammo, 'Piercing') ?? 0)).toBe(0);
    expect(record.ignoreExplosionDI).toBe(true);
    const covered: string[] = [], shielded: string[] = [];
    let totalPlants = 0, totalBreaches = 0;
    for (const name of maps) {
      const map = await loadSimMap(new FsAssetSource(disc!), `RUN/${name}`);
      const ground = forkGround(map.ground), grid = groundGrid(ground);
      const world = new WorldState(map.meta!, ground, grid);
      world.applyInitial();
      const polys = groundPolygons(ground);
      // Access animation names are disc data, not a production map-name switch.
      const barriers = world.health.list.filter(d => /access/i.test(d.anim) && world.health.accepts(d.id, record.explosionDamage));
      for (const d of barriers) {
        world.reset();
        const vertices = ground.owners.filter(o => under(o.path, d.targetPath))
          .flatMap(o => polys.slice(o.first, o.first + o.count).flatMap(p => Array.from(p.points)));
        expect(vertices.length, `${name} ${d.anim}: bound collision`).toBeGreaterThan(0);
        const centre = [0, 1, 2].map(axis => {
          const v = vertices.filter((_, i) => i % 3 === axis);
          return (Math.min(...v) + Math.max(...v)) / 2;
        }) as V3;
        let planted = 0, breached = 0;
        // Test inputs only: ordinary near/far approaches and hand offsets, independent of the target-ray point.
        // LATER 1139: 11, 13 and 15 u (were 15, 25 and 30): every approach inside the hip gate (19.9 u in 3-D).
        for (const distance of [11, 13, 15]) {
          let accepted = false;
          // Search legal viewing positions; every accepted plant must explode at its saved hit, without retrying its result.
          const targets = [centre, ...ground.owners.filter(o => under(o.path, d.targetPath)).flatMap(o => polys.slice(o.first, o.first + o.count)).map(p => [0, 1, 2].map(axis => Array.from(p.points).filter((_, i) => i % 3 === axis).reduce((a, b) => a + b, 0) / (p.points.length / 3)) as V3)];
          for (let i = 0; i < targets.length * 32 && !accepted; i++) {
            const mid = targets[Math.floor(i / 32)]!;
            const angle = (i % 32) * Math.PI / 16, dx = Math.cos(angle), dz = Math.sin(angle);
            const eye: V3 = [mid[0] + dx * distance, mid[1], mid[2] + dz * distance];
            const floor = placeGround(gridCast(grid, map.defaultMaterial ?? ''), eye);
            if (!floor) continue;
            const feet: V3 = [eye[0], floor.point[1], eye[2]];

            const far: V3 = [mid[0] - dx * 30, mid[1], mid[2] - dz * 30];
            // The centred-breach run selects rays before planting; the edge survey retains all accepted edge results.
            const pick = aimPick(grid, eye, far, map.defaultMaterial ?? '');
            if (mode === 'centred breach' && (!pick || Math.hypot(...pick.point.map((v, axis) => v - centre[axis]!)) > record.explosionRadius / 2)) continue;
            for (const side of [-8, 0, 8]) {
              world.reset();
              const hand: V3 = [eye[0] + dz * side, eye[1], eye[2] - dx * side];
              const g = new GrenadeThrower({ grid: () => grid, view: () => 'third',
                snapshot: () => ({ feet, yaw: Math.atan2(dx, dz) * 180 / Math.PI, pitch: 0, stance: 'stand', airborne: false } as PlaySnapshot),
                aim: () => ({ eye, far }), handPoint: () => hand,
              });
              g.setRecords([record]); g.setWorld(() => world); g.setKit(['M67', 'AN-M8', 'C4']);
              run(g, 0.3);
              if (g.c4Target() !== d.id || !g.plantC4()) { g.clearAir(); break; }
              accepted = true;
              const positions: V3[] = [];
              g.on('place', e => { positions.push(e.pos); expect(e.pos).toEqual(e.surface!.point); });
              const explosions: V3[] = [];
              g.on('explode', e => explosions.push(e.pos));
              run(g, record.fuse + 2);
              g.clearAir();
              expect(explosions, `${name} ${d.anim}: one fuse at distance ${distance}, hand ${side}`).toHaveLength(1);
              expect(explosions).toEqual(positions);
              expect(g.stats().leftByItem.C4).toBe(record.capacity - 1);
              // Independent source transcription: FUN_003c7600 D:L318708-318735, D:L318763-318767.
              // A legal edge hit can be outside the shield's effective reach: retain that result, never force a death.
              const range = Math.hypot(...explosions[0]!.map((v, axis) => v - centre[axis]!));
              const rated = range <= record.explosionRadius / 2 ? record.explosionDamage
                : Math.max(0, 2 * record.explosionDamage * (1 - range / record.explosionRadius));
              expect(d.health).toBe(1); expect(d.armor).toBe(0);
              const dies = rated >= d.shield && rated > 0;
              if (mode === 'centred breach') expect(dies).toBe(true);
              expect(world.health.hp(d.id), `${name} ${d.anim}, distance ${distance}, charge ${explosions[0]}`).toBe(dies ? 0 : 1);
              expect(world.isActive(d.targetPath), `${name} ${d.anim}: collision`).toBe(!dies);
              if (dies) breached++;
              else shielded.push(`${name}:${d.anim}:range=${range.toFixed(3)},rating=${rated.toFixed(3)}`);
              planted++;
            }
          }
          expect(accepted, `${name} ${d.anim}: legal approach at distance ${distance}`).toBe(true);
        }
        expect(planted, `${name} ${d.anim}: all three hand offsets at three distances`).toBe(9);
        expect(breached, `${name} ${d.anim}: one charge opens the barrier from multiple approaches`).toBeGreaterThanOrEqual(6);
        totalPlants += planted; totalBreaches += breached;
        covered.push(`${name}:${d.anim}`);
      }
    }
    console.info(`C4 disc coverage: ${maps.length} maps; ${covered.length} access barricades: ${covered.join(', ')}`);
    console.info(`C4 placements: ${totalPlants}; one-charge breaches: ${totalBreaches}; shielded edge plants: ${shielded.join(", ")}`);
    expect(covered.length).toBeGreaterThan(0);
    if (mode === 'centred breach') expect(totalBreaches).toBe(totalPlants);
    // LATER 1139: from the 11, 13 and 15 u approaches the survey's first legal plant at each barrier lands near its
    // middle and breaches; no shielded plant. The far-edge plant the 30 u approach reached is pinned on its own below.
    else expect(shielded).toEqual([]);
  }, 180_000);

  // Sujo access2's far edge under the hip gate (LATER 1139). The plant the old 30 u survey kept first: aiming -x down the
  // barrier's long axis, the ray strikes its +x end at 29.189 u from the collision midpoint. Here the stand is 43 u out
  // on +x (13.8 u back from that end, the hip 14.26 u from the struck point, inside 19.9 u). Its rating, 14.984, is under
  // shield 17: the barrier survives. Original nparams midpoint agrees with the collision midpoint (209 §16).
  it.skipIf(!maps.includes('MP61.ZDB'))('Sujo access2 far edge: a hip-gated plant at the far end is shielded', async () => {
    const zar = Zar.parse(weapon!);
    const rdr = parseRdr(zar.data(zar.root.children.find(k => k.name.toLowerCase() === 'zweapon.rdr')!));
    const record = throwableRecord(rdr, 'C4');
    const map = await loadSimMap(new FsAssetSource(disc!), 'RUN/MP61.ZDB');
    const ground = forkGround(map.ground), grid = groundGrid(ground);
    const world = new WorldState(map.meta!, ground, grid);
    world.applyInitial();
    const polys = groundPolygons(ground);
    const d = world.health.list.find(x => x.anim === 'access2')!;
    expect(d.shield).toBe(17); expect(d.health).toBe(1); expect(d.armor).toBe(0);
    const vertices = ground.owners.filter(o => under(o.path, d.targetPath))
      .flatMap(o => polys.slice(o.first, o.first + o.count).flatMap(p => Array.from(p.points)));
    const centre = [0, 1, 2].map(axis => {
      const v = vertices.filter((_, i) => i % 3 === axis);
      return (Math.min(...v) + Math.max(...v)) / 2;
    }) as V3;
    // Test inputs only: the old survey's first approach (angle 0, aiming -x through the midpoint), stood 43 u out.
    const eye: V3 = [centre[0] + 43, centre[1], centre[2]], far: V3 = [centre[0] - 30, centre[1], centre[2]];
    const floor = placeGround(gridCast(grid, map.defaultMaterial ?? ''), eye);
    expect(floor, 'a legal floor under the stand').not.toBeNull();
    const feet: V3 = [eye[0], floor!.point[1], eye[2]], yaw = Math.atan2(1, 0) * 180 / Math.PI;
    for (const side of [-8, 0, 8]) {
      world.reset();
      const hand: V3 = [eye[0], eye[1], eye[2] - side];
      const g = new GrenadeThrower({ grid: () => grid, view: () => 'third',
        snapshot: () => ({ feet, yaw, pitch: 0, stance: 'stand', airborne: false } as PlaySnapshot),
        aim: () => ({ eye, far }), handPoint: () => hand,
      });
      g.setRecords([record]); g.setWorld(() => world); g.setKit(['M67', 'AN-M8', 'C4']);
      run(g, 0.3);
      expect(g.c4Target(), `hand ${side}: the far end is the target`).toBe(d.id);
      expect(g.plantC4(), `hand ${side}: plant accepted`).toBe(true);
      const positions: V3[] = [], explosions: V3[] = [];
      g.on('place', e => { positions.push(e.pos); expect(e.pos).toEqual(e.surface!.point); });
      g.on('explode', e => explosions.push(e.pos));
      run(g, record.fuse + 2);
      g.clearAir();
      expect(explosions, `hand ${side}: one fuse`).toHaveLength(1);
      expect(explosions).toEqual(positions);
      const hip = hipPoint({ feet, yaw, posture: 'stand', moveRoot: null });
      expect(c4InReach(hip, explosions[0]!), `hand ${side}: struck point inside the hip gate`).toBe(true);
      expect(Math.hypot(...explosions[0]!.map((v, axis) => v - hip[axis]!))).toBeCloseTo(14.26, 2);
      // Independent source transcription: FUN_003c7600 D:L318708-318735, D:L318763-318767.
      const range = Math.hypot(...explosions[0]!.map((v, axis) => v - centre[axis]!));
      expect(range).toBeGreaterThan(record.explosionRadius / 2);
      const rated = Math.max(0, 2 * record.explosionDamage * (1 - range / record.explosionRadius));
      expect(range).toBeCloseTo(29.189, 3);
      expect(rated).toBeCloseTo(14.984, 3);
      expect(rated).toBeLessThan(d.shield);
      expect(world.health.hp(d.id), `hand ${side}: the barrier survives`).toBe(1);
      expect(world.isActive(d.targetPath), `hand ${side}: collision stays`).toBe(true);
    }
  }, 180_000);
});
