// @vitest-environment jsdom
// test/replayFoldResidue.test.ts -- RE-1 (web sprint 38; W38.R1; research 249 §1): the seek's fold reaches what PTT-6 left
// engine-local (research 244 §7.2) -- a victory dance still running at the target, the charges lying there, the ghosts --
// each told as the room's own join tells a page joining at the target (`packages/match/src/room.ts` `hello`,
// `joinWire`), never by replaying the events behind the target
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { CLAYMORE, CLAYMORE_RULES, HELD_RIFLE, HELD_SIDEARM, ITEM, type ThrowableRecord } from '@s2u/scene';
import type { ReplayPlayer, ReplayRecord } from '../../match/src/replay/format';
import { Hud } from '../src/hud';
import { TICK_HZ, type BodyState, type JoinProjectileWire, type ServerEvent } from '../src/net/protocol';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { RemotePlayers } from '../src/remotePlayers';
import { EVENT_CLASS, foldTo, statefulRecord } from '../src/replay/fold';
import { asNetClient, ReplayClient, type LoadedSegment } from '../src/replay/replayClient';
import type { WalkMode } from '../src/walk';
import { ALPHA, BRAVO, body, header } from './replayFixture';

afterEach(() => { vi.restoreAllMocks(); });

const HZ = TICK_HZ;
const CHARLIE: ReplayPlayer = { id: 3, name: 'Charlie', team: 'seal', role: 'player', char: 0 };

/**
 * A segment of `end` ticks: the roster `rosters` from their ticks (Alpha and Bravo from 0), `events` at their ticks
 * before that tick's snapshot (the room's order: roster, events, snapshot), a snapshot every 2 ticks of each seated body
 * (Alpha at x = tick, Bravo at -tick, Charlie at 1000 + tick), alive unless `dead(id, tick)` says it is not.
 */
function segment(events: readonly [number, ServerEvent][], o: {
  end?: number; rosters?: readonly [number, ReplayPlayer[]][]; dead?: (id: number, tick: number) => boolean;
  feet?: (id: number, tick: number) => [number, number, number];
} = {}): LoadedSegment {
  const end = o.end ?? 600;
  const h = header();
  const rosters = o.rosters ?? [[0, [ALPHA, BRAVO]]];
  const records: ReplayRecord[] = [{ kind: 'header', header: h }];
  let seated: ReplayPlayer[] = [];
  for (let tick = 0; tick <= end; tick++) {
    for (const [at, players] of rosters) if (at === tick) { seated = players; records.push({ kind: 'players', tick, players }); }
    for (const [at, event] of events) if (at === tick) records.push({ kind: 'event', tick, event });
    if (tick % 2 === 0) {
      const bodies: BodyState[] = seated.map((p) => {
        const b = body(p.id, p.id === 1 ? tick : p.id === 2 ? -tick : 1000 + tick);
        if (o.feet) b.feet = o.feet(p.id, tick);
        if (o.dead?.(p.id, tick)) b.flags = 0;               // BodyFlag.Alive (64) off
        return b;
      });
      records.push({ kind: 'snap', tick, bodies });
    }
  }
  records.push({ kind: 'end', tick: end, reason: 'closed' });
  return { header: h, records, truncated: false };
}

type Welcome = Extract<ServerEvent, { type: 'welcome' }>;
const welcomeOf = (told: readonly ServerEvent[]): Welcome | undefined => told.find((e): e is Welcome => e.type === 'welcome');

