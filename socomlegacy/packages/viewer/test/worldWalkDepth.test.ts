import { describe, expect, it } from 'vitest';
import { LessEqualDepth, Mesh, PerspectiveCamera, type Material } from 'three';
import { DEFAULT_GRID_PARAMS, type LodBand } from '@s2u/scene';
import { buildWorld } from '../src/world';
import type { LoadedMap, LoadedMesh } from '../src/loadMap';
import { drawState, type MaterialSpec, type TextureFlags } from '../src/materialSpec';
import { fadeMaterial } from '../src/lodFade';

/**
 * NU-15 B1 (PARITY-2; research 330 R330.1, R330.3, R330.6, §5 B1): the world walk writes depth under every draw, blended
 * or not, in either order. `RenderWorld` (`FUN_00339de0`) opens with `FUN_003b7150(0)` (D:L236792), which kicks the
 * `ZBUF_1` packet with `ZMSK` 0 (`FUN_003b7150` D:L308483-308488 -> `FUN_003afe70` D:L304682-304710; the ELF's packet
 * at 0x3e1180, research 330 §1.3); the mask is the pass's, not the packet's, so a vertex ramp (FISH HOOK's terrain
 * blends, `sand_beach`) writes its depth on the console and a later water draw behind it fails its `TEST`. In three's
 * order (`engineOn` false, every page's default, the menu match's included) the walk's blended draws used to write
 * none (`drawState`'s three's branch, `materialSpec.ts:269`, via `world.ts` `apply`), and the env pass, drawn after the
 * whole walk, showed through the slope (the owner's NU.R7).
 *
 * What does not move (research 330 §4, its review's F2 and F3): the alpha pass and the shadow decals (`ZMSK` 1 on the
 * console), the detail and env passes (no depth, `LessEqual` on their base), the LOD fade twins (`fadeMaterial`, which
 * takes `drawState`'s three's branch: two copies crossing over must not cut each other), and `drawState` itself (the
 * effects' and the body's state, `effectMaterials.ts:57`, `bodyView.ts:157`). Nor the held weapon and the grenade,
 * which take the world's materials but are not the walk's draws (`Built.receive` false).
 *
 * The map is built as the menu match builds it (`matchMount.ts`'s `place`: `buildWorld`, every reveal task, no toggle;
 * `worldBlendGraded.test.ts`'s shape).
 */
const S = 2 ** -24;                                       // `world.ts` `REST_WALK_SCALE`: a walk draw's order in three's
const tri = (z: number): Float32Array => new Float32Array([0, 0, z, 1, 0, z, 0, 1, z]);
const part = (textureName: string, order: number, extra: Partial<LoadedMesh> = {}): LoadedMesh => ({
  positions: tri(0), uvs: new Float32Array(6), colors: new Float32Array(12).fill(1), normals: null, faceNormals: null,
  indices: new Uint32Array([0, 1, 2]), textureName, fog: true, lit: false, order, orderEnd: order, cull: true,
  alternate: false, scroll: null, ...extra,
});
/** A vertex ramp (research 82 round 5): the packet's vertices carry an alpha below unity, so it blends source-over. */
const RAMP_COLOURS = new Float32Array([1, 1, 1, 0, 1, 1, 1, 0.5, 1, 1, 1, 1]);
const rgba = (alpha: number) => ({ data: new Uint8ClampedArray(16).fill(alpha), width: 2, height: 2 });
const solid: TextureFlags = { bilinear: true, transparent: false, graded: false, opaque: true, gs: null };
const graded: TextureFlags = { bilinear: true, transparent: true, graded: true, opaque: false, gs: null };
const NORMALS = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]);

