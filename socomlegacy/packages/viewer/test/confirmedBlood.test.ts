import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import { HELD_RIFLE, HELD_SIDEARM, materialTable } from '@s2u/scene';
import { Effects } from '../src/effects';
import { effectsFromDisc, type EffectData } from '../src/effectData';
import { Hud } from '../src/hud';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { FireEvent } from '../src/fire';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';

/**
 * The blood on a hit, seen by every page (INT-NET-2; research 91 section 23). Ported from Chris's browser-beta-v5
 * (`chris/browser-beta-integration` d578f347: `packages/viewer/test/confirmedBlood.test.ts`), re-expressed on the
 * original's own route: the round's impact by the struck node's material (`FUN_003c8920`, the name by `FUN_003c4700`),
 * a body's being `PERSON` (`DAT_003e14f8`), carried on our `shot` -- not on his health-carrying combat event. His rules
 * hold: from the room's hit only (never predicted), one impact per shot event, none for a miss. His "no blood when no
 * damage" does not: the original plays the impact with no test of the damage (L319418-319500).
 */

const PERSON = materialTable().findIndex((m) => m.name === 'PERSON');
type Round = Extract<FireEvent, { type: 'round' }>;

function page() {
  let socket: WebSocketLike | null = null;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
    mode: () => 'walk',
  } as unknown as WalkMode;
  const remote = { setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined } as unknown as RemotePlayers;
  const rounds: [Round, number][] = [], impacts: Round[] = [];
  const deps: NetPageDeps = {
    walk, remote, hud: new Hud(), clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    roundEffects: (e, id) => { rounds.push([e, id]); },
    roundImpact: (e) => { impacts.push(e); },
    socket: () => {
      socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
      return socket;
    },
  };
  new NetPage(deps, 'ws://test/ws', 'MP2', 'Tester', undefined, false, 'classic');
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  server({
    type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
    players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
  } as ServerEvent);
  return { server, rounds, impacts };
}

/** A tracer weapon (the M4A1): `HELD_RIFLE`, the M4A1 SD (62), is TRACERLESS and never draws one (`tracerRound`). */
const M4A1 = 54;

const bodyShot = (id: number): ServerEvent => ({
  type: 'shot', id, weapon: HELD_RIFLE.id, from: [0, 20, 0], to: [57.6, 20, 0], normal: [-1, 0, 0], material: PERSON, body: 2,
});

