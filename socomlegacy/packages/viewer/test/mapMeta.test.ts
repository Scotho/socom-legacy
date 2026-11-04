import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import {
  flattenScene, IDENTITY, NODE_INSTANCE, NODE_MODEL, nodeRefInit, parseSceneGraph, ZANIM_PARENT_OUT_OF_TABLE_PLACEHOLDER, ZCMD,
  type SceneNode, type ZAnimAnimation, type ZAnimArchive, type ZAnimNodeParent, type ZAnimNodeRef,
} from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { alternateDisagreement, readMapMeta, scenicViewsOf, under, ZANIM_PARENT_SCOPE_READING } from '../src/mapMeta';

/**
 * The map's typed metadata (research 209): the actions, every placed node's instance id (a port rule, PF.R15) and the
 * zAnim node references' initial state, read once for the page and the room.
 */

const read = (bytes: Uint8Array, stem: string) => {
  const toc = parseZdb(bytes);
  const models = parseSceneGraph(Zar.parse(zdbMember(bytes, toc, `${stem}_GEO.ZED`)));
  return { meta: readMapMeta(bytes, toc, stem, models), models };
};

describe('under', () => {
  it('is the one subtree test: the root itself, a child after / and the realised prototype after =', () => {
    expect(under('worldmodel/a', 'worldmodel/a')).toBe(true);
    expect(under('worldmodel/a/b', 'worldmodel/a')).toBe(true);
    expect(under('worldmodel/a=a/b', 'worldmodel/a')).toBe(true);
    expect(under('worldmodel/ab', 'worldmodel/a')).toBe(false);
    expect(under('worldmodel', 'worldmodel/a')).toBe(false);
  });
});

describe('alternateDisagreement', () => {
  it('names where the alternate name rule and the initially inactive paths part, and nothing when they agree', () => {
    const initial = [{ path: 'worldmodel/crate/parts', deactivate: true, saveActive: true, saveTransform: false, saveParent: false },
      { path: 'worldmodel/crate/healthy', deactivate: false, saveActive: true, saveTransform: false, saveParent: false }];
    const paths = ['worldmodel/crate/healthy', 'worldmodel/crate/parts', 'worldmodel/crate/parts/part1', 'worldmodel/lamp/nolight', 'worldmodel/crate/healthy/whats_left'];
    const byName = (p: string): boolean => /\/(parts|nolight|whats_left)(\/|$)/.test(p);
    expect(alternateDisagreement(paths, byName, initial)).toBe(
      "alternate: the name rule and zAnim's initial state disagree -- 1 placements hidden by name that zAnim leaves active, first worldmodel/crate/healthy/whats_left; 0 shown that zAnim deactivates (MAP-02 replaces the rule)");
    // The lamp's `nolight` is under no path zAnim names: not judged.
    expect(alternateDisagreement(paths.slice(0, 4), byName, initial)).toBeNull();
    expect(alternateDisagreement(paths.slice(0, 4), () => false, initial)).toBe(
      "alternate: the name rule and zAnim's initial state disagree -- 0 placements hidden by name that zAnim leaves active; 2 shown that zAnim deactivates, first worldmodel/crate/parts (MAP-02 replaces the rule)");
  });
});

