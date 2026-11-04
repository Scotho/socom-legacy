import { describe, expect, it, vi } from 'vitest';
import { Group, Mesh, BoxGeometry, MeshBasicMaterial, type Object3D, PerspectiveCamera, Scene, Vector3 } from 'three';
import { RemotePlayers, type SpawnedBodyState } from '../src/remotePlayers';
import type { LoadedBody } from '../src/body';
import type { LoadedMap } from '../src/loadMap';
import { BodyFlag } from '../src/net/protocol';
import { DEFAULT_LIGHTING } from '../src/lighting';

/**
 * CPS bodies (the client performance sprint's Log, 2026-11-03T02:52Z (B); a product-track adaptation: the same point,
 * the game's behaviour unchanged): `RemotePlayers.headAt` keeps each body's `head` node instead of searching the body's
 * tree for it every frame (`getObjectByName`, 0.045 ms a body a frame in a 16-seat match), searched again whenever the
 * tree changes. The reference is the old search's own answer: the first node named `head` in the tree's pre-order, its
 * world position, or null.
 */

/** A body of four parts and one skinned triangle (`remoteZoneGate.test.ts`'s, a `head` part beside). */
function body(model: string, character: string): LoadedBody {
  const I = Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  const part = (name: string, parent: number) => ({ name, parent, bindLocal: Float32Array.from(I), bindWorld: Float32Array.from(I), bbox: Float32Array.of(-1, -1, -1, 1, 1, 1) });
  return {
    character, model, dressedBy: 'character.rdr', textureAsset: 'sealtex',
    parts: [part('skel_root', -1), part('hips', 0), part('rhand', 1), part('head', 1)],
    subMeshes: [{
      textureName: null, fog: false, positions: Float32Array.of(0, 0, 0, 1, 0, 0, 0, 1, 0), normals: Float32Array.of(0, 0, 1, 0, 0, 1, 0, 0, 1),
      uvs: new Float32Array(6), indices: Uint32Array.of(0, 1, 2), skinIndex: new Uint16Array(12), skinWeight: Float32Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0),
    }],
    fittings: [], missing: [], at: null, height: 19, eye: null, carries: { rifle: null, pistol: null },
    stats: { vertices: 3, triangles: 1, parts: 4, subMeshes: 1, batches: 1, maxInfluences: 1, droppedWeight: 0, fittings: 0 },
  };
}

const state = (id: number, feet: [number, number, number], spawns = 1): SpawnedBodyState => ({
  id, feet, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0,
  flags: BodyFlag.Alive, stance: 0, landing: 0, jumps: 0,
  ground: 0, groundForward: 0, groundRight: 0, groundCls: -1, stickSnaps: 0,
  action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
  overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0,
  trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: 255, slot: 0, spawns,
});

function rig() {
  const scene = new Scene();
  const seal = body('seal_A_des', 'mp6_seal1');
  const map = { body: seal, terrorist: null, types: { seal: [seal], terrorist: [seal], escortees: [] }, textures: {}, textureFlags: {} } as unknown as LoadedMap;
  const remote = new RemotePlayers(scene);
  const kit = (name: string): Group => { const g = new Group(); const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()); m.name = name; g.add(m); return g; };
  remote.setMap(map, DEFAULT_LIGHTING, () => ({ rifle: { object: kit('kit-rifle'), points: [] }, pistol: { object: kit('kit-pistol'), points: [] } }));
  const feet: Record<number, [number, number, number]> = { 2: [0, 0, -100], 3: [10, 0, -100], 4: [20, 0, -100] };
  const ids = [2, 3, 4];
  for (const id of ids) remote.setTeam(id, 'seal');
  const frame = (spawns = 1): void => remote.frame(1 / 60, ids.map((id) => state(id, feet[id]!, spawns)), new PerspectiveCamera());
  frame();
  const groups = (): Object3D[] => scene.children.filter((c) => c.name.startsWith('body '));
  return { remote, frame, groups, scene };
}

/** The old `headAt`'s answer, read off the tree itself. */
function reference(g: Object3D): [number, number, number] | null {
  if (!g.visible) return null;
  const head = g.getObjectByName('head');
  if (!head) return null;
  const p = head.getWorldPosition(new Vector3());
  return [p.x, p.y, p.z];
}

/** The bone itself: the `head` among `hips`'s children (a stand-in group holding only it, for `reference`). */
function bodyHead(g: Object3D): Object3D {
  const bone = g.getObjectByName('hips')!.children.find((c) => c.name === 'head')!;
  const p = bone.getWorldPosition(new Vector3());
  const holder = new Group();
  const stand = new Group();
  stand.name = 'head';
  stand.position.copy(p);
  holder.add(stand);
  return holder;
}

describe("CPS bodies (c): headAt keeps the body's head node, found again when the tree changes", () => {
  it('the same point as the search every frame over a scripted run, the tree searched only after a change', () => {
    const { remote, frame, groups } = rig();
    const g = groups()[0]!;
    const search = vi.spyOn(g, 'getObjectByName');
    const ask = (): [number, number, number] | null => remote.headAt(2);
    const ref = (): [number, number, number] | null => reference(g);
    expect(ask()).not.toBeNull();
    expect(ask()).toEqual(ref());
    search.mockClear();
    ask(); frame(); ask();
    expect(search).not.toHaveBeenCalled();                     // nothing changed in the tree: no search
    expect(ask()).toEqual(ref());

    // A node named `head` hung earlier in the pre-order (under `rhand`, before the bone): the search's first is it.
    const decoy = new Group();
    decoy.name = 'head';
    decoy.position.set(3, 4, 5);
    g.getObjectByName('rhand')!.add(decoy);
    expect(ask()).toEqual(ref());
    expect(ask()).not.toEqual(reference(bodyHead(g)));          // not the bone's
    decoy.removeFromParent();
    expect(ask()).toEqual(ref());

    // The head bone taken off: null, as the search; hung back: its point again.
    const bone = g.getObjectByName('head')!, parent = bone.parent!;
    bone.removeFromParent();
    expect(ask()).toBeNull();
    parent.add(bone);
    expect(ask()).toEqual(ref());

    // The gear rebuilt, a respawn, a mesh hung on the head: the same as the search.
    remote.setKit(2, [1, 2, 3, 4, 5]);
    expect(ask()).toEqual(ref());
    frame(2);
    expect(ask()).toEqual(ref());
    bone.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()));
    expect(ask()).toEqual(ref());

    // Not drawn: null.
    g.visible = false;
    expect(remote.headAt(2)).toBeNull();
    search.mockRestore();
  });

  it('a body built again (its side changed) is searched afresh', () => {
    const { remote, frame, groups } = rig();
    remote.setTeam(3, 'terrorist');
    frame(2);
    const g = groups()[groups().length - 1]!;
    expect(remote.headAt(3)).toEqual(reference(g));
    expect(remote.headAt(3)).not.toBeNull();
  });
});
