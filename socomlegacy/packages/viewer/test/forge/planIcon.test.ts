import { describe, expect, it } from 'vitest';
import { crc32, decodePngAsync, PNG_SIGNATURE, pngSize } from '../../src/png';
import { emptyLayout, type Layout } from '../../src/forge/layout';
import { BLANK_LIBRARY } from '../../src/forge/matchMap';
import {
  drawPlanIcon, PLAN_ICON_INKS, PLAN_ICON_MARGIN, PLAN_ICON_PALETTE, PLAN_ICON_SIZE, planIconPng, type PlanIconInk,
} from '../../src/forge/planIcon';

/**
 * FX-11a slice 1 (FX.R4, FX.R11; H442 f; a browser adaptation with no original): the store package's icon is a drawn
 * top-down plan of the layout -- 256 x 256, a fixed palette of the port's own colours, the pieces' and markers' places
 * as marks on a plain ground, the layout's extent fitted -- and its PNG. Nothing of the disc: no texture, no archive.
 */

const at = (x: number, y: number, z: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const floor = (): Layout => ({ ...emptyLayout({ kind: 'blank', library: BLANK_LIBRARY }), name: 'Yard' });
const yard = (): Layout => ({
  ...floor(),
  pieces: [{ asset: 'MP2:crate', m: at(-300, 0, -200) }, { asset: 'MP2:crate', m: at(300, 0, 200) }],
  spawns: [{ team: 'A', p: [-250, 0, 150], yaw: 0 }, { team: 'B', p: [250, 0, -150], yaw: 0 }],
});

const key = (r: number, g: number, b: number, a: number): string => `${r},${g},${b},${a}`;
const inkOf = new Map<string, PlanIconInk>(PLAN_ICON_INKS.map((ink) => [key(...PLAN_ICON_PALETTE[ink]), ink]));
/** Every pixel's ink, or null for a colour off the palette. */
const inks = (data: Uint8ClampedArray): (PlanIconInk | null)[] => {
  const out: (PlanIconInk | null)[] = [];
  for (let i = 0; i < data.length; i += 4) out.push(inkOf.get(key(data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!)) ?? null);
  return out;
};
const count = (data: Uint8ClampedArray, ink: PlanIconInk): number => inks(data).filter((x) => x === ink).length;

describe('FX-11a: the plan icon is drawn from the layout alone, in a fixed palette', () => {
  it('is 256 x 256 RGBA, and every pixel is one of the palette colours', () => {
    const icon = drawPlanIcon(yard());
    expect([icon.width, icon.height, PLAN_ICON_SIZE]).toEqual([256, 256, 256]);
    expect(icon.data.length).toBe(256 * 256 * 4);
    expect(inks(icon.data).filter((x) => x === null).length).toBe(0);
  });

  it('the palette is a fixed list of opaque colours, each different', () => {
    const colours = PLAN_ICON_INKS.map((ink) => key(...PLAN_ICON_PALETTE[ink]));
    expect(new Set(colours).size).toBe(PLAN_ICON_INKS.length);
    for (const ink of PLAN_ICON_INKS) expect(PLAN_ICON_PALETTE[ink][3]).toBe(255);
    expect(Object.isFrozen(PLAN_ICON_PALETTE)).toBe(true);
  });

  it('an empty layout is the ground inside its frame, nothing else', () => {
    const icon = drawPlanIcon(floor());
    expect(count(icon.data, 'piece') + count(icon.data, 'teamA') + count(icon.data, 'teamB') + count(icon.data, 'objective') + count(icon.data, 'marker')).toBe(0);
    expect(count(icon.data, 'ground')).toBeGreaterThan(0);
    expect(count(icon.data, 'edge')).toBeGreaterThan(0);
  });

  it('draws the pieces and the spawns of each team in their own inks', () => {
    const icon = drawPlanIcon(yard());
    expect(count(icon.data, 'piece')).toBeGreaterThan(0);
    expect(count(icon.data, 'teamA')).toBeGreaterThan(0);
    expect(count(icon.data, 'teamB')).toBeGreaterThan(0);
  });

  it('fits the extent: two pieces 20000 units apart both land inside the margin, one each side of the middle', () => {
    const wide: Layout = { ...floor(), pieces: [{ asset: 'MP2:crate', m: at(-10000, 0, 0) }, { asset: 'MP2:crate', m: at(10000, 0, 0) }] };
    const px = inks(drawPlanIcon(wide).data);
    const columns = px.flatMap((ink, i) => (ink === 'piece' ? [i % 256] : []));
    expect(columns.some((x) => x < 128)).toBe(true);
    expect(columns.some((x) => x >= 128)).toBe(true);
    expect(Math.min(...columns)).toBeGreaterThanOrEqual(PLAN_ICON_MARGIN - 4);
    expect(Math.max(...columns)).toBeLessThan(256 - PLAN_ICON_MARGIN + 4);
  });

  it('the same layout gives the same bytes; a moved piece gives other bytes', () => {
    const a = drawPlanIcon(yard()).data, b = drawPlanIcon(yard()).data;
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const moved = yard();
    moved.pieces[0]!.m = at(-100, 0, -50);
    expect(Buffer.from(drawPlanIcon(moved).data).equals(Buffer.from(a))).toBe(false);
  });

  it('marks the rules and objective rows too: an extraction zone, a rules zone, a bomb site, a hostage, an NPC', () => {
    const rich: Layout = {
      ...yard(),
      extractionZones: [{ name: 'Safety', at: [0, 0, 0], size: [100, 80] }],
      hostages: [{ p: [50, 0, 50], yaw: 0 }],
      npcs: [{ side: 'terrorist', type: 0, p: [-50, 0, 50], yaw: 0 }],
      zones: [{ id: 'hill', shape: 'cylinder', at: [100, 0, -100], radius: 40, height: 10 }],
      markers: [{ id: 'drop', at: [-100, 0, -100], yaw: 0 }],
      objectives: { gameType: 2, bomb: { start: [0, 0, 100], sites: [{ team: 0, at: [150, 0, 0], yaw: 0, range: 15, elevation: 15 }] } },
    };
    const icon = drawPlanIcon(rich);
    expect(count(icon.data, 'objective')).toBeGreaterThan(0);
    expect(count(icon.data, 'marker')).toBeGreaterThan(0);
    expect(inks(icon.data).filter((x) => x === null).length).toBe(0);
  });

  it('a layout of non-finite numbers draws no mark and throws nothing', () => {
    const odd: Layout = { ...floor(), pieces: [{ asset: 'MP2:crate', m: at(Number.NaN, 0, Number.POSITIVE_INFINITY) }] };
    const icon = drawPlanIcon(odd);
    expect(count(icon.data, 'piece')).toBe(0);
  });
});

describe('FX-11a: the plan icon as a PNG (the RGBA writer of the viewer, stored deflate)', () => {
  it('starts with the PNG signature and an IHDR of 256 x 256, 8-bit RGBA, its CRC right', () => {
    const png = planIconPng(yard());
    expect([...png.subarray(0, 8)]).toEqual([...PNG_SIGNATURE]);
    const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(v.getUint32(8)).toBe(13);
    expect(String.fromCharCode(...png.subarray(12, 16))).toBe('IHDR');
    expect([v.getUint32(16), v.getUint32(20), png[24], png[25], png[26], png[27], png[28]]).toEqual([256, 256, 8, 6, 0, 0, 0]);
    expect(v.getUint32(29)).toBe(crc32(png.subarray(12, 29)));
    expect(pngSize(png)).toEqual({ width: 256, height: 256 });
  });

  it('decodes back to exactly the drawn pixels', async () => {
    const l = yard();
    const decoded = await decodePngAsync(planIconPng(l));
    expect([decoded.width, decoded.height]).toEqual([256, 256]);
    expect(Buffer.from(decoded.data).equals(Buffer.from(drawPlanIcon(l).data))).toBe(true);
  });

  it('holds three chunks only: IHDR, IDAT, IEND (no text chunk to carry anything else)', () => {
    const png = planIconPng(yard());
    const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const types: string[] = [];
    for (let p = 8; p < png.length;) {
      const n = v.getUint32(p);
      types.push(String.fromCharCode(...png.subarray(p + 4, p + 8)));
      p += 12 + n;
    }
    expect(types).toEqual(['IHDR', 'IDAT', 'IEND']);
  });
});