describe("PAR-92 B2: a node reference's parent places it (ZANIM_PARENT_SCOPE_READING; research 319 §1.2-§1.3)", () => {
  // `FUN_0026f4e0` D:L118221-118228: a non-zero parent is resolved first and the name looked up beneath its node only,
  // with no world fallback and the search mode unread; 0xf9 (`root`) beneath the instance, else the root (§1.3).
  const node = (name: string, over: Partial<SceneNode> = {}): SceneNode => ({
    name, modelName: null, type: NODE_MODEL, flags: 1, matrix: Float32Array.from(IDENTITY), bbox: new Float32Array(6), regionmask: 0,
    visuals: 0, visualParams: [], visualMaterials: [], children: [], collision: [], ...over,
  });
  const models: SceneNode[] = [
    node('worldmodel', { children: [
      node('pane'), node('rotor'),
      node('slab_1', { type: NODE_INSTANCE, modelName: 'slab' }),
      node('rig_1', { type: NODE_INSTANCE, modelName: 'rig' }),
      node('heli_1', { type: NODE_INSTANCE, modelName: 'heli' }),
    ] }),
    node('slab', { children: [node('glass')] }),
    node('rig', { children: [node('left', { children: [node('hand')] }), node('arm', { children: [node('hand')] })] }),
    node('heli', { children: [node('body', { children: [node('rotor')] })] }),
  ];
  const OFF = 0x80000000;
  const ref = (name: string, parent: ZAnimNodeParent, search: number, word = 0): ZAnimNodeRef => ({ parent, name, search, word, flags: 0, init: nodeRefInit(word) });
  const anim = (name: string, flags: number, nodeRefs: ZAnimNodeRef[], opening: number[] = []): ZAnimAnimation => ({
    name, names: ['NA', name], nodeRefs, health: null,
    params: { nameIndex: 1, rootNodeIndex: 1, paused: 0, state: 1, flags, timer: 0, priority: 0, seqOffsets: [0, 0, 0, 0] },
    // An opening sequence (activation 1) turning each listed reference off: `OBJECT_ACTIVE_STATE`, the node in the i8 at +6.
    sequences: opening.length ? [{ offset: 0, name: 'NA', word: 1 << 1, size: 28, commands: opening.map((n) => {
      const bytes = new Uint8Array(12);
      new DataView(bytes.buffer).setUint32(0, (ZCMD.OBJECT_ACTIVE_STATE & 0xffff) | (12 << 18), true);
      bytes[6] = n;
      return { offset: 0, type: ZCMD.OBJECT_ACTIVE_STATE, set: 0, cmd: ZCMD.OBJECT_ACTIVE_STATE, quadAlign: false, timeless: false, size: 12, bytes };
    }) }] : [],
  });
  const archiveOf = (...anims: ZAnimAnimation[]): ZAnimArchive => ({
    main: { version: 0, gravity: -98, flags: 0, userActionAnimIndex: 0 }, names: [],
    sets: [{ name: 'mission', names: ['NA'], rdrPaths: [], siScripts: [], anims }],
  });
  const meta = (...anims: ZAnimAnimation[]) => readMapMeta(new Uint8Array(0), [], 'MPX', models, archiveOf(...anims));
  const off = (m: ReturnType<typeof meta>): string[] => m.initial.filter((e) => e.deactivate).map((e) => e.path);

  it('the value: a non-zero parent beneath its parent only, `root` beneath the root, parent 0 as before', () => {
    expect(ZANIM_PARENT_SCOPE_READING).toEqual({ beneathParentOnly: true, rootBeneathRoot: true });
  });

  it("parent 0xf9, search 0: beneath the root only -- the world's `pane` is never taken when the root holds none", () => {
    const m = meta(anim('break_slab', 0x21, [ref('NA', 0, 0), ref('slab_1', 0, 0), ref('pane', 'root', 0, OFF)], [2]));
    expect(off(m)).toEqual([]);
    expect(m.autostart).toBeUndefined();
    expect(m.diagnostics).toContain('meta: zAnim break_slab: pane (search 0, parent root) not placed under slab_1');
    // The same reference with parent 0 takes the world's first placement, as it did (NODE_REF_SCOPE_READING).
    expect(off(meta(anim('break_slab', 0x22, [ref('NA', 0, 0), ref('slab_1', 0, 0), ref('pane', 0, 0, OFF)])))).toEqual(['worldmodel/pane']);
  });

  it("parent k: beneath reference k's placement -- the rig's `arm/hand`, not the first `hand` beneath the root", () => {
    const m = meta(anim('grab', 0x22, [ref('NA', 0, 0), ref('rig_1', 0, 0), ref('arm', 0, 0), ref('hand', 2, 0, OFF)]));
    expect(off(m)).toEqual(['worldmodel/rig_1=rig/arm/hand']);
    const before = meta(anim('grab', 0x22, [ref('NA', 0, 0), ref('rig_1', 0, 0), ref('arm', 0, 0), ref('hand', 0, 0, OFF)]));
    expect(off(before)).toEqual(['worldmodel/rig_1=rig/left/hand']);
  });

  it('parent k reads no search mode: a search-3 rotor under its root is placed beneath it, never the world\'s', () => {
    const m = meta(anim('copter', 0x22, [ref('NA', 0, 0), ref('heli_1', 0, 0), ref('rotor', 1, 3, OFF)]));
    expect(off(m)).toEqual(['worldmodel/heli_1=heli/body/rotor']);
  });

  it('`caller` and a parent past the table place nothing at the map\'s load', () => {
    const line = "zAnim mission/held: node reference 3's parent 30 of 4: unresolved (ZANIM_PARENT_OUT_OF_TABLE_PLACEHOLDER)";
    const past = { ...ref('arm', ZANIM_PARENT_OUT_OF_TABLE_PLACEHOLDER, 0, OFF), unresolved: line };
    const m = meta(anim('held', 0x22, [ref('NA', 0, 0), ref('rig_1', 0, 0), ref('hand', 'caller', 0, OFF), past]));
    expect(off(m)).toEqual([]);
    expect(m.diagnostics).toContain(`meta: ${line}`);
  });
});

