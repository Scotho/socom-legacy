// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FsAssetSource } from '@s2u/archive/node';
import { isWallSurface, probeGround, segmentHits, selectFloor, SEAL_TUNING, type Grid } from '@s2u/scene';
import { loadMap } from '../src/loadMap';
import { groundGrid, STEP_PROBE_LIFT_READING, wallProbeHeights, Walker } from '../src/mover';

/**
 * Issue #111 (research 217 s2.6): the pocket beside Crossroads' stair. In the lobby-launched MP72 match the
 * Terrorist's walk (`e2e/menuMatch.ts` `walkTo`) went down the stair `worldmodel/wc13/di_stair` (y 68.2 at z 814 to
 * 42.5 at z 852.6) along its west edge and, in the failing runs, dropped through the crack between that edge and the
 * stringer `worldmodel/wc13/di_ext16_19` (its east face the plane x = 736.3) onto the road `di_road13` at 42.5,
 * where it stalled with the stick pushed (`walk 737,58,830`, then (736-737, 42, 841-842)).
 *
 * The crack is the disc's: the stair's west edge runs from x 736.3 at z 814 to x 736.7 at z 852.6, so at z 841.5 the
 * road alone is under x 736.3..736.585, and `FUN_005b5d40`'s vertical probe (D:L470163-470290) finds it there as the
 * port's `selectFloor` does. The trap was the port's: its grounded step refused any floor more than `step_height` over
 * the feet, a rule the original does not have (research 86 s6.5: `step_height` lifts the move's segment query,
 * `FUN_005483d0` D:L413711-413736; no rise is compared). Every way out of the pocket but west is pushed by the stringer's
 * face (met by the 6.5 probe line) to x 739.8, past the road's edge (x 739.48 at z 841.5), where the only floor is the
 * stair, 7.4 over the feet: refused, so the SEAL stood with the stick pushed. The disc's MP72 through the repository's
 * readers (`loadMap`, `groundGrid`); skipped without SOCOM_DISC.
 */

const DISC = process.env['SOCOM_DISC'];
const HAVE_MP72 = !!DISC && existsSync(resolve(DISC, 'RUN/MP72.ZDB'));

/** Where the failing runs' body stood (issue #111's stall lines), on the road. */
const POCKET: readonly [number, number, number] = [736.5, 42.5, 841.5];
/** The stringer's east face (`di_ext16_19`), a plane x = 736.3 (research 217 s2.6's read of the hull). */
const FACE_X = 736.3;

/** The eight stick directions as world headings (the walker's yaw: forward is (-sin, -cos), so yaw 0 is -z). */
const HEADINGS: readonly { name: string; yaw: number }[] = [
  { name: 'N (-z)', yaw: 0 }, { name: 'NW', yaw: 45 }, { name: 'W (-x)', yaw: 90 }, { name: 'SW', yaw: 135 },
  { name: 'S (+z)', yaw: 180 }, { name: 'SE', yaw: 225 }, { name: 'E (+x)', yaw: 270 }, { name: 'NE', yaw: 315 },
];

