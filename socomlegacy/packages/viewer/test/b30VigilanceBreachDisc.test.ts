// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { groundGrid, groundPolygons, probeLiftOf, Walker } from '../src/mover';
import { simMapFromBytes } from '../src/simMap';
import { Traversal } from '../src/traversal';

/**
 * BUG-B30 ("Vigilance's middle C4 breach can be jump-climbed from the Terrorist side"; SCOPE-C C2): the original,
 * measured -- B30-r0004 (IQ-157, Shadow PC 3, r0004 "10:14:38 Nov 3 2004", LAN Vigilance, a real Terrorist body; a
 * capture of the original running, unscored, unreviewed until a second reader; D:/s2u-records/B30-r0004/B30-r0004.zip,
 * sha256 9203b80f...): the unblown access1 breach (planks at z 1048.0-1049.2, x ~1493) is ONE-SIDED. From the Terrorist
 * side (-z, the barn room, floor y 48.0) a body walks or runs straight through with no collision, no prompt and no jump
 * (R x3 from z 1020, S x3 from z 1040, a held stick: all THROUGH, on to z ~1128 outdoors); from the SEAL side (the
 * plant point (1493.1, 1055.0), facing -z, "PLACE C4 CHARGE") a 0.9 s full-stick push moved the body 1055.000 ->
 * 1054.418: the planks BLOCK.
 *
 * The record's y: r0004's actor y there is the floor 48.0 (the plant point 45.3) where the C4 test's pose reads 63.4 --
 * that pose is the eye, not the feet; x and z match. The SEAL-side case asserts the block, not the original's 0.58 u
 * of travel into it.
 *
 * The port, here (dev-disc; skipped without SOCOM_DISC): the same two walks on the room's own mover over r0004's MP51.
 * The players' report is the original's behaviour; this test says whether the port matches it.
 */
const DISC = process.env.SOCOM_DISC;
const PLANKS_Z = [1048.0, 1049.2] as const;

describe.skipIf(!DISC)('BUG-B30: Vigilance\'s access1 breach is one-sided, as r0004 (B30-r0004)', () => {
  let grid: ReturnType<typeof groundGrid>, polys: ReturnType<typeof groundPolygons>;
  beforeAll(() => {
    const map = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC!, 'RUN/MP51.ZDB'))), 'RUN/MP51.ZDB');
    grid = groundGrid(map.ground!);
    polys = groundPolygons(map.ground!);
  });
  /** A body placed at (x, ~floor, z) heading along +z (dir 1) or -z (dir -1), full stick for `ticks` 60 Hz ticks. */
  const walk = (x: number, z: number, dir: 1 | -1, ticks: number): { minZ: number; maxZ: number; end: number[] } => {
    const w = new Walker(grid);
    w.driver = new Traversal(grid, polys);
    expect(w.place(x, 48 + probeLiftOf('stand'), z)).toBe(true);
    w.state.yaw = dir === 1 ? 180 : 0;                            // forward = -(sin yaw, cos yaw)
    let minZ = w.state.z, maxZ = w.state.z;
    for (let i = 0; i < ticks; i++) {
      w.tick({ forward: 1, right: 0, boost: false });
      minZ = Math.min(minZ, w.state.z); maxZ = Math.max(maxZ, w.state.z);
    }
    return { minZ, maxZ, end: [w.state.x, w.state.y, w.state.z] };
  };

  it('from the Terrorist side (-z), the body walks through the planks (r0004: THROUGH, on to z ~1128)', { timeout: 60_000 }, () => {
    const r = walk(1493, 1020, 1, 240);
    expect(r.maxZ).toBeGreaterThan(PLANKS_Z[1] + 5);
  });

  it('from the SEAL side (+z, the plant point), the planks block (r0004: 1055.000 -> 1054.418 in 0.9 s)', { timeout: 60_000 }, () => {
    const r = walk(1493.1, 1055.0, -1, 54);
    expect(r.minZ).toBeGreaterThan(PLANKS_Z[1]);
  });
});
