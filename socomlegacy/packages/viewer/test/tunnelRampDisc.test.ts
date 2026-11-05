// @vitest-environment node
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import type { Grid } from '@s2u/scene';
import { loadMap } from '../src/loadMap';
import { CROUCH_GATE_REACH_READING, CROUCH_GATE_READING, groundGrid, STEP_PROBE_LIFT_READING, Walker } from '../src/mover';

/**
 * LATER 412 (struck, 2026-10-26): "a crouched walk stops dead at the foot of Frostfire's tunnel ramp; a standing one
 * passes" was a head-on wall, not the crouch. Walking +z from (382.81, 63.2, 1110), the low probe line (feet + 6.5,
 * `wallProbeHeights`) meets a face of `worldmodel/tun1_4` at z 1120 square on, and the slide removes the whole velocity
 * into it (`FUN_005483d0` D:L413533-413597; research 217 §2.3): the body stands at the 3.5 radius, z 1116.5, standing
 * or crouched alike. At x 384 the body meets the face's end (x 383, where the opening's side wall `tun1_7/di7` turns
 * away) 1 off its axis. MV-PARITY (b2), re-derived: the slide pushed the body out along the direction from that corner,
 * so it slid +x to the opening (x 386.5) and climbed -- the port's own output when the case was written. The original's
 * hit has the face's own normal (-z) and is met by the fan's side line, 1.05 to 4.2 off the axis
 * (`WALL_END_CONTACT_READING`; `FUN_005483d0` D:L413557-413567, `FUN_0054aa30` D:L415549-415577): the walk +z loses its
 * part into the face and stops there, standing or crouched alike; a line clear of the corner (x 387.5) climbs. The
 * report's crouch had moved its feet by the stand-to-crouch clip (research 180's `seal_stand2crouch`) -- the probe
 * measured its feet 1.73 units along the facing -- before it turned, onto the square-on line. Off the dev disc
 * (`SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`); skipped, and said so, without it.
 */

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '' && existsSync(join(DISC, 'RUN', 'MP2.ZDB'));

let grid: Grid | null = null;
const mp2 = async (): Promise<Grid> => (grid ??= groundGrid((await loadMap(new FsAssetSource(DISC), 'RUN/MP2.ZDB')).ground!));

/**
 * A walker in `stance`, settled at (384, 63.2, 1110) facing +z (a crouch asked at x 382.81 is refused there by the crouch
 * gate, LATER 497 below), then set on the start line (x, 1110) and walked toward +z at stick 0.6 for 3 s.
 */
const walkUp = (g: Grid, x: number, stance: 'stand' | 'crouch'): Walker => {
  const w = new Walker(g);
  expect(w.place(384, 63.2 + STEP_PROBE_LIFT_READING, 1110)).toBe(true);
  w.state.yaw = 180;                                             // facing +z before any stance change: no root travel across
  for (let i = 0; i < 10; i++) w.tick({ forward: 0, right: 0, boost: false });   // settled on the floor first
  if (stance === 'crouch') w.changeStance('crouch');
  for (let i = 0; i < 60; i++) w.tick({ forward: 0, right: 0, boost: false });
  expect(w.posture, `${stance} before the walk`).toBe(stance);
  w.state.x = x;                                                 // the clip's root travel undone: the same line for both stances
  w.state.z = 1110;
  for (let i = 0; i < 90; i++) w.tick({ forward: 0.6, right: 0, boost: false });
  return w;
};

describe.skipIf(!HAVE_DISC)(`LATER 412: Frostfire's tunnel ramp foot, standing and crouched alike${HAVE_DISC ? '' : ' (no dev disc: SOCOM_DISC or SOCOM_PC_ROOT -- skipped)'}`, () => {
  // SEGMENT-BODY: the stop is the centre segment's reach, 1.1 x 1.4 r = 5.39 (D:L415166, D:L415235), less part of a 60 Hz
  // move: standing z 1114.48 (5.52 off the face at z 1120); crouched the forward reach is x 1.75 (D:L415354-415371): z
  // 1110.43 (9.57 off). [reading, pending a capture: r0004's flat-wall standing stand-off is 6.78, the open 30 Hz settle,
  // H404] Was: both at the disc's 3.5 radius, z 1116.5.
  it("square on to tun1_4 at x 382.81: standing and crouched stop at the centre segment's reach (z 1114.5, crouched 1110.4)", async () => {
    const g = await mp2();
    for (const stance of ['stand', 'crouch'] as const) {
      const w = walkUp(g, 382.81, stance);
      expect(w.posture, stance).toBe(stance);
      expect(w.state.z, stance).toBeCloseTo(stance === 'stand' ? 1114.5 : 1110.4, 1);
      expect(w.state.y, stance).toBeCloseTo(63.19, 1);
      expect(w.wallHits().map((h) => h.poly.path), stance).toContain('worldmodel/tun1_4');
    }
  }, 300_000);

  it("1 off the face's end (x 384): both stances stop at it; clear of it (x 387.5), both climb the ramp", async () => {
    const g = await mp2();
    for (const stance of ['stand', 'crouch'] as const) {
      const w = walkUp(g, 384, stance);
      expect(w.state.x, stance).toBeCloseTo(384, 3);                // nothing turns it along the face (was: to 386.5)
      expect(w.state.z, stance).toBeLessThan(1117);                 // held short of the corner (383, 1120)
      expect(w.state.y, stance).toBeCloseTo(63.19, 1);
      const clear = walkUp(g, 387.5, stance);
      expect(clear.state.z, stance).toBeGreaterThan(1125);
      expect(clear.state.y, stance).toBeGreaterThan(65);
    }
  }, 300_000);

  // LATER 497 (struck): the crouch asked at (382.81, 1110) facing +z is refused by the crouch gate -- `FUN_00552ec0`'s
  // `FUN_0054d620` from stand (D:L418958-418964; `CROUCH_GATE_READING`): a wall within |firepoint| x 1.2 ahead
  // (`CROUCH_GATE_REACH_READING` 9.03, so 10.84) at the feet + 7.8 (the port's `stepHeight` x 1.2 for `DAT_0044c26c` x 1.2) -- tun1_4's face at z 1120, 10.0 ahead. At x 383.5 and
  // 384 the segment clears the face's edge and the crouch is taken.
  it("the crouch gate at the foot: refused at x 382.81 (tun1_4's face 10.0 ahead, within 10.84), taken at x 383.5 and 384", async () => {
    const g = await mp2();
    expect(CROUCH_GATE_REACH_READING.stand * CROUCH_GATE_READING.scale).toBeGreaterThan(10);
    for (const [x, refused] of [[382.81, true], [383.5, false], [384, false]] as const) {
      const w = new Walker(g);
      expect(w.place(x, 63.2 + STEP_PROBE_LIFT_READING, 1110)).toBe(true);
      w.state.yaw = 180;
      for (let i = 0; i < 10; i++) w.tick({ forward: 0, right: 0, boost: false });
      expect(w.crouchRefused(), `x ${x}`).toBe(refused);
      w.changeStance('crouch');
      for (let i = 0; i < 60; i++) w.tick({ forward: 0, right: 0, boost: false });
      expect(w.posture, `x ${x}`).toBe(refused ? 'stand' : 'crouch');
    }
  }, 300_000);
});
