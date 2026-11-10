import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  Box3, BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, OrthographicCamera, Scene, Vector3, type Camera, type ColorRepresentation,
  type Material,
  type RenderTarget,
} from 'three';
import {
  CharacterShadow, fitShadowCamera, mountCharShadow, shadowFactor, shadowMapMargin, shadowMapSize, shadowSoftTaps, SHADOW_MAP_SCALE_HIGH_ADAPTATION,
  SHADOW_MAP_SCALE_LOW_ADAPTATION, SHADOW_MAP_SIZE, SHADOW_SOFT_TAPS_ADAPTATION, type ShadowRenderer,
} from '../src/charShadow';
import { graphicMeshes, graphicShader } from './experimentalShaderFixture';
import { buildWorld } from '../src/world';
import { updateExperimentalAssets } from '../src/experimentalAssets';
import { EXPERIMENTAL_DEFAULTS } from '../src/experimentalGraphics';

/**
 * VS-5 (VS.R5, a browser adaptation; the video settings design §4.2, §4.3, §7): the Shadows row's tiers as scales of the
 * original's one 256x256 map (`ShadowX_%d`, `FUN_00320310`'s `0x100, 0x100`). Medium is the original's map and today's
 * draw exactly; Low halves it, High doubles it and softens its edge (a 4-tap PCF); Off skips the pass (`./matchMount`,
 * as before). The margin `(size - 2) / size` follows the size. Nothing here changes who casts the shadow or its formula.
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = (f: string): string => readFileSync(resolve(here, '../src', f), 'utf-8');

const seal = new Box3(new Vector3(96, 0, -54), new Vector3(104, 18, -46));

class FakeTargets implements ShadowRenderer {
  target: RenderTarget | null = null;
  clearColor = new Color(0);
  clearAlpha = 1;
  readonly drawn: { target: RenderTarget | null; size: [number, number] }[] = [];
  getRenderTarget(): RenderTarget | null { return this.target; }
  setRenderTarget(t: RenderTarget | null): void { this.target = t; }
  getClearColor(c: Color): Color { return c.copy(this.clearColor); }
  getClearAlpha(): number { return this.clearAlpha; }
  setClearColor(c: ColorRepresentation, a = 1): void { this.clearColor = new Color(c); this.clearAlpha = a; }
  clear(): void {}
  render(_scene: Scene, _camera: Camera): void { this.drawn.push({ target: this.target, size: [this.target!.width, this.target!.height] }); }
}

const actor = (): Group => {
  const g = new Group();
  const m = new Mesh(new BoxGeometry(8, 18, 8), new MeshBasicMaterial());
  m.position.set(0, 9, 0);
  g.add(m);
  return g;
};

/** The edge the outermost projected corner lands on, for the map's current size. */
const outermost = (): number => {
  const cam = new OrthographicCamera();
  fitShadowCamera(cam, seal, new Vector3(-0.811, -0.2, 0.55).normalize());
  let most = 0;
  for (let i = 0; i < 8; i++) {
    const c = new Vector3(i & 1 ? seal.max.x : seal.min.x, i & 2 ? seal.max.y : seal.min.y, i & 4 ? seal.max.z : seal.min.z).project(cam);
    most = Math.max(most, Math.abs(c.x), Math.abs(c.y));
  }
  return most;
};

let made: CharacterShadow | null = null;
afterEach(() => { made?.setTier('medium'); made?.dispose(); made = null; });
const shadow = (): CharacterShadow => (made = new CharacterShadow());

describe('VS-5: the original map is untouched', () => {
  it('SHADOW_MAP_SIZE is the original\'s 256 (FUN_00320310: 0x100, 0x100), declared as before', () => {
    expect(SHADOW_MAP_SIZE).toBe(256);
    expect(src('charShadow.ts')).toMatch(/\nexport const SHADOW_MAP_SIZE = 256;\n/);
  });
  it('the tiers are adaptations: 0.5, 2, and 4 soft taps', () => {
    expect(SHADOW_MAP_SCALE_LOW_ADAPTATION).toBe(0.5);
    expect(SHADOW_MAP_SCALE_HIGH_ADAPTATION).toBe(2);
    expect(SHADOW_SOFT_TAPS_ADAPTATION).toBe(4);
    expect(shadowMapSize('low')).toBe(128);
    expect(shadowMapSize('medium')).toBe(256);
    expect(shadowMapSize('high')).toBe(512);
  });
});

