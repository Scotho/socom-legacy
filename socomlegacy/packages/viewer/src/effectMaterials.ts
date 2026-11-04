import { BufferAttribute, BufferGeometry, DoubleSide, FrontSide, Group, LineSegments, Mesh, type Object3D } from 'three';
import { LineBasicNodeMaterial, MeshBasicNodeMaterial } from 'three/webgpu';
import { renderGroup, uniform, vec4, vertexColor, materialReference } from 'three/tsl';
import type { Node } from 'three/webgpu';
import type { GsState } from '@s2u/gs';
import { drawState, materialSpec } from './materialSpec';
import { blendFactorsFor, makeTexture } from './world';
import type { EffectModelData, EffectTexture } from './effectData';

/**
 * The effects' materials, in the world's GS arithmetic (`./world`'s shading, socomlegacy/docs/research/89 §6): the texel times
 * the vertex colour, clamped (`MODULATE`, then `COLCLAMP`), times the frame's brighten (`1 + FIX/128`, `./lighting`),
 * blended by the texture's own `ALPHA_1` -- `effect_muzzle01.tif` additive, `cloudpuff01.tif` and the casing's
 * `shell_gold.tif` source alpha (its bind packet, `@s2u/gs`'s `GsState`). Blended effects go to three's transparent
 * list and write no depth (three's order, `./materialSpec`'s `drawState`); an opaque one (the casing) writes depth.
 */

/**
 * The frame's brighten, one uniform every effect material reads (the world keeps its own). In three's render group, not
 * the per-object default: CPS H9, 2026-11-03: per-object compares 0.7 ms and uploads 0.8 ms a frame across ~550 draws;
 * a render-group uniform is compared once a render. A browser adaptation on the CPU side only -- the same value through
 * the same arithmetic.
 */
export const effectBrighten = uniform(1).setName('effectBrighten').setGroup(renderGroup);

const texel = materialReference('map', 'texture') as unknown as Node<'vec4'>;
const MODULATED = vec4(texel.mul(vertexColor())).clamp(0, 1);
const SHADED = vec4(MODULATED.rgb.mul(effectBrighten), MODULATED.a);

/**
 * READING (research 89 §17): the `ALPHA_1` an untextured particle sprite blends with. `FUN_003251b0`'s untextured branch
 * (D:L223980-223983) sends PRIM 0xE6 -- a sprite with `ABE` on and no texture -- and no bind packet of its own, so the
 * blend is whatever `ALPHA_1` the last bind left; the effects' bitmaps that bind it are source alpha but for the additive
 * few (research 89 §3), and which one went before is the frame's sort. Read as source alpha.
 */
export const UNTEXTURED_PARTICLE_BLEND_READING = 'source' as const;

/** An untextured particle's vertex colour on screen: the key times 128 (D:L225585) as the GS's 8-bit value, /255. */
const UNTEXTURED_SPRITE = vec4(vertexColor()).mul(128 / 255).clamp(0, 1);

/**
 * A material for a texture of the effects (or untextured: the vertex colour), with its GS blend. `vertexAlpha` (the
 * particles): an untextured draw is the GS's untextured sprite, blended by its own alpha
 * (`UNTEXTURED_PARTICLE_BLEND_READING`) and writing no depth -- never an opaque block (the owner's 2026-10-07 report).
 */
export function effectMaterial(texture: EffectTexture | null, options?: { cull?: boolean; fog?: boolean; opaque?: boolean; vertexAlpha?: boolean; line?: false }): MeshBasicNodeMaterial;
export function effectMaterial(texture: EffectTexture | null, options: { cull?: boolean; fog?: boolean; opaque?: boolean; vertexAlpha?: boolean; line: true }): LineBasicNodeMaterial;
export function effectMaterial(texture: EffectTexture | null, options: { cull?: boolean; fog?: boolean; opaque?: boolean; vertexAlpha?: boolean; line?: boolean } = {}): MeshBasicNodeMaterial | LineBasicNodeMaterial {
  // A line strip is the world's line material (`./world`): one GS pixel, which WebGL draws at linewidth 1.
  const m = options.line ? new LineBasicNodeMaterial() : new MeshBasicNodeMaterial();
  if (options.line) (m as LineBasicNodeMaterial).linewidth = 1;
  const gs: GsState | null = texture?.gs ?? null;
  const sprite = !texture && options.vertexAlpha === true;
  const disc = materialSpec(
    texture ? { bilinear: gs?.bilinear ?? true, transparent: true, graded: true, opaque: options.opaque ?? false, gs } : undefined,
    options.fog ?? true, true, options.cull ?? false, undefined, sprite,
  );
  const spec = sprite ? { ...disc, blend: UNTEXTURED_PARTICLE_BLEND_READING } : disc;
  if (texture) m.map = makeTexture(texture.rgba, spec);
  // The destination brighten (`(Cd - 0) As + Cd`: `gen_water_rings.tif`) reads only the source's alpha, which the
  // shader hands on in every channel for the `Cs Cd + Cd` blend (as the world's carrier does, `./world`).
  m.colorNode = sprite ? vec4(UNTEXTURED_SPRITE.rgb.mul(effectBrighten), vec4(vertexColor()).a.clamp(0, 1))
    : !texture ? vec4(vec4(vertexColor()).clamp(0, 1).rgb.mul(effectBrighten), 1)
      : spec.blend === 'destination' ? vec4(MODULATED.a, MODULATED.a, MODULATED.a, MODULATED.a) : SHADED;
  m.vertexColors = false;
  const state = drawState(spec, false);
  m.transparent = state.transparent;
  m.depthWrite = state.depthWrite;
  Object.assign(m, blendFactorsFor(state.factors));
  m.side = options.cull ? FrontSide : DoubleSide;
  m.fog = options.fog ?? true;
  m.toneMapped = false;
  // A line's bind packet (`white8x8.tif`: depth test on). Left at three's default for a mesh, as before.
  if (options.line && texture?.gs) m.depthTest = texture.gs.depthTest;
  return m;
}

