import {
  cloneCorner, cross, dot, faceNormal, facePoints, faceVerts, length, liveFaces, normalize, scale, sub, vertPos,
  type EditMesh, type StyleSlot, type TextureMapping, type Vec3,
} from './editMesh';
// Used inside `applyTexture` alone (`./primitives` reads this module too: no value of it is needed as either loads).
import { NEW_GEOMETRY_COLOR_PLACEHOLDER } from './primitives';

/**
 * Face texturing as Hammer does it (a browser adaptation; the owner, 2026-11-14: "make it work the same way hammer does
 * texturing"). A face carries a material (its draw style's texture) and a `TextureMapping`: two axes, a scale and a shift
 * each. The tools are Hammer's face edit sheet:
 * - **apply** a texture to the selected faces (`applyTexture`), keeping their mapping, or world- or face-aligned;
 * - **world align** (`worldAligned`: the axes of the nearest axis plane) and **face align** (`faceAligned`: in the face);
 * - **scale, shift, rotate** (`adjustMapping`) and **justify** -- fit, left, right, top, bottom, centre (`justify`);
 * - **pick up** a face's texture and mapping and **paste** it on others (`fitMapping`, `applyTexture` with a mapping);
 * - **texture lock**: moving geometry carries its mapping with it (`lockMapping`), so the texture stays on the surface.
 * A face off the disc has no mapping: its disc uvs stay until it is textured, or its mapping is fitted to them.
 */

/** A texture's size in texels, or null when the map does not hold it. */
export type TextureSize = (textureName: string | null) => readonly [number, number] | null;

const SNAP = 1e-6;

/** A mapping's uv at `p` over a `[w, h]` texture. */
export function mappedUv(map: TextureMapping, p: readonly number[], size: readonly [number, number]): [number, number] {
  return [(dot(p, map.u) / map.scaleU + map.shiftU) / size[0], (dot(p, map.v) / map.scaleV + map.shiftV) / size[1]];
}

/** The axes for a face of normal `n`: u to the right and v down, looking at it from in front, `up` the world's +y. */
function axesFor(n: Vec3): { u: Vec3; v: Vec3 } {
  const up: Vec3 = [0, 1, 0];
  let u = cross(up, n);
  if (length(u) < SNAP) u = [1, 0, 0]; // a floor or a ceiling: u along +x
  u = normalize(u);
  return { u, v: normalize(cross(u, n)) };
}

/** World-aligned: the axes of the axis plane nearest the face (Hammer's default), at `scaleTexel` world units a texel. */
export function worldAligned(normal: readonly number[], scaleTexel: number): TextureMapping {
  const ax = Math.abs(normal[0]!), ay = Math.abs(normal[1]!), az = Math.abs(normal[2]!);
  const snapped: Vec3 = ay >= ax && ay >= az ? [0, Math.sign(normal[1]!) || 1, 0] : ax >= az ? [Math.sign(normal[0]!) || 1, 0, 0] : [0, 0, Math.sign(normal[2]!) || 1];
  return { ...axesFor(snapped), scaleU: scaleTexel, scaleV: scaleTexel, shiftU: 0, shiftV: 0 };
}

/** Face-aligned: the axes in the face's own plane. */
export function faceAligned(normal: readonly number[], scaleTexel: number): TextureMapping {
  return { ...axesFor(normalize(normal)), scaleU: scaleTexel, scaleV: scaleTexel, shiftU: 0, shiftV: 0 };
}

/**
 * The mapping that gives face `f` the uvs it has (Hammer's pick-up, and how a disc face gets a mapping to edit): the
 * gradient of its texel coordinates over its first triangle, as axis and scale, and the shift that puts corner 0's
 * texel back. Null on a degenerate face or one whose uvs do not change over it.
 */
