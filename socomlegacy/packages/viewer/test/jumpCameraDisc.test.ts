// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { FsAssetSource } from '@s2u/archive/node';
import { probeGround, probeWater } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { loadMap } from '../src/loadMap';
import { groundGrid, groundPolygons, TICK, WalkMode, type Walker } from '../src/walk';
import { Traversal } from '../src/traversal';

/**
 * JUMP-CAMERA-DIP on the disc (Craig's playtest, 2026-11-22, a release blocker; seat-movement's MP64 repro, kept): the
 * drawn camera through a standing and a running jump in shallow water, on a ramp and on flat ground on Shadow Falls.
 * #842's overhead cap (e6c71d03df) put the drawn eye under the water (min 3.09 / 0.65 over the feet: 1.23 / 3.57 under
 * the surface) and 0.90 over the feet on the ramp's running jump; its parent 07f5c2c6b6 holds 25.71 in every case.
 * The bound: r0004 rides the camera on the actor rigidly through a jump, no clamp to floor or water, its largest
 * legitimate drop ~1 u (seat-kill's read, pilot/kill/keyjob-jumpcam-read.md: FUN_0029a950 D:L142412-142562; reading,
 * pending review), so no drop beyond 1.2 u below the eye before the press. The spots are PINNED, not rescanned, so a
 * collision change cannot silently move the sample (the B-17 census lesson); each is checked to still be what it was.
 */
const DISC = process.env.SOCOM_DISC;
const HAVE_MP64 = !!DISC && existsSync(join(DISC, 'RUN', 'MP64.ZDB'));
const DROP_BOUND = 1.2;
const WATER = { x: 160, z: 1340, floor: 19.68, surface: 24.0 };
const FLAT = { x: 100, z: 1150 };
const RAMP = { x: 250, z: 1000 };
/** Flat GRASS (material 4, FOOT_STEP_OFFSET -0.8, `climb.ts` footStepOffset): the feet sit 0.8 under the floor and the running
 * wind-up sinks them ~0.785 more, so the cast once started under the floor itself (seat-kill's job B; Craig's "usually
 * on flat ground"). The spots above are material 7 (offset 0). */
const GRASS = { x: 100, z: 1350 };
const STILL = { forward: 0, right: 0, boost: false };
const FORWARD = { forward: 1, right: 0, boost: false };
const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
  return c;
};

describe.skipIf(!HAVE_MP64)(`JUMP-CAMERA-DIP on Shadow Falls${HAVE_MP64 ? '' : ' (SOCOM_DISC with RUN/MP64.ZDB absent)'}`, () => {
  it('water, ramp and flat, standing and running: the drawn eye never drops more than 1.2 u in a jump, never under the water', async () => {
    const map = await loadMap(new FsAssetSource(DISC!), 'RUN/MP64.ZDB');
    const grid = groundGrid(map.ground!);
    const top = (x: number, z: number) => probeGround(grid, x, z).reduce((a, b) => (b.y > a.y ? b : a));
    // The pinned spots are still what they were.
    const ws = probeWater(grid, WATER.x, WATER.z);
    expect(ws[0], 'the water surface at the pinned spot').toBeCloseTo(WATER.surface, 1);
    const bed = Math.max(...probeGround(grid, WATER.x, WATER.z).map((h) => h.y).filter((y) => y < ws[0]!));
    expect(bed, 'the bed under it').toBeCloseTo(WATER.floor, 1);
    const flat = top(FLAT.x, FLAT.z), ramp = top(RAMP.x, RAMP.z), grass = top(GRASS.x, GRASS.z);
    expect(grass.normal[1], 'flat grass').toBeGreaterThan(0.995);
    expect(grass.poly.material & 0xff, 'flat grass: material 4').toBe(4);
    expect(flat.normal[1], 'flat').toBeGreaterThan(0.99);
    expect(ramp.normal[1], 'the ramp').toBeGreaterThan(0.9);
    expect(ramp.normal[1], 'the ramp').toBeLessThan(0.95);
    const cases: { label: string; at: [number, number, number]; water: number | null; running: boolean }[] = [
      { label: 'water standing', at: [WATER.x, bed + 1, WATER.z], water: ws[0]!, running: false },
      { label: 'water running', at: [WATER.x, bed + 1, WATER.z], water: ws[0]!, running: true },
      { label: 'ramp standing', at: [RAMP.x, ramp.y + 1, RAMP.z], water: null, running: false },
      { label: 'ramp running', at: [RAMP.x, ramp.y + 1, RAMP.z], water: null, running: true },
      { label: 'flat standing', at: [FLAT.x, flat.y + 1, FLAT.z], water: null, running: false },
      { label: 'flat running', at: [FLAT.x, flat.y + 1, FLAT.z], water: null, running: true },
      { label: 'grass standing', at: [GRASS.x, grass.y + 1, GRASS.z], water: null, running: false },
      { label: 'grass running', at: [GRASS.x, grass.y + 1, GRASS.z], water: null, running: true },
    ];
    for (const c of cases) {
      const m = new WalkMode(new FlyCamera(canvas()), () => undefined);
      m.setGround(map.ground!, null);
      m.useTraversal((w, g) => new Traversal(w.grid, groundPolygons(g)));
      expect(m.respawn(c.at, 0), `${c.label}: respawn`).toBe(true);
      m.walkFor(30 * TICK, STILL);
      if (c.running) m.walkFor(30 * TICK, FORWARD);
      const w = m['walker'] as Walker;
      const before = m.cameraState()!.drawnEye[1] - w.state.y;
      expect(m.jump(), `${c.label}: the jump is taken`).toBe(true);
      let minOverFeet = Infinity, minOverWater = Infinity, air = 0;
      for (let i = 0; i < 90; i++) {
        m.walkFor(TICK, c.running ? FORWARD : STILL);
        const cs = m.cameraState(); if (!cs) continue;
        if (w.airborne) air++;
        minOverFeet = Math.min(minOverFeet, cs.drawnEye[1] - w.state.y);
        if (c.water !== null) minOverWater = Math.min(minOverWater, cs.drawnEye[1] - c.water);
      }
      if (c.running) expect.soft(air, `${c.label}: airborne frames`).toBeGreaterThan(0);
      expect.soft(minOverFeet, `${c.label}: the drawn eye over the feet (before the press ${before.toFixed(2)})`).toBeGreaterThan(before - DROP_BOUND);
      if (c.water !== null) expect.soft(minOverWater, `${c.label}: the drawn eye over the water surface`).toBeGreaterThan(0);
    }
  }, 300_000);
});