/** A watcher's NetPage on a ReplayClient (the replay mode's path), the drawers RE-1's state reaches spied. */
async function replayPage(seg: LoadedSegment, opts: { throwable?: (kind: string) => ThrowableRecord | null } = {}) {
  let now = 0;
  const replay = new ReplayClient(Promise.resolve(seg), { name: 'Watcher', map: 'MP2', now: () => now, ...opts });
  const hud = new Hud();
  vi.spyOn(hud, 'postMessage').mockImplementation(() => undefined);
  const spies = {
    victory: vi.fn(), ghost: vi.fn(), grenade: vi.fn(), corpse: vi.fn(), tracer: vi.fn(), died: vi.fn(), deathVoice: vi.fn(),
    resetVictories: vi.fn(),
  };
  const remote = {
    setTeam: () => undefined, setType: () => undefined, setKit: () => undefined, forget: () => undefined, died: spies.died,
    hydrateCorpse: spies.corpse, markGhost: spies.ghost, victory: spies.victory, clear: () => undefined, frame: () => undefined,
    resetVictories: spies.resetVictories, bodies: () => [], flinch: () => undefined, setEscortee: () => undefined, setOpacity: () => undefined, feet: () => null,
    playerType: () => 0,
  } as unknown as RemotePlayers;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setTrigger: () => undefined,
    setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'fly', setFlinchPose: () => undefined,
    feet: () => [0, 0, 0],
  } as unknown as WalkMode;
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: spies.grenade, spectate: () => undefined, respawned: () => undefined,
    newRound: () => undefined, roundEffects: spies.tracer, weapons: () => [HELD_RIFLE, HELD_SIDEARM], deathVoice: spies.deathVoice,
    client: () => asNetClient(replay),
  };
  const net = new NetPage(deps, 'replay:', 'MP2', 'Watcher', undefined, true, 'classic');
  await replay.ready;
  const told: ServerEvent[] = [];
  replay.on((ev) => told.push(ev));
  const camera = new PerspectiveCamera();
  return {
    replay, net, spies, told,
    wait: (ms: number): void => { now += ms; replay.advance(); },
    frame: (): void => { replay.advance(); net.frame(0, camera, false); },
    clear: (): void => { told.length = 0; for (const s of Object.values(spies)) s.mockClear(); },
  };
}

const msOf = (ticks: number): number => (ticks * 1000) / HZ;

// ---- the dance ----

const dance = (serial: number, clip: string | null, id = 2): ServerEvent => ({ type: 'victory', id, serial, clip, elapsed: 0, ...(clip ? { seq: 7 } : {}) });

describe('RE-1: a victory dance running at the target is told as the room\'s join tells it (room.ts hello, :1353-1355)', () => {
  it('`victory` is stateful now: a dance is state the room hands a joiner; the rest of the table is unchanged', () => {
    expect(EVENT_CLASS.victory).toBe('stateful');
    for (const k of ['shot', 'impact', 'grenade', 'reloadSound', 'hurtVoice', 'flinch', 'detonate'] as const) expect(EVENT_CLASS[k], k).toBe('transient');
  });

  it('a seek into a running dance tells it after the welcome, before the score, with its elapsed at the target; no seq', async () => {
    const p = await replayPage(segment([[100, dance(1, 'victory_a')], [400, dance(1, null)]]));
    p.replay.seek(250);                                    // 150 ticks into the dance
    const kinds = p.told.map((e) => e.type);
    const at = kinds.indexOf('victory');
    expect(at).toBeGreaterThan(kinds.indexOf('welcome'));
    expect(at).toBeLessThan(kinds.lastIndexOf('score'));
    expect(p.told[at]).toEqual({ type: 'victory', id: 2, serial: 1, clip: 'victory_a', elapsed: 150 / HZ });
    expect(p.spies.victory).toHaveBeenCalledWith(2, 1, 'victory_a', 150 / HZ);   // the page's own handler, `remote.victory`
  });

  it('a seek past the dance\'s stop tells none; the page that heard it start in play is told its stop', async () => {
    const p = await replayPage(segment([[100, dance(1, 'victory_a')], [400, dance(1, null)]]));
    p.wait(msOf(300));                                     // played to 300: the start heard live
    expect(p.spies.victory).toHaveBeenCalledWith(2, 1, 'victory_a', 0);
    p.clear();
    p.replay.seek(450);                                    // past the stop at 400
    expect(p.told.filter((e) => e.type === 'victory')).toEqual([{ type: 'victory', id: 2, serial: 1, clip: null, elapsed: 0 }]);
    expect(p.spies.victory).toHaveBeenCalledTimes(1);
    expect(p.spies.victory).toHaveBeenCalledWith(2, 1, null, 0);
  });

  it('a seek back before the start tells the playing dance\'s stop and no start', async () => {
    const p = await replayPage(segment([[50, { type: 'roundTime', seconds: 600 }], [100, dance(1, 'victory_a')], [400, dance(1, null)]]));
    p.wait(msOf(300));
    p.clear();
    p.replay.seek(80);
    expect(p.told.filter((e) => e.type === 'victory')).toEqual([{ type: 'victory', id: 2, serial: 1, clip: null, elapsed: 0 }]);
  });

  it('the last start since its stop is the one told: two dances in turn, the second at its own age', async () => {
    const p = await replayPage(segment([[100, dance(1, 'victory_a')], [200, dance(1, null)], [300, dance(2, 'victory_b')]]));
    p.replay.seek(360);
    expect(p.told.filter((e) => e.type === 'victory')).toEqual([{ type: 'victory', id: 2, serial: 2, clip: 'victory_b', elapsed: 1 }]);
  });

  it('every end the room has is a recorded stop (stopVictory broadcasts it): a spawn\'s, a death\'s, a round end\'s alike', () => {
    // The fold needs no rule of its own for a round end, a reset or a new round: the room's every end is the broadcast
    // `victory` with no clip, recorded (`stopVictory`). A seek just past the start and just past the stop shows both.
    const seg = segment([[100, dance(4, 'victory_c', 1)], [160, dance(4, null, 1)]]);
    expect(foldTo(seg.records, 130, HZ).state.dances.get(1)).toEqual({ serial: 4, clip: 'victory_c', tick: 100 });
    expect(foldTo(seg.records, 160, HZ).state.dances.has(1)).toBe(false);
  });
});