const mp2 = fixture('RUN/MP2.ZDB');
describe.skipIf(mp2 === null)(`Frostfire's metadata${mp2 === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it('stable instance ids: every placed node under worldmodel in flattenScene order, one id each, the same across two reads', () => {
    const { meta, models } = read(mp2!, 'MP2');
    const flat = flattenScene(models, 'worldmodel');
    expect(meta.stem).toBe('MP2');
    expect(meta.instances.length).toBe(flat.length);
    expect(meta.instances.map((i) => i.id)).toEqual(flat.map((_, i) => i));
    expect(meta.instances.map((i) => [i.path, i.node, i.modelName])).toEqual(flat.map((f) => [f.path, f.node.name, f.modelName]));
    // The id a path names is its first placement's; a door's node has one.
    const door = meta.instances[meta.instanceByPath.get('worldmodel/bdoor_4')!]!;
    expect(door.path).toBe('worldmodel/bdoor_4');
    for (const [path, id] of meta.instanceByPath) expect(meta.instances[id]!.path).toBe(path);
    // A second read, from fresh bytes, gives the same ids.
    const again = read(new Uint8Array(mp2!), 'MP2').meta;
    expect(again.instances).toEqual(meta.instances);
    expect([...again.instanceByPath]).toEqual([...meta.instanceByPath]);
    // Each instance's root is its outermost realised prototype (or itself in the world model's own tree).
    for (const i of meta.instances) expect(under(i.path, i.root)).toBe(true);
    expect(meta.actions.map((a) => a.node)).toEqual(['bdoor_4', 'wdoor_1', 'wdoor_2']);
  });

  it("scenicViewsOf reads mission.rdr's Scenic_Views on the MP2 fixture: each view's position and look, in file order (the field layout in research 232 §5)", () => {
    // READERM.ZAR/mission.rdr's Scenic_Views: records of Pos (x y z), Rot (pitch yaw roll, degrees) and Desc (SCENIC_VIEWS_READING).
    const views = scenicViewsOf(mp2!, parseZdb(mp2!));
    expect(views.map((v) => v.name)).toEqual(['SEAL Start', 'Middle Passage', 'Eastern Overlook', 'Warehouse', 'Catwalks', 'Terrorist Start']);
    expect(views[0]).toEqual({ name: 'SEAL Start', at: [979, 236, 689], pitch: -26, yaw: 53, roll: 0 });
    expect(views[5]).toEqual({ name: 'Terrorist Start', at: [673, 210, 1256], pitch: -15, yaw: 65, roll: 0 });
  });
});

const mp72 = fixture('RUN/MP72.ZDB');
describe.skipIf(mp72 === null)(`Crossroads' metadata${mp72 === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it("scenicViewsOf on Crossroads: a pitch written 0-360 (337) is the signed -23 the other maps write (SCENIC_VIEWS_READING)", () => {
    const views = scenicViewsOf(mp72!, parseZdb(mp72!));
    expect(views.length).toBe(11);
    expect(views[0]).toEqual({ name: 'SEAL Base', at: [2179, 153, 1480], pitch: -23, yaw: 72, roll: 0 });
    expect(views.at(-1)).toEqual({ name: 'Terrorist Base', at: [446, 87, 1698], pitch: -18, yaw: 317, roll: 0 });
  });
  it("the initially inactive set of Crossroads holds both arches' destroyed and parts subtrees and neither healthy", () => {
    const { meta } = read(mp72!, 'MP72');
    const off = meta.initial.filter((e) => e.deactivate).map((e) => e.path);
    for (const side of ['seal', 'terrorist']) {
      const arch = `worldmodel/${side}_demo_1/arch=arch`;
      expect(off).toContain(`${arch}/destroyed`);
      expect(off).toContain(`${arch}/parts`);
      for (let k = 1; k <= 15; k++) expect(off).toContain(`${arch}/parts/part_${k}`);
      expect(off.filter((p) => under(p, `${arch}/healthy`))).toEqual([]);
      const healthy = meta.initial.find((e) => e.path === `${arch}/healthy`);
      expect(healthy).toEqual({ path: `${arch}/healthy`, deactivate: false, saveActive: true, saveTransform: false, saveParent: false });
    }
    // Every path the set names is a placed node's.
    for (const e of meta.initial) expect(meta.instanceByPath.has(e.path), e.path).toBe(true);
    expect(meta.instances.find((i) => i.path === 'worldmodel/seal_demo_1/arch=arch/destroyed')?.root).toBe('worldmodel/seal_demo_1/arch=arch');
  });
});