describe.skipIf(!HAVE_MP72)(`issue #111: the pocket beside Crossroads' stair (MP72)${HAVE_MP72 ? '' : ' (SOCOM_DISC with RUN/MP72.ZDB absent: skipped)'}`, () => {
  let grid: Grid | undefined;
  const load = async (): Promise<Grid> => (grid ??= groundGrid((await loadMap(new FsAssetSource(DISC as string), 'RUN/MP72.ZDB')).ground!));

  it("the pocket is the disc's crack: the road alone under it, the stringer's face met by the 6.5 line, the stair 7.4 over the feet past the stand-off", async () => {
    const g = await load();
    const [x, y, z] = POCKET;
    // The probe at the pocket: one hit, the road at 42.5 -- neither the stair (east of 736.585 here) nor the stringer's
    // top (west of 736.3).
    const here = probeGround(g, x, z);
    expect(here).toHaveLength(1);
    expect(here[0]!.y).toBeCloseTo(42.5, 3);
    const pick = selectFloor(here, y + STEP_PROBE_LIFT_READING, y)!;
    expect(pick.y).toBeCloseTo(42.5, 3);
    // Either side of the crack: the stair over the road at x 736.6 (49.87, its slope 25.7 over 38.6 along z), the
    // stringer's top at x 736.2 (53.25: 47.7 at z 850 to 71.2 at z 814).
    const east = probeGround(g, 736.6, z).map((h) => h.y).sort((a, b) => a - b);
    expect(east[0]).toBeCloseTo(42.5, 3);
    expect(east.at(-1)!).toBeCloseTo(49.87, 1);
    expect(Math.max(...probeGround(g, 736.2, z).map((h) => h.y))).toBeCloseTo(53.25, 1);
    // The stringer's east face is a wall (bit 1, |n_y| < 0.7) the low probe line (feet + step_height 6.5 = 49.0) meets at
    // x 736.3; the head line (feet + 19.394) passes over it (the face's top 53.25 here).
    const [low, head] = wallProbeHeights('stand');
    expect(low).toBe(SEAL_TUNING.stepHeight);
    const lowHits = segmentHits(g, [734, y + low, z], [745, y + low, z], isWallSurface);
    expect(lowHits.map((h) => [h.owner.path, Math.round(h.point[0] * 10) / 10])).toEqual([['worldmodel/wc13/di_ext16_19', FACE_X]]);
    expect(segmentHits(g, [734, y + head, z], [745, y + head, z], isWallSurface)).toEqual([]);
    // Past the stand-off (the face + 3.5 = 739.8) the road has ended (its edge x 739.48 at z 841.5): the stair alone,
    // 7.37 over the feet -- over step_height, inside FUN_005b5d40's window of 20.
    const off = probeGround(g, FACE_X + 3.5, z);
    expect(off).toHaveLength(1);
    const stair = selectFloor(off, y + STEP_PROBE_LIFT_READING, y)!;
    expect(stair.y - y).toBeGreaterThan(SEAL_TUNING.stepHeight);
    expect(stair.y - y).toBeLessThan(20);
    expect(stair.y).toBeCloseTo(49.87, 1);
  }, 120_000);

  it('a standing SEAL in the pocket leaves it by the stick in all eight directions within 2 s (east: onto the stair, 7.37 up)', async () => {
    const g = await load();
    const rows: string[] = [];
    const end: Record<string, { moved: number; x: number; y: number; z: number; airborne: boolean }> = {};
    for (const { name, yaw } of HEADINGS) {
      const w = new Walker(g);
      expect(w.place(POCKET[0], POCKET[1] + STEP_PROBE_LIFT_READING, POCKET[2])).toBe(true);
      expect(w.state.y).toBeCloseTo(42.5, 3);
      w.state.yaw = yaw;
      for (let i = 0; i < 120; i++) w.tick({ forward: 1, right: 0, boost: false });   // 2 s at full stick
      const s = w.state, moved = Math.hypot(s.x - POCKET[0], s.z - POCKET[2]);
      end[name] = { moved, x: s.x, y: s.y, z: s.z, airborne: w.airborne };
      rows.push(`${name.padEnd(7)} moved ${moved.toFixed(2).padStart(6)} to (${s.x.toFixed(2)}, ${s.y.toFixed(2)}, ${s.z.toFixed(2)})${w.airborne ? ' airborne' : ''}`);
    }
    console.log(`issue #111, the pocket (${POCKET.join(', ')}), 120 ticks of full stick each:\n${rows.join('\n')}`);
    // Before the fix every direction stood at 0.00 (the port's rise rule: research 217 s2.6's table).
    for (const { name } of HEADINGS) expect(end[name]!.moved, name).toBeGreaterThan(3);
    // East is the rule itself: pushed off the stringer's face to its stand-off and onto the stair, 7.37 over the feet,
    // where the stair's east wall (x 762, the face 3.5 off) stops it.
    expect(end['E (+x)']).toMatchObject({ x: expect.closeTo(758.5, 2), y: expect.closeTo(49.87, 1), z: expect.closeTo(841.5, 3), airborne: false });
    // South runs down the crack's side onto the open road; west is pushed by the same stand-off onto the stair, over the
    // stringer's top (53.25) and off its far face -- the port's stand-off (WALL_PROBE_READING), not a read of the original.
    expect(end['S (+z)']!.z).toBeGreaterThan(900);
  }, 120_000);
});