describe('LATER 31: a replay\'s re-told welcome resets the others\' dances (RemotePlayers.resetVictories), the live page\'s not', () => {
  it('a seek within a dance: the page\'s record is reset at the welcome, before the fold tells the dance at its age', async () => {
    const p = await replayPage(segment([[100, dance(1, 'victory_a')], [400, dance(1, null)]]));
    p.wait(msOf(150));                                     // the start heard in play (serial 1)
    p.clear();
    p.replay.seek(300);                                    // within the same dance: serial 1 again, at 200 ticks
    expect(p.spies.resetVictories).toHaveBeenCalledTimes(1);
    expect(p.spies.victory).toHaveBeenCalledWith(2, 1, 'victory_a', 200 / HZ);
    expect(p.spies.resetVictories.mock.invocationCallOrder[0]).toBeLessThan(p.spies.victory.mock.invocationCallOrder.at(-1)!);
  });

  it('a seek back before a dance resets, so play on draws its start (same serial) again', async () => {
    const p = await replayPage(segment([[50, { type: 'roundTime', seconds: 600 }], [100, dance(1, 'victory_a')], [400, dance(1, null)]]));
    p.wait(msOf(300));
    p.clear();
    p.replay.seek(80);
    expect(p.spies.resetVictories).toHaveBeenCalledTimes(1);
    p.wait(msOf(40));                                      // played over the start at 100 again
    expect(p.spies.victory).toHaveBeenLastCalledWith(2, 1, 'victory_a', 0);
    expect(p.spies.resetVictories.mock.invocationCallOrder[0]).toBeLessThan(p.spies.victory.mock.invocationCallOrder.at(-1)!);
  });

  it('a live page\'s welcome (no replay clock) never resets: a repeated serial stays the body\'s to refuse', () => {
    const spies = { resetVictories: vi.fn(), victory: vi.fn() };
    const remote = {
      setTeam: () => undefined, setType: () => undefined, setKit: () => undefined, forget: () => undefined, died: () => undefined,
      hydrateCorpse: () => undefined, markGhost: () => undefined, clear: () => undefined, frame: () => undefined,
      setEscortee: () => undefined, setOpacity: () => undefined, feet: () => null, playerType: () => 0, bodies: () => [],
      victory: spies.victory, resetVictories: spies.resetVictories,
    } as unknown as RemotePlayers;
    const walk = {
      setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setTrigger: () => undefined,
      setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'walk', setFlinchPose: () => undefined,
      feet: () => [0, 0, 0],
    } as unknown as WalkMode;
    const hud = new Hud();
    vi.spyOn(hud, 'postMessage').mockImplementation(() => undefined);
    let socket: { onopen?: (e: Event) => void; onmessage?: (e: MessageEvent) => void } | null = null;
    const deps: NetPageDeps = {
      walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined, respawned: () => undefined,
      newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
      socket: () => { socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as never; return socket as never; },
    };
    new NetPage(deps, 'ws://test/ws', 'MP2', 'Tester', undefined, false, 'classic');
    socket!.onopen?.({} as Event);
    const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
    const welcome = {
      type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
      players: [{ id: 2, name: 'Bravo', team: 'terrorist' }], rules: 'classic', round: 1, rounds: 2, ghost: false, epoch: 0,
      env: { revision: 0, epoch: 0, states: [] },
    } as ServerEvent;
    server(welcome);
    server(dance(1, 'victory_a'));
    server(welcome);                                       // a rejoin's welcome on the live path
    server(dance(1, 'victory_a'));
    expect(spies.resetVictories).not.toHaveBeenCalled();
    expect(spies.victory).toHaveBeenCalledTimes(2);        // told twice; the body's Play refuses the second (remoteVictory.test.ts)
  });
});

