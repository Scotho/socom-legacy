// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_LAYERS, isGroundSurface, isLiquidSurface, polygonNormal, probeFloor, probeGround, probeWater, segmentHits, surfaceWord, type WorldPoly } from '@s2u/scene';
import { simMapFromBytes } from '../src/simMap';
import { Traversal } from '../src/traversal';
import { cameraClassClear, groundGrid, groundPolygons, isCameraClassSurface, Walker } from '../src/mover';

/**
 * INV-WATER-CROUCH (seat b6's investigation, 2026-11-07; an instrument, not a gate): the owner's report -- "a player
 * walking through water seems to be stuck in crouch mode ... Ruins ... nightstalker ... deep water". Opt-in:
 * WATER_PROBE=1 with SOCOM_DISC or SOCOM_PC_ROOT. It prints, for MP12 and MP7:
 *
 * - the water polygons (`isLiquidSurface`): their ditype, cameratype and whether the headroom ray's camera-class filter
 *   (`isCameraClassSurface`, `FUN_002d2890` D:L174845-174864) takes them;
 * - the depth over the bed on a grid over each water polygon (`probeWater` less the floor under it);
 * - at points of each depth band, a crouched SEAL's stand press and its crouch run: `Walker.headroom('stand')`
 *   (`FUN_0057efe0(actor, 0)`, D:L441190-441245), the port's cast (two-sided until a2da44d9a; one-sided since, so the two columns now agree) against the one-sided one the original's
 *   hull colliders take (`FUN_002d2890` side mode 0x20, D:L174831-174837; research 281 s4.3);
 * - on every map, the census: on a 6-unit grid over the walkable ground, where the crouched headroom ray (the idle hips
 *   + 2 to the feet + 19) answers differently two-sided and one-sided -- the places a one-sided `cameraClassClear` would
 *   change, water and not.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? resolve(PC_ROOT, 'game', 'disc') : '';
const ON = !!process.env.WATER_PROBE && !!DISC;

const STILL = { forward: 0, right: 0, boost: false };

function load(name: string) {
  const map = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC, 'RUN', `${name}.ZDB`))), `RUN/${name}.ZDB`);
  const grid = groundGrid(map.ground!), polys = groundPolygons(map.ground!);
  return { grid, polys };
}

function bounds(p: WorldPoly): [number, number, number, number] {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < p.ptcount; i++) {
    const x = p.points[i * 3]!, z = p.points[i * 3 + 2]!;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  return [x0, x1, z0, z1];
}

describe.skipIf(!ON)(`deep water and the crouch on the dev disc${ON ? '' : ' (opt-in: WATER_PROBE=1 and a dev disc -- skipped)'}`, () => {
  for (const name of ['MP12', 'MP7']) {
    it(`${name}: the water polygons, the depths, and the stand press in them`, () => {
      const { grid, polys } = load(name);
      const water = polys.filter(isLiquidSurface);
      const tally = new Map<string, number>();
      for (const p of water) {
        const k = `ditype ${p.ditype} cameratype ${p.cameratype} word18-19 ${(surfaceWord(p) >>> 18) & 3} cameraClass ${isCameraClassSurface(p)}`;
        tally.set(k, (tally.get(k) ?? 0) + 1);
      }
      console.log(`${name}: ${water.length} water polygons of ${polys.length}`, JSON.stringify(Object.fromEntries(tally)));
      // The winding: the hull test's normal is the polygon's own (research 281 s4.3; `polygonNormal`'s sign).
      const up = water.filter((p) => (polygonNormal(p.points)?.[1] ?? 0) > 0).length;
      console.log(`${name}: water polygons wound up (n_y > 0): ${up}, down: ${water.length - up}`);

      // The depths over the bed, on a 4-unit grid over every water polygon's footprint.
      const samples: { x: number; z: number; bed: number; line: number; depth: number }[] = [];
      const seen = new Set<string>();
      for (const p of water) {
        const [x0, x1, z0, z1] = bounds(p);
        for (let x = Math.ceil(x0 / 4) * 4; x <= x1; x += 4) for (let z = Math.ceil(z0 / 4) * 4; z <= z1; z += 4) {
          const key = `${x},${z}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const lines = probeWater(grid, x, z);
          if (lines.length === 0) continue;
          const line = lines[0]!;
          const bed = probeFloor(grid, x, line + 50, z);
          if (!bed || bed.y > line) continue;
          samples.push({ x, z, bed: bed.y, line, depth: line - bed.y });
        }
      }
      const bands = [0, 2, 5, 7.5, 8.5, 12, 19, 30, Infinity];
      const hist = bands.slice(0, -1).map((lo, i) => `${lo}-${bands[i + 1]}: ${samples.filter((s) => s.depth > lo && s.depth <= bands[i + 1]!).length}`);
      const deepest = samples.reduce((a, s) => (s.depth > a.depth ? s : a), samples[0]!);
      console.log(`${name}: ${samples.length} wet samples; depth bands ${hist.join(', ')}; deepest ${deepest.depth.toFixed(2)} at (${deepest.x}, ${deepest.bed.toFixed(1)}, ${deepest.z})`);

      // A crouched SEAL in each band: the headroom ray, the stand press, the crouch run, then 60 ticks walking forward.
      const pick = (lo: number, hi: number) => samples.find((s) => s.depth > lo && s.depth <= hi) ?? null;
      for (const [lo, hi] of [[2, 5], [5, 7.5], [7.5, 8.5], [8.5, 12], [12, 19]] as const) {
        const s = pick(lo, hi);
        if (!s) { console.log(`  ${lo}-${hi}: no sample`); continue; }
        for (const separate of [false, true]) {
          const w = new Walker(grid);
          const t = new Traversal(grid, polys);
          w.driver = t;
          w.stanceSeparate = separate;
          w.stanceCut = true;
          if (!w.place(s.x, s.line + 30, s.z)) { console.log(`  ${lo}-${hi}: no floor at (${s.x}, ${s.z})`); continue; }
          for (let i = 0; i < 30; i++) w.tick(STILL);
          const feet = w.state.y;
          w.stance = 'crouch';
          w.tick(STILL);
          const after = w.stance;                                 // the water's own demotion over 8.5
          const lo2 = feet + 5.504 + 2, hi2 = feet + 19;
          const rayClear = cameraClassClear(grid, [s.x, lo2, s.z], [s.x, hi2, s.z]);
          const headroom = w.headroom('stand');
          // The original's per-collider test under the hull's side mode 0x20 is one-sided (`FUN_002d2890` D:L174831-174837,
          // research 281 s4.3): the same ray, front entries only (`segmentHits(.., frontOnly)`, LATER 250's).
          const one = segmentHits(grid, [s.x, lo2, s.z], [s.x, hi2, s.z], isCameraClassSurface, ALL_LAYERS, true)[0] ?? null;
          const oneClear = one === null || ((surfaceWord(one.poly) >>> 18) & 3) === 1;
          w.changeStance('stand');
          for (let i = 0; i < 40; i++) w.tick(STILL);
          const stood = w.stance;
          // Crouched again (where crouch is allowed), stick full forward: the crouch run asks the headroom ray too.
          w.stance = 'crouch';
          const postures: string[] = [];
          for (let i = 0; i < 30; i++) { w.tick({ forward: 1, right: 0, boost: false }); postures.push(w.posture); }
          console.log(`  ${lo}-${hi} ${separate ? 'SEPARATE' : 'COMBINED'}: at (${s.x}, ${feet.toFixed(2)}, ${s.z}) depth ${t.depth().toFixed(2)} ` +
            `crouch->${after}; ray (${lo2.toFixed(1)}..${hi2.toFixed(1)}) clear ${rayClear} (one-sided: ${oneClear}), headroom ${headroom}; stand press -> ${stood}; ` +
            `crouched stick-forward postures ${[...new Set(postures)].join('/')} stance ${w.stance}`);
        }
      }
      expect(water.length).toBeGreaterThan(0);
    }, 120_000);
  }

  it('every map: where a one-sided headroom ray answers differently (the census)', () => {
    const rows: string[] = [];
    for (const f of readdirSync(resolve(DISC, 'RUN')).filter((n) => /\.ZDB$/i.test(n)).sort()) {
      const name = f.replace(/\.ZDB$/i, '');
      let grid, polys;
      try { ({ grid, polys } = load(name)); } catch { rows.push(`${name}: no hull`); continue; }
      const seen = new Set<string>();
      let n = 0, flipWater = 0, flipOther = 0;
      const byPath = new Map<string, number>();
      for (const p of polys) {
        if (!isGroundSurface(p) || Math.abs(polygonNormal(p.points)?.[1] ?? 0) < 0.6428) continue;   // walkable either winding
        const [x0, x1, z0, z1] = bounds(p);
        for (let x = Math.ceil(x0 / 6) * 6; x <= x1; x += 6) for (let z = Math.ceil(z0 / 6) * 6; z <= z1; z += 6) {
          for (const h of probeGround(grid, x, z)) {
            if (Math.abs(h.normal[1]) < 0.6428) continue;
            const key = `${x},${z},${Math.round(h.y)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            n++;
            const a: [number, number, number] = [x, h.y + 5.504 + 2, z], b: [number, number, number] = [x, h.y + 19, z];
            const two = segmentHits(grid, a, b, isCameraClassSurface)[0] ?? null;
            const twoClear = two === null || ((surfaceWord(two.poly) >>> 18) & 3) === 1;
            if (twoClear) continue;
            const one = segmentHits(grid, a, b, isCameraClassSurface, ALL_LAYERS, true)[0] ?? null;
            const oneClear = one === null || ((surfaceWord(one.poly) >>> 18) & 3) === 1;
            if (!oneClear) continue;
            if (isLiquidSurface(two.poly)) flipWater++;
            else { flipOther++; const k = two.poly.path || two.poly.modelName; byPath.set(k, (byPath.get(k) ?? 0) + 1); }
          }
        }
      }
      const top = [...byPath].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, c]) => `${k} ${c}`).join('; ');
      rows.push(`${name}: ${n} floor samples; crouched stand refused two-sided, clear one-sided: water ${flipWater}, other ${flipOther}${top ? ` (${top})` : ''}`);
    }
    console.log(rows.join('\n'));
    expect(rows.length).toBeGreaterThan(0);
  }, 600_000);
});
