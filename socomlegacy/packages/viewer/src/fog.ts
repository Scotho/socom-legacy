import { Color, type Camera, type Scene } from 'three';
import { clamp, float, fog as fogNode, positionView, positionWorld, renderGroup, uniform } from 'three/tsl';
import { washFog } from './trueColourScale';

/**
 * SOCOM II's fog, as the game computes it.
 *
 * The EE builds a scale and an offset from the level's near and far
 * (`sub_00294070`, guest `0x294730`-`0x2947CC`):
 *
 * ```
 *   scale  = -255 / (far - near)
 *   offset = 255 - near * scale        // = 255 * far / (far - near)
 * ```
 *
 * and uploads them to VU1 data qwords 28/29. Per vertex the coefficient is
 *
 * ```
 *   F = clamp(w * scale + offset, 0, 255) * clamp((P.y - bottom) / (top - bottom), 0, 1)
 * ```
 *
 * where `w` is the **clip-space w -- view depth along the camera axis**, not radial distance from the
 * eye (`sub_002948D0` computes the radial form, but that is the EE's own mirror for CPU-side object
 * fades; the per-vertex fog that shades world geometry is VU1 handlers `0xf90` and `0x1108`, which read
 * data qwords 28/29 and use `w`). The second factor is the **altitude band**: qword 28 is
 * `(ref.xyz, offset)` and 29 is `(scl.xyz, scale)`, and the VU multiplies the distance term by
 * `clamp(dot(P - ref, scl), 0, 1)` (research/13 lines 570-585). `sub_00294070` from `0x2947D0` fills
 * `ref.y = fog_bottom` and `scl.y = 1 / (fog_top - fog_bottom)` when `cameras/camera` enables the band
 * (flags bit 31; six of the 22 maps), and `sub_00293F90` parks them at `ref.y = -10000`,
 * `scl.y = 0.001` when it does not, so the term is 1 for anything above y = -9000. Below the bottom of
 * the band everything is fog colour: a valley fog.
 *
 * The GS then blends `C = (F*C)>>8 + ((255-F)*FOGCOL)>>8`, i.e. `mix(FOGCOL, C, F/255)`: `F = 255` at
 * `near` is unfogged, `F = 0` at `far` is the fog colour outright -- and only where the packet's
 * `PRIM.FGE` is set (`MeshData.fog`); the skies, the water and the glows clear it and take no fog.
 *
 * Three's own range fog is a *smoothstep* between near and far, which is not the GS's linear ramp, so
 * the fog is a node of its own on `scene.fogNode`: the ramp above, in view depth, with the band.
 *
 * `FOGCOL` is not written by any EE instruction: it sits in a static 16-qword GS-state packet at
 * guest `0x003E0880` (value word at `0x003E08B0`) that the flip DMAs every frame, and the level
 * loader patches that qword per map. The ELF default in the slot is `0x00646464`.
 *
 * **Departures from the hardware.** `far == near` divides by zero on the hardware path too, and the
 * game's own note records the NaN; a zero or inverted span is refused here rather than propagated.
 * The band is applied in world space; the dumps show `ref`/`scl` rewritten per object into model
 * space, which is the same test on an unscaled object.
 */
export interface FogSettings {
  enabled: boolean;
  /** Distance at which fog starts, in game units -- the geometry's own scale. */
  near: number;
  /** Distance at which fog is total. */
  far: number;
  /** `FOGCOL`, 0..255 per channel, as the GS register holds it. */
  color: [number, number, number];
  /** The altitude band, `m_fog_top` / `m_fog_bottom`, or null when the map does not enable it. */
  altitude: { top: number; bottom: number } | null;
}

/** The ELF's own default in the FOGCOL slot at `0x003E08B0`: grey 100,100,100. */
export const ELF_DEFAULT_FOGCOL: [number, number, number] = [0x64, 0x64, 0x64];

/** What `sub_00293F90` writes for `ref.y` and `scl.y` when the band is off. */
const BAND_OFF = { bottom: -10000, invSpan: 0.001 } as const;