export function fitMapping(m: EditMesh, f: number, size: readonly [number, number]): TextureMapping | null {
  const face = m.faces[f];
  if (!face || face.corners.length < 3) return null;
  const [p0, p1, p2] = facePoints(m, f) as [Vec3, Vec3, Vec3];
  const [c0, c1, c2] = face.corners as [number, number, number];
  const e1 = sub(p1, p0), e2 = sub(p2, p0);
  const a = dot(e1, e1), b = dot(e1, e2), c = dot(e2, e2), det = a * c - b * b;
  if (Math.abs(det) < SNAP) return null;
  const grad = (k: 0 | 1): { axis: Vec3; scaleT: number; shift: number } | null => {
    const t0 = m.cUv[c0 * 2 + k]! * size[k], d1 = m.cUv[c1 * 2 + k]! * size[k] - t0, d2 = m.cUv[c2 * 2 + k]! * size[k] - t0;
    const s = (d1 * c - d2 * b) / det, t = (d2 * a - d1 * b) / det;
    const g: Vec3 = [e1[0] * s + e2[0] * t, e1[1] * s + e2[1] * t, e1[2] * s + e2[2] * t];
    const gl = length(g);
    if (gl < SNAP) return null;
    const axis = scale(g, 1 / gl), scaleT = 1 / gl;
    return { axis, scaleT, shift: t0 - dot(p0, axis) / scaleT };
  };
  const u = grad(0), v = grad(1);
  if (!u || !v) return null;
  return { u: u.axis, v: v.axis, scaleU: u.scaleT, scaleV: v.scaleT, shiftU: u.shift, shiftV: v.shift };
}

/**
 * The map's own texel scale: the median world units a texel over the disc faces whose texture size is known -- what a
 * new face's mapping starts at, so a texture laid by hand matches the density of the map around it (read off the
 * map's uvs, not chosen). Null when no face could be fitted.
 */
export function medianTexelScale(m: EditMesh, size: TextureSize, sample = 4000): number | null {
  const faces = liveFaces(m);
  const step = Math.max(1, Math.floor(faces.length / sample));
  const scales: number[] = [];
  for (let i = 0; i < faces.length; i += step) {
    const f = faces[i]!;
    const sz = size(m.styles[m.faces[f]!.style]!.style.textureName);
    if (!sz) continue;
    const map = fitMapping(m, f, sz);
    if (map) scales.push(map.scaleU, map.scaleV);
  }
  if (!scales.length) return null;
  scales.sort((a, b) => a - b);
  return scales[scales.length >> 1]!;
}

/**
 * Gives `faces` corners of their own: a corner another face also uses is copied, so writing these faces' uvs leaves
 * their neighbours' alone (a seam opens where the texture now differs, as it does in the draw).
 */
export function ownCorners(m: EditMesh, faces: readonly number[]): void {
  const mine = new Set(faces);
  const shared = new Set<number>();
  for (const f of liveFaces(m)) if (!mine.has(f)) for (const c of m.faces[f]!.corners) shared.add(c);
  const copied = new Map<number, number>();
  for (const f of faces) {
    const face = m.faces[f];
    if (!face) continue;
    face.corners = face.corners.map((c) => {
      if (!shared.has(c)) return c;
      let n = copied.get(c);
      if (n === undefined) { n = cloneCorner(m, c); copied.set(c, n); }
      return n;
    });
  }
}

/** Rewrites the uvs of `faces` that carry a mapping, from it. */
export function refreshUvs(m: EditMesh, faces: readonly number[], size: TextureSize): void {
  const mapped = faces.filter((f) => m.faces[f]?.mapping);
  ownCorners(m, mapped);
  for (const f of mapped) {
    const face = m.faces[f]!;
    const sz = size(m.styles[face.style]!.style.textureName) ?? [1, 1];
    for (const c of face.corners) {
      const [u, v] = mappedUv(face.mapping!, vertPos(m, m.cVert[c]!), sz);
      m.cUv[c * 2] = u;
      m.cUv[c * 2 + 1] = v;
    }
  }
}

