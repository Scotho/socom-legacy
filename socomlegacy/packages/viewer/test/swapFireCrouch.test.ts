// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGrid, GAME_FRAME_DT, HELD_RIFLE, readKitTable, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { Accuracy, itemReticleOf, type ItemReticle } from '../src/accuracy';
import { moverSnapshot, TICK, Walker } from '../src/mover';

/**
 * SWAPFIRE-CROUCH (simulation track): the rifle's reticle through a crouched run's release, with and without the M67
 * swap, measured on the page's own code -- the real `Walker` (SEPARATE, the crouch run at full stick, the stick let go)
 * fed to the real `Accuracy` as `./matchFirearm` feeds it (`stance` = the snapshot's stance in use, else its posture --
 * `PlaySnapshot.stanceInUse`, `FUN_0058a720(body, 1)`; `rawStance` = the stance word, the body's velocity;
 * `matchFirearm.ts` `accuracy.update`).
 *
 * THE ORIGINAL (proven: the atlas's r0004 capture on LAN Desert Glory, 92 runs, one memory read per game update;
 * `origin/agent/spc-atlas` 899c79b16a `socomlegacy/docs/atlas/captures/nade-swap-reticle-r0004-desert-glory.md`, sha256
 * e27997a8...): the M4A1 SD, the M67 on QUICK 2; frame 0 = the first update with the stick forward; script A: L2 (the
 * grenade) at 60, the stick released at 61, L1 (the rifle) at 70; script B: the stick released at 60. b = the release.
 * - CROUCHED (posture word `actor+0x174` 1): after the release the feet keep moving 19 frames, the action word
 *   `actor+0x534` 17 (`Stand -> Crouch`, 0x11), then 18 (crouched idle). The size reaches 1.000 at b+13 (A) / b+14 (B)
 *   and waits there while the action word reads 17; 0.750 on the first frame it reads 18, b+19 in both on this record
 *   -- one half-length update inside the stop (its step 16); at a steady dt the stop is 18 frames, the port's (the
 *   action-end read, r0004 0x28da70; the controller's 08:20Z ruling) (the record's table rows C and CS, 16 of 16; per-frame C-A-1 "74-79:1 80-115:0.75", C-B-2 "74-78:1 79-105:0.75", CS-A-1, CS-B-1).
 * - STANDING (posture 0): the action word 2 -> 1 on the release frame, the body stops at once; the floor 1.000 (P-B-6
 *   "74-105:1", P-A-5 "72-115:1"; never below 1.000 in any standing run).
 *
 * THE TICK, said: the page's mover ticks at 60 Hz (`TICK` 1/60) and numbers its ticks (`commandSeq`); a game frame is
 * `GAME_FRAME_DT` = 525/15734 s, so game frame g holds the ticks n with floor(n x TICK / GAME_FRAME_DT) = g (the
 * mover's own `throttleFrameEnds` rule; about 2.0019 ticks a frame). The page's kit runs one `update` of `dt` per page
 * frame (MISSION R8); here one per mover tick, `dt` = TICK. Frame 0 is the game frame the stick goes forward on (made
 * to begin a game frame, as the original reads the stick once a frame); a row is the size after its frame's last
 * tick, as the record's row is the read after the update.
 */

const zweapon = fixture('RUN/ZWEAPON.ZAR');
const table = zweapon ? readKitTable(zweapon) : null;
const M67 = 121;                                                   // scene `projectile.ts` M67 `id`
const EAST = 270;                                                  // the camera looks down its own -z: facing +x
const FORWARD = { forward: 1, right: 0, boost: false };
const STILL = { forward: 0, right: 0, boost: false };
const frameOf = (n: number): number => Math.floor((n * TICK + 1e-9) / GAME_FRAME_DT);

function world(): ReturnType<typeof buildGrid> {
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-400, 0, 400, 400, 0, 400, 400, 0, -400, -400, 0, -400]),
  };
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 8, cellsZ: 8, originX: -400, originZ: -400 };
  const owners: CollisionOwner[] = [{ modelName: floor.modelName, path: `${floor.path}0`, first: 0, count: 1 }];
  return buildGrid(params, [], [], [floor], owners);
}

interface Row { frame: number; size: number; posture: string; stance: string; action: string; step: number; item: boolean }

/** One script on the page's code: rows by game frame from the stick's press (0) to `last`. */
function drive(crouched: boolean, script: 'A' | 'B', nade: ItemReticle | null, last = 110): Row[] {
  const w = new Walker(world());
  w.stanceSeparate = true;                                         // SEPARATE: the crouch run's release is built there (OT.R93)
  expect(w.place(-300, 1, 0)).toBe(true);
  let seq = 2;
  const acc = new Accuracy(HELD_RIFLE);
  const step = (input: typeof STILL): void => {
    w.commandSeq = seq++;
    w.tick(input);
    const s = moverSnapshot(w, null, 0, 0);
    acc.update(TICK, {
      stance: s.stanceInUse ?? s.stance, rawStance: w.stance, velocity: [s.vx, s.vy, s.vz], airborne: s.airborne,
      yawRate: 0, pitchRate: 0, zoomState: 0, sticks: { forward: input.forward, right: input.right, turn: 0, pitch: 0 },
    });
  };
  w.state.yaw = EAST;
  for (let i = 0; i < 30; i++) step(STILL);
  if (crouched) w.changeStance('crouch');
  for (let i = 0; i < 180; i++) step(STILL);                       // 3 s still (the record's 90 updates)
  while (frameOf(seq) === frameOf(seq - 1)) step(STILL);          // the press's tick begins a game frame
  expect(w.posture).toBe(crouched ? 'crouch' : 'stand');
  const f0 = frameOf(seq);
  const b = script === 'A' ? 61 : 60;
  const rows: Row[] = [];
  let x = w.state.x;
  for (let g = 0; g <= last; g++) {
    if (script === 'A' && g === 60) acc.setItem(nade);             // L2: the M67 up
    if (script === 'A' && g === 70) acc.setItem(null);             // L1: the rifle back
    while (frameOf(seq) === f0 + g) step(g < b ? FORWARD : STILL);
    rows.push({
      frame: g, size: acc.state().size, posture: w.posture, stance: w.stance, action: w.action?.name ?? '-',
      step: Math.hypot(w.state.x - x, 0), item: script === 'A' && g >= 60 && g < 70,
    });
    x = w.state.x;
  }
  return rows;
}

