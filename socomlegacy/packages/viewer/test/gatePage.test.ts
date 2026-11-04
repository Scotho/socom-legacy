import { describe, expect, it } from 'vitest';
import type { GridParams, WorldPoly } from '@s2u/scene';
import { GatePage } from '../src/gatePage';
import type { GateSpec } from '../src/gates';
import { packGround } from '../src/mover';
import type { DoorWire } from '../src/net/protocol';

/**
 * MAP-07 on the page (`../src/gatePage`): the hook's view of the lever gates (`__viewer.gates()`, a test instrument: the
 * e2e `enowapiGate.spec.ts` reads it) -- each gate's node, path and the offset the page draws, following the room's
 * door tail. No program runs here.
 */

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function rig(): { page: GatePage; wire: { doors: DoorWire[] } } {
  const params: GridParams = { atomCount: 256, posts: 4, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -100, originZ: -100 };
  const poly: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/access2/gate_move2', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([0, 0, 40, 0, 30, 40, 8, 30, 40, 8, 0, 40]),
  };
  const sweep = { minX: -40, maxX: 40, minZ: -40, maxZ: 80 };
  const ground = packGround(params, [poly], [{ modelName: 'worldmodel', path: poly.path, first: 0, count: 1, sweep }]);
  const gate: GateSpec = {
    index: 0, node: 'gate_move2', path: poly.path, local: IDENTITY, parent: IDENTITY, owners: [0], sweep,
    open: [0, 35, 0], seconds: 3, levers: [],
  };
  const wire = { doors: [] as DoorWire[] };
  const page = new GatePage({ move: () => {}, net: () => ({ doors: () => wire.doors }) });
  page.setMap([gate], ground, 1);
  return { page, wire };
}

describe("the page's lever gates (MAP-07)", () => {
  it('stats names each gate and the offset drawn, shut at first and at the open end once the room says so', () => {
    const { page, wire } = rig();
    expect(page.stats()).toEqual([{ node: 'gate_move2', path: 'worldmodel/access2/gate_move2', offset: [0, 0, 0] }]);
    wire.doors = [{ valve: 0, phase: 255 }, { valve: 1, phase: 255 }];   // a door ahead of the gate, then the gate open
    page.frame(1 / 60);
    expect(page.stats()[0]!.offset).toEqual([0, 35, 0]);
  });

  it('stats is empty on a map without gates', () => {
    const page = new GatePage({ move: () => {}, net: () => null });
    page.setMap(undefined, undefined, 0);
    expect(page.stats()).toEqual([]);
  });
});