// ---- the charges ----

const place = (pid: number, kind: string, owner: number, from: [number, number, number], facing: [number, number, number]): ServerEvent =>
  ({ type: 'grenade', id: owner, kind, from, velocity: facing, pid });
const detonator = (owner: number, from: [number, number, number]): ServerEvent =>
  ({ type: 'grenade', id: owner, kind: 'Detonator', from, velocity: [0, 0, 0] });
const projectiles = (p: { told: ServerEvent[] }): JoinProjectileWire[] | undefined => welcomeOf(p.told)?.join?.projectiles;

/** Synthetic records (not the disc's): C4's and the PMN's come off the disc only, so a test names its own. */
const { volatile: _volatile, ...NOT_VOLATILE } = CLAYMORE;
const C4_TEST: ThrowableRecord = { ...NOT_VOLATILE, name: 'C4', id: ITEM.C4, fuse: 6, removal: 7 };
const PMN_TEST: ThrowableRecord = { ...CLAYMORE, name: 'PMN Mine', id: ITEM.PMN, fuse: 8, removal: 20, proximity: 10 };
const withDisc = (kind: string): ThrowableRecord | null => (kind === 'C4' ? C4_TEST : kind === 'PMN Mine' ? PMN_TEST : kind === 'Claymore' ? CLAYMORE : null);