const show = (label: string, rows: Row[], from = 55, to = 85): string =>
  `${label}: ` + rows.slice(from, to + 1).map((r) => `${r.frame}:${r.size.toFixed(3)}${r.item ? 'g' : ''}[${r.posture[0]}${r.stance[0]} ${r.action} ${r.step.toFixed(3)}]`).join(' ');

describe.skipIf(table === null)(`SWAPFIRE-CROUCH: the rifle's floor through the crouched stop (atlas r0004 Desert Glory)${table ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const nade = (): ItemReticle => { const r = itemReticleOf(table!, M67); expect(r).not.toBeNull(); return r!; };

  it('crouched, B (the stick let go at 60): 1.000 from b+14, held while the crouched stop plays (C-B-2, CS-B-1)', () => {
    const rows = drive(true, 'B', null);
    console.log(show('C-B port', rows));
    const b = 60;
    expect(rows[b - 1]!.size, 'running: open to 26').toBeCloseTo(26, 6);
    // The stand row itself (the review's F5): it closes 50 a second, 1.667 a frame (the record 1.668), not the crouch
    // row's 55 (1.833).
    for (let g = b + 1; g <= b + 9; g++) expect(rows[g - 1]!.size - rows[g]!.size, `closing at b+${g - b}`).toBeCloseTo(50 / 30, 2);
    for (let g = b + 14; g <= b + 17; g++) expect(rows[g]!.size, `frame ${g} (b+${g - b})`).toBeCloseTo(1, 3);
  });

  // The stop's length: the original ends a one-shot at the NEAREST whole frame to its length over the measured dt
  // (r0004 0x28da70 / FUN_0028c6e0: phase + half the frame's step strictly past the stop; pilot key job
  // keyjob-action-end-read.md, a reading pending review): Stand -> Crouch's 0.6027 s is 18.06 frames -> 18, as the
  // port's and the Frostfire record's; Desert Glory's 19 holds one half-length update inside the stop (its step 16).
  it('crouched, B: the crouched stop ends at b+18, the crouch floor 0.750 from there (the steady-dt answer)', () => {
    const rows = drive(true, 'B', null);
    const b = 60;
    for (let g = b + 18; g <= 105; g++) expect(rows[g]!.size, `frame ${g} (b+${g - b})`).toBeCloseTo(0.75, 3);
  });

  it('crouched, A (the M67 at 60, the release at 61, the rifle at 70): 1.000 from b+13, held (C-A-1, CS-A-1)', () => {
    const rows = drive(true, 'A', nade());
    console.log(show('C-A port', rows));
    const b = 61;
    for (let g = b + 13; g <= b + 17; g++) expect(rows[g]!.size, `frame ${g} (b+${g - b})`).toBeCloseTo(1, 3);
  });

  it('crouched, A: the crouched stop ends at b+18, the crouch floor 0.750 from there (the steady-dt answer)', () => {
    const rows = drive(true, 'A', nade());
    const b = 61;
    for (let g = b + 18; g <= 110; g++) expect(rows[g]!.size, `frame ${g} (b+${g - b})`).toBeCloseTo(0.75, 3);
  });

  it('crouched, A and B reach the floor 0.750 on the same frame from their release (b+18 both, the steady-dt answer: no swap lead crouched)', () => {
    const first = (rows: Row[], b: number): number => rows.findIndex((r, g) => g >= b && r.size <= 0.75 + 1e-6) - b;
    expect(first(drive(true, 'A', nade()), 61)).toBe(18);
    expect(first(drive(true, 'B', null), 60)).toBe(18);
  });

  it('control, standing: the body stops on the release frame and the floor is 1.000 (B at b+14 or b+15, A at b+11 or b+12; P-B-6, P-A-5)', () => {
    const rb = drive(false, 'B', null), ra = drive(false, 'A', nade());
    console.log(show('P-B port', rb));
    console.log(show('P-A port', ra));
    const reach = (rows: Row[], b: number): number => rows.findIndex((r, g) => g >= b && r.size <= 1 + 1e-6) - b;
    expect([14, 15]).toContain(reach(rb, 60));
    expect([11, 12]).toContain(reach(ra, 61));
    for (const [rows, b] of [[rb, 60], [ra, 61]] as const) {
      for (let g = b + 1; g <= 110; g++) expect(rows[g]!.step, `frame ${g}: the feet stopped`).toBeLessThan(1e-6);
      for (let g = b + 16; g <= 110; g++) expect(rows[g]!.size, `frame ${g}`).toBeCloseTo(1, 6);
    }
  });
});
