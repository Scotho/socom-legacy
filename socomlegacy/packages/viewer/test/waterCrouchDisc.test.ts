// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { simMapFromBytes } from '../src/simMap';
import { Traversal } from '../src/traversal';
import { groundGrid, groundPolygons, Walker, type WalkInput } from '../src/mover';

/**
 * INV-WATER-CROUCH on the dev disc (`SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; skipped -- and said so -- without
 * it; with it, a map file missing is a failure). The owner's report: on Ruins (MP12) and Night Stalker (MP7) a player
 * crouched in deep water stays crouched. At the two spots the investigation found (`waterCrouch.probe.test.ts`, the
 * water 7.5-8.5 deep: over 7.504, the crouched hips + 2, and under 8.5, `FUN_005857e0`'s crouch limit D:L444334-444355),
 * a crouched SEAL's stand press is taken and a full stick runs upright, in COMBINED and SEPARATE -- the stand's and the
 * crouch run's cast (`FUN_0057efe0` D:L441190-441245) one-sided as the hull's per-collider test is (`FUN_002d2890` side
 * mode 0x20, D:L174831-174837; `FUN_00316e30` D:L215827-215828; research 281 s4.3). Reading, pending review.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '';
const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const RUN: WalkInput = { forward: 1, right: 0, boost: false };

/** The spots (feet on the bed), from the investigation's probe: x, the bed's y, z. */
const SPOTS = [['MP12', 1532, 35.5, 1892], ['MP7', 1484, 39.4, 1724]] as const;

function load(name: string) {
  const map = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC, 'RUN', `${name}.ZDB`))), `RUN/${name}.ZDB`);
  return { grid: groundGrid(map.ground!), polys: groundPolygons(map.ground!) };
}

describe.skipIf(!HAVE_DISC)(`deep water: the crouched stand and crouch run on the dev disc${HAVE_DISC ? '' : ' (no dev disc -- skipped)'}`, () => {
  for (const [name, x, y, z] of SPOTS) {
    it(`${name} (${x}, ${y}, ${z}): crouched 7.5-8.5 deep, the stand is taken and the crouch run runs`, () => {
      const { grid, polys } = load(name);
      for (const separate of [false, true]) {
        const fresh = (): { w: Walker; t: Traversal } => {
          const w = new Walker(grid);
          const t = new Traversal(grid, polys);
          w.driver = t;
          w.stanceSeparate = separate;
          w.stanceCut = true;
          expect(w.place(x, y + 10, z)).toBe(true);
          for (let i = 0; i < 30; i++) w.tick(STILL);
          expect(w.state.y).toBeCloseTo(y, 0);
          w.stance = 'crouch';
          w.tick(STILL);
          expect(w.stance).toBe('crouch');                      // under 8.5: the water keeps the crouch
          const depth = t.depth();
          expect(depth).toBeGreaterThan(7.504);                  // the water line over the crouched ray's start
          expect(depth).toBeLessThanOrEqual(8.5);
          return { w, t };
        };
        const a = fresh();
        expect(a.w.headroom('stand')).toBe(true);
        a.w.changeStance('stand');
        for (let i = 0; i < 40; i++) a.w.tick(STILL);
        expect(a.w.stance, `${name} ${separate ? 'SEPARATE' : 'COMBINED'} stand`).toBe('stand');

        const b = fresh();
        const postures = new Set<string>();
        for (let i = 0; i < 30; i++) { b.w.tick(RUN); postures.add(b.w.posture); }
        expect(b.w.stance).toBe('crouch');
        expect(b.w.posture, `${name} ${separate ? 'SEPARATE' : 'COMBINED'} crouch run`).toBe('stand');
        expect([...postures]).not.toContain('crouch');
      }
    }, 120_000);
  }
});
