import { describe, expect, it } from 'vitest';
import { itemClass, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { reloadDelayOf } from '../../src/firearms';
import { LoopbackMatch } from '../../src/net/loopback';
import { netRefills } from '../../src/net/netRefill';
import { groundGrid, packGround, type SimMap } from '../../src/sim';
import type { NpcMarker } from '../../src/forge/layout';
import { seatSlots } from '../../src/forge/matchMap';
import {
  ForgeNpcs, lookStep, NPC_OPENING_TICKS, NPC_PITCH_STEP_DEG, NPC_SEAT_BASE, NPC_YAW_STEP_DEG, PLAYER_SEAT, playerSideOf, soloSideOf,
} from '../../src/forge/npcs';

/**
 * FG-21 (the owner, 2026-10-13: "add hostile npcs as a new entity type that can die in play mode"): the forge's NPCs --
 * seats of the page's own room on their markers' sides, driven by FORGE_HOSTILE_DRIVER_ADAPTATION (turn by the stick's
 * law onto a foe in sight, fire down the look); the room alone decides their rounds and their deaths.
 */
const npc = (side: NpcMarker['side'], x: number, yaw = 0): NpcMarker => ({ side, type: 0, p: [x, 0, 0], yaw });

function flatMap(slots: SimMap['slots']): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(params, [floor], owners);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: slots, notes: [] };
}

describe('FG-21: the sides', () => {
  it('seats the player opposite most NPCs, a SEAL with none or a tie; each NPC on its marker\'s side', () => {
    expect(playerSideOf([])).toBe('seal');
    expect(playerSideOf([npc('terrorist', 0), npc('seal', 0)])).toBe('seal');
    expect(playerSideOf([npc('seal', 0), npc('seal', 0), npc('terrorist', 0)])).toBe('terrorist');
    const side = soloSideOf([npc('terrorist', 0), npc('seal', 0)]);
    expect([PLAYER_SEAT, NPC_SEAT_BASE, NPC_SEAT_BASE + 1, NPC_SEAT_BASE + 2].map(side)).toEqual(['seal', 'terrorist', 'seal', undefined]);
  });
});

describe('FG-21: the look by the stick\'s law', () => {
  it('turns at most the full stick a tick the short way, and holds once there', () => {
    const s = lookStep({ yaw: 350, pitch: 0 }, { yaw: 90, pitch: 30 });
    expect(s.yaw).toBeCloseTo((350 + NPC_YAW_STEP_DEG) % 360);
    expect(s.pitch).toBeCloseTo(NPC_PITCH_STEP_DEG);
    expect(s.turn).toBeGreaterThan(0);
    expect(s.holds).toBe(false);
    const near = lookStep({ yaw: 10, pitch: 1 }, { yaw: 10.5, pitch: 1.2 });
    expect([near.yaw, near.pitch, near.holds]).toEqual([10.5, 1.2, true]);
  });
});

describe('FG-21: each NPC on its own marker at the round start', () => {
  const start = (side: 0 | 1, x: number) => ({ side, index: 0, position: [x, 0, 0] as [number, number, number], onFloor: true, step: 0, facing: [0, -1] as [number, number], loc: { map: 0, x: 0, z: 0 } });
  it('gives a side with NPCs one slot per client index: the player\'s start at 0, NPC i\'s marker at i + 1', () => {
    const slots = seatSlots([start(0, -500), start(1, 500)], [npc('terrorist', 100, -Math.PI / 2), npc('terrorist', 200), npc('seal', 300)], 'seal');
    const seal = slots.filter((s) => s.side === 0).sort((a, b) => a.index - b.index);
    const terr = slots.filter((s) => s.side === 1).sort((a, b) => a.index - b.index);
    expect(seal.map((s) => s.position[0])).toEqual([-500, -500, -500, 300]);
    expect(terr.map((s) => [s.index, s.position[0]])).toEqual([[0, 500], [1, 100], [2, 200]]);
    expect(terr[1]!.step).toBe(2);
    expect(seatSlots([start(0, -500)], [], 'seal')).toEqual([start(0, -500)]);
  });
});

