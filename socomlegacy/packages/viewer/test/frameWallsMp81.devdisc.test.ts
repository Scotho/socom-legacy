// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { simMapFromBytes } from '../src/simMap';
import { probeLiftOf, Walker } from '../src/mover';

/**
 * LATER 1194 (simulation track; reading, pending review; the capture comparison is the r0004 rig's): MP81's steel crate.
 * From inside the crate (`props/steel_crate`), placed at (1481.77, 5.00, 2011.97), yaw -84, 3 s of full forward stick:
 * the original walks through `wall2185` from behind (one-sided) to x 1487.18, where the far d2 wall (x 1493.54, normal
 * (-1, 0, 0)) is met by a frame whose segments reach 1.15 deep with three hits, and is HELD there by the jam (`FUN_005483d0`
 * D:L413598-413609) for the rest of the 3 s: z moves 0.36 / 0.49 (relay-3's rig rows, PC 3, 2 standing trials; the
 * residual creep is unread). Before the fix the port stopped at x 1487.70 and slid along the far wall toward -z at 6.8 u/s,
 * 15.6 u in about 2 s (`GROUND_WALLS_PER_TICK_READING` 'per-tick': segments a tick's move long, deepest 0.59, no jam).
 * The 0.52 between the two holds is the port's ramp phase (`GROUND_FIRST_STEP_READING`), not this rule's.
 *
 * Asserted: once stopped, the body holds -- z moves under 1 u over the 3 s, and x stays within the face's reach.
 * The dev disc: `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; skipped (and said) without it.
 */

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const ZDB = DISC ? join(DISC, 'RUN', 'MP81.ZDB') : '';
const HAVE = !!ZDB && existsSync(ZDB);

describe.skipIf(!HAVE)('LATER 1194: MP81 steel crate, pressed square into the far wall from inside -- the port holds (dev disc)', () => {
  it('stops short of the far wall and holds for the rest of 3 s of full stick', () => {
    const grid = simMapFromBytes(new Uint8Array(readFileSync(ZDB)), 'RUN/MP81.ZDB').grid;
    const w = new Walker(grid);
    w.stance = 'stand';
    w.place(1481.77, 5.0 + probeLiftOf('stand') + 0.1, 2011.97);
    w.state.yaw = -84;
    // The capture's phase: 31 still ticks put the first pressed tick on the frame clock's start (`throttleFrameEnds`), as
    // the original reads its pad once a frame, so the port's frame moves are the original's 0.362, 0.722, 1.082, 1.443,
    // 1.803 (LATER 1164's ramp) and the run stops at 1487.16 (the rig's 1487.18) and jams. The hold rests on the phase at
    // which a frame first meets the wall (about 54 % of them, `frameWalls.test.ts`): with 30 still ticks the frames pair
    // the other ticks, the run stops at 1486.21 with two hits and slides -- as the original does from its 1486.36 approach
    // (relay-2's separation look, `GROUND_WALLS_PER_TICK_READING`'s note), until a half-length frame the port does not
    // have (`GROUND_HALF_STEP_READING`). Not asserted here.
    for (let i = 0; i < 31; i++) w.tick({ forward: 0, right: 0, boost: false });
    const xs: number[] = [], zs: number[] = [];
    for (let t = 0; t < 180; t++) {
      w.tick({ forward: 1, right: 0, boost: false });
      xs.push(w.state.x); zs.push(w.state.z);
      expect(w.airborne).toBe(false);
    }
    const stop = xs.findIndex((x, i) => i > 5 && x === xs[i - 1]);
    expect(stop).toBeGreaterThan(0);
    expect(stop).toBeLessThan(30);                               // the original stopped within 6 frames of the run's start
    const x = xs[xs.length - 1]!;
    expect(x).toBeGreaterThan(1486.5);                           // within a frame's move of the original's 1487.18
    expect(x).toBeLessThan(1493.54 - 3.5);
    expect(Math.abs(zs[zs.length - 1]! - zs[stop]!)).toBeLessThan(1);   // HELD: the original's z moved 0.36 / 0.49
  }, 120_000);
});

if (!HAVE) {
  describe('LATER 1194 MP81 (dev disc)', () => { it.skip('skipped: no dev disc (SOCOM_DISC / SOCOM_PC_ROOT)', () => {}); });
}
