// XBOX-GRENADE-ARCS (the Xbox lightweight fork, imbennyhim's; product track): "no nade arcs" in Lite (a player's report,
// 2026-11-18). The fork draws the held throw's arc since a3960fc592 (`../src/xboxPrototype/walkingGrenades` `writeArc`,
// the core's `arcDrawing` -- `../src/grenadeCore` `drawArc`, the standard engine's rule). This pins it for each hand
// throwable: while one is held, the arc's segments are there and are written into the frame's triangles.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { AN_M8, buildGrid, HE, M67, MARK141, type CollisionOwner, type GridParams, type ThrowableRecord, type WorldPoly } from '@s2u/scene';
import { walkingGrenades } from '../src/xboxPrototype/walkingGrenades';
import { EffectMeshFrame } from '../src/xboxPrototype/particleStyle';

function deck() {
  const poly: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/deck', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, 1000, 1000, 0, 1000, 1000, 0, -1000, -1000, 0, -1000]),
  };
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 1000, cellsX: 4, cellsZ: 4, originX: -2000, originZ: -2000 };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/deck0', first: 0, count: 1 }];
  return buildGrid(params, [], [], [poly], owners);
}
const snap = { feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null, jumps: 0 } as never;
const frames = (g: { frame(dt: number, real: number): void }, seconds: number): void => { for (let t = 0; t < seconds - 1e-9; t += 1 / 30) g.frame(1 / 30, 1 / 30); };

function held(record: ThrowableRecord, viewState = 0) {
  const grid = deck(), client = { state: 'open', role: 'player', lastSeq: () => 1, send: () => {} };
  const grenades = walkingGrenades({ table: null, models: [record.model], grid: () => grid, hull: () => grid, snapshot: () => snap, view: () => 'third' as never,
    feet: () => [0, 0, 0], dead: () => false, fly: { shakeScreen: () => {} }, effects: null, sound: () => {}, ownId: () => 1,
    own: {
      play: { partPoint: () => [2, 12, -8] }, walk: { hold: () => true, fireAim: () => null, fireAllowed: () => true, mode: () => 'walk' } as never,
      pose: { start: () => true, cut: () => {}, released: () => {}, letGo: () => {} } as never,
      client: () => client as never, loadout: () => [0, 0, record.id, 0, 0] as never, pistol: () => false, viewState: () => viewState, handSeq: (s) => s,
      suspendFirearm: () => {}, hand: () => null,
    } });
  grenades.spawn();
  expect(grenades.kit.selectEquipment(1)).toBe(true);
  grenades.trigger(true); frames(grenades, 1);                       // held, not let go
  return grenades;
}

describe('the lightweight match: the held throw\'s arc', () => {
  for (const record of [M67, HE, AN_M8, MARK141]) {
    it(`${record.name}: held, its arc is there and written into the frame's triangles`, () => {
      const grenades = held(record);
      const segments = grenades.report().arcSegments;
      expect(segments).toBeGreaterThan(0);
      const frame = new EffectMeshFrame(), camera = new PerspectiveCamera(60, 640 / 448, 1, 10000);
      camera.position.set(0, 20, 40); camera.updateMatrixWorld();
      frame.begin(); grenades.writeArc(frame, camera);
      expect(frame.vertexCount).toBe(segments * 4);                  // a ribbon quad a segment
      expect(frame.indexCount).toBe(segments * 6);
      expect(frame.dropped).toBe(0);
      // Review: what is written is a drawn ribbon, not only its count -- finite corners, and some segment not clear.
      const written = frame.vertices.subarray(0, segments * 4 * 9);
      expect(written.every(Number.isFinite)).toBe(true);
      expect(Array.from({ length: segments * 4 }, (_, v) => written[v * 9 + 8]!).some(a => a > 0)).toBe(true);
      grenades.dispose();
    });
  }

  it('is not drawn through a scope (view state 4 and up), as the standard engine\'s rule', () => {
    const grenades = held(M67, 4);
    expect(grenades.report().phase).toBe('holding');                   // review: held, so the scope rule alone hides it
    expect(grenades.report().arcSegments).toBe(0);
    grenades.dispose();
  });
});
