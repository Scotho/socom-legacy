import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, Walker } from '../src/sim';
import { applyFall, fallDamageFraction, freshHealth, MP_HEALTH, PARTS } from '../src/net/damage';

/**
 * A drop from rest at six heights, through the port's real mover, against the rig's fall-damage capture (R145).
 *
 * WHAT WAS MEASURED (a capture of the original, pending review; one match, MP12; by PLACEMENT): bodies set at rest in
 * the air over flat ground by a set-up write and left to fall, the placement logged; the six healths read every row;
 * the armour never changed. The loss was one fraction of each health's maximum, the same on all six:
 *   50 u: 0;  56 u: 0;  62 u: 0.143 (x 0.857);  75 u: 0.381 (x 0.619);  90 u: 0.614 (x 0.386);  120 u: dead.
 * The record: `evidence/weekend-mega-2026-11-14/rig/RELAY1-mp12-B3-fall-damage-B1-closed-1302Z.md` on the sprint's hub
 * (the 56 u and 75 u rows added by the main controller's relay of the same session). The port's curve is research 151
 * (`../src/net/damage` `fallDamageFraction`, `applyFall`, `FALL_SPEEDS`): (v - light) / (death - light) on the
 * landing's contact speed.
 *
 * WHAT THE DIFFERENCE IS, AS FAR AS IT IS READ (source inspection, 2026-11-15, pending review): the port's order is the
 * original's -- each game frame adds g dt to the fall speed, moves the height by the new speed, tests the floor, and
 * hands the landing the speed with that frame's g dt in it (`FUN_0059b440` D:L456496-456516, `FUN_005af930`
 * D:L466790-466910; `../src/mover` the air step and `land`) -- so a body at rest h over a floor lands on the first
 * frame k with h <= g dt^2 k (k + 1) / 2, carrying k g dt, in both. The capture's losses are the curve's at ONE FRAME
 * MORE than that (k + 1) at 62, 75, 90 and 120 u. Two readings fit, neither established: the placed body's true drop
 * was 4.2 to 4.44 u more than the stated height (fits all six rows, the 56 u one too), or the original's fall starts
 * one g dt on (misses 56 u). So this red may be the PLACEMENT's, not the port's.
 *
 * A RED KEPT ON THE BRANCH (R145): this test is expected to fail at some heights, and no cure is opened -- the read of
 * where the original detects the landing and which speed it hands `FUN_005ac1f0` (`FUN_0059b440`, `FUN_005af930`,
 * `FUN_005af590`) and a walk-off drop from a real ledge on the rig come first. Evidence kind: unit test over synthetic
 * geometry (one flat floor); no disc data. The harness is `test/knock.test.ts`'s `flat()` and its drop (`state.y`,
 * `setAirborne(true)`, idle ticks).
 */

const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};

function flat(): Walker {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const w = new Walker(groundGrid(packGround(params, [FLOOR], owners)));
  w.place(0, 20, 0);
  w.settle();
  return w;
}

const STILL = { forward: 0, right: 0, boost: false };
/**
 * One game frame's g dt (g 235, the frame 525 / 15734 s): the frames a fall took are its contact speed over this. (The
 * landing's `airTime` sums 60 Hz ticks and reads half a frame long: it gave 21 / 22 / 23 / 25 / 27 / 31 here, one too
 * many each.)
 */
const G_DT = 235 * (525 / 15734);

interface Drop { h: number; speed: number; frames: number; loss: number; dead: boolean; hp: number[] }

/** A body at rest `h` over the floor, no stick, stepped until it lands: its contact speed and what the landing takes. */
function drop(h: number): Drop {
  const w = flat();
  w.state.y = h;
  w.setAirborne(true);
  for (let i = 0; i < 10 * 60 && w.airborne; i++) w.tick(STILL);
  expect(w.airborne, `${h} u: landed`).toBe(false);
  const landing = w.landing!;
  expect(landing).not.toBeNull();
  const health = freshHealth();
  const dead = applyFall(health, landing.speed);
  return { h, speed: landing.speed, frames: Math.round(landing.speed / G_DT), loss: fallDamageFraction(landing.speed), dead, hp: [...health.hp] };
}

