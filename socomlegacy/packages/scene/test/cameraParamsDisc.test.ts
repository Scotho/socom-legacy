import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRdr, parseZdb, zdbMember, Zar, type RdrNode } from '@s2u/archive';
import { parseCameraParams } from '../src/cameraParams';

/**
 * AD-1 (web sprint 40; reconciliation C13): every multiplayer map's `cameras/camera` record off the disc (`SOCOM_DISC`),
 * its near, MID and far (`m_near_plane` / `m_mid_plane` / `m_far_plane`, 0x28 / 0x2C / 0x30) read by `parseCameraParams`
 * and held against the map's own authored text, `READERM.ZAR -> mp<N>.rdr`'s `camera (clip (near far) mid_clip (mid))`
 * -- the two sources inside the same `MP<N>.ZDB`, read by two readers (`Reader` on the binary, `parseRdr` on the text).
 * The MID is the camera's `+0xEC` (the loader `FUN_00318da0` D:L217190-217197 copies the record to cam+0xC0), the aim
 * ray's cap (`FUN_005aa6e0` D:L464106-464109). A dev-disc test: without `SOCOM_DISC` it is skipped, and a skip is not a
 * pass.
 */

const DISC = process.env.SOCOM_DISC;
const MAPS = [1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 51, 52, 53, 61, 62, 64, 71, 72, 73, 81, 82, 83] as const;
const zdbPath = (m: number): string => resolve(DISC ?? '', `RUN/MP${m}.ZDB`);
const present = !!DISC && MAPS.every((m) => existsSync(zdbPath(m)));

/**
 * The 22 records' [MID, far], world units: the reconciliation's census (`docs/plans/inventory/2026-10-15/reconciliation/
 * 03-boundaries-gameplay.md` line 14, the gameplay lane's parseZdb/Zar/Reader run; re-read independently, chunk 08
 * line 18). The near is 4 on every map.
 */
const CENSUS: Readonly<Record<number, readonly [number, number]>> = {
  1: [720, 720], 2: [640, 640], 5: [550, 800], 6: [600, 600], 7: [950, 950], 8: [720, 720], 9: [900, 1800], 10: [760, 760],
  11: [1700, 1700], 12: [800, 800], 51: [2000, 2000], 52: [900, 1200], 53: [1100, 1600], 61: [600, 1000], 62: [650, 1200],
  64: [620, 1200], 71: [800, 800], 72: [620, 820], 73: [700, 900], 81: [2500, 2500], 82: [550, 550], 83: [650, 1200],
};

/** The value list after `key` in the first list that holds it, depth first (the text's `key (values)`). */
function field(node: RdrNode, key: string): RdrNode[] | null {
  if (typeof node === 'string') return null;
  for (let i = 0; i < node.length - 1; i++) if (node[i] === key && Array.isArray(node[i + 1])) return node[i + 1] as RdrNode[];
  for (const child of node) {
    const found = field(child, key);
    if (found) return found;
  }
  return null;
}

interface Planes { near: number; mid: number; far: number }

function fromDisc(m: number): { record: Planes; text: Planes } {
  const zdb = new Uint8Array(readFileSync(zdbPath(m)));
  const toc = parseZdb(zdb);
  const c = parseCameraParams(Zar.parse(zdbMember(zdb, toc, `MP${m}.ZED`)));
  expect([m, c]).not.toEqual([m, null]);
  const readerm = Zar.parse(zdbMember(zdb, toc, 'READERM.ZAR'));
  const key = readerm.root.children.find((k) => k.name.toLowerCase() === `mp${m}.rdr`);
  expect([m, key?.name]).toEqual([m, `mp${m}.rdr`]);
  const camera = field(parseRdr(readerm.data(key!)), 'camera')!;
  const clip = field(camera, 'clip')!, mid = field(camera, 'mid_clip')!;
  return {
    record: { near: c!.nearPlane, mid: c!.mid, far: c!.farPlane },
    text: { near: Number(clip[0]), mid: Number(mid[0]), far: Number(clip[1]) },
  };
}

describe.skipIf(!present)(`AD-1: the 22 multiplayer maps' camera MID off the disc${present ? '' : ' (SOCOM_DISC absent)'}`, () => {
  it("each record's near / MID / far (0x28 / 0x2C / 0x30) is the authored text's clip and mid_clip, and the census", () => {
    for (const m of MAPS) {
      const { record, text } = fromDisc(m);
      expect([m, record]).toEqual([m, text]);
      expect([m, record]).toEqual([m, { near: 4, mid: CENSUS[m]![0], far: CENSUS[m]![1] }]);
    }
  });

  it('the MID differs from the far on ten maps (the far is no stand-in for the cap); MP5 and MP82 alone hold one under 600 (550)', () => {
    const planes = new Map(MAPS.map((m) => [m, fromDisc(m).record] as const));
    expect(MAPS.filter((m) => planes.get(m)!.mid !== planes.get(m)!.far)).toEqual([5, 9, 52, 53, 61, 62, 64, 72, 73, 83]);
    expect(MAPS.filter((m) => planes.get(m)!.mid < 600)).toEqual([5, 82]);
    expect([planes.get(5)!.mid, planes.get(82)!.mid]).toEqual([550, 550]);
    expect(MAPS.every((m) => planes.get(m)!.mid <= planes.get(m)!.far)).toBe(true);   // no MID pushes the far (FUN_00291180)
  });
});
