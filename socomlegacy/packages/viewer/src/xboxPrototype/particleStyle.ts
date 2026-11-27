import { Material } from 'three';
import type { EffectTexture } from '../effectData';
import { drawState, materialSpec } from '../materialSpec';

/** The particle branch of effectMaterials.effectMaterial, as numeric state.
 * No GPU material/texture is created here. The particle core owns this object;
 * render backends release their handles when its dispose event fires.
 */
export class ParticleStyle extends Material {
  readonly spec;
  readonly state;
  constructor(readonly texture: EffectTexture | null) {
    super();
    const gs = texture?.gs ?? null;
    this.spec = materialSpec(texture ? { bilinear: gs?.bilinear ?? true, transparent: true,
      graded: true, opaque: false, gs } : undefined, true, true, false, undefined, true);
    // The untextured vertex-alpha default is the existing source-alpha reading.
    this.state = drawState(this.spec, false);
  }
}

/** The effect MODEL branch of effectMaterials.effectMaterial (`buildEffectModel`), as numeric state: the texture's GS
 * blend, a solid source-alpha bitmap opaque (the casing's gold), the visual's cull and fog. No GPU object here.
 */
export class EffectMeshStyle extends Material {
  readonly spec;
  readonly state;
  /** `vertexAlpha`: an untextured draw blended by its vertices' alpha (the throw's arc), not drawn solid. */
  constructor(readonly texture: EffectTexture | null, readonly cull: boolean, readonly fogged: boolean, vertexAlpha = false) {
    super();
    const gs = texture?.gs ?? null;
    let solid = !!texture && gs?.blend === 'source';
    if (solid) { const a = texture!.rgba.data; for (let i = 3; i < a.length; i += 4) if (a[i]! < 247) { solid = false; break; } }
    this.spec = materialSpec(texture ? { bilinear: gs?.bilinear ?? true, transparent: true, graded: true, opaque: solid, gs } : undefined,
      fogged, true, cull, undefined, vertexAlpha);
    this.state = drawState(this.spec, false);
  }
}

/** Vertices a frame the effect models may write (36 bytes each) and their indices: a flash is tens of vertices, a casing
 * a few dozen; past it a model is left out of the frame and counted (`dropped`). An instrument's bound, not the game's. */
export const EFFECT_MESH_VERTICES = 16384, EFFECT_MESH_INDICES = 32768;

/** One frame's effect-model triangles in the world's space, grouped by style: x y z u v r g b a per vertex, 16-bit indices
 * from the frame's first vertex. Arrays are reused from frame to frame; a renderer borrows them for one synchronous draw. */
export class EffectMeshFrame {
  readonly vertices = new Float32Array(EFFECT_MESH_VERTICES * 9);
  readonly indices = new Uint16Array(EFFECT_MESH_INDICES);
  readonly batches: { style: EffectMeshStyle; first: number; count: number }[] = [];
  vertexCount = 0; indexCount = 0; dropped = 0;
  begin(): void { this.vertexCount = 0; this.indexCount = 0; this.batches.length = 0; }
  /** Room for `vertices` and `indices` more under `style`: the write offsets, or null when the frame is full. */
  take(style: EffectMeshStyle, vertices: number, indices: number): { vertex: number; index: number } | null {
    if (this.vertexCount + vertices > EFFECT_MESH_VERTICES || this.indexCount + indices > EFFECT_MESH_INDICES) { this.dropped++; return null; }
    const last = this.batches[this.batches.length - 1];
    if (last && last.style === style) last.count += indices; else this.batches.push({ style, first: this.indexCount, count: indices });
    const at = { vertex: this.vertexCount, index: this.indexCount };
    this.vertexCount += vertices; this.indexCount += indices; return at;
  }
}
