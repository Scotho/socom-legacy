import { describe, expect, it } from 'vitest';
import { parseZdb } from '@s2u/archive';
import { csm1ClutIndex, PaletteTable, parsePaletteRecord } from '@s2u/gs';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { decodeNamedTextures, readEffectBitmap, readReticle, RETICLE_TEXTURES } from '../src/hudBitmaps';
import { GRENADE_METER_BITMAP_READING, meterLayout } from '../src/reticle';

/**
 * The reticle's bitmaps (web sprint 2, W2.4): `RUN\COMMON\HUD2_TXR.ZED` in every `MP*.ZDB`, decoded with the palettes
 * of its own `HUD2_PAL.ZED` through the same `parseTextureRecord` -> `decodeTexture` path the world's textures take.
 */

const bytes = fixture('RUN/MP2.ZDB');
const absent = bytes === null;

/** Non-zero alpha texels: a bitmap that decoded to nothing has none. */
const inked = (data: Uint8ClampedArray): number => {
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++;
  return n;
};

describe.skipIf(absent)(`the reticle's bitmaps off Frostfire's HUD2_TXR.ZED${absent ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it.skipIf(absent)('ret_rifle_01 is 64x64, ret_rifle_02 32x32, ret_accuracy 16x16, and none is blank', () => {
    const { bitmaps, diagnostics } = readReticle(bytes!, parseZdb(bytes!));
    expect(diagnostics).toEqual([]);
    expect(bitmaps).not.toBeNull();
    const { fixed, floating, accuracy } = bitmaps!;
    expect([fixed.width, fixed.height]).toEqual([64, 64]);
    expect([floating.width, floating.height]).toEqual([32, 32]);
    expect([accuracy!.width, accuracy!.height]).toEqual([16, 16]);
    // The inked texel counts as decoded on 2026-09-28: the ring and its centre dot, one arm, the accuracy diamond.
    expect(inked(fixed.data)).toBe(1096);
    expect(inked(floating.data)).toBe(65);
    expect(inked(accuracy!.data)).toBe(16);
  });

  it.skipIf(absent)('_01 is the fixed part (a dark ring, a white dot at its centre); _02 one arm, white at its outer end', () => {
    const { fixed, floating } = readReticle(bytes!, parseZdb(bytes!)).bitmaps!;
    const at = (b: { width: number; data: Uint8ClampedArray }, x: number, y: number): number[] =>
      Array.from(b.data.slice((y * b.width + x) * 4, (y * b.width + x) * 4 + 4));
    expect(at(fixed, 31, 31)).toEqual([255, 255, 255, 215]);       // the centre dot, texels 31-32
    expect(at(fixed, 7, 31)).toEqual([0, 0, 0, 44]);               // the ring, radius 21-27, black at alpha <= 44
    expect(at(floating, 30, 30)).toEqual([255, 255, 255, 175]);    // the arm's core column 30, rows 8-30
    expect(at(floating, 30, 8)[3]).toBe(44);                       // dim at its inner end
    expect(at(floating, 20, 20)[3]).toBe(0);
  });
});

/**
 * NU-2 (research 320 section 8.1, the dev-disc test owed with G2): the throw meter's two bitmaps as the archive serves
 * them -- the meter's `W` and `H` are `ret_grenade_02`'s (`FUN_00213a60` D:L69198-69201), read here, not assumed -- and
 * the frame laid by `meterLayout` under `GRENADE_METER_BITMAP_READING` against the figure research 320 section 2 read
 * pixel by pixel off the recompilation's frame `h00_hud_grenade_in_hand` (640x448, an M67 in hand, power 0).
 */
const MAPS = ['MP2', 'MP6', 'MP72'] as const;
const mapBytes = Object.fromEntries(MAPS.map((m) => [m, fixture(`RUN/${m}.ZDB`)]));
const mapsAbsent = MAPS.some((m) => mapBytes[m] === null);

describe.skipIf(mapsAbsent)(`the throw meter's bitmaps off HUD2_TXR.ZED (NU-2)${mapsAbsent ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  const sets = (m: (typeof MAPS)[number]) => readReticle(mapBytes[m]!, parseZdb(mapBytes[m]!)).bitmaps!.sets!;

  it.skipIf(mapsAbsent)('ret_grenade_02 (the frame) and ret_grenade_01 (the fill) are 64x64 on every map, inked as decoded 2026-10-14', () => {
    for (const m of MAPS) {
      const frame = sets(m)['ret_grenade_02.tif']!, fill = sets(m)['ret_grenade_01.tif']!;
      expect([frame.width, frame.height, fill.width, fill.height], m).toEqual([64, 64, 64, 64]);
      expect([inked(frame.data), inked(fill.data)], m).toEqual([1356, 1036]);
    }
  });

  it.skipIf(mapsAbsent)('both are mirror-symmetric across (alpha exactly; an inked texel\'s grey within 4): the side the columns run from does not show', () => {
    for (const b of [sets('MP2')['ret_grenade_02.tif']!, sets('MP2')['ret_grenade_01.tif']!]) {
      for (let y = 0; y < b.height; y++) {
        for (let x = 0; x < b.width / 2; x++) {
          const a = (y * b.width + x) * 4, z = (y * b.width + (b.width - 1 - x)) * 4;
          expect(b.data[a + 3], `${x},${y}`).toBe(b.data[z + 3]);
          if (b.data[a + 3] === 0) continue;
          for (let c = 0; c < 3; c++) expect(Math.abs(b.data[a + c]! - b.data[z + c]!), `${x},${y}`).toBeLessThanOrEqual(4);
        }
      }
    }
  });

  it.skipIf(mapsAbsent)('the frame laid at (320, 224) covers the capture\'s figure: each rung\'s span within two pixels', () => {
    expect(GRENADE_METER_BITMAP_READING).toBe('first row on the centre line');
    const frame = sets('MP2')['ret_grenade_02.tif']!;
    const quads = meterLayout({ width: 640, height: 448 }, [320, 224], 0, frame).quads.filter((q) => q.bitmap === 'frame');
    /** The frame's texel drawn at the pixel (x, y) of the 640x448 frame, its alpha, or 0 outside the meter. */
    const alphaAt = (x: number, y: number): number => {
      const px = x + 0.5, py = y + 0.5;
      for (const q of quads) {
        const top = q.y - q.height / 2, left = q.x - q.width / 2;
        if (py < top || py >= top + q.height || px < left || px >= left + q.width) continue;
        const out = q.half === 'top' ? (top + q.height - py) / q.height : (py - top) / q.height;   // 0 on the centre line
        const row = Math.floor((q.rows[0] + out * (q.rows[1] - q.rows[0])) * frame.height);
        const col = Math.floor(((px - left) / q.width) * frame.width);
        return frame.data[(row * frame.width + col) * 4 + 3]!;
      }
      return 0;
    };
    /** The spans of a pixel row at the decoded alpha 128 and up (PS2 alpha 64, half), as [x0, x1] pairs. */
    const spans = (y: number): number[][] => {
      const out: number[][] = [];
      for (let x = 0; x < 640; x++) {
        if (alphaAt(x, y) < 128) continue;
        const last = out[out.length - 1];
        if (last && last[1] === x - 1) last[1] = x; else out.push([x, x]);
      }
      return out;
    };
    const within = (got: number[][], want: number[][]): void => {
      expect(got.length, JSON.stringify(got)).toBe(want.length);
      got.forEach((s, i) => { expect(Math.abs(s[0]! - want[i]![0]!), JSON.stringify(got)).toBeLessThanOrEqual(2); expect(Math.abs(s[1]! - want[i]![1]!), JSON.stringify(got)).toBeLessThanOrEqual(2); });
    };
    // Research 320 section 2: rungs across x 295-344 at y 192 and 255, narrowing toward the centre -- 304-336 at y 198,
    // 309-330 at 203, 313-326 at 208, 316-323 at 213, and their mirrors; the stem x 318-321 at y 213-219 and 228-234; two
    // bars x 300-312 and 327-339 at y 223-224. Two pixels: the capture's figure read at its own threshold over the world
    // behind it, the decode here at half alpha (the rungs' dim ends are half-alpha texels). The other way up -- the last
    // row on the centre line -- would put the widest rungs at y 223-224 and the two bars at 192 and 255.
    for (const [y, span] of [[192, [295, 344]], [198, [304, 336]], [203, [309, 330]], [208, [313, 326]], [213, [316, 323]]] as const) {
      within(spans(y), [[...span]]);
      within(spans(447 - y), [[...span]]);
    }
    for (const y of [214, 216, 218, 229, 231, 233]) within(spans(y), [[318, 321]]);
    for (const y of [223, 224]) within(spans(y), [[300, 312], [318, 321], [327, 339]]);   // the bars, the stem's foot between
  });
});

