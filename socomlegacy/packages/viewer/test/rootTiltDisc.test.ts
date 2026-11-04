// @vitest-environment node
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { probeGround, selectFloor } from '@s2u/scene';
import { Walker } from '../src/mover';
import { worldToBody } from '../src/rootTilt';
import { loadSimMap } from '../src/simMap';

/**
 * PRONE-TILT's dev-disc test (research 217 s7; reading, pending review): on M51 (Seeding Chaos) at the bank the owner's
 * EPH run proned on (861.78, -122.64, 879.08; the PCSX2 path of run 20261031T014055Z, 143-147 s), the room's own map
 * (`loadSimMap`, the server's grid) and one `Walker` laid prone there: the settled root's up is that spot's floor normal,
 * in the body's frame. Reads `SOCOM_DISC` (else `<SOCOM_PC_ROOT>/game/disc`); skipped -- and said so -- without it.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const M51 = DISC !== '' && existsSync(join(DISC, 'RUN', 'M51.ZDB'));
const SPOT = [861.78, -122.64, 879.08] as const;

const deg = (a: readonly number[], b: readonly number[]): number => {
  const d = (a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) / (Math.hypot(a[0]!, a[1]!, a[2]!) * Math.hypot(b[0]!, b[1]!, b[2]!));
  return (Math.acos(Math.min(1, Math.max(-1, d))) * 180) / Math.PI;
};

describe.skipIf(!M51)(`PRONE-TILT on M51's bank${M51 ? '' : ' (SOCOM_DISC with RUN/M51.ZDB absent: skipped)'}`, () => {
  it('the settled prone root\'s up is the floor normal at (861.78, -122.64, 879.08)', async () => {
    const map = await loadSimMap(new FsAssetSource(DISC), 'RUN/M51.ZDB');
    const floor = selectFloor(probeGround(map.grid, SPOT[0], SPOT[2]), SPOT[1] + 10, SPOT[1] - 10);
    expect(floor).not.toBeNull();
    const normal = floor!.normal;
    for (const yaw of [0, 135]) {
      const w = new Walker(map.grid);
      expect(w.place(SPOT[0], SPOT[1] + 5, SPOT[2])).toBe(true);
      w.state.yaw = yaw;
      w.stance = 'prone';
      for (let i = 0; i < 120; i++) w.tick({ forward: 0, right: 0, boost: false });
      expect(w.posture).toBe('prone');
      const at = selectFloor(probeGround(map.grid, w.state.x, w.state.z), w.state.y + 1, w.state.y - 1)!;
      console.log(`PRONE-TILT M51: yaw ${yaw}, feet (${w.state.x.toFixed(2)}, ${w.state.y.toFixed(2)}, ${w.state.z.toFixed(2)}), floor normal `
        + `(${at.normal.map((x) => x.toFixed(4)).join(', ')}), ${deg(at.normal, [0, 1, 0]).toFixed(2)} degrees off level; the spot's `
        + `${deg(normal, [0, 1, 0]).toFixed(2)}; root up off it ${deg(w.rootTilt.up, worldToBody(w.state.yaw, at.normal)).toFixed(5)} degrees`);
      expect(deg(w.rootTilt.up, worldToBody(w.state.yaw, at.normal))).toBeLessThan(1e-3);
      expect(deg(w.rootTilt.up, [0, 1, 0])).toBeGreaterThan(1);                      // the bank is a slope: the body tilts
    }
  }, 120_000);
});