/** The style slot of `f`'s draw with texture `textureName`: its own when it already has it, else a copy made once. */
export function styleWithTexture(m: EditMesh, style: number, textureName: string | null): number {
  const slot = m.styles[style]!;
  if (slot.style.textureName === textureName) return style;
  const base = slot.base ?? style;
  const found = m.styles.findIndex((s, i) => (s.base ?? i) === base && s.style.textureName === textureName);
  if (found >= 0) return found;
  const baseSlot = m.styles[base]!;
  m.styles.push({ ...baseSlot, style: { ...baseSlot.style, textureName }, rank: baseSlot.rank + 0.5, base });
  return m.styles.length - 1;
}

export type AlignMode = 'keep' | 'world' | 'face';

/**
 * Hammer's apply: `faces` take `textureName`. `align` 'keep' keeps a face's mapping -- fitted to its uvs over the old
 * texture's size first when it has none, so the texture lands where the old one lay; 'world' and 'face' align it anew
 * at `scaleTexel`. `paste`: a picked-up mapping laid on every face instead.
 */
export function applyTexture(
  m: EditMesh, faces: readonly number[], textureName: string | null, size: TextureSize,
  opts: { align?: AlignMode; scaleTexel?: number; paste?: TextureMapping } = {},
): void {
  const align = opts.align ?? 'keep';
  const scaleTexel = opts.scaleTexel ?? 1;
  const bare: number[] = [];                                   // the faces textured for the first time
  for (const f of faces) {
    const face = m.faces[f];
    if (!face) continue;
    if (textureName && !m.styles[face.style]!.style.textureName) bare.push(f);
    const oldSize = size(m.styles[face.style]!.style.textureName);
    if (opts.paste) face.mapping = { ...opts.paste };
    else if (align === 'world') face.mapping = worldAligned(faceNormal(m, f), scaleTexel);
    else if (align === 'face') face.mapping = faceAligned(faceNormal(m, f), scaleTexel);
    else if (!face.mapping) face.mapping = (oldSize && fitMapping(m, f, oldSize)) || worldAligned(faceNormal(m, f), scaleTexel);
    face.style = styleWithTexture(m, face.style, textureName);
  }
  refreshUvs(m, faces, size);
  // An untextured face's colour (a blank floor's grey, `UNTEXTURED_FLOOR_COLOR_ADAPTATION`) gives way to the texture's:
  // its corners -- its own now (`refreshUvs`) -- back to new geometry's colour, so the texture shows as it is.
  for (const f of bare) for (const c of m.faces[f]!.corners) m.cColor.splice(c * 4, 4, ...NEW_GEOMETRY_COLOR_PLACEHOLDER);
}

/**
 * What Hammer's eyedropper takes off a face: its material -- the texture and every flag of its draw (lit, fog, cull,
 * alternate, scroll), not the draw's order -- and its mapping (its own, or fitted to its uvs), so a sampled face's look
 * can be laid on others exactly (`pasteLook`, Hammer's apply-material-and-mapping).
 */
export interface FaceLook {
  style: Omit<StyleSlot['style'], 'order' | 'orderEnd'>;
  mapping: TextureMapping | null;
}

export function sampleFace(m: EditMesh, f: number, size: TextureSize): FaceLook | null {
  const face = m.faces[f];
  if (!face) return null;
  const { order: _o, orderEnd: _e, ...style } = m.styles[face.style]!.style;
  const sz = size(style.textureName);
  const mapping = face.mapping ? { ...face.mapping, u: [...face.mapping.u] as Vec3, v: [...face.mapping.v] as Vec3 } : sz ? fitMapping(m, f, sz) : null;
  return { style, mapping };
}

/**
 * Two draw styles alike in everything but their place in the order: every key either holds, a key one lacks read as
 * absent (undefined) -- so a style with a flag of its own (a `detailRange`) is not taken for one without it.
 */
