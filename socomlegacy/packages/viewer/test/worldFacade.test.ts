import { describe, expect, it } from 'vitest';
import { DoubleSide, FrontSide, LineSegments, Matrix4, Mesh, PerspectiveCamera, Vector3, type BufferAttribute, type InterleavedBufferAttribute, type Material } from 'three';
import { DEFAULT_GRID_PARAMS, type GlobalLighting } from '@s2u/scene';
import { buildWorld } from '../src/world';
import type { LoadedMap, LoadedMesh } from '../src/loadMap';
import { facadeRows } from '../src/facade';
import { applyLighting } from '../src/lighting';

/**
 * #291's wiring in `buildWorld`, without a GPU: a facade prop is drawn as `FUN_00317fc0` turns its node (`./facade`).
 * Its mesh sits at the node's origin, its material keeps the visual's cull bit (`FUN_003b5f20` D:L307850), and `frame`
 * turns its local +z along the direction from the camera to the node -- facade 1 about the vertical only, facade 2 with
 * the tilt -- measuring the camera in the world group's frame (the group stands at `map.origin`).
 */

/** A 6-unit quad off the node's origin (its centre at (4, 3, 0)), wound to face -z. */
const card = (cull: boolean): LoadedMesh => ({
  positions: new Float32Array([1, 6, 0, 7, 6, 0, 7, 0, 0, 1, 0, 0]), uvs: new Float32Array(8),
  colors: new Float32Array(16).fill(1), normals: null, faceNormals: null, indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  textureName: 'flare.tif', fog: true, lit: false, order: 0, orderEnd: 0, cull, alternate: false, scroll: null,
});
/** A placement at `at` (group frame), turned a quarter about y and scaled by 2: the facade turn replaces both. */
const placed = (at: [number, number, number]): Float32Array => Float32Array.from(
  new Matrix4().makeTranslation(...at).multiply(new Matrix4().makeRotationY(Math.PI / 2)).multiply(new Matrix4().makeScale(2, 2, 2)).toArray());
const GROUP: [number, number, number] = [100, 0, -50];
const NODE1: [number, number, number] = [10, 5, 20];
const NODE2: [number, number, number] = [-30, 40, 60];
const map = (): LoadedMap => ({
  archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', world: [], lines: null,
  props: [
    { modelName: 'lamp1', parts: [card(true)], matrices: placed(NODE1), order: 0, alternate: false, facade: 1, lod: null, paths: ['worldmodel/lamp1'] },
    { modelName: 'lamp2', parts: [card(false)], matrices: placed(NODE2), order: 1, alternate: false, facade: 2, lod: null, paths: ['worldmodel/lamp2'] },
  ],
  textures: { 'flare.tif': { data: new Uint8ClampedArray(16).fill(255), width: 2, height: 2 } },
  textureFlags: { 'flare.tif': { bilinear: true, transparent: false, graded: false, opaque: true, gs: null } },
  metersPerUnit: 0.1, lightRig: null, origin: GROUP, detail: {}, grid: DEFAULT_GRID_PARAMS,
  collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 },
  slots: [], diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
} as LoadedMap);

function setUp() {
  const view = buildWorld(map());
  for (const task of view.revealProps) task();
  const meshes = view.group.children.filter((c): c is Mesh => c instanceof Mesh);
  const lamp1 = meshes.find((m) => m.name === 'lamp1 (flare)')!;
  const lamp2 = meshes.find((m) => m.name === 'lamp2 (flare)')!;
  const camera = new PerspectiveCamera();
  return { view, lamp1, lamp2, camera };
}
/** The mesh's local +z in the group's frame. */
const plusZ = (m: Mesh): Vector3 => new Vector3(0, 0, 1).applyQuaternion(m.quaternion);

