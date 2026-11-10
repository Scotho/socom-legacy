import { describe, expect, it } from 'vitest';
import { Group, PerspectiveCamera, Scene, Vector3 } from 'three';
import { RemotePlayers, type SpawnedBodyState } from '../src/remotePlayers';
import type { LoadedBody } from '../src/body';
import type { BodyView } from '../src/bodyView';
import type { LoadedMap } from '../src/loadMap';
import type { PlaySnapshot } from '../src/mover';
import { BodyFlag } from '../src/net/protocol';
import { DEFAULT_LIGHTING } from '../src/lighting';
import { Play } from '../src/play';

/**
 * SIGHT-POINTS (LATER 793; research 321 s4.1.1 point 8 and s7.5; reading, pending review): the perception sight query
 * runs from the observer's `head` node (body+0x308, slot +0x34 `FUN_005a31c0`) to the target's `neck` node (body+0x30c,
 * slot +0x38 `FUN_005a3160`), D:L460155-460171 -- the nodes named at the body's set-up (`FUN_00553ea0`
 * D:L419620-419623), each point the node's origin carried up its parent chain (`FUN_002869d0` D:L130737-130766) and put
 * in the world by the body's matrix (`FUN_00308640(body+0x28, p, 1)`, translation included). The page holds both posed
 * skeletons: its own body's (`Play`'s skeleton, its palette in the actor's frame, put in the world at the simulated feet
 * and yaw as `eyeWorld` is) and each other's drawn bones (`RemotePlayers`, the bones named by their parts, as `headAt`).
 */

const I = (): Float32Array => Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
/** A row-major, row-vector translation (the part's `bindLocal` convention: the offset in the last row). */
const T = (x: number, y: number, z: number): Float32Array => Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1);

/**
 * A body of five parts: the hips 10 over the root, the neck 6 over the hips, the head 2 over the neck and 1 behind it
 * (model space: x to the right, y up, z behind) -- so in the bind pose the neck's origin is (0, 16, 0) and the head's
 * (0, 18, 1) over the feet, each the sum up the parent chain.
 */
function body(): LoadedBody {
  const part = (name: string, parent: number, local: Float32Array) => ({ name, parent, bindLocal: local, bindWorld: I(), bbox: Float32Array.of(-1, -1, -1, 1, 1, 1) });
  return {
    character: 'mp6_seal1', model: 'seal_A_des', dressedBy: 'character.rdr', textureAsset: 'sealtex',
    parts: [part('skel_root', -1, I()), part('hips', 0, T(0, 10, 0)), part('rhand', 1, I()), part('neck', 1, T(0, 6, 0)), part('head', 3, T(0, 2, 1))],
    subMeshes: [{
      textureName: null, fog: false, positions: Float32Array.of(0, 0, 0, 1, 0, 0, 0, 1, 0), normals: Float32Array.of(0, 0, 1, 0, 0, 1, 0, 0, 1),
      uvs: new Float32Array(6), indices: Uint32Array.of(0, 1, 2), skinIndex: new Uint16Array(12), skinWeight: Float32Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0),
    }],
    fittings: [], missing: [], at: null, height: 19, eye: null, carries: { rifle: null, pistol: null },
    stats: { vertices: 3, triangles: 1, parts: 5, subMeshes: 1, batches: 1, maxInfluences: 1, droppedWeight: 0, fittings: 0 },
  };
}

const state = (id: number, feet: [number, number, number], flags = BodyFlag.Alive): SpawnedBodyState => ({
  id, feet, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0,
  flags, stance: 0, landing: 0, jumps: 0,
  ground: 0, groundForward: 0, groundRight: 0, groundCls: -1, stickSnaps: 0,
  action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
  overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0,
  trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: 255, slot: 0, spawns: 1,
});

const close = (got: readonly number[] | null, want: readonly number[]): void => {
  expect(got).not.toBeNull();
  got!.forEach((v, i) => expect(v).toBeCloseTo(want[i]!, 5));
};

describe("SIGHT-POINTS: the target's point is its posed neck node (slot +0x38, FUN_005a3160, body+0x30c)", () => {
  function rig() {
    const scene = new Scene();
    const seal = body();
    const map = { body: seal, terrorist: null, types: { seal: [seal], terrorist: [seal], escortees: [] }, textures: {}, textureFlags: {} } as unknown as LoadedMap;
    const remote = new RemotePlayers(scene);
    remote.setMap(map, DEFAULT_LIGHTING, () => ({ rifle: { object: new Group(), points: [] }, pistol: { object: new Group(), points: [] } }));
    remote.setTeam(2, 'seal');
    const frame = (s: SpawnedBodyState[]): void => remote.frame(1 / 60, s, new PerspectiveCamera());
    return { remote, scene, frame };
  }

  it("RemotePlayers.neckAt is the drawn body's bone named `neck` in the world: its origin up the parent chain, at the body's feet", () => {
    const { remote, scene, frame } = rig();
    frame([state(2, [30, 4, -100])]);
    const group = scene.children.find((c) => c.name.startsWith('body '))!;
    const bone = group.getObjectByName('neck')!;
    close(remote.neckAt(2), bone.getWorldPosition(new Vector3()).toArray());
    close(remote.neckAt(2), [30, 20, -100]);                                // the feet + (0, 16, 0), the bind pose's neck
    expect(remote.neckAt(5)).toBeNull();                                   // no body: no point
  });

  it('a body not drawn (a ghost: dead with no death, never spawned) has no neck point -- the page tests no point it does not hold', () => {
    const { remote, scene, frame } = rig();
    frame([state(2, [30, 4, -100], 0)]);                                   // first seen dead, no death heard: a ghost (PF-28)
    expect(scene.children.find((c) => c.name.startsWith('body '))?.visible).toBe(false);
    expect(remote.neckAt(2)).toBeNull();
    frame([state(2, [30, 4, -100])]);                                      // alive: drawn again, its neck with it
    close(remote.neckAt(2), [30, 20, -100]);
  });
});

describe("SIGHT-POINTS: the observer's point is its own posed head node (slot +0x34, FUN_005a31c0, body+0x308)", () => {
  const snap = (feet: [number, number, number], yaw: number) => ({
    feet, yaw, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
    landing: null, jumps: 0, ground: { state: 'idle' }, action: null, turnRate: 0,
  } as unknown as PlaySnapshot);

  it("Play.nodeWorld('head') is the skeleton's head part through its posed palette, put in the world at the simulated feet and yaw", () => {
    const view = { group: new Group(), setVisible(on: boolean) { this.group.visible = on; }, place: () => undefined, setPose: () => undefined, setGearVisible: () => false, addProp: () => new Group() };
    const play = new Play();
    expect(play.nodeWorld('head')).toBeNull();                             // no body: no head
    play.setBody(view as unknown as BodyView, body());
    expect(play.nodeWorld('head')).toBeNull();                             // never played: no feet to stand it on
    let s = snap([100, 0, 50], 0);
    const walk = { snapshot: () => s, view: () => 'third' as const };
    play.frame(1 / 60, walk, new PerspectiveCamera());
    close(play.nodeWorld('head'), [100, 18, 51]);                          // (0, 18, 1) over the feet, yaw 0 faces -z
    close(play.nodeWorld('neck'), [100, 16, 50]);
    s = snap([100, 0, 50], 90);
    play.frame(1 / 60, walk, new PerspectiveCamera());
    close(play.nodeWorld('head'), [101, 18, 50]);                          // turned a quarter: behind is +x (`actorToWorld`)
    expect(play.nodeWorld('no such part')).toBeNull();
  });
});