const sameStyle = (a: StyleSlot['style'], b: StyleSlot['style']): boolean => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.delete('order'); keys.delete('orderEnd');
  const ra = a as unknown as Record<string, unknown>, rb = b as unknown as Record<string, unknown>;
  return [...keys].every((k) => JSON.stringify(ra[k]) === JSON.stringify(rb[k]));
};

/**
 * The style slot of `style`'s draw with the material `look`: its own when it matches, else a copy of its source made once.
 * The style wanted is the source's with `look` (a whole material, `sampleFace`'s) over it.
 */
export function styleWithLook(m: EditMesh, style: number, look: FaceLook['style']): number {
  const slot = m.styles[style]!;
  const base = slot.base ?? style;
  const baseSlot = m.styles[base]!;
  const want = { ...baseSlot.style, ...look };
  if (sameStyle(slot.style, want)) return style;
  const found = m.styles.findIndex((s, i) => (s.base ?? i) === base && sameStyle(s.style, want));
  if (found >= 0) return found;
  m.styles.push({ ...baseSlot, style: want, rank: baseSlot.rank + 0.5, base });
  return m.styles.length - 1;
}

/**
 * The detail pass's two per-visual words on faces' draws (PF-30, as the original holds them per visual, not per
 * texture): `on`, the visual's `vparams` word 0 bit 14 (`DETAIL_BIT14_READING`, `FUN_003b6e10` D:L308392: without it
 * the texture's detail pass is not drawn over the visual); `range`, the visual's gate range, squared world units (its
 * `detail_buff`, `DETAIL_RANGE_SOURCE_READING`; the pass drawn while the visual's centroid is that near,
 * `FUN_003374c0` D:L235405-235418). `LoadedMesh.detailOn` and `detailRange` carry them: absent, on and the texture's
 * manifest record's range.
 */
export interface DetailChange { on?: boolean; range?: number }

/**
 * `faces` given `change` (the owner, 2026-11-18: per mesh, a Detail checkbox and distance): each face's draw with the
 * words set (`styleWithLook`), so faces sharing a draw with others are split into their own -- as retexturing does.
 */
export function setDetail(m: EditMesh, faces: readonly number[], change: DetailChange): void {
  for (const f of faces) {
    const face = m.faces[f];
    if (!face) continue;
    // The face's whole material as it is (its texture and every flag), the words changed over it.
    const { order: _o, orderEnd: _e, ...look } = m.styles[face.style]!.style;
    if (change.on !== undefined) look.detailOn = change.on ? undefined : false;
    if (change.range !== undefined) look.detailRange = change.range;
    face.style = styleWithLook(m, face.style, look);
  }
}

/**
 * A mapping laid on a face of normal `normal` (Hammer's wrap of a pasted mapping): as it is when the face lies near
 * the mapping's own plane, else its axes turned by the least rotation from that plane to the face's, about the face's
 * centre `at` (the texel there kept), so a wall pasted from a floor is not smeared into stripes.
 */
export function wrapMapping(map: TextureMapping, normal: readonly number[], at: readonly number[]): TextureMapping {
  const from = normalize(cross(map.v, map.u)), to = normalize([normal[0]!, normal[1]!, normal[2]!]);
  const d = dot(from, to);
  if (Math.abs(d) >= 0.5) return { ...map, u: [...map.u] as Vec3, v: [...map.v] as Vec3 };
  const axis = cross(from, to), s = length(axis);
  if (s < SNAP) return { ...map };
  const k = scale(axis, 1 / s), c = d;
  const rot = (x: Vec3): Vec3 => {
    const kx = cross(k, x), kd = dot(k, x);
    return normalize([x[0] * c + kx[0] * s + k[0] * kd * (1 - c), x[1] * c + kx[1] * s + k[1] * kd * (1 - c), x[2] * c + kx[2] * s + k[2] * kd * (1 - c)]);
  };
  const u = rot(map.u), v = rot(map.v);
  return {
    u, v, scaleU: map.scaleU, scaleV: map.scaleV,
    shiftU: map.shiftU + (dot(at, map.u) - dot(at, u)) / map.scaleU,
    shiftV: map.shiftV + (dot(at, map.v) - dot(at, v)) / map.scaleV,
  };
}

