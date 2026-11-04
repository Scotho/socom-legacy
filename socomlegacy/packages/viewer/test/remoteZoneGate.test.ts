import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, type Object3D, PerspectiveCamera, Scene } from 'three';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import {
  buildGrid, collisionOwners, parseClutter, parseSceneGraph, parseWorldRoot, placeClutter, placeInstances, worldCollision, type Grid,
} from '@s2u/scene';
import { RemotePlayers } from '../src/remotePlayers';
import { RegionCull } from '../src/regionCull';
import type { LoadedBody } from '../src/body';
import type { LoadedMap } from '../src/loadMap';
import { BodyFlag, type BodyState } from '../src/net/protocol';
import { DEFAULT_LIGHTING } from '../src/lighting';

/**
 * LATER 489 (research 329 §1.2; LATER 415's gate): the scene walk `FUN_003389c0` (D:L236069-236074, D:L236164) draws a
 * node only when its zone passes the camera's mask (`FUN_00290b80(camera, 1 << the node's zone index)`), beside its
 * `+0x5c` bit 0 and `+0x5f` bit 7 -- so a body whose zone the camera does not see is not drawn at all, not only untagged.
 * The port's one consumer: `RemotePlayers.applyZoneGate` takes a body off the render's layer 0 (its group stays active:
 * the aim, the order's pick, the muzzle and the head read it as before; no draw stamp is read on those paths).
 */

/** A body of three parts and one skinned triangle (`remoteEscortee.test.ts`'s). */
function body(model: string, character: string): LoadedBody {
  const I = Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  const part = (name: string, parent: number) => ({ name, parent, bindLocal: Float32Array.from(I), bindWorld: Float32Array.from(I), bbox: Float32Array.of(-1, -1, -1, 1, 1, 1) });
  return {
    character, model, dressedBy: 'character.rdr', textureAsset: 'sealtex',
    parts: [part('skel_root', -1), part('hips', 0), part('rhand', 1)],
    subMeshes: [{
      textureName: null, fog: false, positions: Float32Array.of(0, 0, 0, 1, 0, 0, 0, 1, 0), normals: Float32Array.of(0, 0, 1, 0, 0, 1, 0, 0, 1),
      uvs: new Float32Array(6), indices: Uint32Array.of(0, 1, 2), skinIndex: new Uint16Array(12), skinWeight: Float32Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0),
    }],
    fittings: [], missing: [], at: null, height: 19, eye: null, carries: { rifle: null, pistol: null },
    stats: { vertices: 3, triangles: 1, parts: 3, subMeshes: 1, batches: 1, maxInfluences: 1, droppedWeight: 0, fittings: 0 },
  };
}

const state = (id: number, feet: [number, number, number]): BodyState => ({
  id, feet, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0,
  flags: BodyFlag.Alive, stance: 0, landing: 0, jumps: 0,
  ground: 0, groundForward: 0, groundRight: 0, groundCls: -1, stickSnaps: 0,
  action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
  overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0,
  trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: 255, slot: 0,
});

function rig(feet: Record<number, [number, number, number]>) {
  const scene = new Scene();
  const seal = body('seal_A_des', 'mp6_seal1');
  const map = { body: seal, terrorist: null, types: { seal: [seal], terrorist: [], escortees: [] }, textures: {}, textureFlags: {} } as unknown as LoadedMap;
  const remote = new RemotePlayers(scene);
  // The review's F6: a real mesh in the rifle's slot, so a hung kit is among what the gate takes off.
  const kit = (name: string): Group => { const g = new Group(); const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()); m.name = name; g.add(m); return g; };
  remote.setMap(map, DEFAULT_LIGHTING, () => ({ rifle: { object: kit('kit-rifle'), points: [] }, pistol: { object: kit('kit-pistol'), points: [] } }));
  const ids = Object.keys(feet).map(Number);
  for (const id of ids) remote.setTeam(id, 'seal');
  remote.frame(1 / 60, ids.map((id) => state(id, feet[id]!)), new PerspectiveCamera());
  const meshes = (id: number): Object3D[] => {
    const g = scene.children.filter((c) => c.name.startsWith('body '))[ids.indexOf(id)]!;
    const out: Object3D[] = [];
    g.traverse((o) => { if (o instanceof Mesh) out.push(o); });
    return out;
  };
  const group = (id: number): Object3D => scene.children.filter((c) => c.name.startsWith('body '))[ids.indexOf(id)]!;
  return { remote, meshes, group };
}
const drawnOn0 = (os: Object3D[]): boolean[] => [...new Set(os.map((o) => o.layers.isEnabled(0)))];