describe('VS-5: CharacterShadow.setTier', () => {
  it('by default (medium): today\'s 256 target, 254/256 margin, the single nearest tap', () => {
    const s = shadow();
    expect([s.target.width, s.target.height]).toEqual([256, 256]);
    expect(shadowMapMargin()).toBe(254 / 256);
    expect(outermost()).toBeCloseTo(254 / 256, 6);
    expect(shadowSoftTaps()).toBe(0);
    s.setTier('medium');
    expect([s.target.width, s.target.height]).toEqual([256, 256]);
    expect(shadowSoftTaps()).toBe(0);
  });
  it('low: 128 and 126/128, the sampling as today', () => {
    const s = shadow();
    s.setTier('low');
    expect([s.target.width, s.target.height]).toEqual([128, 128]);
    expect(shadowMapMargin()).toBe(126 / 128);
    expect(outermost()).toBeCloseTo(126 / 128, 6);
    expect(shadowSoftTaps()).toBe(0);
  });
  it('high: 512 and 510/512, the soft taps on', () => {
    const s = shadow();
    s.setTier('high');
    expect([s.target.width, s.target.height]).toEqual([512, 512]);
    expect(shadowMapMargin()).toBe(510 / 512);
    expect(outermost()).toBeCloseTo(510 / 512, 6);
    expect(shadowSoftTaps()).toBe(SHADOW_SOFT_TAPS_ADAPTATION);
    s.setTier('medium');
    expect(shadowSoftTaps()).toBe(0);
    expect(shadowMapMargin()).toBe(254 / 256);
  });
  it('a tier change disposes the old target\'s GPU side and remakes it at the new size; the same tier disposes nothing', () => {
    const s = shadow();
    let disposed = 0;
    s.target.addEventListener('dispose', () => { disposed++; });
    s.setTier('medium');
    expect(disposed).toBe(0);
    s.setTier('high');
    expect(disposed).toBe(1);
    s.setTier('high');
    expect(disposed).toBe(1);
  });
  it('shrinking then growing: the next frame redraws into the remade map at its size (the idle skip never keeps a stale map)', () => {
    const s = shadow();
    const t = new FakeTargets(), scene = new Scene(), a = actor();
    scene.add(a);
    s.update(t, scene, a);
    s.update(t, scene, a);                                  // idle: skipped
    expect(t.drawn.map((d) => d.size)).toEqual([[256, 256]]);
    s.setTier('low');
    s.update(t, scene, a);
    s.setTier('high');
    s.update(t, scene, a);
    s.setTier('medium');
    s.update(t, scene, a);
    expect(t.drawn.map((d) => d.size)).toEqual([[256, 256], [128, 128], [512, 512], [256, 256]]);
    expect(t.drawn.every((d) => d.target === s.target)).toBe(true);
  });
  it('the mounted shadow: setTier through it; its teardown leaves the page\'s map at the original\'s size', () => {
    const m = mountCharShadow();
    m.shadow.setTier('high');
    expect(m.shadow.target.width).toBe(512);
    m.dispose();
    expect(m.shadow.target.width).toBe(256);
    expect(shadowSoftTaps()).toBe(0);
  });
});

interface GraphNode { isNode?: boolean; isTextureNode?: boolean; levelNode?: unknown; getChildren(): Iterable<GraphNode> }
/** Every texture sample reachable from a node graph. */
const samplesOf = (root: unknown): GraphNode[] => {
  const seen = new Set<unknown>(), out: GraphNode[] = [];
  const visit = (n: GraphNode | null | undefined): void => {
    if (!n || n.isNode !== true || seen.has(n)) return;
    seen.add(n);
    if (n.isTextureNode === true) out.push(n);
    for (const c of n.getChildren()) visit(c);
  };
  visit(root as GraphNode);
  return out;
};