/**
 * Hammer's apply-material-and-mapping: `faces` take a sampled face's material and its mapping (wrapped onto each face's
 * plane, `wrapMapping`), so they look as the sampled face does; without a mapping (an untextured sample) each face is
 * world-aligned at `scaleTexel`.
 */
export function pasteLook(m: EditMesh, faces: readonly number[], look: FaceLook, size: TextureSize, scaleTexel = 1): void {
  const live = faces.filter((f) => m.faces[f]);
  for (const f of live) {
    const face = m.faces[f]!;
    const n = faceNormal(m, f);
    const pts = facePoints(m, f);
    const at: Vec3 = [0, 1, 2].map((k) => pts.reduce((a, p) => a + p[k]!, 0) / pts.length) as Vec3;
    face.mapping = look.mapping ? wrapMapping(look.mapping, n, at) : worldAligned(n, scaleTexel);
    face.style = styleWithLook(m, face.style, look.style);
  }
  refreshUvs(m, live, size);
}

/** Realigns `faces` to the world or their own plane, keeping texture and scale. */
export function align(m: EditMesh, faces: readonly number[], mode: 'world' | 'face', size: TextureSize, scaleTexel = 1): void {
  for (const f of faces) {
    const face = m.faces[f];
    if (!face) continue;
    const s = face.mapping ? Math.abs(face.mapping.scaleU) : scaleTexel;
    face.mapping = mode === 'world' ? worldAligned(faceNormal(m, f), s) : faceAligned(faceNormal(m, f), s);
  }
  refreshUvs(m, faces, size);
}

/**
 * A face edit sheet change (Hammer 2's Texture State and Modify Texture): shift (texels) and scale (world units a texel)
 * set, or nudged with `relative` (shift added, scale multiplied); `rotate` degrees about the axes' own normal, added;
 * `rotateTo` the rotation set (`mappingRotation`); `flipU` / `flipV` the texture mirrored along that axis; `nudgeU` /
 * `nudgeV` a shift in world units along the face (Hammer's shift buttons step by the grid), each face's own texels.
 */
export interface MappingChange {
  shiftU?: number; shiftV?: number; scaleU?: number; scaleV?: number; rotate?: number; relative?: boolean;
  rotateTo?: number; flipU?: boolean; flipV?: boolean; nudgeU?: number; nudgeV?: number;
}

