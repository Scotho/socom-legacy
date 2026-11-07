// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PerspectiveCamera } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { parseZdb, zdbMember, Zar } from '@s2u/archive';
import { decodeEffectProgram, GAME_FRAME_DT, parseAnimSets, probeFloor, probeGround, type ParticleSource } from '@s2u/scene';
import { effectsFromDisc, type EffectData } from '../src/effectData';
import { Effects } from '../src/effects';
import type { GameAudio } from '../src/audio';
import { WalkSounds } from '../src/walkSounds';
import { ParticleSystem, tickBack } from '../src/particles';
import { simMapFromBytes, type SimMap } from '../src/simMap';

/**
 * INV-RAIN (seat b6, 2026-11-07; research 89 §21) on the dev disc: the rain on The Ruins (MP12) and every map the same
 * particle bugs touch. Reads `SOCOM_DISC` (else `<SOCOM_PC_ROOT>/game/disc`); without either every test skips -- a
 * skip, not a pass.
 *
 * - **F1**: every source a program makes with a base or world velocity and re-commands without writing it (flags A
 *   0x40 / 0x80 and B 0x2 / 0x4 / 0x40 / 0x80 / 0x100 / 0x200 clear: `FUN_00266830` D:L112949-113119) keeps the
 *   velocity across the re-commands -- MP12's rain falls at (0,-45,0) under (0,-95,0), about -70 u/s at 0.3 s.
 * - **F2**: MP12's rain draws the same band at 30, 60 and 144 frames a second (`STREAK_TICK_READING`).
 * - **F3**: under `worldmodel/g372_1` at (719,106,1930) -- an `m_inside` floor -- `rain_falling`'s far source runs and
 *   its near one stops; in the open, the reverse (`PLAYER_INDOORS`, 72, from the feet's floor). `CAMERA_INDOORS` (66)
 *   is the camera's own pick (`FUN_002d4c20`): a camera under a roof's top over an `m_inside` floor is indoors.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? resolve(PC_ROOT, 'game', 'disc') : '';
const RUN = DISC && existsSync(resolve(DISC, 'RUN')) ? resolve(DISC, 'RUN') : null;

interface Src { config: ParticleSource; base: number[]; world: number[]; active: boolean }
interface P { source: ParticleSource; position: [number, number, number]; velocity: [number, number, number]; moved: number; age: number; size: number }
const inside = (fx: Effects): { sources: Map<string, Src>; particles: P[] } =>
  (fx as unknown as { particles: { sources: Map<string, Src>; particles: P[] } }).particles;
const byName = (fx: Effects, name: string): Src | undefined => [...inside(fx).sources.values()].find((s) => s.config.name === name);

describe.skipIf(!RUN)(`INV-RAIN on the dev disc${RUN ? '' : ' (no dev disc: SOCOM_DISC or SOCOM_PC_ROOT -- skipped)'}`, () => {
  /**
   * F1 over every map's `CZANIM` and `MZANIM`: each source a program makes moving (a non-zero base or world velocity)
   * and names again in a command that writes neither, run through `ParticleSystem.emit` in program order: its
   * velocities after every command are the ones its last writing command set.
   */
  it('F1: every re-switched source keeps its velocities across the commands that do not write them, on every map', () => {
    const rows: string[] = [];
    let checked = 0;
    for (const f of readdirSync(RUN!).filter((n) => /\.ZDB$/i.test(n))) {
      const bytes = new Uint8Array(readFileSync(resolve(RUN!, f)));
      for (const member of ['CZANIM.ZAR', 'MZANIM.ZAR']) {
        let zar: Zar;
        try { zar = Zar.parse(zdbMember(bytes, parseZdb(bytes), member)); } catch { continue; }
        for (const set of parseAnimSets(zar).sets) for (const a of set.anims) {
          const p = decodeEffectProgram(a);
          const made = new Map<string, ParticleSource>();
          const ps = new ParticleSystem(() => 0.5);
          for (const sq of p.sequences) for (const op of sq.ops) {
            if (op.op !== 'particles') continue;
            const c = op.source, had = made.get(c.name);
            const moving = (v: readonly number[]): boolean => v.some((x) => x !== 0);
            if (!had) { if (moving(c.worldVelocity) || moving(c.baseVelocity)) made.set(c.name, c); else continue; }
            ps.emit(c, null, {}, a.name, () => true, null, null);
            if (!had) continue;
            const writes = (c.flagsA & 0xc0) !== 0 || (c.flagsB & 0x3c6) !== 0;
            if (writes) { made.set(c.name, c); continue; }
            const s = [...(ps as unknown as { sources: Map<string, Src> }).sources.values()].find((x) => x.config.name === c.name || x.config === had)!;
            checked++;
            const row = `${f.replace(/\.ZDB$/i, '')} ${a.name}/${c.name}`;
            if (s.world.join() !== had.worldVelocity.join() || s.base.join() !== had.baseVelocity.join()) {
              rows.push(`${row}: world [${s.world.join(',')}] base [${s.base.join(',')}], made [${had.worldVelocity.join(',')}] [${had.baseVelocity.join(',')}]`);
            }
          }
        }
      }
    }
    console.log(`F1: ${checked} flagless re-commands of a moving source checked over the disc`);
    expect(checked).toBeGreaterThan(0);
    expect(rows).toEqual([]);
  }, 120_000);

  describe('MP12 (The Ruins)', () => {
    let d: EffectData;
    let map: SimMap;
    beforeAll(async () => {
      d = await effectsFromDisc(new FsAssetSource(DISC), 'RUN/MP12.ZDB', 'MP12');
      map = simMapFromBytes(new Uint8Array(readFileSync(resolve(RUN!, 'MP12.ZDB'))), 'RUN/MP12.ZDB');
    }, 120_000);

    /** MP12's ambient effects run for `seconds` at `hz`, the camera at `eye`, the player's feet at `feet`. */
    function run(hz: number, seconds: number, eye: [number, number, number], feet: [number, number, number] | null): Effects {
      const fx = new Effects(() => 0.5);
      fx.setWorld(() => map.grid);
      fx.setPlayer(() => feet);
      fx.setData(d);
      const cam = new PerspectiveCamera(60, 16 / 9, 1, 5000);
      cam.position.set(...eye);
      cam.updateMatrixWorld();
      const n = Math.round(seconds * hz);
      for (let i = 0; i < n; i++) fx.update(seconds / n, cam);
      return fx;
    }

    /** A place in the open: the map's measured spawn A (`@s2u/scene` `SPAWNS`), its floor not `m_inside`. */
    function open(): [number, number, number] {
      expect(map.spawns, 'spawn A').not.toBeNull();
      return [...map.spawns!.a];
    }

    it("F1: rain_falling1 keeps (0,-45,0) through the WHILE loop; its drops fall at -62 to -75 u/s (about -70 at 0.3 s)", () => {
      const feet = open();
      const fx = run(1 / GAME_FRAME_DT, 3, [feet[0], feet[1] + 20, feet[2]], feet);
      expect(byName(fx, 'rain_falling1')!.world).toEqual([0, -45, 0]);
      expect(byName(fx, 'rain_falling2')!.world).toEqual([0, -45, 0]);
      const rain = inside(fx).particles.filter((p) => p.source.name === 'rain_falling1');
      expect(rain.length).toBeGreaterThan(100);
      const vy = rain.reduce((a, p) => a + p.velocity[1], 0) / rain.length;
      const age = rain.reduce((a, p) => a + p.age, 0) / rain.length;
      console.log(`F1: rain_falling1 ${rain.length} drops, mean vy ${vy.toFixed(1)} u/s at mean age ${age.toFixed(3)} s`);
      // Every drop leaves at the world velocity's -45 and gains -95 a second: none slower than -45, the mean about -70
      // at the drops' mean age (0.27-0.3 s). Was about -28: the WHILE loop's first switch zeroed the world velocity.
      for (const p of rain) expect(p.velocity[1]).toBeLessThanOrEqual(-45);
      expect(vy).toBeLessThan(-62);
      expect(vy).toBeGreaterThan(-75);
    });

    it('F2: the band a drop draws is the same at 30, 60 and 144 frames a second (mean within 5%; one tick of its own speed within 1%)', () => {
      const feet = open();
      const bands: number[] = [];
      for (const hz of [1 / GAME_FRAME_DT, 60, 144]) {
        const fx = run(hz, 3, [feet[0], feet[1] + 20, feet[2]], feet);
        const rain = inside(fx).particles.filter((p) => p.source.name === 'rain_falling1' && p.moved >= GAME_FRAME_DT);
        let travel = 0, speed = 0;
        for (const p of rain) {
          const b = tickBack(p);
          travel += Math.hypot(p.position[0] - b[0], p.position[1] - b[1], p.position[2] - b[2]);
          speed += Math.hypot(...p.velocity);
        }
        travel /= rain.length;
        speed /= rain.length;
        bands.push(travel);
        console.log(`F2: ${hz.toFixed(1)} Hz, rain_falling1's mean travel a tick ${travel.toFixed(2)} u (speed ${speed.toFixed(1)} u/s) over ${rain.length} drops`);
        // One tick of the drop's own motion, whatever the frame: the speed the last tick moved at (now, less a tick of 95).
        expect(Math.abs(travel / ((speed - 95 * GAME_FRAME_DT) * GAME_FRAME_DT) - 1), `${hz} Hz`).toBeLessThan(0.01);
      }
      // Across the rates the drops' mean speed differs a little (the sub-frame spawn spread leaves a new drop's velocity
      // at the frame's start: up to 95 x dt slower at 30 Hz), so the bands within 5%; the frame-tied band was 4.4x shorter
      // at 144 Hz than at 30 Hz in its travel part (0.19 u against 0.84 u).
      const [a, b, c] = bands as [number, number, number];
      expect(Math.abs(b - a) / a).toBeLessThan(0.05);
      expect(Math.abs(c - a) / a).toBeLessThan(0.05);
    });

    it("F3: under g372_1 at (719,106,1930) the far source runs and the near one stops; in the open, the reverse", () => {
      const roof: [number, number, number] = [719, 106, 1930];
      const floor = probeFloor(map.grid, ...roof)?.poly;
      expect(floor, 'a floor under g372_1').toBeDefined();
      expect(floor!.inside ?? 0, 'm_inside').not.toBe(0);
      // Two seconds: wind_effect's loop re-tests once a second (its first test ran at the map's start, before a camera).
      const under = run(1 / GAME_FRAME_DT, 2, [roof[0], roof[1] + 20, roof[2]], roof);
      expect([byName(under, 'rain_falling1')!.active, byName(under, 'rain_falling2')!.active]).toEqual([false, true]);
      const out = open();
      expect(probeFloor(map.grid, ...out)?.poly.inside ?? 0, 'spawn A in the open').toBe(0);
      const there = run(1 / GAME_FRAME_DT, 2, [out[0], out[1] + 20, out[2]], out);
      expect([byName(there, 'rain_falling1')!.active, byName(there, 'rain_falling2')!.active]).toEqual([true, false]);
      // wind_effect's fog_mist (CAMERA_INDOORS, 66): off under the roof, on in the open (alpha 0 at every key: unseen).
      expect(byName(under, 'fog_mist')!.active).toBe(false);
      expect(byName(there, 'fog_mist')!.active).toBe(true);
    });

    it("66 (CAMERA_INDOORS) is the camera's own pick: 3 under a roof's top at (563,1554) over an m_inside floor, indoors; in the open, outdoors", () => {
      // The column at (563, 1554): a roof's walkable top at 100.46 (not m_inside) over an m_inside floor at 41.82 (the
      // disc's MP12 hull, `probeGround`). The camera 3 under the roof's top: `FUN_002d4c20` takes the highest hit at or
      // below the camera (`CAMERA_FLOOR_ABOVE`, 0), the floor -- indoors. The actor's pick (`probeFloor`: up to 6 over)
      // took the roof and answered outdoors (the review's F1).
      const [x, z] = [563, 1554];
      const col = probeGround(map.grid, x, z).sort((a, b) => b.y - a.y);
      expect(col.map((h) => [Math.round(h.y * 100) / 100, (h.poly.inside ?? 0) !== 0])).toEqual([[100.46, false], [41.82, true]]);
      const eye: [number, number, number] = [x, col[0]!.y - 3, z];
      expect(probeFloor(map.grid, ...eye)?.poly.inside ?? 0, "the actor's pick: the roof").toBe(0);
      const feet = open();
      const roofed = run(1 / GAME_FRAME_DT, 2, eye, feet);
      expect(byName(roofed, 'fog_mist')!.active, 'fog_mist (IF 66) off under the roof').toBe(false);
      const outside = run(1 / GAME_FRAME_DT, 2, [feet[0], feet[1] + 20, feet[2]], feet);
      expect(byName(outside, 'fog_mist')!.active, 'fog_mist on in the open').toBe(true);
    });

    it("the sound's camera-indoors (WalkSounds.frame -> setEnvironment) is the same pick: 3 under the roof's top at (563,1554), indoors; in the open, outdoors", () => {
      // `FUN_00295b00`'s one probe writes the camera's `+0x2b8` (`m_inside`) and `+0x2bc` (the reverb zone) that the
      // reverb (`FUN_00341a60` D:L241520-241521) and 66 both read (research 81 §9-§10): the sound answers as fog_mist above.
      const [x, z] = [563, 1554];
      const top = Math.max(...probeGround(map.grid, x, z).map((h) => h.y));
      const env: [boolean, number][] = [];
      const audio = { setAmbience: () => {}, setEnvironment: (i: boolean, zone: number) => { env.push([i, zone]); } } as unknown as GameAudio;
      const feet = open();
      const ws = new WalkSounds(audio, { walking: () => true, feet: () => feet, stance: () => 'stand', wish: () => ({ forward: 0, right: 0 }), grid: () => map.grid });
      ws.frame([x, top - 3, z]);
      ws.frame([feet[0], feet[1] + 20, feet[2]]);
      expect(env.map(([i]) => i), 'under the roof, then the open').toEqual([true, false]);
    });
  });
});
