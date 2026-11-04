import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Matrix4, Mesh, PerspectiveCamera } from 'three';
import type { MeshBasicNodeMaterial } from 'three/webgpu';
import { FsAssetSource } from '@s2u/archive/node';
import type { GsState } from '@s2u/gs';
import type { EffectProgram, ParticleSource } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { effectsFromDisc, type EffectData, type EffectTexture } from '../src/effectData';
import { effectMaterial } from '../src/effectMaterials';
import { ParticleSystem } from '../src/particles';

/**
 * The particles' bitmaps (socomlegacy/docs/research/89 §3, §17; the owner's 2026-10-07 Desert Glory report): the texture a
 * particle is drawn with is picked per frame by its life fraction when its source steps its list through the life
 * (flag A 0x8000000: `FUN_00327910` asks `FUN_00328a50` when the particle holds no texture of its own, D:L225586-225589),
 * and a particle with no bitmap is the GS's untextured sprite -- PRIM 0xE6, alpha-blended by its RGBA's alpha
 * (`FUN_003251b0`'s `iVar1 == 0` branch, D:L223980-223983) -- never an opaque block.
 */

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const GS: GsState = { blend: 'source', alphaTest: null, depthTest: true, bilinear: true, mipmaps: false, levels: 0, wrapS: 'repeat', wrapT: 'repeat' };
const tex = (blend: GsState['blend']): EffectTexture => ({ rgba: { width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 128]) }, gs: { ...GS, blend } });

/** One source, every override off but what a test sets: one particle a second, at the origin, living a second. */
function source(over: Partial<ParticleSource>): ParticleSource {
  return {
    flagsA: 0x3, flagsB: 0, name: 'probe', setActive: true, node: -6, follow: false, perEvent: 1, events: 1, interval: 0.01,
    perDistance: false, type: 0, streak: null, spin: null, offset: [0, 0, 0], baseVelocity: [0, 0, 0], worldVelocity: [0, 0, 0],
    baseFrom: 'fixed', worldFrom: 'fixed', baseScale: 0, worldScale: 0, baseUnit: false, worldUnit: false, atContext: false,
    atNode: false, positionBlock: null, randomVelocity: [[0, 0], [0, 0], [0, 0]], box: [[0, 0], [0, 0], [0, 0]], accel: [0, 0, 0],
    friction: 0, size: [1, 1], startAge: [0, 0], lifetime: [1, 1], nearFade: null, farFade: null, textures: [], textureMode: 'first',
    texture: null, colours: [[0, 0.4, 0.4, 0.4, 0.6], [1, 0.4, 0.4, 0.4, 0.6]], scales: [], ...over,
  };
}

const camera = (): PerspectiveCamera => {
  const c = new PerspectiveCamera(50, 1, 0.1, 1000);
  c.position.set(0, 0, 50);
  c.updateMatrixWorld(true);
  return c;
};

/** The particle groups drawn now, by texture. */
const drawn = (ps: ParticleSystem): string[] =>
  ps.object.children.filter((o): o is Mesh => o instanceof Mesh && o.visible).map((m) => m.name.replace(/^particles /, '')).sort();

/** Runs the source to its one particle's life fraction `t` (the first tick records the place, the next emits). */
function at(ps: ParticleSystem, s: ParticleSource, t: number): void {
  const cam = camera();
  ps.emit(s, new Matrix4(), {}, 'run', () => true);
  ps.update(0.01, cam);
  ps.update(0.01, cam);
  ps.update(t - 0.01 + 1e-6, cam);
}

describe('a life-stepped source draws each particle with the bitmap of its life fraction (FUN_00328a50)', () => {
  const life = source({
    flagsA: 0x8000003, textureMode: 'life', texture: 'fire_hardedge.tif',
    textures: [{ name: 'fire_hardedge.tif', t: 0 }, { name: 'cloudpuff01.tif', t: 0.4 }, { name: 'effect_mist.tif', t: 0.8 }],
  });
  const textures = new Map([['fire_hardedge.tif', tex('additive')], ['cloudpuff01.tif', tex('source')], ['effect_mist.tif', tex('source')]]);
  for (const [t, want] of [[0.2, 'fire_hardedge.tif'], [0.5, 'cloudpuff01.tif'], [0.9, 'effect_mist.tif']] as const) {
    it(`at ${t} of its life: ${want}`, () => {
      const ps = new ParticleSystem(() => 0.5);
      ps.setTextures(textures);
      at(ps, life, t);
      expect(ps.count()).toBe(1);
      expect(drawn(ps)).toEqual([want]);
    });
  }
  it('a random-mode source keeps the bitmap it drew at its spawn (Desert Glory\'s smoke: one cloudpuff01.tif)', () => {
    const ps = new ParticleSystem(() => 0.5);
    ps.setTextures(textures);
    at(ps, source({ flagsA: 0x4000003, textureMode: 'random', texture: 'cloudpuff01.tif', textures: [{ name: 'cloudpuff01.tif', t: 0 }] }), 0.9);
    expect(drawn(ps)).toEqual(['cloudpuff01.tif']);
  });
});

describe('a particle with no bitmap is the untextured sprite, blended by its alpha (FUN_003251b0, PRIM 0xE6)', () => {
  it('the material blends by the vertex alpha and writes no depth', () => {
    const m = effectMaterial(null, { fog: true, vertexAlpha: true });
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(false);
  });
  it('a source whose bitmap no library holds (fire_very_large\'s fire101.tif) draws blended, not an opaque block', () => {
    const ps = new ParticleSystem(() => 0.5);
    ps.setTextures(new Map());
    at(ps, source({ texture: 'fire101.tif', textures: [{ name: 'fire101.tif', t: 0 }] }), 0.5);
    const mesh = ps.object.children.find((o): o is Mesh => o instanceof Mesh && o.visible)!;
    const material = mesh.material as MeshBasicNodeMaterial;
    expect(material.map).toBeNull();
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
  });
});

