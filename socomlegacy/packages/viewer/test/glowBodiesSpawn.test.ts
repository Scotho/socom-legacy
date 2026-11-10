import { describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Scene, SkinnedMesh, type Material, type Object3D } from 'three';
import { GLSLNodeBuilder, WebGPURenderer } from 'three/webgpu';
import { RemotePlayers } from '../src/remotePlayers';
import { buildBody } from '../src/bodyView';
import type { LoadedBody } from '../src/body';
import type { LoadedMap } from '../src/loadMap';
import { DEFAULT_LIGHTING } from '../src/lighting';
import { BodyFlag, type BodyState } from '../src/net/protocol';

/**
 * FLASH-GLOW-BODIES, the per-body warm (product track, a renderer warm-up; no pixel and no game timing changed). The T4
 * runs of 2026-11-08 (evidence `flash-lag-2026-11-08`, REVIEW-GLOW-BODIES-1.md): at a full lobby's first flashbang the
 * WebGL2 backend built and linked one new program per body in view (+1 with 1-2 bodies, +14 with 14), and the kept glow
 * twin did not remove it. The cause (PER-BODY-PROGRAM-CAUSE.md), held here on three r186's own code, without a GPU:
 * 1. each body's materials key their own node build: `buildBody` makes the body's shading graph per body (its
 *    `bodyBrighten` and rig uniforms), and three keys a node material on its nodes' ids (`Node.customCacheKey`) and on
 *    the render context (`RenderObject.getMaterialCacheKey`'s `context.id`) -- so the glow target's context builds every
 *    body again, once per body;
 * 2. each build of a skinned draw is a program of its own on WebGL2: the bone matrices' buffer is a fresh node at each
 *    build (`Skinning.js` `referenceBuffer`) and the GLSL builder names it by that node's id (`buffer<id>`,
 *    `NodeBuffer_<id>`), so no two builds' vertex sources are equal and the stage cache (keyed by source) never shares.
 *    (The T4 hook log's "one shared vertex shader, 14 distinct fragments of one length" is this, its labels swapped:
 *    three's WebGL backend attaches the fragment shader first, `WebGLBackend.js` 1541-1542, and the hook named the
 *    first attached source the vertex one; the 14 differ by the four-digit id alone.)
 * The fix: the others' bodies were never `prepare`d (only the page's own, `./matchMount` `reseat`), so their glow builds
 * waited for the first flash. `RemotePlayers.setPrepare` hands each body it builds -- a joiner, a respawn on a new
 * appearance, a team change, an escortee, a kit's new models -- to the renderer's `prepare`, whose glow jobs compile it
 * under the twin on the queue's low tail at the spawn.
 */

/** A body of three parts and one skinned triangle (as `remoteEscortee.test.ts`'s). */
function body(model: string, character: string): LoadedBody {
  const I = Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  const part = (name: string, parent: number) => ({ name, parent, bindLocal: Float32Array.from(I), bindWorld: Float32Array.from(I), bbox: Float32Array.of(-1, -1, -1, 1, 1, 1) });
  return {
    character, model, dressedBy: 'character.rdr', textureAsset: null,
    parts: [part('skel_root', -1), part('hips', 0), part('rhand', 1)],
    subMeshes: [{
      textureName: null, fog: false, positions: Float32Array.of(0, 0, 0, 1, 0, 0, 0, 1, 0), normals: Float32Array.of(0, 0, 1, 0, 0, 1, 0, 0, 1),
      uvs: new Float32Array(6), indices: Uint32Array.of(0, 1, 2), skinIndex: new Uint16Array(12), skinWeight: Float32Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0),
    }],
    fittings: [], missing: [], at: null, height: 19, eye: null, carries: { rifle: null, pistol: null },
    stats: { vertices: 3, triangles: 1, parts: 3, subMeshes: 1, batches: 1, maxInfluences: 1, droppedWeight: 0, fittings: 0 },
  };
}
const MAP = { textures: {}, textureFlags: {} } as unknown as LoadedMap;

const skinnedOf = (root: Object3D): SkinnedMesh => {
  let found: SkinnedMesh | null = null;
  root.traverse((o) => { if (!found && o instanceof SkinnedMesh) found = o; });
  return found!;
};

/** A renderer never initialised: the node builder reads its library and settings, not a GPU (`litColourShader.test.ts`). */
const renderer = new WebGPURenderer({
  canvas: { style: {}, width: 1, height: 1, addEventListener() {}, removeEventListener() {}, getContext: () => null } as unknown as HTMLCanvasElement,
  forceWebGL: true,
});
(renderer.backend as unknown as { capabilities: unknown }).capabilities = { getUniformBufferLimit: () => 16384 };

/** The two shaders one node build writes for `mesh` (WebGL2's GLSL). */
function sourcesOf(mesh: SkinnedMesh): { vertex: string; fragment: string } {
  const b = new GLSLNodeBuilder(mesh, renderer as never) as unknown as {
    material: Material; camera: PerspectiveCamera; scene: Scene; build(): void; vertexShader: string; fragmentShader: string;
  };
  b.material = mesh.material as Material;
  b.camera = new PerspectiveCamera();
  b.scene = new Scene();
  b.build();
  return { vertex: b.vertexShader, fragment: b.fragmentShader };
}
/** The source with the builder's id-named buffers renamed in order of appearance. */
const renamed = (s: string): string => {
  const ids = new Map<string, number>();
  return s.replace(/\b(NodeBuffer_|buffer)(\d+)\b/g, (_, p: string, id: string) => {
    if (!ids.has(id)) ids.set(id, ids.size);
    return `${p}x${ids.get(id)}`;
  });
};

