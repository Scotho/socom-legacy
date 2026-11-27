import { describe, expect, it } from 'vitest';
import { InstancedMesh, Matrix4, Mesh, PerspectiveCamera, Raycaster, Vector3 } from 'three';
import { DEFAULT_GRID_PARAMS, type GlobalLighting, type LodBand } from '@s2u/scene';
import { buildWorld } from '../src/world';
import type { LoadedMap, LoadedMesh } from '../src/loadMap';

/**
 * Research 439 (the bugs intake after v0.4.23, item 4): the original bands each visual on its own (`vparams` byte 5
 * into the world root's `LOD_Object`, `FUN_003374c0` D:L235458-235470), tested at the drawn node's world origin. The
 * loader now hands a band per part (`LoadedMesh.lod`); this drives `buildWorld` with Blizzard's numbers, without a GPU.
 *
 * Blizzard's shack (MP1, research 439 s3): `shack_good/inlod` (band 10: in 0, out 350-450) and `shack_good/fogplug`
 * (band 11: in 325-450, out 1000-1001) at one origin; the woodpile's `lowwood` (12: in 170, out 700), `highwood`
 * (13: out 170) and `addhilod` (14: out 145) at another; the bed (6: out 240) alone. H92 (`LOD_LAST_KEPT_RULING`, built
 * per visual: the controller's ruling 2026-11-16, option A): the last band at a spot keeps its far edge open.
 */
const INLOD: LodBand = { nearFade: [0, 0], farFade: [350, 450] };
const PLUG: LodBand = { nearFade: [325, 450], farFade: [1000, 1001] };
const BED: LodBand = { nearFade: [0, 0], farFade: [240, 240] };
const LOWWOOD: LodBand = { nearFade: [170, 170], farFade: [700, 700] };
const HIGHWOOD: LodBand = { nearFade: [0, 0], farFade: [170, 170] };
const ADDHILOD: LodBand = { nearFade: [0, 0], farFade: [145, 145] };

const part = (lod: LodBand | undefined, order = 0): LoadedMesh => ({
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), uvs: new Float32Array(6),
  colors: new Float32Array(12).fill(1), normals: null, faceNormals: null, indices: new Uint32Array([0, 1, 2]),
  textureName: 'wood.tif', fog: true, lit: false, order, orderEnd: order, cull: true, alternate: false, scroll: null,
  ...(lod ? { lod } : {}),
} as LoadedMesh);
const at = (x: number) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1]);
/** A prop entry as the loader now builds it: no band on the entry, a band on each banded part. */
const prop = (modelName: string, parts: LoadedMesh[], x: number) => ({
  modelName, parts, matrices: at(x), order: 0, alternate: false, facade: 0, lod: null,
});
const SHACK = 0, WOODPILE = 5000, BEDSPOT = -5000;
const map = (): LoadedMap => ({
  archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', world: [], lines: null,
  props: [
    prop('inlod', [part(INLOD)], SHACK),
    prop('fogplug', [part(PLUG), part(PLUG, 1)], SHACK),
    prop('lowwood', [part(LOWWOOD)], WOODPILE),
    prop('highwood', [part(HIGHWOOD)], WOODPILE),
    prop('addhilod', [part(ADDHILOD)], WOODPILE),
    // A node whose visuals are not all banded (Blizzard's `alaska4d_door01`: vis0 none, vis1 band 16).
    prop('bed', [part(undefined), part(BED, 1)], BEDSPOT),
  ],
  textures: { 'wood.tif': { data: new Uint8ClampedArray(16).fill(255), width: 2, height: 2 } },
  textureFlags: { 'wood.tif': { bilinear: true, transparent: false, graded: false, opaque: true, gs: null } },
  metersPerUnit: 0.1, lightRig: null, origin: [0, 0, 0], detail: {}, grid: DEFAULT_GRID_PARAMS,
  collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 },
  slots: [],
  diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
} as LoadedMap);

