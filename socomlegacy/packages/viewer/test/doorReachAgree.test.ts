import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readKitTable, segmentHit } from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';
import { simMapFromBytes } from '../src/simMap';
import { DoorSet, doorInReach, pickDoor } from '../src/doors';
import { groundGrid, rootY } from '../src/mover';
import { scopeEye, toWorld } from '../src/cameraRig';

/**
 * HOTFIX DOOR-RESET's review F1 (a guard; a port-side consistency check, no original value): the page never offers a
 * door (`pickDoor`, the HUD's prompt and the action's target) where the room refuses it on reach (`doorInReach`,
 * `Room.useDoor`). Vigilance's four door_ft doors, shut: feet on the floor on a grid each side of each leaf (16 offsets
 * along the normal, 9 along the leaf), every 15 degrees of yaw at three pitches, the first-person scope eye
 * (`scopeEye`, standing; the third person's camera eye is not modelled here). Measured 2026-11-02: offered 8-14 u from
 * the leaf on both sides, the room in reach out to ~36 (its 8 u slack, nearest vertex); none the other way.
 */
const DISC = process.env.SOCOM_DISC;
const READERC = fixture('RUN/READERC.ZAR'), ZWEAPON = fixture('RUN/ZWEAPON.ZAR');
const HAVE = !!DISC && existsSync(resolve(DISC, 'RUN/MP51.ZDB')) && READERC !== null && ZWEAPON !== null;
type V3 = [number, number, number];

describe.skipIf(!HAVE)('F1: the page offers no door on MP51 that the room refuses on reach', () => {
  it('door_ft_1..4, shut: every offer within the room\'s reach, each door offered from both sides', () => {
    const map = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC!, 'RUN/MP51.ZDB'))), 'RUN/MP51.ZDB', { table: readKitTable(ZWEAPON!), readerc: READERC! });
    const doors = new DoorSet(map.doors ?? [], map.ground);
    const grid = groundGrid(map.ground);
    const report: Record<string, unknown>[] = [];
    for (let i = 0; i < doors.count; i++) {
      const spec = doors.specs[i]!;
      const leaf = doors.leaf(i);
      const pts = leaf.flatMap((p) => Array.from(p));
      const mid: V3 = [0, 0, 0];
      let minY = Infinity;
      for (let k = 0; k < pts.length; k += 3) { for (let a = 0; a < 3; a++) mid[a]! += pts[k + a]! / (pts.length / 3); minY = Math.min(minY, pts[k + 1]!); }
      const p0 = leaf[0]!;
      const e1: V3 = [p0[3]! - p0[0]!, 0, p0[5]! - p0[2]!], e2: V3 = [p0[6]! - p0[0]!, p0[7]! - p0[1]!, p0[8]! - p0[2]!];
      let n: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      n = [n[0], 0, n[2]];
      const nl = Math.hypot(...n); n = [n[0] / nl, 0, n[2] / nl];
      const t: V3 = [-n[2], 0, n[0]];
      let pageOnly = 0, both = 0, samples = 0, positions = 0, posRoomNoOffer = 0;
      const pageOnlyAt: string[] = [], roomNoOfferAt: string[] = [];
      const offeredByD: Record<number, number> = {}, reachByD: Record<number, number> = {};
      for (const d of [-80, -64, -48, -36, -28, -20, -14, -8, 8, 14, 20, 28, 36, 48, 64, 80]) {
        for (const s of [-32, -24, -16, -8, 0, 8, 16, 24, 32]) {
          const x = mid[0] + n[0] * d + t[0] * s, z = mid[2] + n[2] * d + t[2] * s;
          // The floor under the point (not the door): a drop from above the leaf's top.
          const down = segmentHit(grid, [x, minY + 60, z], [x, minY - 60, z], (p) => doors.doorOf(p.path) < 0);
          if (!down) continue;
          const feet: V3 = [x, down.point[1], z];
          if (Math.abs(feet[1] - minY) > 20) continue;              // another floor
          positions++;
          const reach = doorInReach(doors, i, feet);
          let offered = false;
          for (let yaw = 0; yaw < 360; yaw += 15) {
            for (const pitch of [-20, 0, 20]) {
              samples++;
              const eye = toWorld(feet, yaw, scopeEye('stand', rootY('stand')));
              const yr = (yaw * Math.PI) / 180, pr = (pitch * Math.PI) / 180;
              const far: V3 = [eye[0] - Math.sin(yr) * Math.cos(pr) * 1000, eye[1] + Math.sin(pr) * 1000, eye[2] - Math.cos(yr) * Math.cos(pr) * 1000];
              const pick = pickDoor(doors, grid, eye, far, feet);
              if (pick !== i) continue;
              offered = true;
              if (reach) both++;
              else { pageOnly++; if (pageOnlyAt.length < 4) pageOnlyAt.push(`feet ${feet.map((v) => v.toFixed(1)).join(',')} yaw ${yaw} pitch ${pitch} (d ${d}, s ${s})`); }
            }
          }
          if (offered) offeredByD[d] = (offeredByD[d] ?? 0) + 1;
          if (reach) reachByD[d] = (reachByD[d] ?? 0) + 1;
          if (reach && !offered) { posRoomNoOffer++; if (roomNoOfferAt.length < 4) roomNoOfferAt.push(`feet ${feet.map((v) => v.toFixed(1)).join(',')} (d ${d}, s ${s})`); }
        }
      }
      report.push({ door: spec.node, range: spec.range, elevation: spec.elevation, positions, samples, offeredAndInReach: both, offeredButRoomRefusesReach: pageOnly, pageOnlyAt, positionsInReachNeverOffered: posRoomNoOffer, roomNoOfferAt, offeredByD: JSON.stringify(offeredByD), reachByD: JSON.stringify(reachByD) });
    }
    expect(report).toHaveLength(4);
    for (const r of report) {
      expect(r.offeredButRoomRefusesReach, `${String(r.door)}: ${JSON.stringify(r.pageOnlyAt)}`).toBe(0);
      const by = Object.keys(JSON.parse(r.offeredByD as string) as Record<string, number>).map(Number);
      expect(by.some((d) => d > 0) && by.some((d) => d < 0), `${String(r.door)} offered from both sides`).toBe(true);
    }
  }, 300_000);
});
