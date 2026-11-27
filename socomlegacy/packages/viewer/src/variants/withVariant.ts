import { mapVariant } from '@s2u/archive';
import type { CameraParams } from '@s2u/scene';
import type { LoadedMap, LoadedMesh } from '../loadMap';
import { materialSpec } from '../materialSpec';
import { propsKey, worldKey } from './key';
import { GRADE_SIZE, GRADE_TOP, PS2_UNITY, VARIANT_CAMERA_FIELDS, gradeIndex, type VariantProfile } from './profile';

/**
 * A map variant applied to a decoded map, once, at load (DAY-2; DAY.R3: the picture on the CPU, never a shader
 * uniform). **A browser adaptation** (NXS.R4; product track, DAY.R1): with no profile the map comes back as the very
 * same object, so an original map's picture is untouched unless a variant is told.
 *
 * Pure: the input is never mutated -- a changed field gets a new array or object, an unchanged one is shared. Steps, in
 * order: a profile for another stem throws; a (stem, variant) pair off `@s2u/archive` `MAP_VARIANTS` (`mapVariant`
 * undefined; DAY.R2: a pair not in the table is refused by every reader) returns the input map unchanged with a
 * diagnostic naming the pair, before anything is applied; the key (DAY.R4, `./key`) and the pack's length are checked
 * against the decoded world, and either mismatch returns the input map unchanged with a diagnostic (never a
 * half-applied picture); the pack or grade is applied once to each world part's RGB (`./profile` for both byte
 * layouts), alpha untouched, except a part whose texture is in `keepTextures` or whose draw blends additively or by the
 * destination (a light, not a lit surface: `isBlendedLight`); world parts whose texture is in `hideTextures` are
 * dropped (after the colours, so the pack's index stays the decoded world's); `addParts` are appended as
 * `../forge/ownEnvironment` `withLayoutEnvironment` appends a sky dome (world, textures, flags, mips), ungraded; each
 * `textureSwaps` entry replaces `textures[name]` and drops `textureMips[name]`; `night`, `lightRig` and the camera's
 * fog fields (`VARIANT_CAMERA_FIELDS`) are set -- a map with no camera record keeps none. The props (IQ-143): with
 * `propColours`, its key (`./key` `propsKey`) and length are checked with the world's, before anything is applied, and
 * its bytes set every prop part's RGB by the decoded prop index (alpha untouched; the matrices shared); then the entries
 * whose model is in `hideProps` are dropped. With neither, `map.props` is the very same array.
 */
export function withVariant(map: LoadedMap, profile: VariantProfile | null | undefined): { map: LoadedMap; diagnostic?: string } {
  if (!profile) return { map };
  if (profile.stem !== map.archive) {
    throw new Error(`withVariant: a profile for ${profile.stem} (${profile.variant}) given the map ${map.archive}`);
  }
  const label = `${profile.stem} ${profile.variant}`;
  if (!mapVariant(profile.stem, profile.variant)) {
    return { map, diagnostic: `variant ${label}: the pair is not in the variant table (MAP_VARIANTS, DAY.R2); drawn as decoded` };
  }
  if (profile.key) {
    const k = worldKey(map);
    if (k.vertices !== profile.key.vertices || k.fnv64 !== profile.key.fnv64) {
      return { map, diagnostic: `variant ${label}: world key mismatch (profile ${profile.key.vertices}/${profile.key.fnv64}, `
        + `map ${k.vertices}/${k.fnv64}); drawn as decoded` };
    }
  }
  const colours = profile.colours;
  if (colours?.kind === 'pack') {
    const vertices = map.world.reduce((n, p) => n + Math.floor(p.positions.length / 3), 0);
    if (colours.rgb8.length !== vertices * 3) {
      return { map, diagnostic: `variant ${label}: colour pack holds ${colours.rgb8.length} bytes, the world ${vertices} vertices `
        + `(${vertices * 3} bytes); drawn as decoded` };
    }
  }
  if (colours?.kind === 'grade' && colours.lut33.length !== GRADE_SIZE ** 3 * 3) {
    return { map, diagnostic: `variant ${label}: colour grade holds ${colours.lut33.length} bytes, not ${GRADE_SIZE ** 3 * 3}; drawn as decoded` };
  }
  const propColours = profile.propColours;
  if (propColours) {
    const k = propsKey(map);
    if (k.vertices !== propColours.key.vertices || k.fnv64 !== propColours.key.fnv64) {
      return { map, diagnostic: `variant ${label}: props key mismatch (profile ${propColours.key.vertices}/${propColours.key.fnv64}, `
        + `map ${k.vertices}/${k.fnv64}); drawn as decoded` };
    }
    if (propColours.rgb8.length !== k.vertices * 3) {
      return { map, diagnostic: `variant ${label}: props pack holds ${propColours.rgb8.length} bytes, the props ${k.vertices} vertices `
        + `(${k.vertices * 3} bytes); drawn as decoded` };
    }
  }

  const keep = new Set(profile.keepTextures);
  const hide = new Set(profile.hideTextures);
  let first = 0;
  const coloured = map.world.map((part) => {
    const at = first;
    first += Math.floor(part.positions.length / 3);
    if (!colours || (part.textureName !== null && keep.has(part.textureName)) || isBlendedLight(part, map)) return part;
    const out = Float32Array.from(part.colors);
    const n = Math.floor(out.length / 4);
    if (colours.kind === 'pack') {
      const rgb8 = colours.rgb8;
      for (let v = 0; v < n; v++) {
        const s = (at + v) * 3, o = v * 4;
        out[o] = rgb8[s]! / PS2_UNITY; out[o + 1] = rgb8[s + 1]! / PS2_UNITY; out[o + 2] = rgb8[s + 2]! / PS2_UNITY;
      }
    } else {
      const c: [number, number, number] = [0, 0, 0];
      for (let v = 0; v < n; v++) {
        const o = v * 4;
        gradeSample(colours.lut33, out[o]!, out[o + 1]!, out[o + 2]!, c);
        out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
      }
    }
    return { ...part, colors: out } as LoadedMesh;
  });
  const kept = hide.size ? coloured.filter((p) => p.textureName === null || !hide.has(p.textureName)) : coloured;

  const add = profile.addParts;
  const world = add ? [...kept, ...add.world] : kept;
  const swaps = Object.keys(profile.textureSwaps);
  let textures = map.textures, textureFlags = map.textureFlags, textureMips = map.textureMips;
  if (add) {
    textures = { ...textures, ...add.textures };
    textureFlags = { ...textureFlags, ...add.textureFlags };
    if (textureMips || add.textureMips) textureMips = { ...(textureMips ?? {}), ...(add.textureMips ?? {}) };
  }
  if (swaps.length) {
    textures = { ...textures, ...profile.textureSwaps };
    if (textureMips && swaps.some((s) => s in textureMips!)) {
      const rest = { ...textureMips };
      for (const s of swaps) delete rest[s];
      textureMips = rest;
    }
  }

  let camera = map.camera;
  if (camera) {
    const fog: Partial<CameraParams> = {};
    for (const f of VARIANT_CAMERA_FIELDS) {
      const v = profile.camera[f];
      if (v !== undefined) (fog as Record<string, unknown>)[f] = Array.isArray(v) ? [...v] : v;
    }
    camera = { ...camera, ...fog };
  }

  let props = map.props;
  if (propColours) {
    const rgb8 = propColours.rgb8;
    let at = 0;
    props = props.map((entry) => ({
      ...entry,
      parts: entry.parts.map((part) => {
        const out = Float32Array.from(part.colors);
        const n = Math.floor(part.positions.length / 3);
        for (let v = 0; v < n; v++) {
          const s = (at + v) * 3, o = v * 4;
          out[o] = rgb8[s]! / PS2_UNITY; out[o + 1] = rgb8[s + 1]! / PS2_UNITY; out[o + 2] = rgb8[s + 2]! / PS2_UNITY;
        }
        at += n;
        return { ...part, colors: out } as LoadedMesh;
      }),
    }));
  }
  const hideProps = new Set(profile.hideProps ?? []);
  if (hideProps.size) props = props.filter((e) => !hideProps.has(e.modelName));

  const out: LoadedMap = {
    ...map,
    world,
    props,
    textures,
    textureFlags,
    camera,
    night: { mission: profile.night.mission, lens: profile.night.lens ? [...profile.night.lens] as [number, number, number, number] : null },
    lightRig: {
      directions: profile.lightRig.directions.map((d) => [...d] as [number, number, number]),
      colours: profile.lightRig.colours.map((c) => [...c] as [number, number, number]),
      ambient: [...profile.lightRig.ambient] as [number, number, number],
    },
  };
  if (textureMips !== undefined) out.textureMips = textureMips;
  return { map: out };
}