/** The measured loss of each health as a fraction of its maximum (1: dead). */
const MEASURED: readonly (readonly [number, number])[] = [[50, 0], [56, 0], [62, 0.143], [75, 0.381], [90, 0.614], [120, 1]];

describe('a drop from rest against the rig\'s fall-damage capture (MP12, by placement, pending review; R145: a red kept)', () => {
  it('50 u: no loss (measured: 0 -- a capture of the original by placement, pending review)', () => {
    const d = drop(50);
    expect(d.loss).toBeLessThanOrEqual(0 + 0.01);
    for (let i = 0; i < PARTS; i++) expect(d.hp[i], `part ${i}`).toBeCloseTo(MP_HEALTH[i]! * (1 - 0), 1);
  });

  it('56 u: THE OPEN ONE -- no loss measured (0, a capture of the original by placement, pending review)', () => {
    // THE OPEN ONE: nothing was measured here and the port gives nothing (21 frames). It decides between the header's
    // two readings: one g dt more would give about 0.03 here (not measured); a true drop 4.196 to 4.439 u more than
    // stated still lands on frame 21. Kept as an assertion like the others, not skipped.
    const d = drop(56);
    expect(d.loss).toBeLessThanOrEqual(0 + 0.01);
  });

  // LATER 1240 (the fall-leave-edge plan's open row 1): a placed drop's flag is unread (FALL_FLAG_PLACED_READING), so
  // this row stays red on FLE-1 and FLE-2 alike -- an expected failure until the write-watch of a placed drop.
  it.fails('62 u: every health x 0.857 (measured loss 0.143 -- a capture of the original by placement, pending review)', () => {
    const d = drop(62);
    expect(Math.abs(d.loss - 0.143), `loss ${d.loss}`).toBeLessThanOrEqual(0.01);
    expect(d.dead).toBe(false);
  });

  // LATER 1240 (the fall-leave-edge plan's open row 1): a placed drop's flag is unread (FALL_FLAG_PLACED_READING), so
  // this row stays red on FLE-1 and FLE-2 alike -- an expected failure until the write-watch of a placed drop.
  it.fails('75 u: every health x 0.619 (measured loss 0.381 -- a capture of the original by placement, pending review)', () => {
    const d = drop(75);
    expect(Math.abs(d.loss - 0.381), `loss ${d.loss}`).toBeLessThanOrEqual(0.01);
    expect(d.dead).toBe(false);
  });

  // LATER 1240 (the fall-leave-edge plan's open row 1): a placed drop's flag is unread (FALL_FLAG_PLACED_READING), so
  // this row stays red on FLE-1 and FLE-2 alike -- an expected failure until the write-watch of a placed drop.
  it.fails('90 u: every health x 0.386 (measured loss 0.614 -- a capture of the original by placement, pending review)', () => {
    const d = drop(90);
    expect(Math.abs(d.loss - 0.614), `loss ${d.loss}`).toBeLessThanOrEqual(0.01);
    expect(d.dead).toBe(false);
  });

  // LATER 1240 (the fall-leave-edge plan's open row 1): a placed drop's flag is unread (FALL_FLAG_PLACED_READING), so
  // this row stays red on FLE-1 and FLE-2 alike -- an expected failure until the write-watch of a placed drop.
  it.fails('120 u: dead, all six healths 0 (measured -- a capture of the original by placement, pending review)', () => {
    const d = drop(120);
    expect(d.dead).toBe(true);
    expect(d.hp).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('informational: the port\'s landing speed, frames in the air and loss beside the measured loss (asserts only six rows)', () => {
    const rows = MEASURED.map(([h, measured]) => {
      const d = drop(h);
      return { h, speed: Number(d.speed.toFixed(2)), frames: d.frames, portLoss: d.dead ? 'dead' : Number(d.loss.toFixed(3)), measured: measured === 1 ? 'dead' : measured };
    });
    console.log(['h | port speed u/s | frames (30 Hz) | port loss | measured loss', ...rows.map((r) =>
      `${r.h} | ${r.speed} | ${r.frames} | ${r.portLoss} | ${r.measured}`)].join('\n'));
    expect(rows).toHaveLength(6);
  });
});