describe('the room\'s body hit on the page (the shot carries PERSON)', () => {
  it('another player\'s round into a body: its whole round, the impact on the PERSON material, once per shot', () => {
    const { server, rounds, impacts } = page();
    server(bodyShot(3));
    expect(rounds).toHaveLength(1);
    expect(rounds[0]![1]).toBe(3);
    expect(rounds[0]![0]).toMatchObject({ hit: true, material: PERSON, normal: [-1, 0, 0], to: [57.6, 20, 0] });
    expect(impacts).toEqual([]);
  });

  it('the page\'s own round into a body (the room\'s `impact`): the impact alone -- no second muzzle, tracer or report -- once', () => {
    const { server, rounds, impacts } = page();
    server({ ...bodyShot(1), type: 'impact' } as ServerEvent);
    expect(rounds).toEqual([]);
    expect(impacts).toHaveLength(1);
    expect(impacts[0]).toMatchObject({ hit: true, material: PERSON, normal: [-1, 0, 0], to: [57.6, 20, 0] });
  });

  // Review finding 1: the shooter's impact is its own event, never a `shot` of the page's own id -- which a page of
  // protocol 9 built before it would draw as another player's round. A `shot` of the page's own id plays nothing.
  it('a shot of the page\'s own id, a body named or not, plays nothing (the impact comes as `impact`)', () => {
    const { server, rounds, impacts } = page();
    server(bodyShot(1));
    expect([rounds, impacts]).toEqual([[], []]);
  });

  // Review finding 3 (round 2): the room sends `impact` to the shooter alone; one naming another id is not this page's.
  it('an impact naming another player\'s id plays nothing (never this page\'s own impact)', () => {
    const { server, rounds, impacts } = page();
    server({ ...bodyShot(3), type: 'impact' } as ServerEvent);
    expect([rounds, impacts]).toEqual([[], []]);
  });

  // P12 (SW-3; research 91 section 23, 219 s3.2): every console walks the round and plays an impact at each surface it
  // strikes (`FUN_003c8920` D:L319497-319500), so the room's `shot` names the others besides its end (`through`, additive;
  // SHOT_EVENT_THROUGH_READING). The page replays one impact per entry -- no second muzzle, tracer or report: the impact
  // alone (`roundImpact`), as the shooter's own page plays its through-surfaces (`./matchFirearm`).
  it('another player\'s round with `through`: its whole round once, then one impact per entry, each the entry\'s point, normal and material, with no tracer', () => {
    const { server, rounds, impacts } = page();
    const CHAINLINK = materialTable().findIndex((m) => m.name === 'CHAINLINK_FENCE');
    for (let i = 0; i < 4; i++) {
      server({
        ...bodyShot(3), weapon: M4A1,                                               // the fourth round draws a tracer
        through: [
          { point: [80, 20, 0], normal: [-1, 0, 0], material: CHAINLINK },
          { point: [120, 20, 0], normal: [-1, 0, 0], material: 7 },
        ],
      } as ServerEvent);
    }
    expect(rounds).toHaveLength(4);                                               // one whole round a shot
    expect(rounds.map(([e, id]) => [e.to, id])).toEqual(Array(4).fill([[57.6, 20, 0], 3]));   // each at the shot's end
    expect(impacts).toHaveLength(8);                                              // two impacts a shot
    expect(impacts.slice(0, 2)).toMatchObject([
      { hit: true, from: [0, 20, 0], to: [80, 20, 0], normal: [-1, 0, 0], material: CHAINLINK },
      { hit: true, from: [0, 20, 0], to: [120, 20, 0], normal: [-1, 0, 0], material: 7 },
    ]);
    expect(rounds.filter(([e]) => e.tracer)).toHaveLength(1);                     // the shot's own tracer: the fourth round's
    for (const e of impacts) expect([e.tracer, e.tracerKind, e.tracerTo]).toEqual([undefined, undefined, undefined]);
  });

  it('a `through` on the page\'s own `impact`, or on its own `shot`, plays no second impact (its own walk drew them)', () => {
    const { server, rounds, impacts } = page();
    const through = [{ point: [80, 20, 0], normal: [-1, 0, 0], material: 7 }];
    server({ ...bodyShot(1), type: 'impact', through } as unknown as ServerEvent);
    server({ ...bodyShot(1), through } as ServerEvent);
    expect(rounds).toEqual([]);
    expect(impacts).toHaveLength(1);
    expect(impacts[0]).toMatchObject({ to: [57.6, 20, 0], material: PERSON });
  });

  // P12b (P12's owed tracer half; research 219 s3.2, 91 s23; match `room.ts` SHOT_EVENT_BODIES_READING): `to` is the
  // first body (its blood, the body hit), so the tracer flew muzzle -> body while P12's impacts played on the wall past
  // it. Every console walks the round to its end (`FUN_003c8920`), and the shooter's own page draws its tracer to the
  // round's end: the room's `shot` names that end (`end`, additive) when it is not `to`, and the page's tracer runs to
  // it -- the round's impact, its normal and material stay `to`'s. The tracer is drawn through the page's `Effects`.
  const tracerFx = (): Effects => {
    const fx = new Effects(() => 0.5, () => {});
    const wait = { name: 's0', activation: 1, ops: [{ op: 'wait' as const, seconds: 60, range: 0, frames: null }] };
    fx.setData({
      archive: 'T', textures: [], absent: [], materials: ['UNKNOWN'], defaultMaterial: 0, marks: [], footprints: [],
      ambient: [], sceneNodes: [], hitAnims: [], missing: [], models: [],
      programs: ['tracer_ally_anim', 'tracer_enemy_anim'].map((name) => ({ name, root: 0, flags: 0, nodes: ['NA'], sequences: [wait] })),
    } as EffectData);
    fx.holdTracers(true);                                                        // the dev instrument: each tracer at its end
    return fx;
  };
  const BODY: [number, number, number] = [100, 20, 0], WALL: [number, number, number] = [160, 20, 0];
  const drawn = (end?: [number, number, number]) => {
    const { server, rounds, impacts } = page();
    for (let i = 0; i < 4; i++) {                                                // the fourth round is the tracer's (every fourth)
      server({ ...bodyShot(3), weapon: M4A1, to: BODY, ...(end ? { end, through: [{ point: end, normal: [-1, 0, 0], material: 7 }] } : {}) } as ServerEvent);
    }
    const fx = tracerFx();
    for (const [e] of rounds) fx.onRound(e, null, false);
    // The `through` impacts, as the page plays them (`roundImpact` -> `onRound`): the impact alone, never a second tracer.
    for (const e of impacts) {
      expect([e.tracer, e.tracerTo]).toEqual([undefined, undefined]);
      fx.onRound(e, null, false);
    }
    expect(impacts).toHaveLength(end ? 4 : 0);
    return { rounds, tracers: fx.stats().tracers };
  };

  it('another player\'s round with `end`: its tracer runs to `end` (the round\'s end past the body); the round\'s impact stays at `to`', () => {
    const { rounds, tracers } = drawn(WALL);
    expect(rounds).toHaveLength(4);
    for (const [e] of rounds) expect(e).toMatchObject({ to: BODY, material: PERSON, normal: [-1, 0, 0], hit: true });
    expect(tracers).toHaveLength(1);
    expect(tracers[0]!.head).toEqual(WALL);
  });

  it('another player\'s round without `end`: its tracer runs to `to`, as before', () => {
    const { tracers } = drawn();
    expect(tracers).toHaveLength(1);
    expect(tracers[0]!.head).toEqual(BODY);
  });

  // LATER 644 (research 81 "A round passing"): the passing sound walks the round's whole path (`FUN_00598000` takes
  // every tick's segment; no tracer test), so the round's end past the body reaches `roundEffects` on every round, the
  // tracerless three of four as the tracer's; only the tracer itself stays the fourth round's.
  it('LATER 644: every round with `end` keeps it as `tracerTo` (the round\'s end), tracer or not; the tracer stays the fourth\'s', () => {
    const { server, rounds } = page();
    for (let i = 0; i < 4; i++) server({ ...bodyShot(3), weapon: M4A1, to: BODY, end: WALL } as ServerEvent);
    expect(rounds.map(([e]) => e.tracerTo)).toEqual([WALL, WALL, WALL, WALL]);
    expect(rounds.map(([e]) => e.tracer ?? false)).toEqual([false, false, false, true]);
    const fx = tracerFx();
    for (const [e] of rounds) fx.onRound(e, null, false);
    expect(fx.stats().tracers.map((t) => t.head)).toEqual([WALL]);              // one tracer, to the end
  });

  it('a shot of the page\'s own that names no body plays nothing (the page drew its own round)', () => {
    const { server, rounds, impacts } = page();
    server({ type: 'shot', id: 1, weapon: HELD_RIFLE.id, from: [0, 20, 0], to: [0, 0, 40], normal: [0, 1, 0], material: 25 });
    expect([rounds, impacts]).toEqual([[], []]);
  });
});

