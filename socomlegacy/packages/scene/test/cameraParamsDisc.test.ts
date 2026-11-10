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

/**
 * DF-11 (the Desert Glory / Fish Hook release, 2026-11-08): the 22 fog records, `cameras/camera`'s `m_fog_near` /
 * `m_fog_far` (0x64 / 0x68), `m_fog_color` (0x10, the GS's 0..255), the enable bit (0x8C bit 29) and the altitude band
 * (bit 31, `m_fog_top` / `m_fog_bottom` 0x7C / 0x80) -- what `fog.ts` hands the ramp: `sub_00294070` builds VU1 data
 * qwords 28-29 from the near and the far (scale -255 / (far - near), offset 255 - near x scale) and, with the band on,
 * `ref.y` = bottom and `scl.y` = 1 / (top - bottom); `sub_00293F90` parks the band when it is off (research 13
 * lines 570-585). Read off the disc by `parseCameraParams` and held against the map's own text, `mp<N>.rdr`'s
 * `fog_standard (enabled range RGB)` and `fog_altitude (enabled range)`. MP6: 300 / 590, (46, 47, 59), the band off
 * (research 82 line 279's sky cap map); MP71: 300 / 799, (156, 155, 136), the band off. Reading (the disc's data
 * through two readers), dev-disc.
 */
interface Fog { near: number; far: number; rgb: [number, number, number]; on: boolean; band: [number, number] | null }
const fog = (near: number, far: number, rgb: [number, number, number], on = true, band: [number, number] | null = null): Fog => ({ near, far, rgb, on, band });
const FOG: Readonly<Record<number, Fog>> = {
  1: fog(1, 700, [32, 35, 40], true, [50, 10]), 2: fog(200, 640, [7, 7, 12]), 5: fog(250, 550, [0, 0, 0]),
  6: fog(300, 590, [46, 47, 59]), 7: fog(60, 950, [0, 0, 0], true, [-100, -110]), 8: fog(20, 720, [0, 0, 0]),
  9: fog(20, 900, [106, 111, 75]), 10: fog(10, 700, [50, 60, 64], true, [5, 0]), 11: fog(0, 1000, [50, 55, 47]),
  12: fog(200, 800, [23, 24, 26]), 51: fog(400, 660, [12, 16, 21], false), 52: fog(600, 920, [11, 13, 12]),
  53: fog(250, 1100, [140, 140, 130]), 61: fog(250, 800, [10, 10, 10]), 62: fog(30, 600, [100, 97, 98], true, [-25, -35]),
  64: fog(100, 600, [19, 20, 22], true, [-100, -200]), 71: fog(300, 799, [156, 155, 136]), 72: fog(230, 600, [170, 165, 120]),
  73: fog(100, 700, [0, 0, 0]), 81: fog(900, 1000, [121, 123, 138], false), 82: fog(100, 500, [60, 60, 70], true, [-50, -100]),
  83: fog(300, 640, [0, 0, 9]),
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

/** The map's fog record off the disc, and its authored text's (`fog_standard`, `fog_altitude`), in one shape. */
function fogFromDisc(m: number): { record: Fog; text: Fog } {
  const zdb = new Uint8Array(readFileSync(zdbPath(m)));
  const toc = parseZdb(zdb);
  const c = parseCameraParams(Zar.parse(zdbMember(zdb, toc, `MP${m}.ZED`)))!;
  const readerm = Zar.parse(zdbMember(zdb, toc, 'READERM.ZAR'));
  const key = readerm.root.children.find((k) => k.name.toLowerCase() === `mp${m}.rdr`)!;
  const camera = field(parseRdr(readerm.data(key)), 'camera')!;
  const std = field(camera, 'fog_standard')!, alt = field(camera, 'fog_altitude')!;
  const num = (list: RdrNode[], k: string): number[] => field(list, k)!.map(Number);
  const altOn = num(alt, 'enabled')[0] === 1, altRange = num(alt, 'range');
  return {
    record: { near: c.fogNear, far: c.fogFar, rgb: c.fogColor, on: c.fogEnabled, band: c.fogAltitude ? [c.fogTop, c.fogBottom] : null },
    text: {
      near: num(std, 'range')[0]!, far: num(std, 'range')[1]!, rgb: num(std, 'RGB') as [number, number, number],
      on: num(std, 'enabled')[0] === 1, band: altOn ? [altRange[0]!, altRange[1]!] : null,
    },
  };
}

describe.skipIf(!present)(`DF-11: the 22 multiplayer maps' fog records off the disc${present ? '' : ' (SOCOM_DISC absent)'}`, () => {
  it("each record's fog near / far / colour / enable / band (0x64 / 0x68 / 0x10 / 0x8C bits 29, 31) is the text's fog_standard and fog_altitude, and the golden", () => {
    for (const m of MAPS) {
      const { record, text } = fogFromDisc(m);
      expect([m, record]).toEqual([m, text]);
      expect([m, record]).toEqual([m, FOG[m]]);
    }
  });

  it('the fog is off on MP51 and MP81 alone; the band on six (MP1, 7, 10, 62, 64, 82); Desert Glory and Fish Hook fog with no band', () => {
    const records = new Map(MAPS.map((m) => [m, fogFromDisc(m).record] as const));
    expect(MAPS.filter((m) => !records.get(m)!.on)).toEqual([51, 81]);
    expect(MAPS.filter((m) => records.get(m)!.band !== null)).toEqual([1, 7, 10, 62, 64, 82]);
    expect([records.get(6), records.get(71)]).toEqual([
      { near: 300, far: 590, rgb: [46, 47, 59], on: true, band: null },
      { near: 300, far: 799, rgb: [156, 155, 136], on: true, band: null },
    ]);
  });
});

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