function rotateAxes(map: TextureMapping, degrees: number): void {
  const n = normalize(cross(map.v, map.u));
  const a = (degrees * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  // Rodrigues about n: each axis stays perpendicular to n.
  const rot = (x: Vec3): Vec3 => {
    const k = cross(n, x), d = dot(n, x);
    return normalize([x[0] * c + k[0] * s + n[0] * d * (1 - c), x[1] * c + k[1] * s + n[1] * d * (1 - c), x[2] * c + k[2] * s + n[2] * d * (1 - c)]);
  };
  map.u = rot(map.u);
  map.v = rot(map.v);
}

/**
 * A mapping's rotation, degrees in (-180, 180]: its u axis against the u its plane would have unturned (`axesFor` of the
 * axes' own normal) -- what Hammer's Texture State shows as Rotate. 0 for a world- or face-aligned mapping.
 */
export function mappingRotation(map: TextureMapping): number {
  const n = normalize(cross(map.v, map.u));
  const ref = axesFor(n).u;
  const deg = (Math.atan2(dot(cross(ref, map.u), n), dot(ref, map.u)) * 180) / Math.PI;
  const r = Math.round(deg * 1000) / 1000;
  return r <= -180 ? r + 360 : r;
}

/** The selected faces' Texture State: each value the faces share, or null where they differ ("mixed"). */
export interface TextureState { count: number; scaleU: number | null; scaleV: number | null; shiftU: number | null; shiftV: number | null; rotate: number | null }

/**
 * The Texture State of `faces` (Hammer 2's panel): each face's mapping (its own, else fitted to its uvs, else
 * world-aligned at `scaleTexel` -- what an edit would start from), and the value they all share per field.
 */
export function textureState(m: EditMesh, faces: readonly number[], size: TextureSize, scaleTexel = 1): TextureState {
  const maps = faces.flatMap((f) => {
    const face = m.faces[f];
    if (!face) return [];
    const sz = size(m.styles[face.style]!.style.textureName);
    return [face.mapping ?? (sz && fitMapping(m, f, sz)) ?? worldAligned(faceNormal(m, f), scaleTexel)];
  });
  const shared = (read: (x: TextureMapping) => number): number | null => {
    if (!maps.length) return null;
    const v = Math.round(read(maps[0]!) * 10000) / 10000;
    return maps.every((x) => Math.abs(read(x) - v) < 1e-3) ? v : null;
  };
  return { count: maps.length, scaleU: shared((x) => x.scaleU), scaleV: shared((x) => x.scaleV), shiftU: shared((x) => x.shiftU), shiftV: shared((x) => x.shiftV), rotate: shared(mappingRotation) };
}

/**
 * Hammer's align to view: each face's axes the camera's right and down laid into the face's plane (`right`, `up` the
 * camera's world axes), so the texture reads upright from where you look; scale kept, shift zeroed.
 */
export function alignToView(m: EditMesh, faces: readonly number[], right: readonly number[], up: readonly number[], size: TextureSize, scaleTexel = 1): void {
  for (const f of faces) {
    const face = m.faces[f];
    if (!face) continue;
    const n = faceNormal(m, f);
    const flat = (a: readonly number[]): Vec3 => { const d = dot(a, n); return [a[0]! - n[0] * d, a[1]! - n[1] * d, a[2]! - n[2] * d]; };
    let u = flat(right);
    if (length(u) < SNAP) u = flat(up);                       // looking straight along the face: its up instead
    if (length(u) < SNAP) continue;
    u = normalize(u);
    const s = face.mapping ? face.mapping.scaleU : scaleTexel, t = face.mapping ? face.mapping.scaleV : scaleTexel;
    face.mapping = { u, v: normalize(cross(u, n)), scaleU: s, scaleV: t, shiftU: 0, shiftV: 0 };
  }
  refreshUvs(m, faces, size);
}

export function adjustMapping(m: EditMesh, faces: readonly number[], change: MappingChange, size: TextureSize, scaleTexel = 1): void {
  for (const f of faces) {
    const face = m.faces[f];
    if (!face) continue;
    const sz = size(m.styles[face.style]!.style.textureName);
    const map = face.mapping ?? (sz && fitMapping(m, f, sz)) ?? worldAligned(faceNormal(m, f), scaleTexel);
    const r = change.relative ?? false;
    if (change.shiftU !== undefined) map.shiftU = r ? map.shiftU + change.shiftU : change.shiftU;
    if (change.shiftV !== undefined) map.shiftV = r ? map.shiftV + change.shiftV : change.shiftV;
    if (change.scaleU !== undefined && change.scaleU !== 0) map.scaleU = r ? map.scaleU * change.scaleU : change.scaleU;
    if (change.scaleV !== undefined && change.scaleV !== 0) map.scaleV = r ? map.scaleV * change.scaleV : change.scaleV;
    if (change.rotate) rotateAxes(map, change.rotate);
    if (change.rotateTo !== undefined) rotateAxes(map, change.rotateTo - mappingRotation(map));
    // A mirror: the scale's sign turned, the texel at the axis's origin kept where it was (Hammer's flip).
    if (change.flipU) { map.scaleU = -map.scaleU; map.shiftU = -map.shiftU; }
    if (change.flipV) { map.scaleV = -map.scaleV; map.shiftV = -map.shiftV; }
    // A step in world units along the face: texels by this face's own scale (positive moves the texture along +u / +v).
    if (change.nudgeU) map.shiftU -= change.nudgeU / map.scaleU;
    if (change.nudgeV) map.shiftV -= change.nudgeV / map.scaleV;
    face.mapping = map;
  }
  refreshUvs(m, faces, size);
}

export type Justify = 'fit' | 'left' | 'right' | 'top' | 'bottom' | 'center';

/**
 * Hammer's justify over `faces` together (as its "treat as one"): their extent in texels along the axes; fit scales
 * one repeat across it, the others shift its edge or middle to the texture's.
 */
export function justify(
  m: EditMesh, faces: readonly number[], how: Justify, size: TextureSize, scaleTexel = 1,
  opts: { repeat?: readonly [number, number]; together?: boolean } = {},
): void {
  const live = faces.filter((f) => m.faces[f]);
  if (!live.length) return;
  // Hammer's "Treat as one" off: each face justified over its own extent.
  if (opts.together === false && live.length > 1) { for (const f of live) justify(m, [f], how, size, scaleTexel, { ...opts, together: true }); return; }
  const [ru, rv] = opts.repeat ?? [1, 1];
  for (const f of live) if (!m.faces[f]!.mapping) {
    const sz = size(m.styles[m.faces[f]!.style]!.style.textureName);
    m.faces[f]!.mapping = (sz && fitMapping(m, f, sz)) || worldAligned(faceNormal(m, f), scaleTexel);
  }
  for (const f of live) {
    const map = m.faces[f]!.mapping!;
    const sz = size(m.styles[m.faces[f]!.style]!.style.textureName) ?? [1, 1];
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const g of live) for (const v of faceVerts(m, g)) {
      const p = vertPos(m, v);
      const pu = dot(p, map.u), pv = dot(p, map.v);
      minU = Math.min(minU, pu); maxU = Math.max(maxU, pu); minV = Math.min(minV, pv); maxV = Math.max(maxV, pv);
    }
    if (how === 'fit') {
      // `ru` x `rv` repeats across the extent (Hammer's Fit X / Y), each axis's mirror kept.
      if (maxU > minU && ru > 0) map.scaleU = (Math.sign(map.scaleU) || 1) * (maxU - minU) / (ru * sz[0]);
      if (maxV > minV && rv > 0) map.scaleV = (Math.sign(map.scaleV) || 1) * (maxV - minV) / (rv * sz[1]);
      map.shiftU = -(map.scaleU > 0 ? minU : maxU) / map.scaleU;
      map.shiftV = -(map.scaleV > 0 ? minV : maxV) / map.scaleV;
    } else if (how === 'left') map.shiftU = -minU / map.scaleU;
    else if (how === 'right') map.shiftU = sz[0] - maxU / map.scaleU;
    else if (how === 'top') map.shiftV = -minV / map.scaleV;
    else if (how === 'bottom') map.shiftV = sz[1] - maxV / map.scaleV;
    else {
      map.shiftU = sz[0] / 2 - (minU + maxU) / 2 / map.scaleU;
      map.shiftV = sz[1] / 2 - (minV + maxV) / 2 / map.scaleV;
    }
  }
  refreshUvs(m, live, size);
}