describe('buildWorld: the facade props (#291, FUN_00317fc0 D:L216502-216595)', () => {
  it('a culled facade part draws front side only, an unculled one both sides', () => {
    const { lamp1, lamp2 } = setUp();
    expect(lamp1).toBeDefined();
    expect(lamp2).toBeDefined();
    expect((lamp1.material as Material).side).toBe(FrontSide);
    expect((lamp2.material as Material).side).toBe(DoubleSide);
  });

  it('each facade mesh sits at its node\'s origin, its geometry the node\'s own', () => {
    const { lamp1, lamp2 } = setUp();
    expect(lamp1.position.toArray()).toEqual(NODE1);
    expect(lamp2.position.toArray()).toEqual(NODE2);
    expect(Array.from(lamp1.geometry.getAttribute('position').array).slice(0, 3)).toEqual([1, 6, 0]);
  });

  it('frame turns +z from the camera to the node: facade 1 about the vertical, facade 2 with the tilt; scale 1', () => {
    const { view, lamp1, lamp2, camera } = setUp();
    camera.position.set(GROUP[0] + 70, GROUP[1] + 65, GROUP[2] - 40);   // the world frame; (70, 65, -40) in the group's
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    view.frame(camera, 0);
    const eye = new Vector3(70, 65, -40);
    const to1 = new Vector3(...NODE1).sub(eye);
    const flat1 = new Vector3(to1.x, 0, to1.z).normalize();
    expect(plusZ(lamp1).distanceTo(flat1)).toBeLessThan(1e-5);
    expect(new Vector3(0, 1, 0).applyQuaternion(lamp1.quaternion).distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-5);
    expect(plusZ(lamp2).distanceTo(new Vector3(...NODE2).sub(eye).normalize())).toBeLessThan(1e-5);
    expect(lamp1.scale.toArray()).toEqual([1, 1, 1]);
    expect(lamp2.scale.toArray()).toEqual([1, 1, 1]);
  });

  it('setBillboards(false) puts back the placement\'s own pose, a quarter turn about y at scale 2', () => {
    const { view, lamp1, camera } = setUp();
    camera.position.set(0, 50, 0);
    view.frame(camera, 0);
    view.setBillboards(false);
    expect(plusZ(lamp1).distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-5);
    expect(lamp1.scale.toArray().map((s) => Math.round(s * 1e5) / 1e5)).toEqual([2, 2, 2]);
  });
});

type V3 = [number, number, number];
/** A map of `props` (and `world`) at the origin, with `rig` its lighting: the cases below measure in the world frame. */
const mapOf = (props: LoadedMap['props'], world: LoadedMesh[] = [], rig: GlobalLighting | null = null): LoadedMap => ({
  ...map(), origin: [0, 0, 0], props, world, lightRig: rig,
} as LoadedMap);
const translated = (at: V3): Float32Array => Float32Array.from(new Matrix4().makeTranslation(...at).toArray());
const built = (m: LoadedMap) => {
  const view = buildWorld(m);
  for (const task of [...view.revealWorld, ...view.revealProps]) task();
  return { view, meshes: view.group.children.filter((c): c is Mesh => c instanceof Mesh) };
};
const cameraAt = (at: V3): PerspectiveCamera => {
  const camera = new PerspectiveCamera();
  camera.position.set(...at);
  camera.updateMatrixWorld();
  return camera;
};
/** A point of model space carried by the facade turn `rows` (`facadeRows`, row-vector) to the node at `origin`. */
const turnedPoint = (rows: ArrayLike<number>, origin: V3, p: V3): V3 =>
  [0, 1, 2].map((k) => origin[k]! + p[0] * rows[k]! + p[1] * rows[3 + k]! + p[2] * rows[6 + k]!) as V3;