describe('FG-21: NPCs in the page\'s room', () => {
  it('turn onto each other, fire, and the room kills one', async () => {
    const markers = [npc('terrorist', 300, Math.PI / 2), npc('seal', -300, -Math.PI / 2)];
    const map = flatMap(seatSlots([], markers, 'seal'));
    const loop = new LoopbackMatch(map, null, { auto: false, soloSide: soloSideOf(markers), launchCountdownS: 0 });
    const npcs = new ForgeNpcs(loop, markers, map, () => 0.5);
    const kills: number[] = [];
    let tick = 0, spawnAt = -1, firstFire = -1;
    npcs.npcs[0]!.client.on((ev) => {
      if (ev.type === 'kill') kills.push(ev.victim);
      if (ev.type === 'spawn' && ev.id === npcs.npcs[0]!.id) spawnAt = tick;
    });
    const client = npcs.npcs[0]!.client;
    const send = client.send.bind(client);
    client.send = (ev) => { if (ev.type === 'fire' && firstFire < 0) firstFire = tick; send(ev); };
    for (let i = 0; i < 4; i++) await Promise.resolve();
    const ids = npcs.npcs.map((n) => n.id);
    expect(ids.map((id) => loop.room.player(id)?.team)).toEqual(['terrorist', 'seal']);
    for (let t = 0; t < 60 * 30 && kills.length === 0; t++) {
      tick = t;
      loop.step();
      npcs.step();
      await Promise.resolve();
      await Promise.resolve();
    }
    // Each stood on its own marker (the classic start's slot by its client index), facing the other.
    expect(ids.map((id) => Math.round(loop.room.player(id)!.sim.walker.state.x))).toEqual([300, -300]);
    expect(loop.room.stats().round).toBe(1);
    expect(spawnAt).toBeGreaterThanOrEqual(0);
    expect(firstFire - spawnAt).toBeGreaterThanOrEqual(NPC_OPENING_TICKS - 1);   // no round in the opening
    expect(kills.length).toBeGreaterThan(0);
    expect(ids).toContain(kills[0]);
    expect(loop.room.player(kills[0]!)?.alive).toBe(false);
    npcs.close();
    loop.stop();
  });
});

/**
 * FG-42: an NPC's reload follows the room's own rule -- the walk's next magazine (`MagazineRing.canReload`), or the
 * network refill (`../../src/net/netRefill` `netRefills`, NET-REFILL, the room's `reload`) under the room's rules. Two
 * NPCs on opposite markers; the first's ring emptied once both are seated in a round, and only the NPCs stepped (inside
 * the opening, so no round is fired) for longer than its record's ReloadDelay.
 */
async function reloadsSentWhenDry(opts: { rules: 'respawn' | 'classic' }): Promise<{ sent: string[]; id: number }> {
  const markers = [npc('terrorist', 300, Math.PI / 2), npc('seal', -300, -Math.PI / 2)];
  const map = flatMap(seatSlots([], markers, 'seal'));
  const loop = new LoopbackMatch(map, null, { auto: false, soloSide: soloSideOf(markers), launchCountdownS: 0, rules: opts.rules, respawnRules: opts.rules === 'respawn' });
  const npcs = new ForgeNpcs(loop, markers, map, () => 0.5);
  const first = npcs.npcs[0]!;
  const sent: string[] = [];
  const send = first.client.send.bind(first.client);
  first.client.send = (ev) => { sent.push(ev.type); send(ev); };
  for (let i = 0; i < 4; i++) await Promise.resolve();
  const alive = () => npcs.npcs.every((n) => loop.room.player(n.id)?.alive === true && n.client.role === 'player');
  for (let t = 0; t < 60 * 20 && !alive(); t++) { loop.step(); npcs.step(); await Promise.resolve(); await Promise.resolve(); }
  expect(alive()).toBe(true);
  expect(loop.room.rules).toBe(opts.rules);
  const self = loop.room.player(first.id)!;
  self.mags[0].restore({ slots: new Array<number>(10).fill(0), current: 0 });     // dry, and no other magazine
  expect(self.mags[0].canReload()).toBe(false);
  sent.length = 0;
  const ticks = Math.ceil(reloadDelayOf(self.records[0]) * 60) + 30;
  expect(ticks).toBeLessThan(NPC_OPENING_TICKS);
  for (let t = 0; t < ticks; t++) { npcs.step(); await Promise.resolve(); }
  const id = self.records[0].id;
  npcs.close();
  loop.stop();
  return { sent, id };
}

describe('FG-42: an NPC fired dry reloads as the room\'s rules refill', () => {
  it('in a respawn room, its primary refilled by the network rule (no other magazine), it asks for a reload', async () => {
    const { sent, id } = await reloadsSentWhenDry({ rules: 'respawn' });
    expect(itemClass(id)).not.toBe('pistol');
    expect(netRefills(id, { respawn: true })).toBe(true);
    expect(sent).toContain('reload');
  });

  it('in a classic room with a rifle, which the refill does not reach, it does not', async () => {
    const { sent, id } = await reloadsSentWhenDry({ rules: 'classic' });
    expect(netRefills(id, { respawn: false })).toBe(false);
    expect(sent).not.toContain('reload');
  });
});

