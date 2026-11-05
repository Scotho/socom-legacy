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
 *
 * Those replays ran build r0001 (their `record.json`: `build` and `revision.detected` r0001), whose stored contact turns
 * the jump standing (`FUN_0057e1b0` D:L440815-440819) -- the rejected reading (research 217 s2.9). The r0004 spec's
 * own trace is ac's ditch capture (2026-11-04, RESULTS.md beside its CSVs): from (990, -140, 841.5) facing 180, held
 * right, the body stalls at (982.40, -150.84, 841.50) and every press is the running jump, which rises +13.17 and lands
 * back in the ditch. [proven: a memory trace of the original running]
 */
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '';
const HAVE_M51 = !!DISC && existsSync(resolve(DISC, 'RUN', 'M51.ZDB'));

describe.skipIf(!HAVE_M51)(`M51's ditch holds a body pushed into its far side${HAVE_M51 ? '' : ' (SOCOM_DISC absent)'}`, () => {
  const push = async () => {
    const map = await loadSimMap(new FsAssetSource(DISC), 'RUN/M51.ZDB');
    const w = new Walker(map.grid);
    w.driver = new Traversal(map.grid, groundPolygons(map.ground));
    expect(w.place(990, -140, 841.5)).toBe(true);
    w.state.yaw = 180;                                           // the replays' facing: the stick's right is -x
    let zMax = -Infinity, xMin = Infinity, xMax = -Infinity, yMax = -Infinity, fastest = 0, running = 0, ticks = 0;
    for (let i = 0; i < 90; i++) {
      w.tick({ forward: 0, right: 1, boost: false });
      if (i < 20) continue;                                      // the run down the bank to the step
      zMax = Math.max(zMax, w.state.z); xMin = Math.min(xMin, w.state.x); xMax = Math.max(xMax, w.state.x); yMax = Math.max(yMax, w.state.y);
      fastest = Math.max(fastest, Math.hypot(w.state.vx, w.state.vz));
      ticks++;
      const kept = w.saveState();                                // a jump pressed on this tick, undone after
      if (w.jump() && w.airborne) running++;
      w.restoreState(kept);
    }
    expect(xMin).toBeGreaterThan(980);                           // never past the step's foot
    // SEGMENT-BODY (re-judged; was yMax under -147): the strafe's centre segment (5.39 + the move at the feet + 6.5, no
    // 1.75: the body-frame z is none) holds it 2 to 5 off the step's foot, inside the replays' x 981-986, and the slide
    // -z runs it up the near bank's foot to -146 at z 834 -- the near side, not the far (x stays over 980).
    expect(yMax).toBeLessThan(-145);                             // never up on the far side (its top is -143 .. -145)
    expect(xMax).toBeLessThan(986.5);                            // within the replays' x 981-986 once at the step
    expect(zMax).toBeLessThanOrEqual(841.5);                     // the slide runs -z, as the original's (843 -> 834)
    expect(w.state.z).toBeLessThan(838);
    expect(fastest).toBeGreaterThan(0);
    return { running, ticks, walker: w };
  };
  it('pushed -x into the step at (984, -150, 841.5): blocked, sliding -z', async () => {
    await push();
  }, 120_000);
  // LATER 676, closed as faithful: the running jump is offered on every tick at the step. `FUN_0057e1b0` squares the
  // clip's velocity `+0x2c..+0x34` (D:L440812-440814; r0004 0x583668-0x583694), which the walls never cut
  // (`FUN_005483d0` cuts only `+0xf44` and `+0x1350`, D:L413533-413597): the port reads the tick's velocity before the
  // walls (`Walker.jump`, `RUNNING_JUMP_SPEED`). Proven by ac's r0004 ditch capture (agent-mail/evidence/
  // eph-hunt-2026-11-01/segment-body/ditch-capture/RESULTS.md, case 1 x3, 2026-11-04): from this start, held right until
  // blocked at (982.40, -150.84, 841.50), the body moving 0.00 a second against a clip velocity of 65 and `+0x10ac` set,
  // every press gave the running jump (type 8), never the standing jump (178). Was `it.fails` "no tick offers", which
  // rested on r0001 replays (research 217 s2.9, the rejected reading).
  it('every tick at the step offers the running jump: 70 of 70 (the r0004 ditch capture)', async () => {
    const { running, ticks } = await push();
    expect(ticks).toBe(70);
    expect(running).toBe(70);
  }, 120_000);
  // The owner's concern (6d, 2026-11-04): nobody is stuck in the ditch. From where the push leaves the body (the step's
  // foot), the stick forward up the near bank (+x, yaw 270) or across it (yaw 225, 315) reaches ground 15 over the
  // ditch's floor (-150) and outside its x within 2 s. Measured: yaw 270 at (1002.8, -133.5) after 0.5 s, (1024.7,
  // -117.3) after 1 s; yaw 225 (1021.5, -128.1) and yaw 315 (1011.6, -117.5) after 1 s.
  it('a body at the step walks out up the near bank within 2 s', async () => {
    const { walker } = await push();
    const kept = walker.saveState();
    for (const yaw of [270, 225, 315]) {
      walker.restoreState(kept);
      walker.state.yaw = yaw;
      let out = false;
      for (let i = 0; i < 120 && !out; i++) {
        walker.tick({ forward: 1, right: 0, boost: false });
        out = walker.state.x > 1000 && walker.state.y > -135 && !walker.airborne;
      }
      expect(out, `yaw ${yaw}`).toBe(true);
    }
  }, 120_000);
  // GAP (LATER 690): the capture's jump lands back in the ditch -- case 1 rises +13.17 (+13.12 on t3) at 0.37-0.40 s
  // and lands 0.63 s after the press at (984.03, -145.62, 830.15), settling at (979.69, -148.38, 830.15); it never
  // reaches the rim. The port, pressed at the capture's time (92 ticks of the push, 1.53 s; the capture's press came
  // 46 frames after the stick), carries 65 -x over `worldmodel/log1` and lands at x 932: on the 25 of 70 ticks whose
  // move met no segment the carry is the uncut 65 (`+0x1350 = +0x38`, D:L440823-440825, the port's cut velocity), where
  // the original stalls with the contact set every frame; the ticks whose move was cut land at x 984.2-985.1, as the
  // capture. Two causes (DITCH-ESCAPE-READ, 2026-11-04): the 60 Hz wall step (H404) -- a 1.083 move never crosses the
  // band where one or two lines reach the log, so the depth push sends it back up the bank every other tick, where the
  // original's 30 Hz frame steps into the three-hit jam -- and the take-off carry: the port's is zeroed on a jam where
  // the original keeps +0x38 (from +0x64, its writer unread). The fix is the follow-up branch for the next release: the
  // walls stepped at 30 Hz per the owner's H404 (b) ruling, plus the carry.
  it.fails('GAP (LATER 690): from the capture start, the running jump lands back in the ditch, apex 13.17 +- 0.5', async () => {
    const map = await loadSimMap(new FsAssetSource(DISC), 'RUN/M51.ZDB');
    const w = new Walker(map.grid);
    w.driver = new Traversal(map.grid, groundPolygons(map.ground));
    expect(w.place(990, -140, 841.5)).toBe(true);
    w.state.yaw = 180;
    const right = { forward: 0, right: 1, boost: false };
    for (let i = 0; i < 92; i++) w.tick(right);
    const y0 = w.state.y;
    expect(w.jump() && w.airborne).toBe(true);
    let apex = -Infinity;
    for (let i = 0; i < 120 && w.airborne; i++) { w.tick(right); apex = Math.max(apex, w.state.y); }
    expect(w.airborne).toBe(false);
    expect(apex - y0).toBeCloseTo(13.17, 0);
    expect(w.state.x).toBeGreaterThan(979);
    expect(w.state.x).toBeLessThan(986);
    expect(w.state.y).toBeLessThan(-143);
  }, 120_000);
});