/**
 * NU-3a (research 321 sections 2.2, 2.3 and 7.2; the reader run `SHOTGUN_CORNER_READING` and `LAUNCHER_SIGHT_READING`
 * owed): the shotguns' and the launchers' bitmaps as the archive serves them -- their `W` and `H` read here, the corners'
 * and the sight's quads laid at the draw from the served size -- and where their ink lies: about the decoded top-right
 * corner, the corner `./reticle`'s corner and sight layouts put on the square's corner and on the frame's centre.
 */
describe.skipIf(mapsAbsent)(`the corners' and the launcher's bitmaps off HUD2_TXR.ZED (NU-3a)${mapsAbsent ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  const sets = (m: (typeof MAPS)[number]) => readReticle(mapBytes[m]!, parseZdb(mapBytes[m]!)).bitmaps!.sets!;
  /** Each texel over half alpha (decoded 128), as its centre's offset from the decoded top-right corner: [left, down]. */
  const ink = (b: { width: number; height: number; data: Uint8ClampedArray }): [number, number][] => {
    const out: [number, number][] = [];
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) if (b.data[(y * b.width + x) * 4 + 3]! > 128) out.push([b.width - (x + 0.5), y + 0.5]);
    return out;
  };

  it('ret_shotgun_01 64x64, ret_shotgun_02 32x32, ret_rocket_01 64x64, ret_rocket_02 64x64 on every map, inked as decoded 2026-10-14', () => {
    for (const m of MAPS) {
      const got = ['ret_shotgun_01.tif', 'ret_shotgun_02.tif', 'ret_rocket_01.tif', 'ret_rocket_02.tif'].map((n) => {
        const b = sets(m)[n]!;
        return [n, b.width, b.height, inked(b.data)];
      });
      expect(got, m).toEqual([
        ['ret_shotgun_01.tif', 64, 64, 2828], ['ret_shotgun_02.tif', 32, 32, 70], ['ret_rocket_01.tif', 64, 64, 2305], ['ret_rocket_02.tif', 64, 64, 140],
      ]);
    }
  });

  it('ret_shotgun_02 is one arc of radius 16 about its decoded top-right corner, mirror-symmetric across the diagonal through it', () => {
    const b = sets('MP2')['ret_shotgun_02.tif']!;
    const pts = ink(b);
    expect(pts).toHaveLength(41);
    for (const [dx, dy] of pts) {
      expect(Math.hypot(dx, dy)).toBeGreaterThan(15);
      expect(Math.hypot(dx, dy)).toBeLessThan(17);
    }
    // Across the line from the top-right corner to the bottom-left one: (x, y) and (W - 1 - y, H - 1 - x), alpha exactly.
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
      expect(b.data[(y * b.width + x) * 4 + 3], `${x},${y}`).toBe(b.data[((b.height - 1 - x) * b.width + (b.width - 1 - y)) * 4 + 3]);
    }
  });

  it('ret_rocket_02 is one stroke across the diagonal from its decoded top-right corner, 24-34 texels out', () => {
    const pts = ink(sets('MP2')['ret_rocket_02.tif']!);
    expect(pts).toHaveLength(92);
    for (const [dx, dy] of pts) {
      expect(Math.hypot(dx, dy)).toBeGreaterThan(24);
      expect(Math.hypot(dx, dy)).toBeLessThan(34);
      expect(dx + dy).toBeGreaterThanOrEqual(35);                    // across the diagonal: left + down within 35-44
      expect(dx + dy).toBeLessThanOrEqual(44);
    }
  });

  it('ret_rocket_01 is a quarter disc about its decoded top-right corner, a dot on that corner, mirror-symmetric across the diagonal', () => {
    const b = sets('MP2')['ret_rocket_01.tif']!;
    const a = (x: number, y: number): number => b.data[(y * b.width + x) * 4 + 3]!;
    expect([a(63, 0), a(62, 0), a(63, 1), a(62, 1)]).toEqual([251, 251, 251, 251]);   // the dot, on the corner the sight meets
    expect(a(0, 63)).toBe(0);
    const pts = ink(b);
    expect(pts).toHaveLength(201);
    for (const [dx, dy] of pts) expect(Math.hypot(dx, dy)).toBeLessThan(60);          // the dark rim out to 59.2 texels
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
      expect(a(x, y), `${x},${y}`).toBe(a(b.width - 1 - y, b.height - 1 - x));
    }
  });
});

/** An 8x8 PSMT8 `texdat` as `CTexture::Read` lays it out (36 §5): the header, 16 prefix bytes, the pixels, the bind packet. */
function texdat(pixels: Uint8Array, gsaddr: number, cbp: number): Uint8Array {
  const out = new Uint8Array(16 + 16 + pixels.length + 144);
  const v = new DataView(out.buffer);
  v.setUint16(0, 8, true);
  v.setUint16(2, 8, true);
  v.setUint32(4, pixels.length, true);
  v.setUint32(8, gsaddr, true);
  v.setUint32(12, 8 | (1 << 25), true);                             // 8 bits a texel, palettised
  out.set(pixels, 32);
  // TEX0: TBP0 = gsaddr, PSM = PSMT8 (0x13), TW = TH = log2 8, CBP = the palette's id.
  const tex0 = BigInt(gsaddr) | (0x13n << 20n) | (3n << 26n) | (3n << 30n) | (BigInt(cbp) << 37n);
  v.setBigUint64(32 + pixels.length, tex0, true);
  return out;
}

/** A 16-entry PSMCT32 CLUT (`par` + `buf`), entry k = (16k, 255 - 16k, k, alpha 8k of 0x80). */
function clut16(gsaddr: number): { par: Uint8Array; buf: Uint8Array } {
  const par = new Uint8Array(8);
  const p = new DataView(par.buffer);
  p.setUint32(0, gsaddr, true);
  p.setUint32(4, 64, true);                                         // m_size 64, m_format 0 (PSMCT32)
  const buf = new Uint8Array(64);
  for (let k = 0; k < 16; k++) buf.set([16 * k, 255 - 16 * k, k, 8 * k], k * 4);
  return { par, buf };
}

describe.skipIf(mapsAbsent)(`the threat marks' bitmap off HUD2_TXR.ZED (THREAT-MARKS, research 321 s2.6)${mapsAbsent ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  const threat = (m: (typeof MAPS)[number]) => readReticle(mapBytes[m]!, parseZdb(mapBytes[m]!)).bitmaps!.sets!['ret_threat.tif']!;

  it('ret_threat is 16x16 with 76 inked texels on MP2, MP6 and MP72, its alphas 86, 169 and 255 only', () => {
    for (const m of MAPS) {
      const b = threat(m);
      expect([b.width, b.height, inked(b.data)], m).toEqual([16, 16, 76]);
      const alphas = new Set<number>();
      for (let i = 3; i < b.data.length; i += 4) if (b.data[i]! > 0) alphas.add(b.data[i]!);
      expect([...alphas].sort((x, y) => x - y), m).toEqual([86, 169, 255]);
    }
  });

  it('its ink mirror-symmetric across (the alphas of row 5 aside:169 at x 5-9, 255 at x 10-12); a wedge wide at row 4, its tip at row 11', () => {
    const b = threat('MP2');
    const at = (x: number, y: number): number => b.data[(y * 16 + x) * 4 + 3]!;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) expect(at(x, y) > 0, `${x},${y}`).toBe(at(15 - x, y) > 0);
    for (let y = 0; y < 16; y++) if (y !== 5) for (let x = 0; x < 8; x++) expect(at(x, y), `${x},${y}`).toBe(at(15 - x, y));
    expect([5, 6, 7, 8, 9, 10, 11, 12].map((x) => at(x, 5))).toEqual([169, 169, 169, 169, 169, 255, 255, 255]);
    const span = (y: number): number[] => { const xs: number[] = []; for (let x = 0; x < 16; x++) if (b.data[(y * 16 + x) * 4 + 3]! > 0) xs.push(x); return xs; };
    const rows = [...Array(16).keys()].filter((y) => span(y).length > 0);
    expect([rows[0], rows[rows.length - 1]]).toEqual([4, 11]);
    expect(span(4).length).toBeGreaterThan(span(11).length);
  });
});