describe('FLASH-GLOW-BODIES, the cause: one node build and one WebGL2 program per body per render context (three r186)', () => {
  it('two bodies of one model key two node builds: the shading graph is each body\'s own (`buildBody`)', () => {
    const a = buildBody(body('seal_A_des', 'mp6_seal1'), MAP, DEFAULT_LIGHTING);
    const b = buildBody(body('seal_A_des', 'mp6_seal1'), MAP, DEFAULT_LIGHTING);
    const ma = skinnedOf(a.group).material as Material, mb = skinnedOf(b.group).material as Material;
    expect(ma.customProgramCacheKey()).not.toBe(mb.customProgramCacheKey());
    a.dispose(); b.dispose();
  });

  it('each build of a skinned draw writes a vertex source of its own (the bone buffer named by a fresh node id): no stage is shared', () => {
    const a = buildBody(body('seal_A_des', 'mp6_seal1'), MAP, DEFAULT_LIGHTING);
    const b = buildBody(body('seal_A_des', 'mp6_seal1'), MAP, DEFAULT_LIGHTING);
    const sa = sourcesOf(skinnedOf(a.group)), sb = sourcesOf(skinnedOf(b.group));
    const va = sa.vertex, vb = sb.vertex;
    expect(sa.fragment).toBe(sb.fragment);         // the fragment stage is shared: the per-body text is the vertex's alone
    expect(va).toMatch(/\bNodeBuffer_\d+\b/);
    expect(va).not.toBe(vb);                       // two programs linked, as the T4 counted
    expect(renamed(va)).toBe(renamed(vb));         // the same program but for the id-named buffer
    a.dispose(); b.dispose();
  });
});

const state = (id: number, over: Partial<BodyState> = {}): BodyState => ({
  id, feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0,
  flags: BodyFlag.Alive, stance: 0, landing: 0, jumps: 0,
  ground: 0, groundForward: 0, groundRight: 0, groundCls: -1, stickSnaps: 0,
  action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
  overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0,
  trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: 255, slot: 0, ...over,
});

function rig() {
  const scene = new Scene();
  const seal = body('seal_A_des', 'mp6_seal1');
  const escortees = [body('thai_biologist01', 'mp_fem1')];
  const map = { body: seal, terrorist: null, types: { seal: [seal], terrorist: [seal], escortees }, textures: {}, textureFlags: {} } as unknown as LoadedMap;
  const kitOf = vi.fn(() => ({ rifle: { object: new Group(), points: [] }, pistol: { object: new Group(), points: [] } }));
  const remote = new RemotePlayers(scene);
  remote.setMap(map, DEFAULT_LIGHTING, kitOf);
  const camera = new PerspectiveCamera();
  const frame = (...bodies: BodyState[]) => { remote.frame(1 / 60, bodies, camera); };
  const prepared: { objects: Object3D[]; stale: () => boolean }[] = [];
  const prepare = vi.fn((objects: Object3D[], stale: () => boolean) => { prepared.push({ objects, stale }); });
  const groups = () => scene.children.filter((c) => c.name.startsWith('body '));
  return { remote, frame, prepare, prepared, groups };
}

describe('FLASH-GLOW-BODIES, the fix: every body RemotePlayers builds is handed to `prepare` at its spawn', () => {
  it('a joiner\'s body is prepared once, whole (its skinned draws and its hung models), and stale once it is gone', () => {
    const { remote, frame, prepare, prepared, groups } = rig();
    remote.setPrepare(prepare);
    frame(state(5));
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepared[0]!.objects).toEqual([groups()[0]]);
    expect(prepared[0]!.stale()).toBe(false);
    frame(state(5));
    expect(prepare).toHaveBeenCalledTimes(1);       // a drawn body is not prepared again each frame
    remote.forget(5);
    expect(prepared[0]!.stale()).toBe(true);        // its jobs dropped if they have not run
  });

  it('a full lobby: each of 14 bodies prepared at its own spawn, never at a flash', () => {
    const { remote, frame, prepare, prepared } = rig();
    remote.setPrepare(prepare);
    const bodies = Array.from({ length: 14 }, (_, i) => state(10 + i));
    frame(...bodies);
    expect(prepare).toHaveBeenCalledTimes(14);
    expect(new Set(prepared.map((p) => p.objects[0])).size).toBe(14);
  });

  it('a rebuilt body (a team change, a new appearance) is prepared again; the old one\'s jobs are stale', () => {
    const { remote, frame, prepare, prepared } = rig();
    remote.setTeam(7, 'seal');
    remote.setPrepare(prepare);
    frame(state(7));
    remote.setTeam(7, 'terrorist');
    frame(state(7));
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(prepared[0]!.stale()).toBe(true);
    expect(prepared[1]!.stale()).toBe(false);
  });

  it('an escortee\'s body is prepared too', () => {
    const { remote, frame, prepare, prepared, groups } = rig();
    remote.setPrepare(prepare);
    remote.setEscortee(241, 0);
    frame(state(241));
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepared[0]!.objects).toEqual([groups()[0]]);
  });

  it('a kit\'s new models on a drawn body are prepared with it', () => {
    const { remote, frame, prepare, prepared } = rig();
    remote.setPrepare(prepare);
    frame(state(9));
    remote.setKit(9, [1, 2, 3, 4, 5]);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(prepared[1]!.stale()).toBe(false);
  });

  it('with no prepare set, or after it is cleared, nothing is asked', () => {
    const { remote, frame, prepare } = rig();
    frame(state(3));
    remote.setPrepare(prepare);
    remote.setPrepare(null);
    frame(state(4));
    expect(prepare).not.toHaveBeenCalled();
  });
});
