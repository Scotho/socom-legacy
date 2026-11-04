// @vitest-environment node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { groundPolygons, Walker } from '../src/mover';
import { Traversal } from '../src/traversal';
import { loadSimMap } from '../src/simMap';

/**
 * MV-PARITY (b2), the ditch block on M51 (a dev-disc test: `RUN/M51.ZDB` through `loadSimMap`; it skips without
 * `SOCOM_DISC`). The emulator parity harness's incline-prone replays (EPH runs 20261031T154035Z, 154148Z, 154254Z and
 * Craig's live run 014055Z, 17.6-23.4 s) put the original at the ditch's bottom (x 981-986, y about -150) pushed -x by
 * the full stick: it stays blocked by the far side's 7-unit step, slides -z along it (z 843 -> 834) and every jump
 * there (19051, 19213, 19349) leaves it where it was. The page slid +z, met the step where it is lower and climbed out.
 *
 * The cause: three faces of the step meet at (980.3, -143.3, 839.3), and the body pushed -x is within its radius of
 * that corner. `Walker.slide` pushed it away from the corner (+x, +z) and took the velocity's part along that
 * direction, so the body drifted +z at about 30 a second -- fast enough (`RUNNING_JUMP_SPEED` 15) that a jump there was
 * the running jump, whose rise clears the step. The original takes the hit polygon's own normal, never a direction
 * from a corner (`FUN_005483d0` D:L413533-413597: the frame displacement `+0xf44`, the port's move and velocity, loses
 * its part along each hit's normal, D:L413557-413567); every face there turns a -x push to -z. [reading, pending review]
 */
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '';
const HAVE_M51 = !!DISC && existsSync(resolve(DISC, 'RUN', 'M51.ZDB'));

describe.skipIf(!HAVE_M51)(`M51's ditch holds a body pushed into its far side${HAVE_M51 ? '' : ' (SOCOM_DISC absent)'}`, () => {
  it('pushed -x into the step at (984, -150, 841.5): blocked, sliding -z, too slow for the running jump', async () => {
    const map = await loadSimMap(new FsAssetSource(DISC), 'RUN/M51.ZDB');
    const w = new Walker(map.grid);
    w.driver = new Traversal(map.grid, groundPolygons(map.ground));
    expect(w.place(990, -140, 841.5)).toBe(true);
    w.state.yaw = 180;                                           // the replays' facing: the stick's right is -x
    let zMax = -Infinity, xMin = Infinity, yMax = -Infinity, fastest = 0;
    for (let i = 0; i < 90; i++) {
      w.tick({ forward: 0, right: 1, boost: false });
      if (i < 20) continue;                                      // the run down the bank to the step
      zMax = Math.max(zMax, w.state.z); xMin = Math.min(xMin, w.state.x); yMax = Math.max(yMax, w.state.y);
      fastest = Math.max(fastest, Math.hypot(w.state.vx, w.state.vz));
    }
    expect(xMin).toBeGreaterThan(980);                           // never past the step's foot
    expect(yMax).toBeLessThan(-147);                             // never up on the far side (its top is -143 .. -145)
    expect(zMax).toBeLessThanOrEqual(841.5);                     // the slide runs -z, as the original's (843 -> 834)
    expect(w.state.z).toBeLessThan(838);
    expect(fastest).toBeLessThan(15);                            // a jump here is the standing jump: no rise
  }, 120_000);
});