const map = (): LoadedMap => ({
  archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', lines: null, grid: DEFAULT_GRID_PARAMS, slots: [],
  world: [
    part('rock.tif', 0, { positions: tri(-50) }),                                                 // solid terrain, far
    // FISH HOOK's slope: a vertex ramp over a solid texture, nearer the camera than the water (research 330 §2.5).
    part('rock.tif', 256, { vertexAlpha: true, colors: RAMP_COLOURS, positions: tri(-10) }),
    // The water: drawn later in the walk, with the env pass its palette entry names (`reflect` 1, `envMaterials`).
    part('water.tif', 512, { reflect: 1, normals: NORMALS, positions: tri(-30) }),
    part('skyrim.tif', 768, { fog: false }),                                                       // a sky dome's rim: a texture ramp
    part('grass.tif', 1024, { vertexAlpha: true, colors: RAMP_COLOURS, positions: tri(-10) }),     // a blended layer over the slope
    part('window.tif', 1280, { alphaPass: true }),                                                 // the alpha pass: a window
    part('shadow.tif', 1536),                                                                      // a drop shadow decal
  ],
  props: [],
  textures: {
    'rock.tif': rgba(255), 'water.tif': rgba(255), 'skyrim.tif': rgba(128), 'grass.tif': rgba(255), 'window.tif': rgba(255),
    'shadow.tif': rgba(128), 'sky01.tif': rgba(255), 'grain.tif': rgba(255),
  },
  textureFlags: {
    'rock.tif': solid, 'water.tif': solid, 'skyrim.tif': graded, 'grass.tif': solid, 'window.tif': solid, 'shadow.tif': graded,
    'sky01.tif': solid, 'grain.tif': solid,
  },
  envMaterials: [{ index: 0, rgba: [128, 128, 128, 0], uvScale: 0.5, rimOffset: 0, rimSlope: 1, texture: 'sky01.tif' }],
  detail: { 'rock.tif': { name: 'grain.tif', uv: 4, range: 202500, bmode: 'COLORBLEND' } },
  weapons: { rifle: { name: 'rifle', parts: [part('skyrim.tif', 0)], points: [] } },               // a texture ramp: `held` takes no vertex alpha
  metersPerUnit: 0.1, lightRig: null, origin: [0, 0, 0],
  collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 },
  diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
});

/** `matchMount.ts`'s `place`: `buildWorld(m)`, then every reveal task; no toggle is called. */
function asTheMenuMatchBuildsIt(m: LoadedMap = map()) {
  const view = buildWorld(m);
  for (const task of [...view.revealWorld, ...view.revealProps]) task();
  const meshes = view.group.children.filter((c): c is Mesh => c instanceof Mesh);
  const named = (name: string): Mesh[] => meshes.filter((x) => x.name === name);
  const [ground, slope] = named('rock.tif');
  const pass = (base: Mesh, suffix: string): Mesh => base.children.find((c): c is Mesh => c instanceof Mesh && c.name.endsWith(suffix))!;
  const water = named('water.tif')[0]!;
  return {
    view, ground: ground!, slope: slope!, water, env: pass(water, ' (env)'), detail: pass(slope!, ' (detail)'),
    rim: named('skyrim.tif')[0]!, grass: named('grass.tif')[0]!, window: named('window.tif')[0]!, shadow: named('shadow.tif')[0]!,
  };
}

/** What the GPU is told about depth: the list it sorts in, the write, and the test. */
const depth = (m: Mesh) => { const x = m.material as Material; return { transparent: x.transparent, depthWrite: x.depthWrite, depthFunc: x.depthFunc }; };
const WALK_BLENDED = { transparent: true, depthWrite: true, depthFunc: LessEqualDepth };
const NO_DEPTH = { transparent: true, depthWrite: false, depthFunc: LessEqualDepth };