function setUp() {
  const view = buildWorld(map());
  for (const task of view.revealProps) task();
  const meshes = view.group.children.filter((c): c is Mesh => c instanceof Mesh);
  const named = (prefix: string) => meshes.filter((m) => m.name.startsWith(prefix));
  const camera = new PerspectiveCamera();
  /** The camera `units` from a spot along z. */
  const from = (spot: number, units: number) => { camera.position.set(spot, 0, units); camera.updateMatrixWorld(); view.frame(camera, 0); };
  return { named, from };
}
const shown = (ms: Mesh[]) => ms.map((m) => m.visible);

describe('buildWorld: a band on each visual (research 439)', () => {
  it('measures a band from its node\'s origin, not from its visual\'s centroid (LOD_BAND_ANCHOR_READING, D:L235458)', () => {
    // One placement at x = 20000, its plug part's centroid 700 units off the origin: with the camera 100 u from the origin
    // the plug is inside its near edge (hidden), while the centroid, sqrt(700^2 + 100^2) ~ 707 u away, is on the band's
    // plateau (450-1000) -- so a measure from the centroid would draw it whether or not the copy is the last (H92 apart;
    // the cure's review C1). At 600 u from the origin it is drawn.
    const m = map();
    const off = { ...part(PLUG), centre: [700, 0, 0] as [number, number, number] };
    m.props = [prop('offplug', [off], 20000)];
    const view = buildWorld(m);
    for (const task of view.revealProps) task();
    const plug = view.group.children.filter((c): c is Mesh => c instanceof Mesh && c.name.startsWith('offplug'));
    const camera = new PerspectiveCamera();
    const from = (units: number) => { camera.position.set(20000, 0, units); camera.updateMatrixWorld(); view.frame(camera, 0); };
    from(100);
    expect(shown(plug)).toEqual([false]);
    from(600);
    expect(shown(plug)).toEqual([true]);
  });

  it('hides Blizzard\'s fog plug inside 325 units and shows the shack\'s interior copy there', () => {
    const { named, from } = setUp();
    from(SHACK, 100);
    expect(shown(named('fogplug'))).toEqual([false, false]);
    expect(shown(named('inlod'))).toEqual([true]);
  });

  it('shows the plug and drops the interior copy from 450 units out: the copy has a successor at its spot', () => {
    const { named, from } = setUp();
    from(SHACK, 600);
    expect(shown(named('fogplug'))).toEqual([true, true]);
    expect(shown(named('inlod'))).toEqual([false]);
  });

  it('keeps the plug past its far edge, the last band at its spot (H92, option A)', () => {
    const { named, from } = setUp();
    from(SHACK, 1200);
    expect(shown(named('fogplug'))).toEqual([true, true]);
  });

  it('steps the woodpile\'s near copies aside for the far one, so the two are not drawn together', () => {
    const { named, from } = setUp();
    from(WOODPILE, 100);
    expect([...shown(named('highwood')), ...shown(named('addhilod')), ...shown(named('lowwood'))]).toEqual([true, true, false]);
    from(WOODPILE, 300);
    expect([...shown(named('highwood')), ...shown(named('addhilod')), ...shown(named('lowwood'))]).toEqual([false, false, true]);
  });

  it('bands a node\'s banded visual alone: the unbanded one is drawn at every range, the lone band kept (H92)', () => {
    const { named, from } = setUp();
    from(BEDSPOT, 600);
    const bed = named('bed');
    expect(bed.length).toBe(2);
    expect(bed.every((m) => m.visible)).toBe(true);
    expect(bed.filter((m) => m.name.endsWith('(lod)')).length).toBe(1);   // only the banded visual is a LOD draw
  });
});

/**
 * Research 439 s4a (the main controller's word, 2026-11-16 ~21:3xZ): an UNRAMPED banded part with several placements
 * stays ONE instanced draw -- each instance tested at its own node origin, hidden by the zero matrix outside its band and
 * put back at the crossing, `lodIsLast` decided per instance (H92 as built) -- so the picture is the per-placement
 * meshes' and the draws are the base's. A RAMPED part stays a mesh per placement (a per-instance fade opacity is owed).
 */