/**
 * A bullet mark's (and a footprint's) material (`./fire`'s marks, research 89 §5): the GS's `(texel x vertex) >> 7`,
 * clamped, brightened with the frame -- the vertex colour being the world polygon's own under the mark
 * (`./surfaceShade`: `FUN_003beca0` unpacks the wall vertices' colour words into the mark's packet), so a mark on a
 * wall baked at a quarter of unity is a quarter as bright as its bitmap, as the wall is. Drawing the bitmap bare
 * (texel x 1.0) made every mark two to eight times lighter than the game's. Blended by its bind packet (source alpha
 * on all six `bullet_mark_*.tif`), no depth write, pulled toward the camera so it does not fight the wall. The mark's
 * geometry carries the colour as a `color` attribute (unity where none is known).
 */
export function markMaterial(texture: EffectTexture): MeshBasicNodeMaterial {
  const m = effectMaterial(texture, { fog: true });
  m.colorNode = SHADED;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -1;
  m.polygonOffsetUnits = -1;
  return m;
}

/** An effect model as a three group: one mesh a packet, each node's parts under a group named by its path. */
export function buildEffectModel(model: EffectModelData, textures: ReadonlyMap<string, EffectTexture>, cache: Map<string, MeshBasicNodeMaterial | LineBasicNodeMaterial>): Group {
  const root = new Group();
  root.name = model.name;
  const nodes = new Map<string, Object3D>([[model.name, root]]);
  /** The group at a path, made with its parents (the effects move `scale` and `rotate` nodes: `node(path)`). */
  const at = (path: string): Object3D => {
    const known = nodes.get(path);
    if (known) return known;
    const cut = path.lastIndexOf('/');
    const parent = cut < 0 ? root : at(path.slice(0, cut));
    const g = new Group();
    g.name = path.slice(cut + 1);
    parent.add(g);
    nodes.set(path, g);
    return g;
  };
  for (const part of model.parts) {
    const holder = at(part.path.slice(0, part.path.lastIndexOf('/')) || model.name);
    for (const mesh of part.meshes) {
      const name = mesh.textureName?.toLowerCase() ?? null;
      const tex = name ? textures.get(name) ?? null : null;
      const key = `${name}|${mesh.cull}|${mesh.fog}`;
      let material = cache.get(key);
      if (!material) {
        material = effectMaterial(tex, { cull: mesh.cull, fog: mesh.fog, opaque: tex?.gs?.blend === 'source' && isSolid(tex) });
        cache.set(key, material);
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(mesh.positions, 3));
      g.setAttribute('uv', new BufferAttribute(mesh.uvs, 2));
      g.setAttribute('color', new BufferAttribute(mesh.colors, 4));
      g.setIndex(new BufferAttribute(mesh.indices, 1));
      g.computeBoundingSphere();
      const m = new Mesh(g, material);
      m.name = `${part.node} (${name ?? 'untextured'})`;
      m.frustumCulled = false;
      holder.add(m);
    }
    for (const line of part.lines ?? []) {
      const n = line.positions.length / 3;
      if (n < 2) continue;
      const name = line.textureName?.toLowerCase() ?? null;
      const tex = name ? textures.get(name) ?? null : null;
      const key = `line|${name}|${line.cull}|${line.fog}`;
      let material = cache.get(key);
      if (!material) {
        material = effectMaterial(tex, { cull: line.cull, fog: line.fog, line: true });
        cache.set(key, material);
      }
      const segments = (n - 1) * 2;
      const positions = new Float32Array(segments * 3);
      const uvs = new Float32Array(segments * 2);
      const colors = new Float32Array(segments * 4);
      let w = 0;
      for (let k = 0; k + 1 < n; k++) {
        for (const end of [k, k + 1]) {
          positions.set(line.positions.subarray(end * 3, end * 3 + 3), w * 3);
          uvs.set(line.uvs.subarray(end * 2, end * 2 + 2), w * 2);
          colors.set(line.colors.subarray(end * 4, end * 4 + 4), w * 4);
          w++;
        }
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(positions, 3));
      g.setAttribute('uv', new BufferAttribute(uvs, 2));
      g.setAttribute('color', new BufferAttribute(colors, 4));
      g.computeBoundingSphere();
      const strip = new LineSegments(g, material);
      strip.name = `${part.node} (line ${name ?? 'untextured'})`;
      strip.frustumCulled = false;
      holder.add(strip);
    }
  }
  return root;
}

/** Every texel solid: a texture with no alpha to blend (the casing's gold). */
function isSolid(t: EffectTexture): boolean {
  const a = t.rgba.data;
  for (let i = 3; i < a.length; i += 4) if (a[i]! < 247) return false;
  return true;
}