describe('NU-15 B1: the world walk writes depth under its blends in three\'s order (research 330 B1)', () => {
  it('a vertex-ramp walk draw (FISH HOOK\'s slope) writes depth in three\'s order, at its walk order, before the env pass', () => {
    const { slope, env, water } = asTheMenuMatchBuildsIt();
    // `ZMSK` 0 for the whole walk (`FUN_003b7150(0)` D:L236792): the ramp's depth is written, as the console wrote it.
    expect(depth(slope)).toEqual(WALK_BLENDED);
    // Still the transparent list at its scene-walk place (`restOrder`): only the depth write moves.
    expect(slope.renderOrder).toBe(256 * S);
    // The env pass: transparent, no depth, `LessEqual` (GEQUAL on the console's Z16S), numbered after the ramp, so it
    // is tested against the ramp's depth and fails behind it.
    expect(depth(env)).toEqual(NO_DEPTH);
    expect(env.renderOrder).toBe(512 * S + 0.75);
    expect(env.renderOrder).toBeGreaterThan(slope.renderOrder);
    expect(depth(water)).toEqual({ transparent: false, depthWrite: true, depthFunc: LessEqualDepth });
  });

  it('a texture-ramp walk draw (a sky dome\'s rim) writes depth too; the solid terrain is unchanged', () => {
    const { rim, ground } = asTheMenuMatchBuildsIt();
    expect(depth(rim)).toEqual(WALK_BLENDED);
    expect(rim.renderOrder).toBe(768 * S);
    expect(depth(ground)).toEqual({ transparent: false, depthWrite: true, depthFunc: LessEqualDepth });
  });

  it('a blended layer over a blended layer: both write depth, the later one after it in the walk and tested less-or-equal, so it lands on the first', () => {
    const { slope, grass } = asTheMenuMatchBuildsIt();
    expect(depth(grass)).toEqual(WALK_BLENDED);
    // The same depth through the same transform passes `LessEqual` over the earlier layer's written depth (GEQUAL on
    // the console), and the walk's order puts it after: the overlay is drawn over the slope, not cut by it.
    expect(grass.renderOrder).toBeGreaterThan(slope.renderOrder);
    expect((grass.material as Material).depthTest).toBe(true);
  });

  it('under the engine order the ramp is opaque with depth written, as before; back in three\'s order it still writes depth', () => {
    const { view, slope, rim } = asTheMenuMatchBuildsIt();
    view.setEngineOrder(true);
    expect([depth(slope).transparent, depth(slope).depthWrite]).toEqual([false, true]);
    expect([depth(rim).transparent, depth(rim).depthWrite]).toEqual([false, true]);
    view.setEngineOrder(false);
    expect(depth(slope)).toEqual(WALK_BLENDED);
    expect(depth(rim)).toEqual(WALK_BLENDED);
  });

  it('pins: the alpha pass (a window) and a shadow decal write none, in either order (ZMSK 1, D:L235137)', () => {
    const { view, window, shadow } = asTheMenuMatchBuildsIt();
    for (const engine of [false, true]) {
      view.setEngineOrder(engine);
      expect(depth(window).depthWrite, `window, engine ${engine}`).toBe(false);
      expect(depth(shadow).depthWrite, `shadow, engine ${engine}`).toBe(false);
    }
  });

  it('pins: a blended base\'s detail pass keeps its base\'s list, writes none and tests less-or-equal, half a step behind it', () => {
    const { detail, slope } = asTheMenuMatchBuildsIt();
    expect(depth(detail)).toEqual(NO_DEPTH);
    expect(detail.renderOrder).toBe(slope.renderOrder + 0.5);
  });

  it('pins: drawState and the LOD fade twin are unchanged -- three\'s branch writes no depth (the effects and the body share it)', () => {
    const spec = (blend: MaterialSpec['blend']): MaterialSpec => ({
      blend, alphaTest: 0, cull: false, wrapS: 'repeat', wrapT: 'repeat', bilinear: true, mipmaps: false, fog: true,
    });
    expect(drawState(spec('source'), false)).toEqual({ transparent: true, depthWrite: false, factors: { src: 'srcAlpha', dst: 'oneMinusSrcAlpha' } });
    expect(fadeMaterial(spec('source'), false).state.depthWrite).toBe(false);
    expect(fadeMaterial(spec('none'), false).state.depthWrite).toBe(false);
  });

  /**
   * The review's F2 (NU15-W3, `NU15_SLOPE_LOD_FADE_READING`): a LOD copy in its fade band draws with its twin, which
   * writes no depth, at its walk `renderOrder` -- so the env pass at +0.75 is drawn over it in either order. B1 does not
   * change it; at rest the copy is a walk draw and writes depth like any.
   */
  it('pins F2: a blended LOD copy at rest writes depth; fading, its twin writes none at its walk order, before the env pass', () => {
    const band = (nearFade: [number, number], farFade: [number, number]): LodBand => ({ nearFade, farFade });
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const lodProp = (modelName: string, order: number, lod: LodBand) => ({
      modelName, parts: [part('grass.tif', order, { vertexAlpha: true, colors: RAMP_COLOURS })], matrices: identity.slice(), order,
      alternate: false, facade: 0, lod, cells: [[0]],
    });
    const { view, env } = asTheMenuMatchBuildsIt({ ...map(), props: [lodProp('slopehi', 300, band([0, 0], [100, 120])), lodProp('slopelo', 301, band([100, 120], [420, 440]))] });
    const high = view.group.children.find((c) => c.name === 'slopehi (lod)') as Mesh;
    const rest = high.material;
    expect(depth(high)).toEqual(WALK_BLENDED);                     // at rest: the walk's draw, depth written
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 110);                                // both copies in their fade band
    camera.updateMatrixWorld();
    view.frame(camera, 0);
    expect(high.material).not.toBe(rest);
    expect([depth(high).transparent, depth(high).depthWrite]).toEqual([true, false]);
    expect(high.renderOrder).toBe(300 * S);
    expect(env.renderOrder).toBeGreaterThan(high.renderOrder);
  });

  it('pins: the held weapon takes the world\'s materials but is not the walk\'s draw -- its blended part is unchanged', () => {
    const { view } = asTheMenuMatchBuildsIt();
    const rifle = view.held('rifle')!;
    const mesh = rifle.children.find((c): c is Mesh => c instanceof Mesh)!;
    expect([depth(mesh).transparent, depth(mesh).depthWrite]).toEqual([true, false]);
  });
});