/**
 * Texture lock: a mapping carried through a move of its face by the column-major 4x4 `mat` (`p' = mat p`), so every
 * point of the moved face takes the texel it had. The axes go through the inverse transpose of the linear part (a
 * texel coordinate is a plane through space), the shift through the translation.
 */
export function lockMapping(map: TextureMapping, mat: ArrayLike<number>): TextureMapping {
  // The linear part L, column-major: L[r][c] = mat[c * 4 + r]. A texel coordinate t(p) = dot(p, a) / s + h; t(p') = t(p)
  // needs a' = L^-T a and h' = h - dot(T, a') / s.
  const L = [[mat[0]!, mat[4]!, mat[8]!], [mat[1]!, mat[5]!, mat[9]!], [mat[2]!, mat[6]!, mat[10]!]];
  const T: Vec3 = [mat[12]!, mat[13]!, mat[14]!];
  const det = L[0]![0]! * (L[1]![1]! * L[2]![2]! - L[1]![2]! * L[2]![1]!) - L[0]![1]! * (L[1]![0]! * L[2]![2]! - L[1]![2]! * L[2]![0]!) + L[0]![2]! * (L[1]![0]! * L[2]![1]! - L[1]![1]! * L[2]![0]!);
  if (Math.abs(det) < SNAP) return map;
  // Inverse of L by cofactors; L^-T is the cofactor matrix over det.
  const cof = (r: number, c: number): number => {
    const rs = [0, 1, 2].filter((x) => x !== r), cs = [0, 1, 2].filter((x) => x !== c);
    const v = L[rs[0]!]![cs[0]!]! * L[rs[1]!]![cs[1]!]! - L[rs[0]!]![cs[1]!]! * L[rs[1]!]![cs[0]!]!;
    return ((r + c) % 2 ? -v : v) / det;
  };
  const invT = (a: Vec3): Vec3 => [0, 1, 2].map((r) => cof(r, 0) * a[0] + cof(r, 1) * a[1] + cof(r, 2) * a[2]) as Vec3;
  const carry = (a: Vec3, s: number, h: number): { axis: Vec3; s: number; h: number } => {
    const raw = invT(a); // a'/s' up to the length the scale takes
    const l = length(raw);
    const axis = scale(raw, 1 / l), s2 = s / l;
    return { axis, s: s2, h: h - dot(T, axis) / s2 };
  };
  const u = carry(map.u, map.scaleU, map.shiftU), v = carry(map.v, map.scaleV, map.shiftV);
  return { u: u.axis, v: v.axis, scaleU: u.s, scaleV: v.s, shiftU: u.h, shiftV: v.h };
}