/**
 * A starting near/far for a map whose own numbers have not been read off the disc yet, derived from
 * how big the map is. Stated as a fraction of the world diagonal so it is at least the right order
 * of magnitude on a 100 m map and on a 400 m one.
 */
export function fogForExtent(diagonal: number): { near: number; far: number } {
  return { near: Math.round(diagonal * 0.35), far: Math.round(diagonal * 0.95) };
}

/**
 * The GS's `F` at a distance, for a test or a readout. Returns 0..255, 255 being unfogged.
 * Mirrors `sub_002948D0` including its clamp.
 */
export function fogCoefficient(dist: number, near: number, far: number): number {
  if (!(far > near)) return 255;                       // the hardware's NaN case, refused
  const scale = -255 / (far - near);
  const offset = 255 - near * scale;
  return Math.min(255, Math.max(0, offset + scale * dist));
}

/** The altitude term at a height: 1 at and above the top of the band, 0 at and below the bottom. */
export function altitudeFactor(y: number, top: number, bottom: number): number {
  if (!(top > bottom)) return 1;
  return Math.min(1, Math.max(0, (y - bottom) / (top - bottom)));
}

/** The four numbers the VU reads: qword 29's scale, qword 28's offset, and the band's `ref.y` / `scl.y`. */
export interface FogParams { scale: number; offset: number; bottom: number; invSpan: number }

/** `fogParams` of the settings, or null when the fog is off or its span is degenerate. */
export function fogParams(settings: FogSettings): FogParams | null {
  if (!settings.enabled || !(settings.far > settings.near)) return null;
  const scale = -255 / (settings.far - settings.near);
  const offset = 255 - settings.near * scale;
  const band = settings.altitude;
  const altitude = band && band.top > band.bottom
    ? { bottom: band.bottom, invSpan: 1 / (band.top - band.bottom) }
    : BAND_OFF;
  return { scale, offset, ...altitude };
}

/**
 * `uniform` is overloaded; these two pin the shapes the fog uses so the record below can name them. In three's render
 * group, not the per-object default: CPS H9, 2026-11-03: per-object compares 0.7 ms and uploads 0.8 ms a frame across
 * ~550 draws; a render-group uniform is compared once a render. A browser adaptation on the CPU side only -- the same
 * values through the same arithmetic.
 */
const numberUniform = (v: number, name: string) => uniform(v).setName(name).setGroup(renderGroup);
const colorUniform = (c: Color, name: string) => uniform(c).setName(name).setGroup(renderGroup);

/** The node and its uniforms, one set per scene, updated in place. */
interface Ps2Fog {
  color: ReturnType<typeof colorUniform>;
  scale: ReturnType<typeof numberUniform>;
  offset: ReturnType<typeof numberUniform>;
  bottom: ReturnType<typeof numberUniform>;
  invSpan: ReturnType<typeof numberUniform>;
  node: ReturnType<typeof fogNode>;
}

const fogs = new WeakMap<Scene, Ps2Fog>();

function ps2FogFor(scene: Scene): Ps2Fog {
  const known = fogs.get(scene);
  if (known) return known;
  const color = colorUniform(new Color(), 'fogColour');
  const scale = numberUniform(0, 'fogScale');
  const offset = numberUniform(255, 'fogOffset');
  const bottom = numberUniform(BAND_OFF.bottom, 'fogBottom');
  const invSpan = numberUniform(BAND_OFF.invSpan, 'fogInvSpan');
  // `w` is the view-space depth; `P` the world position. Both clamps are the VU's own.
  const viewZ = positionView.z.negate();
  const base = clamp(viewZ.mul(scale).add(offset), float(0), float(255));
  const band = clamp(positionWorld.y.sub(bottom).mul(invSpan), float(0), float(1));
  const factor = base.mul(band).div(255).oneMinus();   // 0 = untouched, 1 = FOGCOL outright
  // The colour through `TRUE_COLOR_SCALE`'s row while one is set (the flashbang's wash: `FUN_003b5a10` on the camera's
  // fog colour, D:L236755-236769; `./trueColourScale`).
  const made: Ps2Fog = { color, scale, offset, bottom, invSpan, node: fogNode(washFog(color), factor) };
  fogs.set(scene, made);
  return made;
}