describe('buildWorld: an unramped banded part stays one instanced draw (research 439 s4a)', () => {
  // Lowwood's band (in 170, out 700, no ramps) at three placements 400 apart; highwood's (out 170) at two, one of them on
  // lowwood's first spot (so it steps aside there) and one alone (so it is the last there and kept).
  const X0 = 30000;
  const at3 = new Float32Array([...at(X0), ...at(X0 + 400), ...at(X0 + 800)]);
  const at2 = new Float32Array([...at(X0), ...at(X0 + 1600)]);
  const instancedMap = (): LoadedMap => {
    const m = map();
    m.props = [
      { ...prop('lowwoods', [part(LOWWOOD)], 0), matrices: at3 },
      { ...prop('highwoods', [part(HIGHWOOD)], 0), matrices: at2 },
      // A ramped band (the shack's interior copy) with two placements: a mesh per placement, as before.
      { ...prop('inlods', [part(INLOD)], 0), matrices: new Float32Array([...at(X0 + 5000), ...at(X0 + 5400)]) },
    ];
    return m;
  };
  const zero = (mesh: InstancedMesh, i: number): boolean => {
    const m = new Matrix4();
    mesh.getMatrixAt(i, m);
    // `world.ts`'s ZERO_MATRIX: every element 0 but the last (w), 1 -- every vertex at the origin, nothing drawn.
    return m.elements.slice(0, 15).every((e) => e === 0) && m.elements[15] === 1;
  };
  function setUpInstanced() {
    const view = buildWorld(instancedMap());
    for (const task of view.revealProps) task();
    const inst = (name: string) => view.group.children.find((c): c is InstancedMesh => c instanceof InstancedMesh && c.name === name)!;
    const camera = new PerspectiveCamera();
    const from = (x: number, z: number) => { camera.position.set(x, 0, z); camera.updateMatrixWorld(); view.frame(camera, 0); };
    return { view, inst, camera, from };
  }

  it('draws the unramped part once for all its placements, and the ramped one a mesh per placement', () => {
    const { view, inst } = setUpInstanced();
    expect(inst('lowwoods')).toBeDefined();
    expect(inst('lowwoods').count).toBe(3);
    expect(inst('highwoods')).toBeDefined();
    const meshes = view.group.children.filter((c): c is Mesh => c instanceof Mesh && !(c instanceof InstancedMesh));
    expect(meshes.filter((m) => m.name.startsWith('lowwoods')).length).toBe(0);
    expect(meshes.filter((m) => m.name === 'inlods (lod)').length).toBe(2);
    expect(view.revealProps.length).toBe(1 + 1 + 2);
  });

  it('hides an instance inside its near edge and shows one past it, and puts each back at its crossing', () => {
    const { inst, from } = setUpInstanced();
    const low = inst('lowwoods');
    from(X0, 100);                                        // 100 u from the first, ~412 from the second, ~806 from the third
    expect([zero(low, 0), zero(low, 1), zero(low, 2)]).toEqual([true, false, false]);   // the third is last: kept past 700
    from(X0, 200);                                        // the first crosses its near edge (170)
    expect(zero(low, 0)).toBe(false);
    from(X0 + 400, 50);                                   // the second now inside its near edge, the first ~403 out
    expect([zero(low, 0), zero(low, 1)]).toEqual([false, true]);
  });

  it('decides the last copy per instance: highwood steps aside where lowwood follows it, and is kept where it is alone', () => {
    const { inst, from } = setUpInstanced();
    const high = inst('highwoods');
    from(X0 + 800, 400);                                  // ~894 u from the first highwood, ~983 from the lone one
    expect([zero(high, 0), zero(high, 1)]).toEqual([true, false]);
  });

  it('a hidden instance is not hit by a ray (the zero matrix, as the alternate states are hidden)', () => {
    const { inst, from, camera } = setUpInstanced();
    const low = inst('lowwoods');
    from(X0, 100);
    expect(zero(low, 0)).toBe(true);
    low.updateMatrixWorld(true);
    // Aimed at a point inside the first instance's triangle (model space (0.25, 0.25, 0) at its node's origin).
    const toward = (): Vector3 => new Vector3(X0 + 0.25, 0.25, 0).sub(camera.position).normalize();
    const ray = new Raycaster(camera.position.clone(), toward());
    expect(ray.intersectObject(low).filter((h) => h.instanceId === 0)).toEqual([]);
    from(X0, 200);
    const back = new Raycaster(camera.position.clone(), toward());
    expect(back.intersectObject(low).filter((h) => h.instanceId === 0).length).toBeGreaterThan(0);
  });
});