describe('RE-1: the charges lying at the target are the join envelope\'s projectiles (room.ts joinWire, joinState.ts)', () => {
  it('a seek past a claymore\'s placement lays it at rest, in the room\'s wire shape and clock (ticks)', async () => {
    const p = await replayPage(segment([[100, place(0, 'Claymore', 1, [10, 0, 5], [0, 0, -1])]]));
    p.replay.seek(250);
    expect(projectiles(p)).toEqual([{
      pid: 0, owner: 1, kind: 'Claymore', pos: [10, 0, 5], vel: [0, 0, 0], state: 'rest', age: 150,
      fuse: CLAYMORE.fuse * HZ - 150, removal: CLAYMORE.removal * HZ - 150, bounces: 0, dud: false, facing: [0, 0, -1],
    }]);
    // Laid by the page's own join path (`NetPage.joinSinks` -> `remoteGrenade`), at its phase in seconds.
    expect(p.spies.grenade).toHaveBeenCalledWith('Claymore', [10, 0, 5], [0, 0, -1], 1, 0, expect.objectContaining({ state: 'rest', age: 2.5 }));
  });

  it('a seek back before the placement lays none', async () => {
    const p = await replayPage(segment([[50, { type: 'roundTime', seconds: 600 }], [100, place(0, 'Claymore', 1, [10, 0, 5], [0, 0, -1])]]));
    p.wait(msOf(300));
    p.clear();
    p.replay.seek(80);
    expect(projectiles(p)).toEqual([]);
  });

  it('a `detonate` sets it off: detonated until its removal (the page lays nothing for it), then gone', async () => {
    const seg = segment([[100, place(0, 'Claymore', 1, [10, 0, 5], [0, 0, -1])], [300, { type: 'detonate', pid: 0, by: 2 }]], { end: 1200 });
    const p = await replayPage(seg);
    p.replay.seek(400);                                    // set off at 300; Timer2 (10 s) from the placement not yet run
    expect(projectiles(p)?.map((x) => [x.pid, x.state])).toEqual([[0, 'detonated']]);
    p.clear();
    p.replay.seek(100 + CLAYMORE.removal * HZ);            // its removal: gone from the room's list
    expect(projectiles(p)).toEqual([]);
  });

  it('the Detonator sets off its owner\'s claymores within its reach, not another\'s or one out of reach', async () => {
    const far = CLAYMORE_RULES.detonateRange + 1;
    const seg = segment([
      [100, place(0, 'Claymore', 1, [0, 0, 0], [1, 0, 0])], [110, place(1, 'Claymore', 1, [far, 0, 0], [1, 0, 0])],
      [120, place(2, 'Claymore', 2, [5, 0, 0], [1, 0, 0])], [200, detonator(1, [0, 0, 0])],
    ]);
    const p = await replayPage(seg);
    p.replay.seek(250);
    expect(projectiles(p)?.map((x) => [x.pid, x.state])).toEqual([[0, 'detonated'], [1, 'rest'], [2, 'rest']]);
  });

  it('a round start and an abandon clear the air (clearAir, ROUND_START_PROJECTILES_READING)', async () => {
    const start: ServerEvent = { type: 'roundStart', round: 2, seconds: 100, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 2, startTick: 300 };
    const seg = segment([[100, place(0, 'Claymore', 1, [0, 0, 0], [1, 0, 0])], [300, start], [400, place(0, 'Claymore', 2, [9, 0, 9], [0, 0, 1])], [500, { type: 'abandoned' }]]);
    const p = await replayPage(seg);
    p.replay.seek(350);
    expect(projectiles(p)).toEqual([]);
    p.clear();
    p.replay.seek(450);
    expect(projectiles(p)?.map((x) => [x.pid, x.owner])).toEqual([[0, 2]]);
    p.clear();
    p.replay.seek(550);
    expect(projectiles(p)).toEqual([]);
  });

  it('C4 at rest until its fuse (Timer1) has run, then detonated; given its record by the page (`throwable`)', async () => {
    const seg = segment([[100, place(0, 'C4', 1, [3, 4, 5], [0, 0, 1])]], { end: 1000 });
    const p = await replayPage(seg, { throwable: withDisc });
    p.replay.seek(300);
    expect(projectiles(p)).toEqual([expect.objectContaining({ kind: 'C4', state: 'rest', age: 200, fuse: 6 * HZ - 200, removal: 7 * HZ - 200 })]);
    p.clear();
    p.replay.seek(100 + 6 * HZ + 2);
    expect(projectiles(p)?.map((x) => x.state)).toEqual(['detonated']);
    p.clear();
    p.replay.seek(100 + 7 * HZ);
    expect(projectiles(p)).toEqual([]);
  });

  it('a kind whose record the page has not given is not folded (C4 and the PMN come off the disc only)', async () => {
    const p = await replayPage(segment([[100, place(0, 'C4', 1, [3, 4, 5], [0, 0, 1])], [120, place(1, 'Claymore', 1, [0, 0, 0], [1, 0, 0])]]));
    p.replay.seek(200);
    expect(projectiles(p)?.map((x) => x.kind)).toEqual(['Claymore']);
  });

  it('a thrown grenade is not a charge: never folded (its arc is transient, W37.R4)', async () => {
    const p = await replayPage(segment([[100, place(0, 'M67', 1, [0, 10, 0], [100, 50, 0])], [101, { type: 'roundTime', seconds: 600 }]]));
    p.replay.seek(110);
    expect(projectiles(p)).toEqual([]);
    expect(p.spies.grenade).not.toHaveBeenCalled();
  });

  it('a PMN armed (Timer1 run) is tripped by a living seated body within its ProximityDistance in a recorded snapshot', async () => {
    const at: [number, number, number] = [0, 0, 0];
    // Alpha stands on it from tick 700 (after the 8 s arming from 100); before that it is 100 units away.
    const feet = (id: number, tick: number): [number, number, number] => (id === 1 ? (tick >= 700 ? [3, 0, 0] : [100, 0, 0]) : [500, 0, 0]);
    const seg = segment([[100, place(0, 'PMN Mine', 2, at, [1, 0, 0])]], { end: 900, feet });
    const p = await replayPage(seg, { throwable: withDisc });
    p.replay.seek(650);
    expect(projectiles(p)?.map((x) => x.state)).toEqual(['rest']);
    p.clear();
    p.replay.seek(750);
    expect(projectiles(p)?.map((x) => x.state)).toEqual(['detonated']);
  });

  it('a seat dead before the arming does not trip it, nor does a body inside the radius before the arming', async () => {
    const feet = (id: number): [number, number, number] => (id === 1 ? [3, 0, 0] : [500, 0, 0]);
    const seg = segment([[100, place(0, 'PMN Mine', 2, [0, 0, 0], [1, 0, 0])]], { end: 900, feet, dead: (id, tick) => id === 1 && tick >= 500 });
    const p = await replayPage(seg, { throwable: withDisc });
    p.replay.seek(800);
    expect(projectiles(p)?.map((x) => x.state)).toEqual(['rest']);
  });

  it('a charge\'s placement counts as state for the seek\'s gate (statefulRecord), a thrown grenade does not', () => {
    const r = (event: ServerEvent): ReplayRecord => ({ kind: 'event', tick: 1, event });
    expect(statefulRecord(r(place(0, 'Claymore', 1, [0, 0, 0], [1, 0, 0])))).toBe(true);
    expect(statefulRecord(r(place(0, 'M67', 1, [0, 0, 0], [1, 0, 0])))).toBe(false);
    expect(statefulRecord(r(place(0, 'C4', 1, [0, 0, 0], [1, 0, 0])), withDisc)).toBe(true);
  });
});