/** The uniforms behind a scene's fog, for a test or a readout; null before `applyFog` ran. */
export function fogUniforms(scene: Scene): Omit<Ps2Fog, 'node'> | null {
  return fogs.get(scene) ?? null;
}

/**
 * Puts the settings on the scene. The colour is set through `setRGB` on the working space rather than
 * `setHex`, which would apply an sRGB decode the GS never did -- `FOGCOL` is a raw register value and
 * the viewer's default pipeline is the GS's own space.
 */
export function applyFog(scene: Scene, settings: FogSettings): void {
  // The base the view range extends (`extendFog`): a refresh is a new base, put on unextended; the world's next frame
  // extends it again while the view asks for it.
  bases.set(scene, { settings: { ...settings, color: [...settings.color] }, extra: 0 });
  putFog(scene, settings);
}

/** The settings `applyFog` last put on a scene and the extra over them now. */
const bases = new WeakMap<Scene, { settings: FogSettings; extra: number }>();

/**
 * The view range on the fog (research 188 U3, 232 §2; ruling PF.R49): `FUN_001f1470` (D:L53202-53255) with 1 adds the
 * view state's extra to the fog's far (`cam+0x128`) and rebuilds the fog (`FUN_00294070`); with 0 restores it and the
 * colour. The near is not touched, so the ramp lengthens: Frostfire's 200..640 is 200..940 in a scope. Relative to the
 * last `applyFog` -- never stacked, never read back off the uniforms -- and a no-op while the extra is unchanged, so
 * the world can call it every frame. Nothing to do while the fog is off.
 */
export function extendFog(scene: Scene, extra: number): void {
  const base = bases.get(scene);
  if (!base || base.extra === extra) return;
  base.extra = extra;
  if (!fogParams(base.settings)) return;
  putFog(scene, { ...base.settings, far: base.settings.far + extra });
}

/** The far clip a camera had before the view range extended it, and the far the extension set. */
const farBases = new WeakMap<Camera, { base: number; applied: number }>();

/**
 * The view range on the far clip (`FUN_001f1470`: `cam+0xf0` / `+0x2ec`, research 188 U3, 232 §2): the camera's far is
 * its base plus the extra, restored at 0. The base is the far the camera had when no extension of this function's was
 * on it: a far set from outside since (`FlyCamera.setClipPlanes` at a map's load) is the new base. A camera without
 * a far (none the page uses) is left alone. The game's mid (`+0xec`, `FUN_00291180`) has no counterpart here.
 */
export function extendFar(camera: Camera, extra: number): void {
  const cam = camera as Camera & { far?: number; updateProjectionMatrix?: () => void };
  if (typeof cam.far !== 'number') return;
  const known = farBases.get(camera);
  const base = known && cam.far === known.applied ? known.base : cam.far;
  const far = base + extra;
  if (cam.far !== far) {
    cam.far = far;
    cam.updateProjectionMatrix?.();
  }
  farBases.set(camera, { base, applied: far });
}

/** The uniforms of `settings` on the scene's fog node (`applyFog`, `extendFog`). */
function putFog(scene: Scene, settings: FogSettings): void {
  const params = fogParams(settings);
  if (!params) {
    scene.fogNode = null;
    return;
  }
  const fog = ps2FogFor(scene);
  const [r, g, b] = settings.color;
  fog.color.value.setRGB(r / 255, g / 255, b / 255);
  fog.scale.value = params.scale;
  fog.offset.value = params.offset;
  fog.bottom.value = params.bottom;
  fog.invSpan.value = params.invSpan;
  if (scene.fogNode !== fog.node) scene.fogNode = fog.node;
}