describe('FG-21: an NPC\'s marker in the editor', () => {
  it('is tagged with its side and type, found from its figure, and frees the figure with itself', async () => {
    const { Group } = await import('three');
    const { forgeRootOf, npcMarker } = await import('../../src/forge/pieces');
    let freed = 0;
    const figure = new Group();
    const child = new Group();
    figure.add(child);
    const m = npcMarker('terrorist', 2, { group: figure, dispose: () => { freed++; } });
    expect(m.userData['forgeNpc']).toEqual({ side: 'terrorist', type: 2 });
    expect(forgeRootOf(child)).toBe(m);
    (m.userData['dispose'] as () => void)();
    expect(freed).toBe(1);
    const post = npcMarker('seal', 0, null);
    expect(post.children.length).toBe(3);                    // ring, arrow and the stand-in post
  });
});

describe('FG-21: the seats the room holds', () => {
  it('keeps 8 a side with the player among them and 16 in all, in the layout\'s order; the rest counted', async () => {
    const { npcsThatFit } = await import('../../src/forge/npcs');
    const ten = Array.from({ length: 10 }, (_, i) => npc('terrorist', i));
    const a = npcsThatFit(ten, 'seal');
    expect([a.kept.length, a.dropped]).toEqual([8, 2]);
    expect(a.kept[7]!.p[0]).toBe(7);
    const mixed = [...Array.from({ length: 9 }, (_, i) => npc('seal', i)), ...ten];
    const b = npcsThatFit(mixed, 'seal');
    expect(b.kept.filter((n) => n.side === 'seal').length).toBe(7);    // the player is the side's eighth
    expect(b.kept.filter((n) => n.side === 'terrorist').length).toBe(8);
    expect(b.dropped).toBe(4);
  });

  it('FG-24: seats no more than the layout\'s players setting, the player among them; above 16, the room\'s 16 still', async () => {
    const { npcsThatFit } = await import('../../src/forge/npcs');
    const six = Array.from({ length: 6 }, (_, i) => npc(i % 2 ? 'seal' : 'terrorist', i));
    expect(npcsThatFit(six, 'seal', 4).kept.length).toBe(3);
    expect(npcsThatFit(six, 'seal', 4).dropped).toBe(3);
    const twenty = [...Array.from({ length: 10 }, (_, i) => npc('seal', i)), ...Array.from({ length: 10 }, (_, i) => npc('terrorist', i))];
    expect(npcsThatFit(twenty, 'seal', 32).kept.length).toBe(15);    // 7 + 8 beside the player: the lobby's sides
  });
});

describe('FG-21: with the page\'s own room options (its launch countdown)', () => {
  it('stands the player on its spawn and the NPC on its marker once round 1 begins', async () => {
    const { slotsOfSpawns } = await import('../../src/forge/matchMap');
    const markers = [npc('terrorist', 400, Math.PI)];
    const spawnsOnly = slotsOfSpawns([{ team: 'A', p: [-400, 0, 0], yaw: 0 }]);
    const both = [...spawnsOnly, ...spawnsOnly.map((s, i) => ({ ...s, side: 1 as const, index: i }))];  // composeMatchMap's copy
    const map = flatMap(seatSlots(both, markers, 'seal'));
    const loop = new LoopbackMatch(map, null, { auto: false, soloSide: soloSideOf(markers) });
    const me = loop.socket('loopback:');
    for (let i = 0; i < 2; i++) await Promise.resolve();
    me.send(JSON.stringify({ type: 'hello', version: (await import('../../src/sim')).PROTOCOL_VERSION, name: 'ME', map: 'MP99' }));
    const npcs = new ForgeNpcs(loop, markers, map, () => 0.5);
    for (let i = 0; i < 4; i++) await Promise.resolve();
    let t = 0;
    for (; t < 60 * 20 && loop.room.stats().round < 1; t++) { loop.step(); npcs.step(); await Promise.resolve(); }
    for (let i = 0; i < 5; i++) { loop.step(); await Promise.resolve(); }
    const x = (id: number) => Math.round(loop.room.player(id)!.sim.walker.state.x);
    expect(loop.room.stats().round).toBe(1);
    expect([x(PLAYER_SEAT), x(NPC_SEAT_BASE)]).toEqual([-400, 400]);
    npcs.close();
    loop.stop();
  });
});