describe('LATER 489: the bodies drawn by the region gate (RemotePlayers.applyZoneGate)', () => {
  it('a body its zone leaves undrawn leaves the render (layer 0), its group still active; the gate lifted, it is back', () => {
    const { remote, meshes, group } = rig({ 2: [0, 0, -100], 3: [10, 0, -100] });
    expect(remote.ids().sort()).toEqual([2, 3]);
    const head = remote.headAt(2), feet = remote.feet(2);
    remote.applyZoneGate((id) => id !== 2);
    expect(meshes(2).length).toBeGreaterThan(0);
    expect(drawnOn0(meshes(2))).toEqual([false]);
    expect(drawnOn0(meshes(3))).toEqual([true]);
    expect(group(2).visible).toBe(true);                    // the aim, the pick, the muzzle and the head read it
    expect([remote.headAt(2), remote.feet(2)]).toEqual([head, feet]);   // the tag's anchor and the feet read as before
    remote.applyZoneGate(null);
    expect(drawnOn0(meshes(2))).toEqual([true]);
  });

  it("the review's F6: a hung kit's mesh goes with its body, and a mesh attached after a gated call is off at the next", () => {
    const { remote, meshes, group } = rig({ 2: [0, 0, -100], 3: [10, 0, -100] });
    remote.applyZoneGate((id) => id !== 2);
    const kitMeshes = meshes(2).filter((m) => m.name.startsWith('kit-'));
    expect(kitMeshes.length).toBeGreaterThan(0);                        // the rifle (or the sidearm) hung on the body
    expect(drawnOn0(kitMeshes)).toEqual([false]);
    const late = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    group(2).add(late);                                                 // a re-hung kit, a raised launcher (cloneHeld)
    expect(late.layers.isEnabled(0)).toBe(true);
    remote.applyZoneGate((id) => id !== 2);
    expect(late.layers.isEnabled(0)).toBe(false);
  });

  it("the review's F1: on both pages the gate's frame and applyZoneGate come before the frame's render", () => {
    const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf8');
    const main = src('main.ts'), mount = src('matchMount.ts');
    const before = (s: string, a: string, b: string): boolean => s.indexOf(a) >= 0 && s.indexOf(b) >= 0 && s.indexOf(a) < s.indexOf(b);
    expect(before(main, 'regionCull.frame(', 'charShadow.frame(created.renderer')).toBe(true);
    expect(before(main, 'remote.applyZoneGate(', 'charShadow.frame(created.renderer')).toBe(true);
    expect(before(mount, 'regionCull.frame(', 'renderer.render(scene, fly.camera)')).toBe(true);
    expect(before(mount, 'remote.applyZoneGate(', 'renderer.render(scene, fly.camera)')).toBe(true);
  });

});

const DISC = process.env.SOCOM_DISC;
const MP11 = !!DISC && existsSync(resolve(DISC, 'RUN/MP11.ZDB'));
function mp11(): Grid {
  const bytes = new Uint8Array(readFileSync(resolve(DISC!, 'RUN/MP11.ZDB')));
  const toc = parseZdb(bytes);
  const zar = (s: string): Zar => Zar.parse(zdbMember(bytes, toc, s));
  const models = parseSceneGraph(zar('MP11_GEO.ZED'));
  return buildGrid(parseWorldRoot(zar('MP11.ZED')).grid, placeInstances(models), placeClutter(models, parseClutter(zar('CLUTTER.ZAR'))).placed,
    worldCollision(models), collisionOwners(models));
}

describe.skipIf(!MP11)(`LATER 489 on MP11's hull${MP11 ? '' : ' (SOCOM_DISC with RUN/MP11.ZDB absent: skipped)'}`, () => {
  it("415's staging: the teammate whose zone the viewer's new region does not see is not drawn; the one behind a wall is", () => {
    const g = mp11();
    const mate: [number, number, number] = [540, -99.81, 260], walled: [number, number, number] = [780, -100, 320];
    const { remote, meshes } = rig({ 2: mate, 3: walled });
    const c = new RegionCull();
    const bodies = remote.ids().map((id) => ({ id, feet: remote.feet(id) }));
    c.frame(g, { viewed: [680, -98.38, 300], eye: [680, -73.38, 300], spectator: false, bodies });
    remote.applyZoneGate((id) => c.drawn(id));
    expect(drawnOn0(meshes(2))).toEqual([true]);
    c.frame(g, { viewed: [960, -140, 380], eye: [960, -115, 380], spectator: false, bodies });
    remote.applyZoneGate((id) => c.drawn(id));
    expect(drawnOn0(meshes(2))).toEqual([false]);
    expect(drawnOn0(meshes(3))).toEqual([true]);
  });
});
