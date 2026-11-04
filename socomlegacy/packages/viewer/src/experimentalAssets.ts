import { renderGroup, uniform } from 'three/tsl';
import {updateWorldSampling} from './experimentalWorldSampling';
import type { ExperimentalSettings } from './experimentalGraphics';

// CPS H9, 2026-11-03: per-object compares 0.7 ms and uploads 0.8 ms a frame across ~550 draws; a render-group
// uniform is compared once a render. So the frame-wide uniforms below sit in three's render group, not the per-object
// default -- a browser adaptation on the CPU side only: the same values through the same arithmetic.
const frameWide = (v: number, name: string) => uniform(v).setName(name).setGroup(renderGroup);
/** Uniforms bind only into the enabled material variants; ordinary shaders do not reference them. */
export const experimentalAssets = {
  mipOn: false, detailOn: false, characterOn: false,
  mipBias: frameWide(0, 'expMipBias'), detailStrength: frameWide(1, 'expDetailStrength'), detailRangeSq: 1,
  characterAmbient: frameWide(1, 'expCharacterAmbient'), characterDirectional: frameWide(1, 'expCharacterDirectional'),
};
const listeners = {map: new Set<() => void>(), character: new Set<() => void>()};
/** Reuse meshes and textures when swapping graph variants; disposed views release their subscription. */
export function onExperimentalAssetsChange(kind: keyof typeof listeners, changed: () => void): () => void {
  listeners[kind].add(changed);
  return () => { listeners[kind].delete(changed); };
}
export function updateExperimentalAssets(settings: ExperimentalSettings): void {
  updateWorldSampling(settings);
  const character = settings.enabled && settings.characterLight;
  const mip = settings.enabled && settings.textureBias;
  const detail = settings.enabled && settings.detailAdjust;
  const mapChanged = mip !== experimentalAssets.mipOn || detail !== experimentalAssets.detailOn;
  const characterChanged = character !== experimentalAssets.characterOn;
  experimentalAssets.characterAmbient.value = character ? Math.max(0, Math.min(2, settings.characterAmbient)) : 1;
  experimentalAssets.characterDirectional.value = character ? Math.max(0, Math.min(2, settings.characterDirectional)) : 1;
  experimentalAssets.mipBias.value = mip ? Math.max(-2, Math.min(2, settings.mipBias)) : 0;
  experimentalAssets.detailStrength.value = detail ? Math.max(0, Math.min(2, settings.detailStrength)) : 1;
  experimentalAssets.detailRangeSq = detail ? Math.max(0.5, Math.min(2, settings.detailRange)) ** 2 : 1;
  experimentalAssets.mipOn = mip; experimentalAssets.detailOn = detail; experimentalAssets.characterOn = character;
  if (mapChanged) for (const changed of listeners.map) changed();
  if (characterChanged) for (const changed of listeners.character) changed();
}
