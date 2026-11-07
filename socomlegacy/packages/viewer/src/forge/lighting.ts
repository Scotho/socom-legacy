import { AdditiveBlending, CustomBlending, OneFactor, Vector3, type Material, type Object3D } from 'three';
import type { Node, NodeMaterial } from 'three/webgpu';
import { float, uniform, vec3, vec4 } from 'three/tsl';
import type { FogSettings } from '../fog';
import { atmosphereTarget, calibrate, previewGain } from './lightingBaseline';
import type { LayoutSettings } from './layout';
import type { LoadedMap } from '../loadMap';
import type { Lighting } from '../lighting';
import { brightenOf } from '../lighting';
import { liftFog } from '../matchCore';
import type { Scene } from 'three';

/** Saved Forge browser adaptation (FDL.R0-R4), never an original lighting reading.
 * Baseline belongs to the base world alone: editor, walking and matches share it even
 * when the composed map adds pieces, bodies or a blank match floor.
 */
export interface ForgeLightingOptions { timeOfDay: number; baseline: number; /** A new empty map's own fog colour kept over the time's tint (`lightingFog`). */ keepFogColour?: boolean }
const baselines = new WeakMap<LoadedMap, number>();
export function forgeLightingOptions(settings: Pick<LayoutSettings, 'timeOfDay' | 'fogColor'>, base: LoadedMap | null): ForgeLightingOptions | null {
  if (settings.timeOfDay === null) return null;
  if (base && !baselines.has(base)) baselines.set(base, calibrate(base).median);
  // Blank layouts have no authored world. This fixed adaptation baseline also grades their match floor.
  // A new empty map's own fog colour (`LayoutSettings.fogColor`, a blank base: no `base` here) is kept over the time's tint.
  return { timeOfDay: settings.timeOfDay, baseline: base ? baselines.get(base)! : 0.18, ...(base === null && settings.fogColor ? { keepFogColour: true } : {}) };
}

/**
 * Compose before liftFog's lens/flash gain and scope extension, never once per frame. `keepColour` (a new empty map's
 * own fog colour, the owner 2026-11-06): the time's atmosphere does not tint it -- a colour chosen is the colour shown.
 */
export function lightingFog(fog: FogSettings, time: number | null, keepColour = false): FogSettings {
  return time === null || keepColour ? fog : { ...fog, color: atmosphereTarget(time).map(v => v * 255) as [number, number, number] };
}

/** Existing fog lifecycle, including fog-disabled clear colour, composed ahead of the lens. */
export function liftForgeFog(scene: Scene, fog: FogSettings, lighting: Lighting, lens: readonly number[] | null,
  clear: ((rgb: [number, number, number]) => void) | null | undefined, time: number | null, keepColour = false): void {
  liftFog(scene, lightingFog(fog, time, keepColour), lighting, lens, rgb => {
    if (time !== null && !fog.enabled && !keepColour) {
      const gain = brightenOf(lighting);
      rgb = atmosphereTarget(time).map((v, i) => Math.min(255, v * 255 * gain * (lens?.[i] ?? 1))) as [number, number, number];
    }
    clear?.(rgb);
  });
}

let nextHelper = 0;
type Saved = { output: PropertyDescriptor | undefined; cache: PropertyDescriptor | undefined };

/** Instance-only setupOutput extension: world LOD twins copy colorNode, so changing
 * that graph would grade them twice. Native fog and premultiplication run AFTER grading.
 * Uniform edits need no program rebuild; Original and dispose restore exact methods.
 * The helper never owns or disposes materials. Scene roots exclude the separate HUD.
 */
export function createForgeLighting() {
  const suffix = `:forge-lighting-${++nextHelper}`;
  const gain = uniform(1), sky = uniform(new Vector3());
  const saved = new Map<NodeMaterial, Saved>();
  const restore = (material: NodeMaterial, descriptors: Saved) => {
    if (descriptors.output) Object.defineProperty(material, 'setupOutput', descriptors.output);
    else delete (material as Partial<NodeMaterial>).setupOutput;
    if (descriptors.cache) Object.defineProperty(material, 'customProgramCacheKey', descriptors.cache);
    else delete (material as Partial<NodeMaterial>).customProgramCacheKey;
    material.needsUpdate = true;
  };
  const clear = () => { for (const [m, d] of saved) restore(m, d); saved.clear(); };
  return {
    update(roots: readonly Object3D[], options: ForgeLightingOptions | null): void {
      if (options === null) { if (saved.size) clear(); return; }
      gain.value = previewGain(options.baseline, options.timeOfDay);
      sky.value.fromArray(atmosphereTarget(options.timeOfDay));
      const seen = new Map<NodeMaterial, 'surface' | 'sky' | 'skip'>();
      const scan = (object: Object3D, parentSkip = false) => {
        const skip = parentSkip || (object.userData['forgeLightingInstrument'] === true || object.userData['forgeGhost'] === true) || /shadow|glow|flare|beam/i.test(object.name);
        const materials = (object as Object3D & { material?: Material | Material[] }).material;
        for (const material of materials ? Array.isArray(materials) ? materials : [materials] : []) {
          const m = material as NodeMaterial;
          if (!m.isNodeMaterial || typeof m.setupOutput !== 'function') continue;
          // world.ts marks baked shadow decals (including prop/LOD copies whose names
          // omit the texture) with this negative polygon offset. Keep their blend carrier.
          const shadowDecal = m.polygonOffset && m.polygonOffsetFactor === -1 && m.polygonOffsetUnits === -1;
          const kind = skip || shadowDecal || /shadow|glow|flare|beam/i.test(m.name) || m.blending === AdditiveBlending || (m.blending === CustomBlending && m.blendDst === OneFactor)
            ? 'skip' : /sky|cloud|horizon/i.test(`${object.name} ${m.name}`) ? 'sky' : 'surface';
          // A carrier must keep its equation even if its material is shared.
          if (seen.get(m) !== 'skip') seen.set(m, kind);
        }
        for (const child of object.children) scan(child, skip);
      };
      for (const root of roots) scan(root);
      // A replaced/removed material is released too, bounding retained references.
      for (const [m, d] of saved) if (!seen.has(m) || seen.get(m) === 'skip') { restore(m, d); saved.delete(m); }
      for (const [material, kind] of seen) {
        if (kind === 'skip' || saved.has(material)) continue;
        saved.set(material, { output: Object.getOwnPropertyDescriptor(material, 'setupOutput'), cache: Object.getOwnPropertyDescriptor(material, 'customProgramCacheKey') });
        const original = material.setupOutput, cache = material.customProgramCacheKey;
        material.setupOutput = function(builder, output) {
          const source = output as Node<'vec4'>;
          const rgb = source.rgb.clamp(0, 1);
          const shaped = kind === 'sky'
            ? sky.mul(rgb.dot(vec3(0.2126, 0.7152, 0.0722)).mul(0.8).add(0.6))
            : rgb.mul(gain).div(float(1).add(rgb.mul(gain.sub(1))));
          return original.call(this, builder, vec4(shaped, source.a));
        };
        material.customProgramCacheKey = function() { return `${cache.call(this)}${suffix}:${kind}`; };
        material.needsUpdate = true;
      }
    },
    dispose: clear,
  };
}