const DISC = process.env.SOCOM_DISC;
const HAVE_MP2 = !!DISC && existsSync(resolve(DISC, 'RUN/MP2.ZDB'));

describe.skipIf(!HAVE_MP2)(`the person impact on the game's data${HAVE_MP2 ? '' : ' (SOCOM_DISC with RUN/MP2.ZDB absent)'}`, () => {
  let data: EffectData | null = null;
  const load = async (): Promise<EffectData> => (data ??= await effectsFromDisc(new FsAssetSource(DISC as string), 'RUN/MP2.ZDB', 'MP2'));
  const weapon = { name: HELD_RIFLE.name, id: HELD_RIFLE.id, fireAnim: null, sounds: { close: null, med: null, far: null, reload: null } };
  const round = (over: Partial<Round>): Round => ({
    type: 'round', weapon, from: [0, 20, 0], to: [57.6, 20, 0], hit: true, rounds: 0, normal: [-1, 0, 0], material: PERSON, ...over,
  } as Round);

  it('a body hit plays bullet_hit_person and its .BUL_INTO_BODY once; a hull hit and a miss play no person impact', async () => {
    const d = await load();
    expect(d.materials[PERSON]).toBe('PERSON');                 // the byte the room sends is the disc's PERSON row
    const fx = new Effects(() => 0.5);
    fx.setData({ ...d, ambient: [] });
    fx.onRound(round({}), null, false);
    expect(fx.stats().played['bullet_hit_person']).toBe(1);
    expect(fx.stats().sounds.filter((n) => n.includes('BUL_INTO_BODY'))).toHaveLength(1);
    fx.onRound(round({ material: 25, normal: [-1, 0, 0] }), null, false);          // METAL_THICK: the hull's
    fx.onRound(round({ hit: false, normal: null, material: null }), null, false);   // a miss
    expect(fx.stats().played['bullet_hit_person']).toBe(1);
    expect(fx.stats().sounds.filter((n) => n.includes('BUL_INTO_BODY'))).toHaveLength(1);
  });
});

