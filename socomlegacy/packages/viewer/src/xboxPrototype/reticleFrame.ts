import type { Rgba } from '@s2u/gs';
import type { ReticleBitmaps } from '../hudBitmaps';
import { WHITE, type HudQuad } from '../hudLayout';
import { BINOCULAR_BITMAPS, BINOCULAR_UV, RETICLE_SETS, binocularsLayout, nightLayout, reticleLayout, reticleTint, scopeLayout, type ReticleMode } from '../reticle';
import { SCOPE_BITMAPS } from '../sights';

/** Shared firearm/scope/binocular layouts on the raw HUD. Throw meter, target
 * and threat feeds remain separate. Geometry/tints come from the existing reticle.
 */
export interface ReticleFrame {
  visible: boolean;
  aim: [number, number]; size: number; offset: [number, number]; set: number;
  mode?: ReticleMode;
  night?: boolean;
  scopeBitmaps?: readonly string[];
}
export type ReticleQuad = Omit<HudQuad, 'element'> & { linear?: true };
export function reticleTextures(bitmaps: ReticleBitmaps | null | undefined): Record<string, Rgba> {
  if (!bitmaps) return {};
  const out: Record<string, Rgba> = {};
  for (const set of [0, 1, 2]) {
    const names = RETICLE_SETS[set]!;
    const fixed = bitmaps.sets?.[names.fixed], floating = bitmaps.sets?.[names.floating!];
    if (fixed && floating) { out[names.fixed] = fixed; out[names.floating!] = floating; }
  }
  const rifle = RETICLE_SETS[1]!;
  out[rifle.fixed] = bitmaps.fixed; out[rifle.floating!] = bitmaps.floating;
  for (const name of [...SCOPE_BITMAPS, ...BINOCULAR_BITMAPS, 'nvg_part.tif']) {
    const bitmap = bitmaps.sets?.[name]; if (bitmap) out[name] = bitmap;
  }
  return out;
}
export function reticleQuads(frame: { width: number; height: number }, sight: ReticleFrame | undefined,
  sizes: Readonly<Record<string, { width: number; height: number }>>): ReticleQuad[] {
  if (!sight?.visible) return [];
  const out: ReticleQuad[] = [];
  const bars = (rects: readonly { x: number; y: number; width: number; height: number }[]) => {
    for (const rect of rects) out.push({ texture: WHITE, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2,
      w: rect.width, h: rect.height, turn: 0, u0: 0, u1: 1, v0: 0, v1: 1, rgba: [0, 0, 0, 1] });
  };
  if (sight.mode === 'scope' && SCOPE_BITMAPS.some(name => !!sizes[name])) {
    const layout = scopeLayout(frame);
    for (const texture of sight.scopeBitmaps ?? SCOPE_BITMAPS) {
      const bitmap = sizes[texture]; if (!bitmap) continue;
      for (const q of layout.quads) out.push({ texture, x: q.x, y: q.y, w: q.size, h: q.size, turn: 0,
        // Reticle.setBitmaps: research341's scope sampling is 0.01..0.99,
        // bilinear. Both masks use the shared mirrored scopeLayout quads.
        u0: (q.flipX ? 0.99 : 0.01) * bitmap.width, u1: (q.flipX ? 0.01 : 0.99) * bitmap.width,
        v0: (q.flipY ? 0.99 : 0.01) * bitmap.height, v1: (q.flipY ? 0.01 : 0.99) * bitmap.height,
        rgba: [1, 1, 1, 1], linear: true });
    }
    bars(layout.bars);
    return out;
  }
  if (sight.mode === 'binoculars' && BINOCULAR_BITMAPS.some(name => !!sizes[name])) {
    const layout = binocularsLayout(frame);
    for (const q of layout.quads) {
      const bitmap = sizes[q.bitmap]; if (!bitmap) continue;
      out.push({ texture: q.bitmap, x: q.x, y: q.y, w: q.width, h: q.height, turn: 0,
        u0: (q.flipX ? BINOCULAR_UV.u1 : BINOCULAR_UV.u0) * bitmap.width,
        u1: (q.flipX ? BINOCULAR_UV.u0 : BINOCULAR_UV.u1) * bitmap.width,
        v0: BINOCULAR_UV.v0 * bitmap.height, v1: BINOCULAR_UV.v1 * bitmap.height, rgba: [1, 1, 1, 1] });
    }
    bars(layout.bars);
    return out;
  }
  const night = sizes['nvg_part.tif'];
  let nightBars: ReturnType<typeof nightLayout>['bars'] = [];
  if (sight.night && night) {
    const layout = nightLayout(frame);
    for (const q of layout.quads) out.push({ texture: 'nvg_part.tif', x: q.x, y: q.y, w: q.width, h: q.height, turn: 0,
      u0: q.flipX ? night.width : 0, u1: q.flipX ? 0 : night.width,
      v0: q.flipY ? night.height : 0, v1: q.flipY ? 0 : night.height, rgba: [1, 1, 1, 1] });
    nightBars = layout.bars;
  }
  const finish = () => { bars(nightBars); return out; };
  if (![0, 1, 2].includes(sight.set)) return finish();
  const set = sight.set, names = RETICLE_SETS[set]!;
  const fixed = sizes[names.fixed], floating = sizes[names.floating!];
  if (!fixed || !floating) return finish();
  for (const q of reticleLayout(frame, sight.aim, sight.size, sight.offset,
    { fixed: fixed.width, fixedH: fixed.height, arm: floating.width, armH: floating.height }, set).quads) {
    const texture = q.part === 'fixed' ? names.fixed : names.floating!, bitmap = sizes[texture]!;
    out.push({ texture, x: q.x, y: q.y, w: q.width, h: q.height, turn: q.turns * Math.PI / 2,
      u0: q.flipX ? bitmap.width : 0, u1: q.flipX ? 0 : bitmap.width,
      v0: q.flipY ? bitmap.height : 0, v1: q.flipY ? 0 : bitmap.height,
      rgba: [...(q.part === 'fixed' ? [1, 1, 1] as const : reticleTint('rest')), 1] });
  }
  return finish();
}

/** Reticle.setSet refuses a missing pair and keeps the last drawn firearm set. */
export function reticleDrawSet(requested: number, previous: number,
  sizes: Readonly<Record<string, { width: number; height: number }>>): number {
  const names = RETICLE_SETS[requested];
  return [0, 1, 2].includes(requested) && names && sizes[names.fixed] && sizes[names.floating!] ? requested : previous;
}