describe('decodeNamedTextures (synthetic, the same path)', () => {
  it('an 8x8 PSMT8 texture through a 16-entry CLUT decodes to that CLUT\'s entries, csm1 order and alpha rescaled', () => {
    const table = new PaletteTable();
    const { par, buf } = clut16(7);
    table.add(parsePaletteRecord(par, buf));
    // Texel i shows entry i % 16; the stored index is where the csm1 block swap puts that entry (8..15 -> 16..23).
    const pixels = Uint8Array.from({ length: 64 }, (_, i) => csm1ClutIndex(i % 16));
    const { textures, diagnostics } = decodeNamedTextures(
      (name) => (name === 'ret_test.tif' ? texdat(pixels, 100, 7) : null), table, ['ret_test.tif', 'ret_missing.tif']);
    expect(diagnostics).toEqual(['ret_missing.tif: not in the library']);
    const rgba = textures['ret_test.tif']!;
    expect([rgba.width, rgba.height]).toEqual([8, 8]);
    const want: number[] = [];
    for (let i = 0; i < 64; i++) {
      const k = i % 16;
      want.push(16 * k, 255 - 16 * k, k, Math.min(255, Math.round((8 * k * 255) / 128)));
    }
    expect(Array.from(rgba.data)).toEqual(want);
  });

  it('names the three bitmaps W2.4 draws', () => {
    expect(RETICLE_TEXTURES).toEqual({ fixed: 'ret_rifle_01.tif', floating: 'ret_rifle_02.tif', accuracy: 'ret_accuracy.tif' });
  });
});