const HAVE_MP6 = !!DISC && existsSync(resolve(DISC, 'RUN/MP6.ZDB'));

/**
 * The owner's Desert Glory playtest (2026-10-07: the hostages' hit blood "way off"; research 238 §8): `bullet_hit_person`
 * picks its blood by the camera's distance from the hit -- `RANGE_TEST` 0x61, the camera node (0x01) against the
 * context's position (0x20), nearer than 130 (0x40, the range 16900 squared; `FUN_0025de90` D:L107857-107942) -- the
 * close set (`red_flash_close` 2 + 2, `red_streak_close` 5 + 5, `blooddust_close` one of two by a coin: 15 particles)
 * within it, the far set (2 + 2, 7 + 7, one: 19; the flash 2.25 times the scale, the streaks three times the speed and
 * twice the size, the dust 3.75-5 times the size) beyond. The page tested no 0x40, so every body hit at any distance
 * drew the far set.
 */
describe.skipIf(!HAVE_MP6)(`the person impact's close and far blood on Desert Glory${HAVE_MP6 ? '' : ' (SOCOM_DISC with RUN/MP6.ZDB absent)'}`, () => {
  let data: EffectData | null = null;
  const load = async (): Promise<EffectData> => (data ??= await effectsFromDisc(new FsAssetSource(DISC as string), 'RUN/MP6.ZDB', 'MP6'));
  const weapon = { name: HELD_RIFLE.name, id: HELD_RIFLE.id, fireAnim: null, sounds: { close: null, med: null, far: null, reload: null } };
  const HIT: [number, number, number] = [1752.3, 63.6, 1179.7];       // a standing hostage's hip, Hostage at its start
  /** The particles one body hit emits with the camera `distance` from the hit (along +x, the shooter's side). */
  const emitted = async (distance: number): Promise<number> => {
    const fx = new Effects(() => 0.5);
    fx.setData({ ...(await load()), ambient: [] });
    const camera = new PerspectiveCamera();
    camera.position.set(HIT[0] + distance, HIT[1], HIT[2]);
    camera.updateMatrixWorld();
    fx.update(0, camera);                                            // the frame's camera, as the page's loop hands it
    const before = fx.stats().emitted;
    fx.onRound({
      type: 'round', weapon, from: [HIT[0] + 22, HIT[1], HIT[2]], to: HIT, hit: true, rounds: 0, normal: [1, 0, 0], material: PERSON,
    } as Round, null, false);
    for (let i = 0; i < 6; i++) fx.update(1 / 60, camera);
    expect(fx.stats().played['bullet_hit_person']).toBe(1);
    return fx.stats().emitted - before;
  };

  it('the camera 30 or 129 from the hit: the close blood (15 particles); 131 or 200 away: the far blood (19)', async () => {
    expect(await emitted(30)).toBe(15);
    expect(await emitted(129)).toBe(15);
    expect(await emitted(131)).toBe(19);
    expect(await emitted(200)).toBe(19);
  });
});