/**
 * A world part that is a light rather than a lit surface: its draw blends additively (`(Cs - 0) * As + Cd`) or by the
 * destination (`(Cd - 0) * As + Cd`, a light map) -- `../materialSpec` `materialSpec`'s `blend`, whose factors
 * `drawState` sets, read as `world.ts` reads it (the disc's state honoured, `blendGraded`'s default true). The same two
 * blends `../forge/lighting.ts` (:83, `AdditiveBlending` or a custom blend with `OneFactor` destination) leaves
 * unshaped; that file is not imported because it pulls in three.js.
 */
export function isBlendedLight(part: LoadedMesh, map: Pick<LoadedMap, 'textureFlags'>): boolean {
  const flags = part.textureName === null ? undefined : map.textureFlags[part.textureName];
  const blend = materialSpec(flags, part.fog, true, part.cull, undefined, part.vertexAlpha ?? false).blend;
  return blend === 'additive' || blend === 'destination';
}

/**
 * The grade at one colour (`./profile`: 33^3 RGB8, red fastest, domain 0..`GRADE_TOP` in PS2 units, output byte / 128),
 * trilinear between the eight lattice points around it; each input lane clamped to the domain.
 */
export function gradeSample(lut: Uint8Array, r: number, g: number, b: number, out: [number, number, number]): void {
  const last = GRADE_SIZE - 1, scale = last / GRADE_TOP;
  const pos = (c: number) => Math.min(Math.max(c * scale, 0), last);
  const pr = pos(r), pg = pos(g), pb = pos(b);
  const r0 = Math.min(Math.floor(pr), last - 1), g0 = Math.min(Math.floor(pg), last - 1), b0 = Math.min(Math.floor(pb), last - 1);
  const fr = pr - r0, fg = pg - g0, fb = pb - b0;
  for (let ch = 0; ch < 3; ch++) {
    const at = (dr: number, dg: number, db: number) => lut[gradeIndex(r0 + dr, g0 + dg, b0 + db) * 3 + ch]!;
    const x00 = at(0, 0, 0) + (at(1, 0, 0) - at(0, 0, 0)) * fr;
    const x10 = at(0, 1, 0) + (at(1, 1, 0) - at(0, 1, 0)) * fr;
    const x01 = at(0, 0, 1) + (at(1, 0, 1) - at(0, 0, 1)) * fr;
    const x11 = at(0, 1, 1) + (at(1, 1, 1) - at(0, 1, 1)) * fr;
    const y0 = x00 + (x10 - x00) * fg, y1 = x01 + (x11 - x01) * fg;
    out[ch] = (y0 + (y1 - y0) * fb) / PS2_UNITY;
  }
}
