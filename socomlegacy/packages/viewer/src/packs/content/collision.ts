import { Matrix4, Vector3 } from 'three';
import { contentAssetKey, type ContentRef } from '@s2u/creator-contracts';
import { polygonNormal, WALL_NY, type WorldPoly } from '@s2u/scene';
import type { PieceHull } from '../../forge/ground';
import { bakedHulls, type AssetDefinition } from './assets';

/**
 * FCW-09 (product track; a browser adaptation with no original): the collision provider for a creator pack's prop. It
 * yields the forge's existing shapes -- a `PieceHull` (`../../forge/ground`) that `layoutGround` composes as it composes a
 * disc prototype's, and the `WorldPoly[]` that composition places -- so there is no second collision compositor. The one
 * function (`propHull`) serves both callers: the page's walk (`layoutGround`) and the server's room
 * (`match/src/forgeSimMap.ts` `composeForgeSimMap`), so the room's hull for a pack piece is the page's.
 *
 * A retail piece never comes here: its polygons are the disc's own (`prototypePolygons`), its ditype, material and frame
 * the disc's. A pack hull has none of those, so the engine gives it the values below, each named as an adaptation.
 * Placement is translation and a turn about +Y only (the plan's rule, FCW-09): units, axis and scale are baked by the
 * import tool, and a piece whose matrix is anything else is refused (`pieceYaw`), never decomposed.
 */

/**
 * Metres a game unit for a pack prop: the engine's default (`@s2u/scene` `worldRoot.ts` L163 `DEFAULT_METERS_PER_UNIT`,
 * research 36 section 2, the value `MP*.ZED/MetersPerUnit` falls back to; the forge's blank floor carries the same,
 * `../../forge/matchMap.ts` `blankLibraryMap`). One scale on every base, so a pack's metre is the same size everywhere and
 * the page and the server agree without reading the base's own key. An adaptation.
 */
export const CONTENT_METRES_PER_UNIT_ADAPTATION = 0.1;
/**
 * `m_ditype` of a hull face that faces up at least as steeply as the engine's wall bound (`WALL_NY`, research 24 section
 * 2): 3, ground and side (`@s2u/scene` `collision.ts` L21-25: bit 0 the vertical ground probe's, bit 1 the column probe's).
 * A pack hull carries no ditype of its own; its outward normal decides. An adaptation.
 */
export const CONTENT_GROUND_DITYPE_ADAPTATION = 3;
/**
 * `m_ditype` of every other hull face -- a side (a wall where `isWallSurface` finds it steep) or an underside: 2, side
 * only, so the ground probe never stands a body on a face that looks down. An adaptation.
 */
export const CONTENT_WALL_DITYPE_ADAPTATION = 2;
/** `m_material` of a pack hull's faces: 0, the forge's blank floor's (`../../forge/ground.ts` `floorGround`). An adaptation. */
export const CONTENT_MATERIAL_ADAPTATION = 0;
/**
 * How far a piece's matrix may be from an exact turn about +Y with unit scale and still be read as one (`pieceYaw`): a
 * floating-point allowance for three's `compose` and a JSON round trip, not a game value. An adaptation.
 */
export const CONTENT_PLACEMENT_TOLERANCE_ADAPTATION = 1e-6;
/** The owner path `propHull` names when its caller names none. */
export const CONTENT_OWNER_DEFAULT = 'forge/content';

/** A pack piece as `layoutGround` takes it: its owner path, its reference, its column-major matrix. */
export interface ContentPiece {
  readonly owner: string;
  readonly content: ContentRef;
  readonly m: readonly number[];
}
/** The registry's answer for a reference: the asset's definition, or null when the pack or the asset is not here. */
export type ContentResolver = (ref: ContentRef) => AssetDefinition | null;
/** A pack piece left out of the hull: its reference unresolved, or its placement not a turn about +Y. */
export interface ContentMiss {
  readonly owner: string;
  readonly content: ContentRef;
  readonly reason: 'unresolved' | 'placement';
}

const modelPolys = new WeakMap<AssetDefinition, WorldPoly[]>();

/**
 * The definition's hull faces as collision polygons in its model space, in game units: one polygon a face, the frame
 * baked (`bakedHulls`), metres over `CONTENT_METRES_PER_UNIT_ADAPTATION`, the face's ditype by its outward normal. The
 * owner path is the placement's (`propHull`). Empty for a visual-only prop. Cached a definition.
 */
export function propModelPolys(def: AssetDefinition): readonly WorldPoly[] {
  const have = modelPolys.get(def);
  if (have) return have;
  const modelName = contentAssetKey(def.ref);
  const out: WorldPoly[] = [];
  for (const hull of bakedHulls(def)) {
    for (const face of hull.faces) {
      const points = new Float32Array(face.length * 3);
      face.forEach((v, k) => {
        const p = hull.vertices[v]!;
        points[k * 3] = p[0] / CONTENT_METRES_PER_UNIT_ADAPTATION;
        points[k * 3 + 1] = p[1] / CONTENT_METRES_PER_UNIT_ADAPTATION;
        points[k * 3 + 2] = p[2] / CONTENT_METRES_PER_UNIT_ADAPTATION;
      });
      // The import tool's faces wind counterclockwise seen from outside, so `polygonNormal`'s sign is outward.
      const n = polygonNormal(points);
      const ditype = n !== null && n[1] >= WALL_NY ? CONTENT_GROUND_DITYPE_ADAPTATION : CONTENT_WALL_DITYPE_ADAPTATION;
      out.push({ modelName, path: modelName, region: 0, ditype, material: CONTENT_MATERIAL_ADAPTATION, ptcount: face.length, cameratype: 0, points });
    }
  }
  modelPolys.set(def, out);
  return out;
}

