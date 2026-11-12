import {LinearFilter, LinearMipmapLinearFilter, type Texture} from 'three';
import {texture, uniform} from 'three/tsl';
import type {Node} from 'three/webgpu';
import type {ExperimentalSettings} from './experimentalGraphics';
import type {LoadedMap} from './loadMap';
import {bodyTextureNames} from './body';
import {isWorldFacadeProp} from './worldFacadeProps';

/** H135 browser adaptation. Only existing mip chains; no new mip allocation or source-pixel writes. */
let maximum = 1, derivative = false, biased = false, anisotropy = 1;
const lodBias = uniform(0);
const listeners = new Set<() => void>();
/** VS-6: the keeper's anisotropy (`setWorldAnisotropy`) and the experiment's last settings (`updateWorldSampling`). */
let ungatedAnisotropy = false;
let lastSettings: ExperimentalSettings | null = null;
export function setWorldSamplingMaximum(value: number): void {
  maximum = Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
  recompute();   // VS-6 review F2: a flag left on across renderers takes the new renderer's maximum
}
export function worldSamplingMaximum(): number { return maximum; }
/**
 * VS-6 (the spec's §4.2 Texture filtering, a browser adaptation): the video keeper's `filtering` row -- the anisotropy
 * part alone, switched independent of the experiment's `enabled` (the match applies it live under the Modern picture,
 * never under PS2). Trilinear and the mip bias stay the experiment's (`updateWorldSampling`), gated as before.
 */
export function setWorldAnisotropy(on: boolean): void {
  if (ungatedAnisotropy === on) return;
  ungatedAnisotropy = on;
  recompute();
}
/** Whether the keeper's anisotropy (`setWorldAnisotropy`) is on. */
export function worldAnisotropyOn(): boolean { return ungatedAnisotropy; }
export function updateWorldSampling(s: ExperimentalSettings): void {
  lastSettings = s;
  recompute();
}
function recompute(): void {
  const s = lastSettings;
  const gated = !!s?.enabled;
  const nextAnisotropy = (gated && s?.worldAnisotropy) || ungatedAnisotropy ? maximum : 1;
  const nextDerivative = !!((gated && s?.worldTrilinear) || nextAnisotropy > 1);
  const nextBiased = !!(nextDerivative && gated && s?.worldLodBias);
  const changed = derivative !== nextDerivative || biased !== nextBiased || anisotropy !== nextAnisotropy;
  derivative = nextDerivative; biased = nextBiased; anisotropy = nextAnisotropy;
  lodBias.value = biased && s && Number.isFinite(s.worldLodBiasValue) ? Math.max(-2, Math.min(2, s.worldLodBiasValue)) : 0;
  if (changed) for (const listener of listeners) listener();
}

/** A shared texture object must not change another role. Be conservative about mixed-use names. */
export function worldSamplingNames(map: LoadedMap): Set<string> {
  const excluded = new Set<string>();
  const ban = (name: string | null | undefined) => { if (name) excluded.add(name); };
  // FACADES-2: the world model's own facade nodes are drawn as props since LATER 112 (`loadMap`'s `place`); they were world
  // draws and share their textures with the world's alone (MP52's `mp52_rusty_pipe.tif`), so they ban nothing.
  for (const p of map.props) if (!isWorldFacadeProp(p)) for (const part of p.parts) ban(part.textureName);
  for (const line of map.lines ?? []) ban(line.textureName);
  for (const d of Object.values(map.detail)) ban(d.name);
  for (const e of map.envMaterials ?? []) ban(e.texture);
  for (const w of Object.values(map.weapons ?? {})) for (const p of w.parts) ban(p.textureName);
  for (const g of map.grenade?.models ?? []) for (const p of g.parts) ban(p.textureName);
  for (const body of [map.body, map.terrorist, ...(map.types?.seal ?? []), ...(map.types?.terrorist ?? []), ...(map.types?.escortees ?? [])]) {
    if (body) for (const name of bodyTextureNames(body)) ban(name);
  }
  return new Set(map.world.map(p => p.textureName).filter((n): n is string => !!n && !excluded.has(n)));
}

/** One owner per world. The same texture/image/mips survive ON/OFF and texture-pack replacement. */
export class WorldTextureSampling {
  private originals = new Map<Texture, {min: Texture['minFilter']; mag: Texture['magFilter']; anisotropy: number}>();
  private refresh = () => { for (const t of this.originals.keys()) this.apply(t); this.changed(); };
  constructor(private changed: () => void) { listeners.add(this.refresh); }
  add(t: Texture): void {
    if (this.originals.has(t)) return;
    this.originals.set(t, {min:t.minFilter, mag:t.magFilter, anisotropy:t.anisotropy}); this.apply(t);
  }
  key(t: Texture): number { return this.originals.has(t) && derivative ? (biased ? 2 : 1) : 0; }
  sample(t: Texture, at: Node<'vec2'>): Node<'vec4'> | null {
    const key = this.key(t); if (!key) return null;
    const sampled = texture(t, at);
    return (key === 2 ? sampled.bias(lodBias) : sampled) as unknown as Node<'vec4'>;
  }
  private apply(t: Texture): void {
    const old = this.originals.get(t)!;
    const min = derivative ? LinearMipmapLinearFilter : old.min;
    const mag = derivative ? LinearFilter : old.mag;
    const aniso = derivative ? anisotropy : old.anisotropy;
    if (t.minFilter === min && t.magFilter === mag && t.anisotropy === aniso) return;
    // r186 WebGL only writes TEXTURE_MAX_ANISOTROPY_EXT above 1; recreate to really reset it to 1.
    // No pixel/mip/source changes, also safe if a local pack has replaced the image in the meantime.
    t.dispose(); t.minFilter = min; t.magFilter = mag; t.anisotropy = aniso; t.needsUpdate = true;
  }
  dispose(): void { listeners.delete(this.refresh); this.originals.clear(); }
}
