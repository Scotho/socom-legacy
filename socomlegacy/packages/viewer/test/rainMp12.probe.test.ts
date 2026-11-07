// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { parseZdb, zdbMember, Zar } from '@s2u/archive';
import { decodeEffectProgram, GAME_FRAME_DT, parseAnimSets, type ParticleSource } from '@s2u/scene';
import { effectsFromDisc } from '../src/effectData';
import { Effects } from '../src/effects';
import { tickBack } from '../src/particles';
import { groundPolygons } from '../src/mover';
import { simMapFromBytes } from '../src/simMap';

/**
 * The Ruins' (MP12) rain, measured on the dev disc (an investigation's instrument, not a gate: seat b6's rain-mp12
 * investigation, 2026-11-07). Opt-in: RAIN_PROBE=1 with SOCOM_DISC or SOCOM_PC_ROOT. It prints:
 *
 * - the mission's ambient programs that draw the weather (`rain_falling`, `rain_drops*`, `moreraindrops*`,
 *   `wind_effect`) and the scene nodes the ripples sit at;
 * - the three bitmaps (`raindrop.tif`, `waterdrip.tif`, `effect_mist.tif`): their size, their alpha, their bind packet's
 *   blend -- numbers only, never the bitmap;
 * - the streak a falling drop draws (`particles.ts` `streak`: from where it was a game tick ago, `tickBack`, to where it
 *   is -- a browser frame ago until INV-RAIN F2) at three frame rates: the original's game tick (`GAME_FRAME_DT`,
 *   30 Hz), 60 Hz and 144 Hz;
 * - which of the two rain sources runs: `rain_falling`'s `IF set 0 cmd 72` (`PLAYER_INDOORS`, `@s2u/sound`
 *   `ZANIM_PLAYER_INDOORS`) -- unread until INV-RAIN F3, now the floor under the player's feet (none here: outdoors).
 *
 * The gate's assertions are `rainDisc.test.ts`'s; this prints.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? resolve(PC_ROOT, 'game', 'disc') : '';

interface P { source: ParticleSource; position: [number, number, number]; moved: number; velocity: [number, number, number]; size: number; age: number; life: number }

const ON = !!process.env.RAIN_PROBE && !!DISC;

describe.skipIf(!ON)(`MP12's rain on the dev disc${ON ? '' : ' (opt-in: RAIN_PROBE=1 and a dev disc -- skipped)'}`, () => {
  it('prints the rain\'s programs, bitmaps and the streak per frame rate', async () => {
    const d = await effectsFromDisc(new FsAssetSource(DISC), 'RUN/MP12.ZDB', 'MP12');
    const weather = d.ambient.filter((n) => /rain|drops|wind|sky|camera_inside|noise/i.test(n));
    console.log('ambient (weather):', weather.join(', '));
    console.log('ambient (all):', d.ambient.length, d.ambient.join(', '));
    for (const n of ['drops1', 'drops2', 'drops3', 'moredrops1', 'moredrops2', 'moredrops3', 'moredrops4', 'camera', 'sky']) {
      const m = d.sceneNodes.find(([k]) => k === n)?.[1];
      console.log(`scene node ${n}:`, m ? `at (${m[12]!.toFixed(1)}, ${m[13]!.toFixed(1)}, ${m[14]!.toFixed(1)})` : 'absent');
    }
    for (const t of ['raindrop.tif', 'waterdrip.tif', 'effect_mist.tif']) {
      const e = d.textures.find(([k]) => k === t)?.[1];
      if (!e) { console.log(t, 'absent'); continue; }
      const a = e.rgba.data;
      let min = 255, max = 0, sum = 0, n = 0;
      for (let i = 3; i < a.length; i += 4) { min = Math.min(min, a[i]!); max = Math.max(max, a[i]!); sum += a[i]!; n++; }
      let rgbMax = 0;
      for (let i = 0; i < a.length; i += 4) rgbMax = Math.max(rgbMax, a[i]!, a[i + 1]!, a[i + 2]!);
      console.log(`${t}: ${e.rgba.width}x${e.rgba.height}, alpha min ${min} max ${max} mean ${(sum / n).toFixed(1)} (of 255), rgb max ${rgbMax}, gs`, JSON.stringify(e.gs));
    }
    expect(d.ambient).toContain('rain_falling');

    for (const hz of [1 / GAME_FRAME_DT, 60, 144]) {
      const fx = new Effects(Math.random);
      fx.setData(d);
      const cam = new PerspectiveCamera(60, 16 / 9, 1, 5000);
      cam.position.set(1500, 80, 1500);
      cam.updateMatrixWorld();
      const dt = 1 / hz;
      for (let t = 0; t < 3; t += dt) fx.update(dt, cam);
      const ps = (fx as unknown as { particles: { particles: P[] } }).particles.particles;
      const by = new Map<string, number>();
      for (const p of ps) by.set(p.source.name, (by.get(p.source.name) ?? 0) + 1);
      const rain = ps.filter((p) => p.source.name === 'rain_falling1' || p.source.name === 'rain_falling2');
      let travel = 0, band = 0;
      for (const p of rain) {
        const prev = tickBack(p);
        const tr = Math.hypot(p.position[0] - prev[0], p.position[1] - prev[1], p.position[2] - prev[2]);
        const [reach] = p.source.streak ?? [1, 0.3];
        travel += tr; band += tr + p.size * (1 + reach);
      }
      const n = Math.max(1, rain.length);
      const vy = rain.reduce((a, p) => a + p.velocity[1]!, 0) / n, age = rain.reduce((a, p) => a + p.age, 0) / n;
      const moving = rain.filter((p) => p.moved > 0).length;
      console.log(`  rain mean vy ${vy.toFixed(1)} u/s, mean age ${age.toFixed(3)} s, moved this frame ${moving}/${rain.length}`);
      console.log(`${hz.toFixed(1)} Hz: particles ${ps.length} by source ${JSON.stringify(Object.fromEntries(by))}; ` +
        `rain streak: travel ${(travel / n).toFixed(2)} u, band ${(band / n).toFixed(2)} u (mean of ${rain.length})`);
      console.log(`  the far source's particles: ${by.get('rain_falling2') ?? 0} (no player: PLAYER_INDOORS false, the ELSE branch)`);
      const src = (fx as unknown as { particles: { sources: Map<string, { config: ParticleSource; world: number[]; base: number[] }> } }).particles.sources;
      for (const [k, v] of src) if (/rain_falling|fog_mist/.test(k)) console.log(`  source ${k}: world velocity now [${v.world.join(', ')}] (its config's [${v.config.worldVelocity.join(', ')}])`);
    }
  }, 60_000);

  /**
   * Every map's zAnim programs: a particle source made with a base or world velocity (flag A 0x40 / 0x80) that a later
   * command of the same program names without that flag -- the commands the original leaves the velocity alone for
   * (`FUN_00266830` D:L112952, D:L113044), which the port's `ParticleSystem.emit` re-resolved to zero until INV-RAIN F1
   * (the gate's check: `rainDisc.test.ts`).
   */
  it('lists the sources a flagless re-command would stop on every map', () => {
    const run = resolve(DISC, 'RUN');
    const rows = new Set<string>();
    for (const f of readdirSync(run).filter((n) => /\.ZDB$/i.test(n))) {
      const bytes = new Uint8Array(readFileSync(resolve(run, f)));
      for (const member of ['CZANIM.ZAR', 'MZANIM.ZAR']) {
        let zar: Zar;
        try { zar = Zar.parse(zdbMember(bytes, parseZdb(bytes), member)); } catch { continue; }
        for (const set of parseAnimSets(zar).sets) for (const a of set.anims) {
          const p = decodeEffectProgram(a);
          const made = new Map<string, ParticleSource>();
          for (const sq of p.sequences) for (const op of sq.ops) {
            if (op.op !== 'particles') continue;
            const c = op.source, had = made.get(c.name);
            const moving = (v: number[]): boolean => v.some((x) => x !== 0);
            if (!had && (moving(c.worldVelocity) || moving(c.baseVelocity))) { made.set(c.name, c); continue; }
            if (had && (c.flagsA & 0xc0) === 0 && (c.flagsB & 0x3c6) === 0) {
              rows.add(`${member === 'CZANIM.ZAR' ? 'common' : f.replace(/\.ZDB$/i, '')} ${a.name}/${c.name}: world [${had.worldVelocity.join(',')}] base [${had.baseVelocity.join(',')}] re-commanded with flags A 0x${c.flagsA.toString(16)}`);
            }
          }
        }
      }
    }
    console.log([...rows].sort().join('\n'));
    expect(rows.size).toBeGreaterThan(0);
  }, 120_000);

  /** Where to look: MP12's ground marked `m_inside` (the camera's indoors, research 81 s9) and its water, by place. */
  it('lists MP12\'s indoor ground and its water', () => {
    const map = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC, 'RUN/MP12.ZDB'))), 'RUN/MP12.ZDB');
    const polys = groundPolygons(map.ground!);
    const centre = (p: { points: ArrayLike<number>; ptcount: number }): number[] => {
      let x = 0, y = 0, z = 0;
      for (let i = 0; i < p.ptcount; i++) { x += p.points[i * 3]!; y += p.points[i * 3 + 1]!; z += p.points[i * 3 + 2]!; }
      return [x / p.ptcount, y / p.ptcount, z / p.ptcount].map((v) => Math.round(v));
    };
    const inside = polys.filter((p) => p.inside && (p.ditype & 1) !== 0);
    console.log(`indoor ground polygons: ${inside.length} of ${polys.length}`);
    const byPath = new Map<string, number[][]>();
    for (const p of inside) { const k = p.path || p.modelName; byPath.set(k, [...(byPath.get(k) ?? []), centre(p)]); }
    for (const [k, cs] of [...byPath].slice(0, 25)) console.log(`  ${k}: ${cs.length}, e.g. ${JSON.stringify(cs[0])}`);
    const water = polys.filter((p) => p.material === 11);
    console.log(`water polygons (material 11): ${water.length}; e.g. ${JSON.stringify(water.slice(0, 6).map(centre))}`);
    expect(polys.length).toBeGreaterThan(0);
  }, 120_000);
});