/**
 * The column-major matrix of a placement at `at` turned `yaw` radians about +Y (three's `makeRotationY`: (x, z) to
 * (x cos + z sin, z cos - x sin)), unit scale. The four off-axis terms are exactly 0, so `layoutGround` gives the owner no
 * frame (`uprightFrame`).
 */
export function propMatrix(at: readonly [number, number, number], yaw: number): number[] {
  if (!at.every(Number.isFinite) || !Number.isFinite(yaw)) throw new RangeError('a pack placement is three finite numbers and a finite yaw');
  const c = Math.cos(yaw) + 0, s = Math.sin(yaw) + 0;
  return [c, 0, -s + 0, 0, 0, 1, 0, 0, s, 0, c, 0, at[0] + 0, at[1] + 0, at[2] + 0, 1];
}

/**
 * The placement a piece's matrix makes, when it is a turn about +Y with unit scale (`CONTENT_PLACEMENT_TOLERANCE_ADAPTATION`):
 * the four off-axis terms exactly 0, as three's `compose` leaves them for a turn about y (`uprightFrame`'s structural
 * reading). Null for anything else -- a tilt, a scale, a mirror, a shear, a projective row or a non-finite entry.
 */
export function pieceYaw(m: readonly number[]): { at: [number, number, number]; yaw: number } | null {
  if (m.length !== 16 || !m.every(Number.isFinite)) return null;
  if (m[1] !== 0 || m[4] !== 0 || m[6] !== 0 || m[9] !== 0 || m[3] !== 0 || m[7] !== 0 || m[11] !== 0 || m[15] !== 1) return null;
  const t = CONTENT_PLACEMENT_TOLERANCE_ADAPTATION;
  const c = m[0]!, s = m[8]!;
  if (Math.abs(m[5]! - 1) > t || Math.abs(m[10]! - c) > t || Math.abs(m[2]! + s) > t || Math.abs(Math.hypot(c, s) - 1) > t) return null;
  return { at: [m[12]!, m[13]!, m[14]!], yaw: Math.atan2(s, c) };
}

/**
 * The provider: the `PieceHull` of `def` placed at `at` turned `yaw` about +Y, owned by `owner` -- the shape `layoutGround`
 * composes, carried by `propMatrix`. Null for a visual-only prop: nothing to stand on or bump into, as a disc prototype
 * with no `di` gives none (`prototypePolygons`).
 */
export function propHull(def: AssetDefinition, at: readonly [number, number, number], yaw: number, owner: string = CONTENT_OWNER_DEFAULT): PieceHull | null {
  const polys = propModelPolys(def);
  if (polys.length === 0) return null;
  return { owner, polys, m: propMatrix(at, yaw) };
}

/**
 * The polygons `propHull`'s hull places in the world (what `layoutGround` adds for it): each face carried by the
 * placement's matrix, three's `applyMatrix4` as `layoutGround` carries, named by `owner`. Empty for a visual-only prop.
 */
export function propPolys(def: AssetDefinition, at: readonly [number, number, number], yaw: number, owner: string = CONTENT_OWNER_DEFAULT): WorldPoly[] {
  const hull = propHull(def, at, yaw, owner);
  if (!hull) return [];
  const m = new Matrix4().fromArray(hull.m as number[]);
  const v = new Vector3();
  return hull.polys.map((p) => {
    const points = new Float32Array(p.points.length);
    for (let i = 0; i < points.length; i += 3) {
      v.set(p.points[i]!, p.points[i + 1]!, p.points[i + 2]!).applyMatrix4(m);
      points[i] = v.x; points[i + 1] = v.y; points[i + 2] = v.z;
    }
    return { ...p, path: owner, points };
  });
}

/**
 * A pack piece through the resolver: its hull (`propHull`'s, carried by the piece's own matrix once `pieceYaw` reads it
 * as a turn about +Y), null when the prop is visual-only, with the definition it was read from -- or why it is left out:
 * `unresolved` (no resolver, or the registry has no such asset) or `placement` (not a turn about +Y). The one path for the
 * page's `layoutGround`, the match map's drawn pieces (`../../forge/matchMap` `composeMatchMap`) and the server's
 * `composeForgeSimMap`, so a piece is drawn exactly when it is solid (or visual-only) and refused by both alike.
 */
export function contentPieceHull(piece: ContentPiece, resolve: ContentResolver | null):
  { hull: PieceHull | null; def: AssetDefinition } | { missing: ContentMiss['reason'] } {
  const def = resolve ? resolve(piece.content) : null;
  if (!def) return { missing: 'unresolved' };
  if (!pieceYaw(piece.m)) return { missing: 'placement' };
  // The piece's own matrix, read as a turn about +Y: the hull sits exactly where the page draws the piece.
  const polys = propModelPolys(def);
  return { hull: polys.length === 0 ? null : { owner: piece.owner, polys, m: [...piece.m] }, def };
}