describe.skipIf(absent)(`the bullet mark off Frostfire's EFFE_TXR.ZED (W2.5)${absent ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it.skipIf(absent)('decals.rdr\'s bullet_mark_stone.tif decodes 16x16 with its own EFFE_PAL: a dark hole in a lighter ring', () => {
    const { rgba, diagnostics } = readEffectBitmap(bytes!, parseZdb(bytes!), 'bullet_mark_stone.tif');
    expect(diagnostics).toEqual([]);
    expect([rgba!.width, rgba!.height]).toEqual([16, 16]);
    expect(inked(rgba!.data)).toBe(INKED_STONE);
    const at = (x: number, y: number): number[] => Array.from(rgba!.data.slice((y * 16 + x) * 4, (y * 16 + x) * 4 + 4));
    expect(at(6, 7)[0]).toBeLessThan(40);          // the hole: dark and the most opaque
    expect(at(6, 7)[3]).toBe(163);
    expect(at(0, 0)[3]).toBe(0);                   // the corner: clear
  });

  it.skipIf(absent)('a name the library does not hold is a diagnostic and no bitmap', () => {
    const { rgba, diagnostics } = readEffectBitmap(bytes!, parseZdb(bytes!), 'no_such_mark.tif');
    expect(rgba).toBeNull();
    expect(diagnostics).toEqual(['bullet mark: no_such_mark.tif: not in the library']);
  });
});

/** Non-zero alpha texels of `bullet_mark_stone.tif` as decoded on 2026-09-28. */
const INKED_STONE = 157;
