import { expect, it } from 'vitest';
import { ITEM } from '@s2u/scene';
import { WHITE } from '../src/hudLayout';
import { BINOCULAR_UV } from '../src/reticle';
import { scopeBitmaps } from '../src/sights';
import { reticleQuads, type ReticleFrame } from '../src/xboxPrototype/reticleFrame';

const sight: ReticleFrame = { visible: true, aim: [0.5, 0.5], size: 1, offset: [0, 0], set: 1 };
const frame = { width: 1280, height: 720 };
const sizes = Object.fromEntries(['ret_scope_01.tif', 'ret_scope_02.tif', 'ret_binocs.tif', 'ret_binocs2.tif', 'nvg_part.tif',
  'ret_rifle_01.tif', 'ret_rifle_02.tif'].map(name => [name, { width: 128, height: 128 }]));

it('draws the selected scope masks with their bilinear inset and fills only the widescreen sides', () => {
  const quads = reticleQuads(frame, { ...sight, mode: 'scope', scopeBitmaps: scopeBitmaps(ITEM.F2000) }, sizes);
  const masks = quads.filter(q => q.texture !== WHITE), bars = quads.filter(q => q.texture === WHITE);
  expect(masks).toHaveLength(4); expect(masks.every(q => q.texture === 'ret_scope_01.tif' && q.linear)).toBe(true);
  expect(masks[0]).toMatchObject({ u0: 1.28, u1: 126.72, v0: 126.72, v1: 1.28 });
  expect(bars).toHaveLength(2); expect(bars[0]!.rgba).toEqual([0, 0, 0, 1]);
  expect(bars[0]!.x - bars[0]!.w / 2).toBeCloseTo(0);
  expect(bars[1]!.x + bars[1]!.w / 2).toBeCloseTo(frame.width);
  expect(reticleQuads(frame, { ...sight, mode: 'scope' }, {})).toEqual([]);
});
it('keeps binocular painter order and mirrored native sampled windows', () => {
  const masks = reticleQuads(frame, { ...sight, mode: 'binoculars' }, sizes).filter(q => q.texture !== WHITE);
  expect(masks.map(q => q.texture)).toEqual(['ret_binocs.tif', 'ret_binocs.tif', 'ret_binocs2.tif', 'ret_binocs2.tif']);
  expect(masks[0]!.u0).toBe(BINOCULAR_UV.u0 * 128); expect(masks[1]!.u0).toBe(BINOCULAR_UV.u1 * 128);
  expect(masks.every(q => !q.linear)).toBe(true);
});
it('draws goggles behind the existing firearm sight and clears every overlay when hidden', () => {
  const quads = reticleQuads(frame, { ...sight, night: true }, sizes);
  expect(quads.slice(0, 4).every(q => q.texture === 'nvg_part.tif')).toBe(true);
  expect(quads.some(q => q.texture === 'ret_rifle_01.tif')).toBe(true);
  expect(quads.slice(-2).every(q => q.texture === WHITE)).toBe(true);
  expect(reticleQuads(frame, { ...sight, visible: false, mode: 'scope', night: true }, sizes)).toEqual([]);
});
it('preserves the shared firearm/night fallback with missing masks and keeps bars when a scope collection exists', () => {
  const rifleOnly = { 'ret_rifle_01.tif': sizes['ret_rifle_01.tif']!, 'ret_rifle_02.tif': sizes['ret_rifle_02.tif']! };
  for (const mode of ['scope', 'binoculars'] as const) {
    expect(reticleQuads(frame, { ...sight, mode }, rifleOnly)).toEqual(reticleQuads(frame, sight, rifleOnly));
  }
  const fallback = reticleQuads(frame, { ...sight, mode: 'scope', night: true }, { ...rifleOnly, 'nvg_part.tif': sizes['nvg_part.tif']! });
  expect(fallback[0]!.texture).toBe('nvg_part.tif');
  const onlyOtherMask = { 'ret_scope_02.tif': sizes['ret_scope_02.tif']! };
  const bars = reticleQuads(frame, { ...sight, mode: 'scope', scopeBitmaps: scopeBitmaps(ITEM.F2000) }, onlyOtherMask);
  expect(bars).toHaveLength(2); expect(bars.every(q => q.texture === WHITE)).toBe(true);
});
