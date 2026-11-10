import { describe, expect, it } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { Hud } from '../src/hud';
import { groundGrid, packGround } from '../src/mover';
import type { MapMeta } from '../src/mapMeta';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import { encodeSnapshot } from '../src/net/codec';
import type { EnvWire, ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';
import { WorldState } from '../src/worldState';
import { decodeRecords, type ReplayRecord } from '../../match/src/replay/format';
import { ReplayClient } from '../src/replay/replayClient';
import { body, fixtureBytes, header, msOf } from './replayFixture';

/**
 * XRDS-EMBASSY-TENT, D (the owner's suspicion of 2026-11-09: "the tent doesn't destroy in spectate mode"; test only):
 * the room's world reaches a page that is not playing. A page benched by its death (classic) and a page welcomed as a
 * spectator each take a snapshot's environment -- the SEAL base's `healthy` off, its `whats_left` on, as
 * `destroy_seal_base` leaves Crossroads' hospital tent (`roomBomb.test.ts`) -- with no own body in it (`own: null`), and
 * the round's start brings the tent back (`WorldState.reset`). `envPage.test.ts`'s harness, on a synthetic hull whose two
 * nodes carry the base's paths (no game data): `whats_left` made inactive at the map's opening by a saved reference, as
 * the disc's base is, and `healthy` saved active.
 */

const BASE = 'worldmodel/seal_base/crates_hospital=crates_hospital';
const HEALTHY = `${BASE}/healthy`, LEFT = `${BASE}/whats_left`;
const HEALTHY_ID = 1, LEFT_ID = 2;

function tentWorld(): WorldState {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const poly = (path: string, ditype: number, points: number[]): WorldPoly => ({
    modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: points.length / 3, cameratype: 0, points: Float32Array.from(points),
  });
  const polys = [
    poly('worldmodel/floor', 3, [-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
    poly(HEALTHY, 2, [10, 0, -100, 10, 0, 100, 10, 50, 100, 10, 50, -100]),
    poly(LEFT, 2, [-40, 0, -100, -40, 0, 100, -40, 10, 100, -40, 10, -100]),
  ];
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: 'worldmodel', path: p.path, first: i, count: 1, flags: 0x1001 }));
  const ground = packGround(params, polys, owners);
  const paths = ['worldmodel/floor', HEALTHY, LEFT];
  const instances = paths.map((path, id) => ({ id, path, node: path.split('/').pop()!, modelName: 'worldmodel', root: path }));
  const meta: MapMeta = {
    stem: 'SYN', actions: [], instances, instanceByPath: new Map(instances.map((i) => [i.path, i.id])), diagnostics: [],
    initial: [
      { path: HEALTHY, deactivate: false, saveActive: true, saveTransform: false, saveParent: false },
      { path: LEFT, deactivate: true, saveActive: true, saveTransform: false, saveParent: false },
    ],
  };
  const world = new WorldState(meta, ground, groundGrid(ground), { visible: () => {} });
  world.applyInitial();
  return world;
}

function page() {
  const world = tentWorld();
  let socket: WebSocketLike | null = null;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setDead: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
    mode: () => 'walk',
  } as unknown as WalkMode;
  const remote = { setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined } as unknown as RemotePlayers;
  const deps: NetPageDeps = {
    walk, remote, hud: new Hud(), clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM], world: () => world,
    socket: () => {
      socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
      return socket;
    },
  };
  new NetPage(deps, 'ws://test/ws', 'SYN', 'Tester', undefined, false, 'classic');
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  let tick = 400;
  const snapshot = (env: EnvWire): void => { socket!.onmessage?.({ data: encodeSnapshot({ tick: ++tick, own: null, bodies: [], env }) } as unknown as MessageEvent); };
  return { world, server, snapshot };
}

const standing: EnvWire = { revision: 3, epoch: 2, states: [] };
const destroyed: EnvWire = { revision: 4, epoch: 2, states: [{ id: HEALTHY_ID, active: false }, { id: LEFT_ID, active: true }] };
const welcomeOf = (role: 'player' | 'spectator'): ServerEvent => ({
  type: 'welcome', id: 1, version: 11, map: 'SYN', tick: 400, role, team: role === 'player' ? 'terrorist' : null, queue: 0, name: 'Tester',
  players: role === 'player' ? [{ id: 2, name: 'Seal', team: 'seal' }] : [{ id: 2, name: 'Seal', team: 'seal' }, { id: 3, name: 'Terr', team: 'terrorist' }],
  rules: 'classic', round: 3, rounds: 11, ghost: false, epoch: 2, startTick: 300, env: standing,
} as ServerEvent);

describe('the tent falls on a page that is not playing (XRDS-EMBASSY-TENT, D)', () => {
  for (const role of ['player', 'spectator'] as const) {
    it(`${role === 'player' ? 'a player killed and benched (classic)' : 'a page welcomed as a spectator'}: a snapshot with healthy off and whats_left on hides the tent and shows its remains; the round's start brings the tent back`, () => {
      const { world, server, snapshot } = page();
      server(welcomeOf(role));
      expect([world.isActive(HEALTHY), world.isActive(LEFT)]).toEqual([true, false]);
      if (role === 'player') server({ type: 'kill', killer: 2, victim: 1, weapon: 'M4A1', how: 'weapon', clip: null } as ServerEvent);
      snapshot(destroyed);
      expect([world.isActive(HEALTHY), world.isActive(LEFT)]).toEqual([false, true]);
      server({ type: 'roundStart', round: 4, seconds: 360, wins: { seal: 1, terrorist: 2 }, rounds: 11, epoch: 3, startTick: 900 } as ServerEvent);
      expect([world.isActive(HEALTHY), world.isActive(LEFT)]).toEqual([true, false]);
    });
  }
});

describe("the tent falls in the replay viewer too (XRDS-EMBASSY-TENT, D; the replay client's snapshot path)", () => {
  it('played forward past the snapshot that names it, the tent is hidden and its remains shown; a seek before it stands it again, past it hides it', async () => {
    const world = tentWorld();
    const records: ReplayRecord[] = [{ kind: 'header', header: header({ map: 'MP72', kind: 'dedicated', session: null }) }];
    for (let tick = 0; tick <= 300; tick += 2) {
      if (tick === 0) records.push({ kind: 'players', tick, players: [{ id: 2, name: 'Seal', team: 'seal', role: 'player', char: 0 }] });
      records.push({ kind: 'snap', tick, bodies: [body(2, 0)], ...(tick === 0 ? { env: standing } : tick === 100 ? { env: destroyed } : {}) });
    }
    records.push({ kind: 'end', tick: 300, reason: 'closed' });
    const { records: rs, truncated } = decodeRecords(fixtureBytes(records));
    const h = rs[0];
    if (h?.kind !== 'header') throw new Error('no header');
    let now = 0;
    const c = new ReplayClient(Promise.resolve({ header: h.header, records: rs, truncated }), { name: 'Watcher', map: 'MP72', now: () => now, world: () => world });
    await c.ready;
    expect([world.isActive(HEALTHY), world.isActive(LEFT)]).toEqual([true, false]);
    now += msOf(150); c.advance();
    expect([world.isActive(HEALTHY), world.isActive(LEFT)]).toEqual([false, true]);
    c.seek(50);
    expect([world.isActive(HEALTHY), world.isActive(LEFT)]).toEqual([true, false]);
    c.seek(200);
    expect([world.isActive(HEALTHY), world.isActive(LEFT)]).toEqual([false, true]);
  });
});