/**
 * The controller's question on the batching cure (2026-11-17 ~01:3xZ): "an instanced part is lit by its first placement's
 * rotation" -- does a newly instanced part light as its per-placement meshes did at the base? `world.ts` builds a prop
 * part's geometry ONCE, its normals turned by the FIRST placement's rotation (`rotation`, before either draw path; at the
 * base 4853eae49f :1322/:1356, the `prop.lod` branch after it at :1361), so the base's per-placement LOD meshes shared
 * those lit colours too: a rotated placement is lit as the first one in both. Held here with two placements a quarter
 * turn apart, a lit part under a rig, the ramped (mesh per placement) path against the unramped (instanced) one.
 */
describe('buildWorld: an instanced banded part is lit as its per-placement meshes were (research 439 s4a)', () => {
  const RIG: GlobalLighting = {
    directions: [[-0.6, -0.8, 0], [0, 0, 1], [0, 0, 0]], colours: [[0.5, 0.4, 0.3], [0.2, 0.3, 0.4], [0, 0, 0]], ambient: [0.1, 0.1, 0.1],
  };
  const litPart = (lod: LodBand): LoadedMesh => ({
    ...part(lod), lit: true, normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]), colors: new Float32Array(12).fill(0.75),
  } as LoadedMesh);
  // Placement 0 a quarter turn about x (so "lit by the first placement" is not "never turned": the review's L1);
  // placement 1 a quarter turn about y, 400 units off (column-major).
  const first = new Float32Array([1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1]);
  const turned = new Float32Array([0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 400, 0, 0, 1]);
  const colours = (lod: LodBand, matrices = new Float32Array([...first, ...turned])): number[][] => {
    const m = map();
    m.lightRig = RIG;
    m.props = [{ ...prop('litcopy', [litPart(lod)], 0), matrices }];
    const view = buildWorld(m);
    for (const task of view.revealProps) task();
    return view.group.children.filter((c): c is Mesh => c instanceof Mesh && c.name.startsWith('litcopy')).map((mesh) => {
      const c = mesh.geometry.getAttribute('color');
      return Array.from({ length: c.count }, (_, i) => [c.getX(i), c.getY(i), c.getZ(i)]).flat();
    });
  };
  it("gives the instanced draw the very colours of each per-placement mesh: the first placement's, as at the base", () => {
    const perPlacement = colours({ nearFade: [0, 0], farFade: [350, 450] });   // ramped: a mesh per placement
    const instanced = colours({ nearFade: [0, 0], farFade: [600, 600] });      // unramped: one instanced draw
    expect(perPlacement.length).toBe(2);
    expect(instanced.length).toBe(1);
    expect(perPlacement[1]).toEqual(perPlacement[0]);                          // the turned placement lit as the first
    expect(instanced[0]).toEqual(perPlacement[0]);
    expect(instanced[0]!.some((v) => v !== 0.75)).toBe(true);                  // the rig did light it
    // ...and by the FIRST placement's rotation: not as if never turned (one unturned placement), not as the second one.
    const unturned = colours({ nearFade: [0, 0], farFade: [350, 450] }, at(0));
    const asSecond = colours({ nearFade: [0, 0], farFade: [350, 450] }, new Float32Array([...turned]));
    expect(instanced[0]).not.toEqual(unturned[0]);
    expect(instanced[0]).not.toEqual(asSecond[0]);
    const asFirst = colours({ nearFade: [0, 0], farFade: [350, 450] }, new Float32Array([...first]));
    expect(instanced[0]).toEqual(asFirst[0]);
  });
});
