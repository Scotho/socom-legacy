import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { planFrame, type UiFramePlan, type UiPlanBlendMode } from '../src/uiFramePlan';
import { UI_RASTER_CASES, UI_RASTER_CASE_MODES, UI_RASTER_CASE_SCALES, caseRasterInputs, caseRunKey } from './uiRasterCases';

/**
 * GM-29 (plan 2026-11-01-gpu-menus, row GM-29; product track, a cost): the planner made cheaper per frame (its axis
 * table sized from the last plan and handed out without a copy, its per-quad arrays written out, `wrapIndex` in the
 * axis functions) must plan every frame as before, byte for byte. This pins a digest of each GM-03 case's whole plan --
 * its hash, every field of its steps, quads, triangles, passes, batches, textures (each image by size and by identity
 * with the bitmap or HD image it names), verdict, why, fallback, undrawn, register, stats and the axis table's bytes --
 * at 1, 2 and 4, opaque and transparent, under `ff` and `exact`, as `agent/gm-final` 6723e6f27 (GM-29's base) planned
 * them. Unit test: no disc, no browser.
 */

const BLENDS: readonly UiPlanBlendMode[] = ['ff', 'exact'];

function digestOf(p: UiFramePlan, images: (image: unknown) => string): string {
  const h = createHash('sha256');
  const { source: _source, axis, textures, movies, ...rest } = p;
  h.update(JSON.stringify(rest, (_k, v: unknown) => (typeof v === 'number' && !Number.isFinite(v) ? `#${String(v)}` : Object.is(v, -0) ? '#-0' : v)));
  h.update(JSON.stringify(textures.map(({ image, ...t }) => ({ ...t, image: images(image), w: image.width, h: image.height }))));
  h.update(JSON.stringify(movies.map(({ image, picture: _picture, ...m }) => ({ ...m, w: image.width, h: image.height }))));
  h.update(String(axis.length));
  h.update(new Uint8Array(axis.buffer, axis.byteOffset, axis.byteLength));
  return h.digest('hex').slice(0, 16);
}

function caseDigest(c: (typeof UI_RASTER_CASES)[number]): string {
  const h = createHash('sha256');
  for (const scale of UI_RASTER_CASE_SCALES) for (const mode of UI_RASTER_CASE_MODES) for (const blend of BLENDS) {
    const { items, textures, options } = caseRasterInputs(c, scale, mode);
    const { quadCache: _cache, ...rest } = options;
    // Each planned image named by where it came from: the list's bitmap (identity), the HD lookup's image (its pixels), or neither.
    const named = new Map<unknown, string>();
    const look = (name: string): unknown => textures(name);
    const p = planFrame(items, textures, { ...rest, blend });
    p.textures.forEach((t) => { const b = look(t.name); named.set(t.image, t.image === b ? 'bitmap' : b && rest.hd?.(b as never)?.data === t.image.data ? 'hd' : 'other'); });
    h.update(`${caseRunKey(c, scale, mode)} ${blend} ${digestOf(p, (im) => named.get(im) ?? '?')}\n`);
  }
  return h.digest('hex').slice(0, 16);
}

/** The digests at GM-29's base (agent/gm-final 6723e6f27), one per case over its 12 runs. */
const PINNED: Readonly<Record<string, string>> = {
  '1': '550ff0ede98dfbe9',
  '2': '7cf365ace523334a',
  '3': 'f9ff9850bf45dbd1',
  '4': '6ffe3cb57f73aa40',
  '5': '676e81bc7e0a522c',
  '6': '11340cf440140beb',
  '7': '23e6dc61d0170a69',
  '8': '16e91d7e81caa1f4',
  '9': '76563f0afc323a5d',
  '10': '7031d81a7e309787',
  '11': 'd13d22aa5ef7ed37',
  '12': 'd25316fe6549b511',
  '14': '12edc3f0a0fc6e33',
  '15': '93e49a6d2246f174',
  '16': '7056ccc1f4c132a2',
  '17': '8464fb67e1cefd73',
  '18': '2f5c9ceb6425f337',
  '20': '1b91fb0f0b814850',
  '13.cold': 'c32a36cf023cd8bd',
  '13.warm': 'dd9d0d984ae54038',
  '13.hot': '5ec78ce736fe47bc',
  '19.a0': 'cbcabe536cb9b12c',
  '19.a64': 'baf8d6ee5bfac4f8',
  '19.a128': '176785b31a771ff4',
  '19.a192': 'e22af3814aad4555',
  '19.a255': '1801f3a053d5b471',
};

describe('GM-29: the planner plans every GM-03 case as at its base, byte for byte', () => {
  for (const c of UI_RASTER_CASES) {
    it(`case ${c.key}: ${c.name}`, () => {
      expect(caseDigest(c)).toBe(PINNED[c.key]);
    });
  }
});