describe('particle batches sort at their currently drawn location', () => {
  function emitAt(ps: ParticleSystem, x: number, over: Partial<ParticleSource> = {}): void {
    ps.emit(source(over), new Matrix4().makeTranslation(x, 0, 0), {}, 'sort-probe', () => true);
  }
  function mesh(ps: ParticleSystem): Mesh {
    const m = ps.object.children.find((o): o is Mesh => o instanceof Mesh && o.visible)!;
    // This is what the renderer does when the geometry has no sorting sphere yet.
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    return m;
  }
  for (const x of [-1000, 1000]) {
    it(`does not sort smoke behind a target farther away from the camera at x=${x}`, () => {
      const ps = new ParticleSystem(() => 0.5), cam = camera();
      cam.position.set(x + Math.sign(x) * 100, 0, 0);
      cam.lookAt(x, 0, 0); cam.updateMatrixWorld(true);
      emitAt(ps, x);
      ps.update(0.01, cam); ps.update(0.01, cam);
      const sphere = mesh(ps).geometry.boundingSphere!;
      const target = cam.position.clone().setX(x - Math.sign(x) * 50);
      expect(sphere.center.distanceTo(cam.position)).toBeLessThan(target.distanceTo(cam.position));
      expect(sphere.center.x).toBeCloseTo(x);
      expect(sphere.radius).toBeLessThan(2);
      ps.setTextures(new Map());
    });
  }
  it('updates the sorting location when particles move after their first render', () => {
    const ps = new ParticleSystem(() => 0.5), cam = camera();
    emitAt(ps, 1000, { worldVelocity: [100, 0, 0] });
    ps.update(0.01, cam); ps.update(0.01, cam);
    const m = mesh(ps), before = m.geometry.boundingSphere!.center.x;
    ps.update(0.2, cam);
    expect(m.geometry.boundingSphere!.center.x - before).toBeCloseTo(20);
    ps.setTextures(new Map());
  });
  it('excludes retired particles and reuses the buffer without retaining its old sorting location', () => {
    const ps = new ParticleSystem(() => 0.5), cam = camera();
    emitAt(ps, -1000, { lifetime: [0.1, 0.1] }); emitAt(ps, 1000);
    ps.update(0.01, cam); ps.update(0.01, cam);
    const m = mesh(ps), geometry = m.geometry;
    ps.update(0.2, cam);
    expect(ps.count()).toBe(1);
    expect(m.geometry.boundingSphere!.center.x).toBeCloseTo(1000);
    expect(m.geometry.boundingSphere!.radius).toBeLessThan(2);
    ps.clear(); emitAt(ps, -500);
    ps.update(0.01, cam); ps.update(0.01, cam);
    expect(mesh(ps).geometry).toBe(geometry);
    expect(geometry.boundingSphere!.center.x).toBeCloseTo(-500);
    ps.setTextures(new Map());
  });
});

const MP2 = fixture('RUN/MP2.ZDB'), MP6 = fixture('RUN/MP6.ZDB');
const particles = (d: EffectData, program: string): ParticleSource[] =>
  (d.programs.find((p) => p.name === program) as EffectProgram).sequences.flatMap((s) => s.ops)
    .flatMap((o) => (o.op === 'particles' && o.source.interval !== null ? [o.source] : []));

describe.skipIf(!MP2)(`Frostfire's tower flames on the game's data${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('firey_flames steps fire_hardedge (additive), cloudpuff01 and effect_mist (source alpha) through each flame\'s life', async () => {
    const d = await effectsFromDisc(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB', 'MP2');
    const flames = particles(d, 'firey_flames');
    expect(flames.map((s) => s.name)).toEqual(['smallconstantflame', 'flames']);
    for (const s of flames) {
      expect(s.textureMode).toBe('life');
      expect(s.textures.map((t) => [t.name, +t.t.toFixed(3)])).toEqual([['fire_hardedge.tif', 0], ['cloudpuff01.tif', 0.4], ['effect_mist.tif', 0.8]]);
    }
    const t = new Map(d.textures);
    expect([t.get('fire_hardedge.tif')?.gs?.blend, t.get('cloudpuff01.tif')?.gs?.blend, t.get('effect_mist.tif')?.gs?.blend]).toEqual(['additive', 'source', 'source']);
  });
});

describe.skipIf(!MP6)(`Desert Glory's smoke on the game's data${MP6 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('the barrel\'s and the rubble\'s smoke: one source-alpha cloudpuff01.tif each, the libraries holding it', async () => {
    const d = await effectsFromDisc(new FsAssetSource(FIXTURES), 'RUN/MP6.ZDB', 'MP6');
    const smoke = [...particles(d, 'flame_in_barrel'), ...particles(d, 'smoldering_rubble')].filter((s) => /smoke|smolder/.test(s.name));
    expect(smoke.map((s) => s.name)).toEqual(['fire_smoker1', 'smoldering_rubble']);
    for (const s of smoke) {
      expect(s.textureMode).toBe('random');
      expect(s.textures.map((x) => x.name)).toEqual(['cloudpuff01.tif']);
    }
    expect(new Map(d.textures).get('cloudpuff01.tif')?.gs?.blend).toBe('source');
    expect(d.absent).toEqual(['fire101.tif', 'fire102.tif']);
  });
});
