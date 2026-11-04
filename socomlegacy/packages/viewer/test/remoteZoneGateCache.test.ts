import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Layers, Mesh, MeshBasicMaterial, type Object3D, PerspectiveCamera, Scene } from 'three';
import { RemotePlayers, type SpawnedBodyState } from '../src/remotePlayers';
import type { LoadedBody } from '../src/body';
import type { LoadedMap } from '../src/loadMap';
import { BodyFlag } from '../src/net/protocol';
import { DEFAULT_LIGHTING } from '../src/lighting';

/**
 * CPS bodies (the client performance sprint's Log, 2026-11-03T02:52Z (B); a product-track adaptation: the same layers,
 * the game's behaviour unchanged): `RemotePlayers.applyZoneGate` walks a body's objects only when its verdict or its
 * object tree changed since the walk last laid it -- 0.10 ms a body a frame in a 16-seat match, every frame, before.
 * The reference is the old walk's own rule: after every call, every object of a body holds layer 0 exactly when the
 * body's latest verdict was "drawn" (null: every body drawn), and no other bit of any object's mask moves.
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

/** Every object of every body: layer 0 exactly where its body's verdict is "drawn". */
function expectLayers(groups: Object3D[], drawn: (index: number) => boolean): void {
  groups.forEach((g, index) => {
    const on = drawn(index);
    let n = 0;
    g.traverse((o) => { n++; expect(o.layers.isEnabled(0), `${g.name}/${o.name || o.type}`).toBe(on); });
    expect(n).toBeGreaterThan(3);
  });
}

describe('CPS bodies (a): the zone gate walks a body only when its verdict or its tree changes', () => {
  it('the same layers as the walk every frame over a scripted run; no layer written when nothing changed', () => {
    const { remote, frame, groups } = rig();
    const enable = vi.spyOn(Layers.prototype, 'enable');
    const disable = vi.spyOn(Layers.prototype, 'disable');
    const writes = (): number => enable.mock.calls.length + disable.mock.calls.length;
    const marked = groups()[0]!.children[0]!;
    marked.layers.enable(3);                                   // a bit beside layer 0 (the shadow's, say) stays put
    let asked = 0;
    const gate = (off: number) => (id: number): boolean => { asked++; return id !== off; };

    remote.applyZoneGate(gate(2));
    expectLayers(groups(), (i) => i !== 0);
    expect(asked).toBe(3);                                     // the verdict is asked of every body, every call

    let before = writes();
    remote.applyZoneGate(gate(2));                             // nothing changed: no walk
    frame();
    remote.applyZoneGate(gate(2));
    expect(writes() - before).toBe(0);
    expect(asked).toBe(9);
    expectLayers(groups(), (i) => i !== 0);

    before = writes();
    remote.applyZoneGate(gate(3));                             // two bodies' verdicts change: those two are walked
    expect(writes() - before).toBeGreaterThan(0);
    expectLayers(groups(), (i) => i !== 1);
    expect(marked.layers.isEnabled(3)).toBe(true);

    // A mesh hung deep in an undrawn body (a launcher on its node, an effect light's overlay beside a mesh) after a call.
    const bone = groups()[1]!.getObjectByName('rhand')!;
    const late = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    bone.add(late);
    expect(late.layers.isEnabled(0)).toBe(true);
    remote.applyZoneGate(gate(3));
    expect(late.layers.isEnabled(0)).toBe(false);
    expectLayers(groups(), (i) => i !== 1);
    // Taken off and hung again under another node of the same body: walked again.
    late.removeFromParent();
    late.layers.enable(0);
    groups()[1]!.getObjectByName('head')!.add(late);
    remote.applyZoneGate(gate(3));
    expect(late.layers.isEnabled(0)).toBe(false);

    // The gear rebuilt (a new kit: the old firearms off, new clones on) on the undrawn body.
    remote.setKit(3, [1, 2, 3, 4, 5]);
    remote.applyZoneGate(gate(3));
    expectLayers(groups(), (i) => i !== 1);

    // A respawn (the play rebuilt), then the gate lifted, then the same null again.
    frame(2);
    remote.applyZoneGate(gate(3));
    expectLayers(groups(), (i) => i !== 1);
    remote.applyZoneGate(null);
    expectLayers(groups(), () => true);
    before = writes();
    remote.applyZoneGate(null);
    expect(writes() - before).toBe(0);

    // A body rebuilt whole (its side changed: removed, then built again at the next frame) is laid at the next call.
    remote.applyZoneGate(gate(4));
    remote.setTeam(4, 'terrorist');
    frame(2);
    remote.applyZoneGate(gate(4));
    expect(remote.bodySide(4)).toBe('terrorist');
    const g4 = groups()[groups().length - 1]!;                  // the scene's newest body: 4's, built again
    g4.traverse((o) => expect(o.layers.isEnabled(0)).toBe(false));
    enable.mockRestore();
    disable.mockRestore();
  });
});
