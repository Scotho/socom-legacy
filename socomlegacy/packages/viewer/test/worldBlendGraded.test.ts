import { describe, expect, it } from 'vitest';
import { Mesh, OneFactor, OneMinusSrcAlphaFactor, SrcAlphaFactor, ZeroFactor, type Material } from 'three';
import type { GsState } from '@s2u/gs';
import { DEFAULT_GRID_PARAMS } from '@s2u/scene';
import { buildWorld } from '../src/world';
import type { LoadedMap, LoadedMesh } from '../src/loadMap';
import type { TextureFlags } from '../src/materialSpec';

/**
 * PAR-35 (research 255 s8): the world as the menu-launched match builds it -- `buildWorld(m)` and every reveal task run,
 * no `setBlendGraded` call (`matchMount.ts`'s `place`) -- draws a texture whose alpha is a ramp with the equation its
 * bind packet's `ALPHA_1` asks for (`@s2u/gs` `decodeAlpha`; `materialSpec`'s `discSpec`), as /testroom draws it with its
 * panel's `graded alpha` box checked. `WorldView.setBlendGraded`'s own doc: "On by default; off restores the cutout".
 * Before PAR-35 `world.ts` started it false, so the menu match punched every ramp out at half.
 */
const part = (textureName: string, order: number, extra: Partial<LoadedMesh> = {}): LoadedMesh => ({
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), uvs: new Float32Array(6),
  colors: new Float32Array(12).fill(1), normals: null, faceNormals: null, indices: new Uint32Array([0, 1, 2]),
  textureName, fog: true, lit: false, order, orderEnd: order, cull: true, alternate: false, scroll: null, ...extra,
});
const rgba = (alpha: number) => ({ data: new Uint8ClampedArray(16).fill(alpha), width: 2, height: 2 });
/** A bind packet's state: `ALPHA_1` decoded to `blend`, `TEST_1.ATE` off (no alpha test), as a glow's packet sets. */
const gs = (blend: GsState['blend']): GsState => ({
  blend, alphaTest: null, depthTest: true, bilinear: true, mipmaps: false, levels: 0, wrapS: 'clamp', wrapT: 'clamp',
});
const solid: TextureFlags = { bilinear: true, transparent: false, graded: false, opaque: true, gs: gs('source') };
const ramp = (blend: GsState['blend']): TextureFlags => ({ bilinear: true, transparent: true, graded: true, opaque: false, gs: gs(blend) });

const map = (): LoadedMap => ({
  archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', lines: null, grid: DEFAULT_GRID_PARAMS, slots: [],
  world: [
    part('wall.tif', 0),
    part('glow.tif', 1),                                                     // additive: `ALPHA_1` 0x48, a lamp's glow
    part('decal.tif', 2),                                                    // source alpha: `ALPHA_1` 0x44
    // A vertex ramp over a solid texture (research 82 round 5, RENDER-VIG): blends by its packet's `ALPHA_1` too.
    part('wall.tif', 3, { vertexAlpha: true, colors: new Float32Array([1, 1, 1, 0, 1, 1, 1, 0.5, 1, 1, 1, 1]) }),
  ],
  props: [],
  textures: { 'wall.tif': rgba(255), 'glow.tif': rgba(128), 'decal.tif': rgba(128) },
  textureFlags: { 'wall.tif': solid, 'glow.tif': ramp('additive'), 'decal.tif': ramp('source') },
  detail: {}, metersPerUnit: 0.1, lightRig: null, origin: [0, 0, 0],
  collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 },
  diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
} as unknown as LoadedMap);

/** `matchMount.ts`'s `place`: `buildWorld(m)`, then every reveal task; no toggle is called. */
function asTheMenuMatchBuildsIt() {
  const view = buildWorld(map());
  for (const task of [...view.revealWorld, ...view.revealProps]) task();
  const meshes = view.group.children.filter((c): c is Mesh => c instanceof Mesh);
  const walls = meshes.filter((m) => m.name === 'wall.tif');
  const byName = (name: string): Mesh => meshes.find((m) => m.name === name)!;
  return { view, wall: walls[0]!, overlay: walls[1]!, glow: byName('glow.tif'), decal: byName('decal.tif') };
}

type Blended = Material & { blendSrc: number; blendDst: number };
/** What the GPU is told: the list it sorts in, the depth write, the alpha test, and the blend's two factors. */
const drawn = (m: Mesh) => {
  const x = m.material as Blended;
  return { transparent: x.transparent, depthWrite: x.depthWrite, alphaTest: x.alphaTest, src: x.blendSrc, dst: x.blendDst };
};
const CUTOUT = { transparent: false, depthWrite: true, alphaTest: 0.5, src: OneFactor, dst: ZeroFactor };

describe('buildWorld: graded alpha blends by default (PAR-35)', () => {
  it('a world built as the menu match builds it, no toggle called, blends a ramp-alpha texture with its bind packet\'s equation, not the cutout', () => {
    const { glow, decal, overlay, wall } = asTheMenuMatchBuildsIt();
    // The glow: `(Cs - 0) * As + Cd`, additive; three's order, so the transparent list -- a walk draw, so depth written
    // under the blend (NU-15 B1, research 330: `ZMSK` 0 for the walk, `FUN_003b7150(0)` D:L236792; was no depth written).
    expect(drawn(glow)).toEqual({ transparent: true, depthWrite: true, alphaTest: 0, src: SrcAlphaFactor, dst: OneFactor });
    // The decal: `(Cs - Cd) * As + Cd`, source alpha over.
    expect(drawn(decal)).toEqual({ transparent: true, depthWrite: true, alphaTest: 0, src: SrcAlphaFactor, dst: OneMinusSrcAlphaFactor });
    // The vertex ramp over the solid wall blends source alpha as its packet asks; the wall itself stays opaque.
    expect(drawn(overlay)).toEqual({ transparent: true, depthWrite: true, alphaTest: 0, src: SrcAlphaFactor, dst: OneMinusSrcAlphaFactor });
    expect(drawn(wall)).toEqual({ transparent: false, depthWrite: true, alphaTest: 0, src: OneFactor, dst: ZeroFactor });
  });

  it('setBlendGraded(false) still gives the cutout at half for every ramp; true again restores the bind packet\'s blend', () => {
    const { view, glow, decal, overlay, wall } = asTheMenuMatchBuildsIt();
    view.setBlendGraded(false);                          // /testroom's box unchecked: the escape hatch
    expect([drawn(glow), drawn(decal), drawn(overlay)]).toEqual([CUTOUT, CUTOUT, CUTOUT]);
    expect(drawn(wall)).toEqual({ transparent: false, depthWrite: true, alphaTest: 0, src: OneFactor, dst: ZeroFactor });
    view.setBlendGraded(true);
    expect(drawn(glow)).toEqual({ transparent: true, depthWrite: true, alphaTest: 0, src: SrcAlphaFactor, dst: OneFactor });   // was depthWrite false (NU-15 B1)
    expect(drawn(decal).dst).toBe(OneMinusSrcAlphaFactor);
  });
});