/**
 * Each texture's natural size (the owner, 2026-11-17: texturing "easy ... for noobs", kept standard): the median world
 * units a texel over the faces of `m` that wear it, as the map's own makers laid it (at most `sample` faces a texture,
 * read off their uvs as `medianTexelScale` reads the map's), by lowercase name. What Reset puts a face back to.
 */
export function textureTexelScales(m: EditMesh, size: TextureSize, sample = 200): Map<string, number> {
  const byName = new Map<string, number[]>();
  for (const f of liveFaces(m)) {
    const name = m.styles[m.faces[f]!.style]!.style.textureName;
    if (!name) continue;
    const key = name.toLowerCase();
    const l = byName.get(key) ?? [];
    if (l.length >= sample * 2) continue;
    const sz = size(name);
    const map = sz ? fitMapping(m, f, sz) : null;
    if (!map) continue;
    l.push(Math.abs(map.scaleU), Math.abs(map.scaleV));
    byName.set(key, l);
  }
  const out = new Map<string, number>();
  for (const [k, l] of byName) { l.sort((a, b) => a - b); const mid = l[l.length >> 1]; if (mid && Number.isFinite(mid)) out.set(k, mid); }
  return out;
}

/** Hammer's reset: `faces` world-aligned again at their texture's natural size (`scaleOf`), shift and rotation zeroed. */
export function resetMapping(m: EditMesh, faces: readonly number[], size: TextureSize, scaleOf: (textureName: string | null) => number): void {
  for (const f of faces) {
    const face = m.faces[f];
    if (!face) continue;
    face.mapping = worldAligned(faceNormal(m, f), scaleOf(m.styles[face.style]!.style.textureName));
  }
  refreshUvs(m, faces, size);
}
