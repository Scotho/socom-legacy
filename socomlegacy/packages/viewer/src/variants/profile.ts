import type { MapVariant } from '@s2u/archive';
import type { CameraParams, GlobalLighting } from '@s2u/scene';
import type { LoadedMap, LoadedMesh } from '../loadMap';

/**
 * A map variant's profile (DAY-2; DAY.R2, DAY.R3): what `./withVariant` applies to a decoded `LoadedMap` once at load,
 * on the CPU, to draw one of the table's labelled variants (`@s2u/archive` `MAP_VARIANTS`: MP5 day, MP64 day, MP6
 * night). **A browser adaptation**, never presented as the original (NXS.R4; product track, DAY.R1): the original has
 * no time-of-day variants, so no value here is a reading of SOCOM II. The profiles' values are their own tasks'
 * (DAY-P1b, DAY-P2, DAY-P3); this file holds only the shape and the byte layouts.
 *
 * **The pack** (`colours.kind === 'pack'`): one RGB8 triple per world vertex, `rgb8.length === 3 * vertices`, in
 * `map.world` part order, then each part's own vertex order (`positions`/`colors` index) -- every part counted, the
 * ones `withVariant` leaves alone (kept, blended light, hidden) included, so the index is the decoded world's, the same
 * walk `./key` `worldKey` hashes. Byte `b` becomes the colour `b / 128` on its lane: the PS2's scale, where 128 (0x80)
 * is unity (`mesh/src/interpret.ts` `PS2_UNITY`, the decode's `mem / 128`; `mesh/src/meshData.ts` `colors`), so a
 * pack byte means what the disc's own vertex byte means; 255 reaches 255/128 as the decode allows (RGB unclamped).
 * Alpha is never in the pack and never touched.
 *
 * **The grade** (`colours.kind === 'grade'`): a 33 x 33 x 33 RGB8 lookup, `lut33.length === 3 * 33^3`, red fastest:
 * the entry for lattice point `(r, g, b)` (each 0..32) starts at byte `3 * gradeIndex(r, g, b)` =
 * `3 * (r + 33 * (g + 33 * b))`. Its domain is the input colour 0..2 in PS2 units on each lane (lattice point `i` is
 * the colour `i / 16`, i.e. the vertex byte `8 i`), so every lattice point sits on a whole vertex byte and an identity
 * entry is the exact byte `8 i` (the top point, 256, saturates at 255 -- the one inexact entry). An input above 2
 * clamps to the top face, below 0 to the bottom. Why 0..2 and not 0..1: the decode leaves RGB unclamped up to 255/128
 * (`interpret.ts`), so the grade covers the whole representable range; the bytes never exceed 128 as measured on
 * three maps (Frostfire, Desert Glory, Crossroads: `mesh/src/meshData.ts:22-24`), so their colours use the lower 17
 * points per axis. The output byte `b` is the colour `b / 128`, as
 * the pack's. Sampled trilinearly (`./withVariant` `gradeSample`).
 */
export interface VariantProfile {
  /** The map's stem (`MP5`), compared with `LoadedMap.archive`; a profile for another stem is refused (throws). */
  stem: string;
  variant: MapVariant;
  /**
   * DAY.R4: the decoded world this profile's pack was built against (`./key` `worldKey`). Absent: no check (a grade
   * alone needs none). A mismatch leaves the map as decoded, with a diagnostic -- never a half-applied picture.
   */
  key?: { vertices: number; fnv64: string };
  /** The world's colours: a per-vertex pack, a colour grade, or none (the decoded colours kept). */
  colours: { kind: 'pack'; rgb8: Uint8Array } | { kind: 'grade'; lut33: Uint8Array } | null;
  /** Texture names whose world parts keep their decoded colours (the sky). */
  keepTextures: string[];
  /** The world root's night flag and lens colour to draw with (`LoadedMap.night`). */
  night: NonNullable<LoadedMap['night']>;
  /** The light rig to draw with (`LoadedMap.lightRig`). */
  lightRig: GlobalLighting;
  /** The camera record's fields to take; only the fog fields (`VARIANT_CAMERA_FIELDS`) are applied. */
  camera: Partial<CameraParams>;
  /** Texture names whose world parts are dropped (a sun's glow at night, a moon by day). */
  hideTextures: string[];
  /**
   * IQ-143: the props' colours, a pack as `colours`'s (byte `b` -> `b / 128`, RGB only, alpha untouched) over every prop
   * vertex -- `map.props` order, each entry's parts in order, each part's vertices in order -- keyed by `./key`
   * `propsKey`. Absent: the props keep their decoded colours. A key or length mismatch leaves the whole map as decoded,
   * with a diagnostic.
   */
  propColours?: { key: { vertices: number; fnv64: string }; rgb8: Uint8Array };
  /** IQ-143: prop model names (`map.props[i].modelName`) whose entries are dropped (a moon by day); after `propColours`. */
  hideProps?: string[];
  /** World parts appended after the world, with their textures, as a sky dome is (`../forge/ownEnvironment`). */
  addParts?: VariantParts;
  /** A texture replaced by name (its own mip levels dropped: the replacement's chain is generated). */
  textureSwaps: Record<string, LoadedMap['textures'][string]>;
}

/** What an appended set of world parts brings: the shape `../forge/skyDome` `skyDomeFor` returns. */
export interface VariantParts {
  world: LoadedMesh[];
  textures: LoadedMap['textures'];
  textureFlags: LoadedMap['textureFlags'];
  textureMips?: LoadedMap['textureMips'];
}

/** The camera record's fog fields: the only ones a profile's `camera` sets. */
export const VARIANT_CAMERA_FIELDS = [
  'fogColor', 'fogNear', 'fogFar', 'fogTop', 'fogBottom', 'fogEnabled', 'fogAltitude', 'fogDirectional',
] as const satisfies readonly (keyof CameraParams)[];

/** The grade's lattice points per axis. */
export const GRADE_SIZE = 33;
/** The grade's input domain's top, in PS2 units (lattice point `i` is the colour `i * GRADE_TOP / 32`). */
export const GRADE_TOP = 2;
/** The PS2's unity byte: a colour byte `b` is `b / PS2_UNITY` (`mesh/src/interpret.ts`). */
export const PS2_UNITY = 128;

/** The lattice point's entry index (multiply by 3 for its first byte): red fastest. */
export function gradeIndex(r: number, g: number, b: number): number {
  return r + GRADE_SIZE * (g + GRADE_SIZE * b);
}
