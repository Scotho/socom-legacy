import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import { LoopbackMatch } from '../../src/net/loopback';
import { groundGrid, packGround, PROTOCOL_VERSION, type SimMap } from '../../src/sim';

/**
 * FG-21 (the forge's NPCs): `LoopbackMatch.socketAs(id)` -- a socket onto the page's own room for a seat of its own
 * (`socket` is the page's player, SOLO_ID), so each forge NPC is a seat the room damages, kills and counts; with the
 * room's `soloSide` it joins the side the forge names.
 */
function flatMap(): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(params, [floor], owners);
  const slot = (side: 0 | 1, index: number, x: number): SpawnSlot => ({ side, index, position: [x, 0, 0], onFloor: true, step: 0, facing: [0, -1], loc: { map: 0, x: 0, z: 0 } });
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots: [slot(0, 0, -400), slot(1, 0, 400)], respawns: [], notes: [] };
}

const hello = (name: string): string => JSON.stringify({ type: 'hello', version: PROTOCOL_VERSION, name, map: 'MP99' });
const opened = async (): Promise<void> => { await Promise.resolve(); await Promise.resolve(); };

describe('FG-21: a seat of its own on the page’s room', () => {
  it('seats the id it is made for, on the side the room’s soloSide names; the player’s socket stays seat 1', async () => {
    const loop = new LoopbackMatch(flatMap(), null, { auto: false, soloSide: (id) => (id === 7 ? 'terrorist' : undefined) });
    const me = loop.socket('loopback:');
    const npc = loop.socketAs(7)('loopback:');
    await opened();
    me.send(hello('ME'));
    npc.send(hello('NPC'));
    expect(loop.room.player(1)?.team).toBe('seal');
    expect(loop.room.player(7)?.team).toBe('terrorist');
    npc.close();
    expect(loop.room.player(7)).toBeUndefined();
    loop.stop();
  });
});