// ---- the ghosts ----

describe('RE-1: the ghosts are the join envelope\'s (joinState.ts joinWire: a seat dead with no death since the round\'s reset)', () => {
  const start = (tick: number): ServerEvent => ({ type: 'roundStart', round: 1, seconds: 600, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: tick });
  const spawn = (id: number): ServerEvent => ({ type: 'spawn', id, at: [0, 0, 0], yaw: 0, after: 0 });
  const kill: ServerEvent = { type: 'kill', killer: 1, victim: 2, weapon: 'M4A1', how: 'weapon', clip: 'die_back', cause: 5, voiced: true };

  it('a seat taken in a classic round in play, never spawned, is a ghost at the target; at the next round it is not', async () => {
    const seg = segment([[10, start(10)], [10, spawn(1)], [10, spawn(2)], [250, kill], [400, start(400)], [400, spawn(1)], [400, spawn(2)], [400, spawn(3)]], {
      end: 600, rosters: [[0, [ALPHA, BRAVO]], [200, [ALPHA, BRAVO, CHARLIE]]],
      dead: (id, tick) => (id === 3 && tick < 400) || (id === 2 && tick >= 250 && tick < 400) || tick < 10,
    });
    const p = await replayPage(seg);
    p.replay.seek(300);
    expect(welcomeOf(p.told)?.join?.ghosts).toEqual([3]);   // Bravo is a corpse (killed at 250), not a ghost
    expect(welcomeOf(p.told)?.join?.corpses.map((c) => c.id)).toEqual([2]);
    expect(p.spies.ghost).toHaveBeenCalledWith(3);
    p.clear();
    p.replay.seek(450);
    expect(welcomeOf(p.told)?.join?.ghosts).toEqual([]);
    p.clear();
    p.replay.seek(150);                                    // before Charlie was seated
    expect(welcomeOf(p.told)?.join?.ghosts).toEqual([]);
  });

  it('an abandon resets the deaths: a dead seat left unspawned there is a ghost, not a corpse (room.ts abandon, diedAt -1)', async () => {
    const seg = segment([[10, start(10)], [10, spawn(1)], [10, spawn(2)], [100, kill], [200, { type: 'abandoned' }], [200, spawn(1)]], {
      end: 400, dead: (id, tick) => (id === 2 && tick >= 100) || tick < 10,
    });
    const p = await replayPage(seg);
    p.replay.seek(150);
    expect(welcomeOf(p.told)?.join?.corpses.map((c) => c.id)).toEqual([2]);
    expect(welcomeOf(p.told)?.join?.ghosts).toEqual([]);
    p.clear();
    p.replay.seek(300);
    expect(welcomeOf(p.told)?.join?.corpses).toEqual([]);
    expect(welcomeOf(p.told)?.join?.ghosts).toEqual([2]);
  });

  it('review: a file opening on the last match\'s end (RoomRecording, files.ts) names no dead seat a ghost: its death lies in the file before', async () => {
    // The server's next file starts at the next snapshot with the carried roster, still in phase `over`: Bravo was killed
    // in the previous file, so the room's `joinWire` names it a corpse (`diedAt` >= 0); its death tick is not in this file.
    const over: ServerEvent = { type: 'roundOver', round: 11, winner: 'seal', wins: { seal: 6, terrorist: 5 }, matchOver: true, screens: [{ screen: 'gameComplete', seconds: 10 }] };
    const seg = segment([[0, over], [300, start(300)], [300, spawn(1)], [300, spawn(2)]], {
      end: 600, rosters: [[0, [ALPHA, BRAVO]], [400, [ALPHA, BRAVO, CHARLIE]]], dead: (id, tick) => (id === 2 && tick < 300) || (id === 3 && tick >= 400),
    });
    const p = await replayPage(seg);
    p.replay.seek(100);
    expect(welcomeOf(p.told)?.join?.ghosts).toEqual([]);    // not a ghost: no death known, drawn as the snapshot draws it
    expect(welcomeOf(p.told)?.join?.corpses).toEqual([]);   // and no corpse made up without its death's tick
    expect(p.spies.ghost).not.toHaveBeenCalled();
    p.clear();
    p.replay.seek(500);                                    // after the reset at 300, Charlie seated at 400 and not spawned
    expect(welcomeOf(p.told)?.join?.ghosts).toEqual([3]);
  });
});

// ---- PTT-6's guarantees ----

describe('RE-1 keeps PTT-6\'s guarantees: nothing transient replayed', () => {
  it('a seek over a placement, a dance and a Detonator plays no grenade event, no release, no stop or start but the fold\'s', async () => {
    const seg = segment([
      [100, place(0, 'Claymore', 1, [0, 0, 0], [1, 0, 0])], [150, dance(1, 'victory_a')], [200, { type: 'shot', id: 1, weapon: HELD_RIFLE.id, from: [0, 0, 0], to: [1, 0, 0], normal: null, material: null }],
      [300, detonator(1, [0, 0, 0])],
    ]);
    const p = await replayPage(seg);
    p.replay.seek(400);
    expect(p.told.filter((e) => e.type === 'grenade' || e.type === 'shot' || e.type === 'detonate')).toEqual([]);
    expect(p.spies.tracer).not.toHaveBeenCalled();
    expect(p.told.filter((e) => e.type === 'victory')).toEqual([{ type: 'victory', id: 2, serial: 1, clip: 'victory_a', elapsed: 250 / HZ }]);
  });
});