const range = (a: V3, b: V3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** An attribute's components through its accessors: a world draw's are an interleaved buffer's slots (CPS H12). */
const components = (a: BufferAttribute | InterleavedBufferAttribute): number[] => {
  const out: number[] = [];
  for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out.push(a.getComponent(i, k));
  return out;
};

describe('LATER 113: with the engine order on, a turned facade is keyed by its centroid through the turn, every frame', () => {
  // MP9's far-tree cards (`facadetrees.tif`, facade 1, the alpha pass; FACADES-2's census, rounded): `lo_jungletree04`
  // I000 V01 and `lo_congo2_tree4` I011 V01 -- their node origins, their visuals' centroids (`LoadedMesh.centre`, model
  // space) and their geometry's box centres, and a camera from which the two orders part. The engine keys an alpha-pass
  // visual by the range from the camera to its centroid carried through the matrix it is drawn with (`FUN_003371b0`
  // D:L235314-235317), the turned one (`FUN_003389c0` D:L236081).
  const A = { origin: [2614.8, 166.63, 358.36] as V3, centre: [-1.65, 58.55, 0] as V3, box: [3.22, 48.78, 0] as V3 };
  const B = { origin: [2702.53, 154.14, 282.49] as V3, centre: [-5.89, 69.08, -1.5] as V3, box: [-15.16, 62.63, -1.44] as V3 };
  const EYE: V3 = [2594.96, 158.35, 261.97];
  /** A 10-unit card about `box`, its visual's centroid `centre`. */
  const treeCard = (box: V3, centre: V3): LoadedMesh => ({
    ...card(false), alphaPass: true, centre,
    positions: Float32Array.from([box[0] - 5, box[1] + 5, box[2], box[0] + 5, box[1] + 5, box[2], box[0] + 5, box[1] - 5, box[2], box[0] - 5, box[1] - 5, box[2]]),
  });

  it('draws the card nearer by the turned centroid after the other, where the box centre at load says otherwise', () => {
    // The case discriminates: by the engine's key A is the nearer, by the box centre placed unturned B is.
    const key = (c: typeof A): number => range(turnedPoint(facadeRows(1, c.origin, EYE)!, c.origin, c.centre), EYE);
    const atLoad = (c: typeof A): number => range([c.origin[0] + c.box[0], c.origin[1] + c.box[1], c.origin[2] + c.box[2]], EYE);
    expect(key(A)).toBeLessThan(key(B));
    expect(atLoad(A)).toBeGreaterThan(atLoad(B));
    const { view, meshes } = built(mapOf([
      { modelName: 'treeA', parts: [treeCard(A.box, A.centre)], matrices: translated(A.origin), order: 0, alternate: false, facade: 1, lod: null },
      { modelName: 'treeB', parts: [treeCard(B.box, B.centre)], matrices: translated(B.origin), order: 1, alternate: false, facade: 1, lod: null },
    ]));
    view.setEngineOrder(true);
    view.frame(cameraAt(EYE), 0);
    const a = meshes.find((m) => m.name === 'treeA (flare)')!, b = meshes.find((m) => m.name === 'treeB (flare)')!;
    expect(a.renderOrder).toBeGreaterThan(b.renderOrder);   // far to near: the nearer goes out later
  });
});

describe('LATER 114: a lit facade part is lit under its turned normals, every frame', () => {
  // The engine lights a node by the matrix it draws it with (`FUN_003b6d10` D:L308338-308339, `FUN_003b6870`
  // D:L308207-308208), the turned one for a facade (`FUN_003389c0` D:L236081): the part's normals turn with it.
  const RIG: GlobalLighting = {
    directions: [[-0.6, -0.8, 0], [0, 0, 1], [0, 0, 0]], colours: [[0.5, 0.4, 0.3], [0.2, 0.3, 0.4], [0, 0, 0]], ambient: [0.1, 0.1, 0.1],
  };
  const NODE: V3 = [10, 5, 20];
  const UP_Z = (): Float32Array => Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const litCard = (): LoadedMesh => ({ ...card(false), lit: true, normals: UP_Z(), colors: new Float32Array(16).fill(0.75) });
  const lightingUnder = (normals: Float32Array): Float32Array => {
    const out = new Float32Array(16);
    applyLighting({ colors: new Float32Array(16).fill(0.75), normals, lit: true }, { rig: RIG, brighten: 0, rigEverywhere: false }, out);
    return out;
  };

  it('frame re-lights the card under the normals the facade turn gives it; the placed pose\'s bake is not kept', () => {
    const EYE: V3 = [70, 65, -40];
    const rows = facadeRows(2, NODE, EYE)!;
    const turned = Float32Array.from([0, 1, 2, 3].flatMap(() => [rows[6]!, rows[7]!, rows[8]!]));   // (0, 0, 1) through the rows
    const want = lightingUnder(turned);
    const bake = lightingUnder(UP_Z());
    expect(Math.max(...want.map((v, i) => Math.abs(v - bake[i]!)))).toBeGreaterThan(0.05);   // the case discriminates
    const { view, meshes } = built(mapOf([
      { modelName: 'glow', parts: [litCard()], matrices: translated(NODE), order: 0, alternate: false, facade: 2, lod: null },
    ], [], RIG));
    view.frame(cameraAt(EYE), 0);
    const colours = components(meshes.find((m) => m.name === 'glow (flare)')!.geometry.getAttribute('color'));
    want.forEach((v, i) => expect(colours[i]).toBeCloseTo(v, 5));
  });
});

describe('LATER 112 and F-B: a prop part keeps its texture scroll (`TextureScroll_Object`, `LoadedMesh.scroll`)', () => {
  // A scrolling texture gets a material of its own, the one a world part with the same draw state and scroll gets
  // (`materialFor`, keyed on the scroll), whose shading graph pushes the uv along; a part drawn without its scroll
  // shares the plain material's shading instead.
  const SCROLL: [number, number] = [0, -0.15];
  const part = (scroll: [number, number] | null): LoadedMesh => ({ ...card(true), scroll });
  const scene = (facade: number, count: number) => {
    const matrices = new Float32Array(16 * count);
    for (let i = 0; i < count; i++) matrices.set(translated([i * 10, 0, 0]), i * 16);
    return built(mapOf([
      { modelName: 'scrolled', parts: [part(SCROLL)], matrices, order: 0, alternate: false, facade, lod: null },
      { modelName: 'plain', parts: [part(null)], matrices: translated([0, 0, 50]), order: 1, alternate: false, facade, lod: null },
    ], [part(SCROLL)]));
  };
  const colorNode = (m: Mesh): unknown => (m.material as unknown as { colorNode: unknown }).colorNode;
  const check = (meshes: Mesh[], scrolledName: string, plainName: string): void => {
    const world = meshes.find((m) => m.name === 'flare.tif')!;
    const scrolled = meshes.find((m) => m.name === scrolledName)!, plain = meshes.find((m) => m.name === plainName)!;
    expect(world).toBeDefined();
    expect(colorNode(world)).not.toBe(colorNode(plain));   // the world part's own scrolling graph
    expect(scrolled.material).toBe(world.material);
  };

  it('LATER 112: a facade part (M72\'s smoke columns, (0, -0.15)) scrolls as the world part it was', () => {
    check(scene(1, 1).meshes, 'scrolled (flare)', 'plain (flare)');
  });

  it('F-B: a prop drawn once scrolls (MP61\'s sky)', () => {
    check(scene(0, 1).meshes, 'scrolled', 'plain');
  });

  it('F-B: an instanced prop scrolls (MP52\'s dust)', () => {
    check(scene(0, 3).meshes, 'scrolled', 'plain');
  });
});

describe('LATER 114\'s cost guard: a facade part is re-lit when its turn or its lighting changed, and only then', () => {
  // A guard on cost alone, with no visible change: the colours are what `relightFacade` gives for the turn and the
  // lighting of the frame, whether the frame re-lit them or kept the last ones.
  const RIG: GlobalLighting = {
    directions: [[-0.6, -0.8, 0], [0, 0, 1], [0, 0, 0]], colours: [[0.5, 0.4, 0.3], [0.2, 0.3, 0.4], [0, 0, 0]], ambient: [0.1, 0.1, 0.1],
  };
  const RIG2: GlobalLighting = { ...RIG, colours: [[0.9, 0.1, 0.1], [0.1, 0.9, 0.1], [0, 0, 0]] };
  const NODE: V3 = [10, 5, 20];
  const EYE: V3 = [70, 65, -40];
  const UP_Z = (): Float32Array => Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const setUpLit = (lit = true) => {
    const { view, meshes } = built(mapOf([
      { modelName: 'glow', parts: [{ ...card(false), lit, normals: UP_Z(), colors: new Float32Array(16).fill(0.75) }], matrices: translated(NODE), order: 0, alternate: false, facade: 2, lod: null },
    ], [], RIG));
    const colour = meshes.find((m) => m.name === 'glow (flare)')!.geometry.getAttribute('color') as BufferAttribute | InterleavedBufferAttribute;
    // The colours through the attribute, the uploads counted on the buffer it lives in (CPS H12: an interleaved one).
    const attribute = {
      get array(): number[] { return components(colour); },
      get version(): number { return 'data' in colour ? colour.data.version : colour.version; },
    };
    return { view, attribute };
  };
  /** The colours `relightFacade` gives the card under `normal` (its (0, 0, 1) as the mesh faces) and `rig`. */
  const under = (normal: ArrayLike<number>, rig: GlobalLighting, rigEverywhere = false, lit = true): number[] => {
    const out = new Float32Array(16);
    applyLighting({ colors: new Float32Array(16).fill(0.75), normals: Float32Array.from([0, 1, 2, 3].flatMap(() => Array.from(normal))), lit },
      { rig, brighten: 0, rigEverywhere }, out);
    return Array.from(out);
  };
  const turned = (): number[] => { const r = facadeRows(2, NODE, EYE)!; return [r[6]!, r[7]!, r[8]!]; };
  const close = (got: ArrayLike<number>, want: number[]): void => want.forEach((v, i) => expect(got[i]).toBeCloseTo(v, 5));

  it('a card that does not turn is not re-lit while nothing changed: no colour upload on the second frame', () => {
    const { view, attribute } = setUpLit();
    const camera = cameraAt(EYE);
    view.frame(camera, 0);
    const lit = attribute.version;
    view.frame(camera, 0);
    view.frame(camera, 0);
    expect(attribute.version).toBe(lit);
    close(attribute.array, under(turned(), RIG));
  });

  it('a card that does not turn is re-lit when the rig changes, never left under the old light', () => {
    const { view, attribute } = setUpLit();
    const camera = cameraAt(EYE);
    view.frame(camera, 0);
    view.setLighting({ rig: RIG2, brighten: 0, rigEverywhere: false });
    view.frame(camera, 0);
    close(attribute.array, under(turned(), RIG2));
    const lit = attribute.version;
    view.setLighting({ rig: RIG2, brighten: 40, rigEverywhere: false });   // the brighten is a uniform: nothing to re-light
    view.frame(camera, 0);
    expect(attribute.version).toBe(lit);
  });

  it('an unlit card is lit by the rig once rigEverywhere is on, and goes back to its material colour when it is off', () => {
    const { view, attribute } = setUpLit(false);
    const camera = cameraAt(EYE);
    view.frame(camera, 0);
    close(attribute.array, new Array(16).fill(0.75));
    view.setLighting({ rig: RIG, brighten: 0, rigEverywhere: true });
    view.frame(camera, 0);
    close(attribute.array, under(turned(), RIG, true, false));
    view.setLighting({ rig: RIG, brighten: 0, rigEverywhere: false });
    view.frame(camera, 0);
    close(attribute.array, new Array(16).fill(0.75));
  });

  it('setBillboards both ways re-lights the card: the pose on disc, then the turn again', () => {
    const { view, attribute } = setUpLit();
    const camera = cameraAt(EYE);
    view.frame(camera, 0);
    view.setBillboards(false);
    close(attribute.array, under([0, 0, 1], RIG));   // the placement's own pose: a translation, (0, 0, 1) as modelled
    view.setBillboards(true);
    view.frame(camera, 0);
    close(attribute.array, under(turned(), RIG));
  });
});

describe('LATER 120: a turned placement\'s line strips turn with it (`LoadedLineGroup.turn`)', () => {
  // MP11's bulbs' `wire` is a GS line strip drawn on the bulb's turned entry (`FUN_003389c0` D:L236081): its group holds
  // the placement's strips in model space with the placement's matrix, and `frame` turns it about the origin as it turns
  // a facade mesh; `setBillboards(false)` puts back the pose on disc.
  const wire = (): NonNullable<LoadedMap['lines']>[number] & { turn: { facade: number; matrix: Float32Array } } => ({
    textureName: 'flare.tif', fog: true, order: 2, positions: Float32Array.from([0, -0.5, 0, 0, -3.25, 0]), uvs: new Float32Array(4),
    colors: new Float32Array(8).fill(1), normals: new Float32Array(6), spans: [{ walk: 7, first: 0, count: 2 }],
    turn: { facade: 2, matrix: placed(NODE2) },
  });
  const setUpLine = () => {
    const view = buildWorld({ ...map(), lines: [wire()] } as LoadedMap);
    for (const task of view.revealProps) task();
    const line = view.group.children.find((c): c is LineSegments => c instanceof LineSegments)!;
    return { view, line };
  };

  it('the group is drawn at the placement\'s origin, its points the model space\'s', () => {
    const { line } = setUpLine();
    expect(line).toBeDefined();
    expect(line.position.toArray()).toEqual(NODE2);
    expect(Array.from(line.geometry.getAttribute('position').array)).toEqual([0, -0.5, 0, 0, -3.25, 0]);
  });

  it('frame turns its +z along the camera-to-origin direction (facade 2), scale 1; setBillboards(false) puts back the pose', () => {
    const { view, line } = setUpLine();
    const camera = cameraAt([GROUP[0] + 70, GROUP[1] + 65, GROUP[2] - 40]);
    view.frame(camera, 0);
    const eye = new Vector3(70, 65, -40);
    expect(new Vector3(0, 0, 1).applyQuaternion(line.quaternion).distanceTo(new Vector3(...NODE2).sub(eye).normalize())).toBeLessThan(1e-5);
    expect(line.scale.toArray()).toEqual([1, 1, 1]);
    view.setBillboards(false);
    expect(new Vector3(0, 0, 1).applyQuaternion(line.quaternion).distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-5);
    expect(line.scale.toArray().map((s) => Math.round(s * 1e5) / 1e5)).toEqual([2, 2, 2]);
  });

  it('with the engine order on, frame keys every billboard by its draw: the turned group has one (`drawnByObject`)', () => {
    const { view } = setUpLine();
    view.setEngineOrder(true);
    // `frame` reads each billboard's `drawn` (`inAlphaPass`): a group pushed without one would throw here.
    expect(() => view.frame(cameraAt([GROUP[0] + 70, GROUP[1] + 65, GROUP[2] - 40]), 0)).not.toThrow();
  });

  it('lineGroups() reports the turned group\'s extent where it is placed, before any frame, not in model space', () => {
    const { view } = setUpLine();   // no frame yet: the placed matrix, set at build
    const [g] = view.lineGroups();
    expect(g!.min[0]).toBeGreaterThan(NODE2[0] - 7);
    expect(g!.max[1]).toBeLessThanOrEqual(NODE2[1] + 1e-4);
    expect(g!.min[1]).toBeCloseTo(NODE2[1] - 6.5, 4);   // the pose on disc: scale 2, so -3.25 reaches 6.5 below
  });
});
