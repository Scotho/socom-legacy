import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { BoxGeometry, Mesh, PerspectiveCamera, Scene, type Material } from 'three';
import { GLSLNodeBuilder, MeshBasicNodeMaterial, WGSLNodeBuilder, WebGPURenderer } from 'three/webgpu';
import { uniform, uv, vec4 } from 'three/tsl';
import { installInvariantPosition, invariantPositionInstalled, INVARIANT_GLSL_LINE, INVARIANT_WGSL_POSITION, setInvariantPositionForTest } from '../src/invariantPosition';
import { WorldMeshMaterial } from '../src/worldInstancing';

/**
 * MAC-FLOOR step 2 (INTAKE I-3, tier 1 row 18; B-64): the world draws its detail pass and its environment pass as second
 * meshes on the base's own geometry, depth-tested less-or-equal against the base (`./world` `applyDetail`, the environment
 * pass), as the console tested them (GEQUAL on its own depth: the detail records' `TEST_1`, `./materialSpec` `detailDrawState`; the env textures' `TEST_1` `0x5000c`, research 330 §7). That
 * holds only while every program computes the base's clip-space position to the last bit; three r186 marks it invariant in
 * neither backend, and a tester's M1 Pro on WebGPU lost the detail pass in 32 px tiles (agent-mail
 * evidence/floor-flicker-mac-2026-11-21/RESULTS.md). `./invariantPosition` marks it invariant in every vertex program:
 * WGSL `@invariant` on the position output, GLSL `invariant gl_Position;`. Unit test of the generated text (no GPU).
 */

const canvas = { style: {}, width: 1, height: 1, addEventListener() {}, removeEventListener() {}, getContext: () => null } as unknown as HTMLCanvasElement;
const webgpu = new WebGPURenderer({ canvas });
const webgl = new WebGPURenderer({ canvas, forceWebGL: true });
for (const r of [webgpu, webgl]) (r.backend as unknown as { capabilities: unknown }).capabilities = { getUniformBufferLimit: () => 16384 };

type Builder = { material: Material; camera: PerspectiveCamera; scene: Scene; build(): void; vertexShader: string; fragmentShader: string };
function build(kind: 'wgsl' | 'glsl', material: Material): { vertex: string; fragment: string } {
  const mesh = new Mesh(new BoxGeometry(), material);
  const B = kind === 'wgsl' ? WGSLNodeBuilder : GLSLNodeBuilder;
  const b = new B(mesh, (kind === 'wgsl' ? webgpu : webgl) as never) as unknown as Builder;
  b.material = material;
  b.camera = new PerspectiveCamera();
  b.scene = new Scene();
  b.build();
  return { vertex: b.vertexShader, fragment: b.fragmentShader };
}

/** A base and a pass over it as the world makes them: the same geometry, different colour graphs. */
const base = (): Material => new WorldMeshMaterial();
const pass = (): Material => {
  const m = new WorldMeshMaterial();
  m.colorNode = vec4(uv().mul(uniform(4)), 0, 1);
  return m;
};

describe('MAC-FLOOR: importing the module installs nothing', () => {
  it('importing the module installs nothing (PC 1, 2026-11-21: the mark moves edges on an NVIDIA GPU); installInvariantPosition puts it on both builders', () => {
    expect(invariantPositionInstalled()).toBe(false);
    expect(build('wgsl', base()).vertex).not.toContain('@invariant');
    installInvariantPosition();
    expect(invariantPositionInstalled()).toBe(true);
  });
});

describe('MAC-FLOOR: every vertex program\'s clip-space position is invariant (`./invariantPosition`)', () => {

  // The re-review's F3: every test below installs the mark itself, so none rests on the first test's (or on `-t`'s order).
  beforeEach(() => { installInvariantPosition(); });

  it.each([['the base', base], ['a coplanar pass', pass], ['a plain basic material', () => new MeshBasicNodeMaterial()]] as const)(
    'WGSL, %s: the position output is @invariant, exactly once, and the fragment stage is untouched', (_name, make) => {
      const { vertex, fragment } = build('wgsl', make());
      expect(vertex.split(INVARIANT_WGSL_POSITION).length - 1).toBe(1);
      expect(vertex).not.toMatch(/(?<!@invariant )@builtin\( position \)/);
      expect(fragment).not.toContain('@invariant');
    });

  it.each([['the base', base], ['a coplanar pass', pass], ['a plain basic material', () => new MeshBasicNodeMaterial()]] as const)(
    'GLSL, %s: `invariant gl_Position;` once, after the version and extensions and before main', (_name, make) => {
      const { vertex, fragment } = build('glsl', make());
      expect(vertex.split(INVARIANT_GLSL_LINE).length - 1).toBe(1);
      expect(vertex.startsWith('#version 300 es')).toBe(true);
      const at = vertex.indexOf(INVARIANT_GLSL_LINE);
      expect(at).toBeGreaterThan(vertex.lastIndexOf('#extension') );
      expect(at).toBeLessThan(vertex.indexOf('void main('));
      expect(fragment).not.toContain('invariant');
    });

  it('the switch: off gives three\'s own text, on again the invariant one', () => {
    setInvariantPositionForTest(false);
    try {
      expect(build('wgsl', base()).vertex).not.toContain('@invariant');
      expect(build('glsl', base()).vertex).not.toContain(INVARIANT_GLSL_LINE);
    } finally { setInvariantPositionForTest(true); }
    expect(build('wgsl', base()).vertex).toContain(INVARIANT_WGSL_POSITION);
  });

  it("pins three r186's two lines the patch relies on (an upgrade that moves them fails here)", () => {
    const root = dirname(dirname(createRequire(import.meta.url).resolve('three')));
    const wgsl = readFileSync(join(root, 'src/renderers/webgpu/nodes/WGSLNodeBuilder.js'), 'utf8');
    const glsl = readFileSync(join(root, 'src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js'), 'utf8');
    expect(wgsl).toContain("this.getBuiltin( 'position', 'builtinClipSpace', 'vec4<f32>', 'vertex' );");
    expect(wgsl).toContain('snippets.push( `@builtin( ${name} ) ${property} : ${type}` );');
    expect(glsl).toContain("flow += 'gl_Position = ';");
    expect(glsl).toContain('this.vertexShader = this._getGLSLVertexCode( shadersData.vertex );');
  });
});
