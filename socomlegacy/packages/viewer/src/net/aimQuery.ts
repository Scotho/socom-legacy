import { aimPickBlocks, CAMERA_SKIP, SURFACE_SIDE, SURFACE_SKIP, surfaceWord, type SurfaceMaterial, type WorldPoly } from '@s2u/scene';

/**
 * AD-2 (web sprint 40; reconciliation C10, LATER 35; research 84 §19): the admission of `FUN_005aa6e0`'s aim query and
 * `FUN_005b6240`'s, shared by every copy of them -- the shot's eye ray, the loft's and the accuracy pip's (`../fire`), the
 * reticle's target pick and the hostage order's pick, the page's and the room's (`./hostageOrder` `pickSurfaces`,
 * `crosshairPick`; AD-2's review F1). Pure: no three.js, no DOM -- the server imports it through `./hostageOrder`.
 */

/** AD-2: the two aim queries -- the eye's (`FUN_005aa6e0`) and the accuracy pip's muzzle (`FUN_005b6240`). */
export type AimQuery = 'eye' | 'muzzle';

/**
 * AD-2 (reconciliation C10, LATER 35; research 84 §19): whether an aim query reaches a polygon at all. Both run
 * `FUN_0031e160` -> `FUN_002d4780` -> `FUN_002d2890`, which takes a surface only with the side bit (surface word bit 1,
 * D:L174845) and then by `DAT_0044d758` (D:L174846-174862): the eye's query sets it to 1 around its call
 * (`FUN_002d4fd0(1)` / `(0)`, D:L464117, D:L464125), so a bit-19 surface (`m_cameratype` bit 1) is skipped; the muzzle's
 * runs after the reset, at 0 (its one caller, D:L464333; every setter puts 0 back), so a bit-18 surface (`m_cameratype`
 * bit 0) is skipped instead. Mode 1 also skips a VOLUMETRIC material (D:L174856-174861); `aimHitKept` passes those
 * anyway, so it is not repeated here (the one place the two would part is a model's first-hit rule, research 230 §3.4's
 * open F1, which `segmentHit` does not model). The shooter's own node is switched out of both (D:L464119-464124,
 * D:L470353-470358): the port's grid holds no player's body, and the bodies a caller adds are only the others'.
 */
export function aimQueryAdmits(p: Pick<WorldPoly, 'ditype' | 'ptcount' | 'material' | 'cameratype'>, query: AimQuery): boolean {
  const w = surfaceWord(p);
  if ((w & SURFACE_SIDE) === 0) return false;
  return (w & (query === 'eye' ? CAMERA_SKIP : SURFACE_SKIP)) === 0;
}

/**
 * AD-2: the hit rule `FUN_005aa6e0` (D:L464145-464159) and `FUN_005b6240` (D:L470381-470397) share, the same predicate
 * in both: a hit whose material slot is empty (`DAT_0044f358[i]` 0) is not kept; nor one on an `m_cameratype` 1 surface
 * (bit 18 alone: D:L464148, D:L470384-470385); any other is kept unless its material is VOLUMETRIC, LIQUID or of
 * PENETRATION >= 0.98 without PICKUP (`aimPickBlocks`). Of the hits kept each query takes the nearest its start, not the
 * first met (D:L464162-464169; D:L470400-470407): `segmentHit` with this as its filter. A hit not kept is passed: the eye's
 * query hands one on an action node to the action record (`+0x3e0`, D:L464171-464194), never the aim; the muzzle's drops it.
 * `materialOf` null is the port's page without a material table (a browser fallback, as `Fire.setMaterials`' null): the
 * surface's class is still judged, its material not (every material kept).
 */
export function aimHitKept(
  p: Pick<WorldPoly, 'material' | 'cameratype'>, materialOf: ((material: number) => SurfaceMaterial | null | undefined) | null,
): boolean {
  const m = materialOf ? materialOf(p.material) : null;
  if (materialOf && !m) return false;
  if ((p.cameratype & 3) === 1) return false;
  return m ? aimPickBlocks(m) : true;
}