describe('VS-5 review F1, VS-12: High\'s taps are explicit-LOD samples, in a graph of their own', () => {
  // A `level()` sample is a clone naming its base (`referenceNode`, the texture's value only): a base is not a sample.
  const sampled = (root: unknown): GraphNode[] => {
    const all = samplesOf(root) as (GraphNode & { referenceNode?: unknown })[];
    const bases = new Set(all.map((t) => t.referenceNode).filter((r) => r != null));
    return all.filter((t) => !bases.has(t));
  };
  it('Medium and Low: today\'s one tap (no level) and nothing else; High: the four soft taps at level(0) and nothing else', () => {
    const one = sampled(shadowFactor());
    expect(one).toHaveLength(1);
    expect(one[0]!.levelNode == null).toBe(true);
    const soft = sampled(shadowFactor(undefined, true));
    expect(soft).toHaveLength(SHADOW_SOFT_TAPS_ADAPTATION);
    expect(soft.filter((t) => t.levelNode != null)).toHaveLength(SHADOW_SOFT_TAPS_ADAPTATION);
  });

  // Medium's source is pinned to the base's by `test/experimentalOriginal.test.ts` (its import order: the declaration order
  // of a shared var follows the modules' load, so the pin is read there); here, the swap and the way back, on each receiver
  // path: the mipmapped map (`world.ts`'s scroll/mip graph), its detail pass, and an unmipmapped map (`apply`'s plain
  // shaded graph) -- the last from this test's own fixture call, the pinned fixture untouched.
  const hash = (t: string): string => createHash('sha256').update(t).digest('hex');
  const lods = (t: string, re: RegExp): number => t.match(re)?.length ?? 0;
  /** Low draws Medium's; High its own, four more level-0 samples; Medium's again on the way back; the same material. */
  const swapsAndBack = (mesh: Mesh, s: CharacterShadow, name: string): void => {
    const mediumGlsl = graphicShader(mesh, 'GLSL'), mediumWgsl = graphicShader(mesh, 'WGSL');
    const before = mesh.material;
    s.setTier('low');
    expect(hash(graphicShader(mesh, 'GLSL')), name).toBe(hash(mediumGlsl));
    expect(hash(graphicShader(mesh, 'WGSL')), name).toBe(hash(mediumWgsl));
    s.setTier('high');
    const glsl = graphicShader(mesh, 'GLSL'), wgsl = graphicShader(mesh, 'WGSL');
    expect(hash(glsl), name).not.toBe(hash(mediumGlsl));
    expect(hash(wgsl), name).not.toBe(hash(mediumWgsl));
    // GLSL: the one tap is an implicit `texture(`, the four are `textureLod(` (a mipmapped pass's own GS level is one already).
    expect(lods(glsl, /textureLod\(/g), name).toBe(lods(mediumGlsl, /textureLod\(/g) + SHADOW_SOFT_TAPS_ADAPTATION);
    // WGSL: this fixture's renderer reads the unfilterable map by textureLoad at level 0 -- the four taps.
    expect(lods(wgsl, /textureLoad\(/g), name).toBe(SHADOW_SOFT_TAPS_ADAPTATION);
    s.setTier('medium');
    expect(hash(graphicShader(mesh, 'GLSL')), name).toBe(hash(mediumGlsl));
    expect(hash(graphicShader(mesh, 'WGSL')), name).toBe(hash(mediumWgsl));
    expect(mesh.material, name).toBe(before);                                             // the same material, its graph swapped
  };

  it('each receiver\'s shader: Low draws Medium\'s; High swaps in a graph with its four level-0 taps; back at Medium, Medium\'s again', () => {
    updateExperimentalAssets({ ...EXPERIMENTAL_DEFAULTS, enabled: false });            // the ordinary picture
    const v = graphicMeshes();
    const plain = graphicMeshes((m) => {
      const ground = m.textureFlags.ground!;
      m.textureFlags.ground = { ...ground, gs: { ...ground.gs!, mipmaps: false } };       // gsMipLod: null -- no scroll/mip graph
      return buildWorld(m);
    });
    const s = shadow();
    try {
      swapsAndBack(v.meshes.map!, s, 'map');
      swapsAndBack(v.meshes.detail!, s, 'detail');
      swapsAndBack(plain.meshes.map!, s, 'unmipmapped map');
    } finally { v.dispose(); plain.dispose(); }
    // A disposed world no longer listens: a tier to High leaves its materials alone.
    const versions = [v.meshes.map!, v.meshes.detail!, plain.meshes.map!].map((m) => (m.material as Material).version);
    s.setTier('high');
    expect([v.meshes.map!, v.meshes.detail!, plain.meshes.map!].map((m) => (m.material as Material).version)).toEqual(versions);
  });
});

describe('VS-5: the match applies the keeper\'s tier (./matchMount)', () => {
  it('review F2, F3: the tier and filter re-applied at attach; the colour filter off at teardown', () => {
    const mount = src('matchMount.ts');
    expect(mount).toMatch(/\n {4}attached = true;[^\n]*\n {4}applyTierAndFilter\(videoV2\.get\(\)\);/);
    expect(mount).toMatch(/\n {4}offTierFilter\(\);[^\n]*\n {4}colourFilter\(canvas, 'off'\);/);   // the lane merge: VS-5's observer is offTierFilter beside VS-4's offVideoV2
  });
  it('off: setShadows(false) and the frame line skipped, as today; else setShadows(true) and the tier', () => {
    const mount = src('matchMount.ts');
    expect(mount).toMatch(/view\?\.setShadows\(shadowsOn\); if \(!shadowsOn\) shadow\.shadow\.clear\(\);/);
    expect(mount).toMatch(/if \(v\.shadows !== 'off'\) shadow\.shadow\.setTier\(v\.shadows\);/);
  });
});
