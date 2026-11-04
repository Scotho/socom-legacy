// @vitest-environment jsdom
// test/replaySeekFold.test.ts -- PTT-6 (web sprint 37; W37.R4; research 244 §7): a seek folds the stateful events and
// skips only the transient ones -- held through the page's own handlers (`NetPage`, `BombPage`) on a `ReplayClient`
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import type { ReplayRecord } from '../../match/src/replay/format';
import { BombPage } from '../src/bombPage';
import { Hud } from '../src/hud';
import { BODY_FADE_S } from '../src/net/deaths';
import { BOMB_STATE, type BombWire } from '../src/net/objective';
import type { ScoreRow, ServerEvent } from '../src/net/protocol';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { RemotePlayers } from '../src/remotePlayers';
import { asNetClient, ReplayClient, type LoadedSegment } from '../src/replay/replayClient';
import type { WalkMode } from '../src/walk';
import { ALPHA, BRAVO, body, header } from './replayFixture';

afterEach(() => { vi.restoreAllMocks(); });

const HZ = 60;
/** `netPage.ts`'s `ENGINE_READ_S`: the round screens start this long after the `roundOver`. */
const ENGINE_READ_S = 3;

/**
 * A segment of `end` ticks: Alpha and Bravo from tick 0, a snapshot every 2 ticks (Alpha at x = tick, Bravo at -tick),
 * `events` at their ticks before that tick's snapshot (the room's order), Bravo's body dead from `deadFrom` on.
 */
function segment(events: readonly [number, ServerEvent][], o: { end?: number; deadFrom?: number } = {}): LoadedSegment {
  const end = o.end ?? 600;
  const h = header();
  const records: ReplayRecord[] = [{ kind: 'header', header: h }];
  for (let tick = 0; tick <= end; tick++) {
    if (tick === 0) records.push({ kind: 'players', tick, players: [ALPHA, BRAVO] });
    for (const [at, event] of events) if (at === tick) records.push({ kind: 'event', tick, event });
    if (tick % 2 === 0) {
      const bravo = body(2, -tick);
      if (o.deadFrom !== undefined && tick >= o.deadFrom) bravo.flags = 0;     // BodyFlag.Alive (64) off
      records.push({ kind: 'snap', tick, bodies: [body(1, tick), bravo] });
    }
  }
  records.push({ kind: 'end', tick: end, reason: 'closed' });
  return { header: h, records, truncated: false };
}

const row = (id: number, name: string, team: 'seal' | 'terrorist', kills: number): ScoreRow =>
  ({ id, name, team, kills, deaths: 0, score: kills, alive: true, ping: 0 });
const score = (alphaKills: number, timeLeft: number | null = null): ServerEvent => ({
  type: 'score', rows: [row(1, 'Alpha', 'seal', alphaKills), row(2, 'Bravo', 'terrorist', 0)], timeLeft, spectators: [],
  wins: { seal: alphaKills, terrorist: 0 },
});
const shot: ServerEvent = { type: 'shot', id: 1, weapon: HELD_RIFLE.id, from: [0, 0, 0], to: [10, 0, 0], normal: null, material: null };

/** A watcher's NetPage on a ReplayClient (the replay mode's path), every drawer it reaches a spy. */
async function replayPage(seg: LoadedSegment) {
  let now = 0;
  const replay = new ReplayClient(Promise.resolve(seg), { name: 'Watcher', map: 'MP2', now: () => now });
  const hud = new Hud();
  const spies = {
    scoreRows: vi.spyOn(hud, 'setScoreRows'),
    timer: vi.spyOn(hud, 'setTimer'),
    roundScreen: vi.spyOn(hud, 'setRoundScreen'),
    message: vi.spyOn(hud, 'postMessage').mockImplementation(() => undefined),
    tracer: vi.fn(),
    died: vi.fn(),
    corpse: vi.fn(),
    deathVoice: vi.fn(),
  };
  const remote = {
    setTeam: () => undefined, setType: () => undefined, setKit: () => undefined, forget: () => undefined, died: spies.died,
    hydrateCorpse: spies.corpse, markGhost: () => undefined, clear: () => undefined, frame: () => undefined, bodies: () => [],
    flinch: () => undefined, setEscortee: () => undefined, setOpacity: () => undefined, feet: () => null, playerType: () => 0,
  } as unknown as RemotePlayers;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setTrigger: () => undefined,
    setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'fly', setFlinchPose: () => undefined,
    feet: () => [0, 0, 0],
  } as unknown as WalkMode;
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined, respawned: () => undefined,
    newRound: () => undefined, roundEffects: spies.tracer, weapons: () => [HELD_RIFLE, HELD_SIDEARM], deathVoice: spies.deathVoice,
    client: () => asNetClient(replay),
  };
  const net = new NetPage(deps, 'replay:', 'MP2', 'Watcher', undefined, true, 'classic');
  await replay.ready;
  const camera = new PerspectiveCamera();
  return {
    replay, net, hud, spies,
    /** The wall clock on by `ms` and the records it passed played (the mode's frame pumps them). */
    wait: (ms: number): void => { now += ms; replay.advance(); },
    /** One page frame (the timer, the round screen), no replay time passing. */
    frame: (): void => { replay.advance(); net.frame(0, camera, false); },
    clear: (): void => { for (const s of Object.values(spies)) s.mockClear(); },
  };
}

const msOf = (ticks: number): number => (ticks * 1000) / HZ;
const lastRows = (s: { mock: { calls: unknown[][] } }): unknown => (s.mock.calls.at(-1)?.[0] as { kills: number }[] | undefined)?.map((r) => r.kills);

describe('PTT-6: a seek folds the stateful events (W37.R4; review focus 6)', () => {
  it('review focus 6: a seek back across a score change shows the score at the target, not the latest; the tracer in the skipped span draws nothing', async () => {
    const p = await replayPage(segment([[100, score(0)], [200, shot], [350, shot], [400, score(1)]]));
    p.wait(msOf(500));                                     // played to 500: the live page heard both scores, both shots
    expect(lastRows(p.spies.scoreRows)).toEqual([1, 0]);
    expect(p.spies.tracer).toHaveBeenCalledTimes(2);
    p.clear();
    p.replay.seek(300);                                    // back across the score at 400 and the shot at 350
    expect(lastRows(p.spies.scoreRows)).toEqual([0, 0]);   // the score at 300: Alpha's kill at 400 not yet
    expect(p.spies.tracer).not.toHaveBeenCalled();         // no tracer, nothing replayed
    p.wait(msOf(120));                                     // on from 300: the shot at 350 and the score at 400 play
    expect(p.spies.tracer).toHaveBeenCalledTimes(1);
    expect(lastRows(p.spies.scoreRows)).toEqual([1, 0]);
  });
  it('a seek forward over a shot draws no tracer, and the score at the target is drawn', async () => {
    const p = await replayPage(segment([[100, score(0)], [200, shot], [250, score(1)]]));
    p.replay.seek(300);
    expect(p.spies.tracer).not.toHaveBeenCalled();
    expect(lastRows(p.spies.scoreRows)).toEqual([1, 0]);
  });

  it('the round clock at the target: the round start, a score\'s time left and a minute taken off, both ways', async () => {
    const start: ServerEvent = { type: 'roundStart', round: 1, seconds: 100, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 10 };
    const p = await replayPage(segment([[10, start], [10, score(0, 100)], [700, { type: 'roundTime', seconds: 40 }]], { end: 1200 }));
    p.replay.seek(610);                                    // 600 ticks into a 100 s round: 90 s left
    p.frame();
    expect(p.spies.timer.mock.calls.at(-1)?.[0]).toBeCloseTo(90, 0);
    p.replay.seek(1000);                                   // after the minute taken off at 700: 40 - 990/60 = 23.5 s
    p.frame();
    expect(p.spies.timer.mock.calls.at(-1)?.[0]).toBeCloseTo(23.5, 0);
    p.replay.seek(310);                                    // back before it: 95 s
    p.frame();
    expect(p.spies.timer.mock.calls.at(-1)?.[0]).toBeCloseTo(95, 0);
  });
  it('the round\'s screens at the target: a seek into the round end shows the screen at its own age, the clock stopped', async () => {
    const start: ServerEvent = { type: 'roundStart', round: 1, seconds: 100, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 };
    const over: ServerEvent = {
      type: 'roundOver', round: 1, winner: 'seal', wins: { seal: 1, terrorist: 0 }, matchOver: false,
      screens: [{ screen: 'roundComplete', seconds: 10 }],
    };
    const p = await replayPage(segment([[0, start], [0, score(0, 100)], [300, over]], { end: 1200 }));
    p.replay.seek(300 + (ENGINE_READ_S + 2) * HZ);         // 2 s into ROUND COMPLETE's 10
    p.frame();
    const shown = p.spies.roundScreen.mock.calls.at(-1)?.[0] as { kind: string; secondsLeft: number } | null;
    expect(shown?.kind).toBe('roundComplete');
    expect(shown?.secondsLeft).toBeCloseTo(8, 0);
    p.spies.timer.mockClear();
    p.frame();
    expect(p.spies.timer).not.toHaveBeenCalled();          // the round's clock is stopped there, as the live page's
    p.replay.seek(120);                                    // back into the round: no screen, the clock running (98 s)
    p.frame();
    expect(p.spies.roundScreen.mock.calls.at(-1)?.[0]).toBeNull();
    expect(p.spies.timer.mock.calls.at(-1)?.[0]).toBeCloseTo(98, 0);
  });

  it('a bomb planted before the target shows as planted, silently; a seek before it takes it away', async () => {
    const carried: BombWire = { state: BOMB_STATE.carried, pos: [1, 0, 1], carrier: 2, planter: null, plantingTeam: null, defuser: null, detonateTick: null } as BombWire;
    const planted: BombWire = { state: BOMB_STATE.planted, pos: [5, 0, 5], carrier: null, planter: 2, plantingTeam: 'terrorist', defuser: null, detonateTick: 300 + 45 * HZ } as BombWire;
    const seg = segment([[100, { type: 'bomb', ...carried }], [300, { type: 'bomb', ...planted }]]);
    const p = await replayPage(seg);
    const place = vi.fn(), effect = vi.fn(() => true), cue = vi.fn();
    // The bomb's page on the replay's client, as the test room's `acts.followNet()` hands it the page's client each frame.
    const bomb = new BombPage(p.replay, {
      id: () => null, team: () => null, alive: () => false, feet: () => null, actions: () => [], look: () => null,
      serverTick: () => p.replay.serverTick(),
    }, { worldBomb: { place }, effects: { play: effect }, roundAudio: { bomb: cue } });
    p.replay.seek(400);
    expect(bomb.state()?.state).toBe(BOMB_STATE.planted);
    expect(bomb.state()?.pos).toEqual([5, 0, 5]);
    expect(place.mock.calls.at(-1)?.[0]).toEqual([5, 0, 5]);
    expect(effect).not.toHaveBeenCalled();
    expect(cue).not.toHaveBeenCalled();
    p.replay.seek(50);                                     // before any bomb event: none
    expect(bomb.state()).toBeNull();
    expect(place.mock.calls.at(-1)?.[0]).toBeNull();
  });

  it('a body killed in the skipped span is dead at the target: its death clip at its age, no kill line, no voice, no clip restarted', async () => {
    const kill: ServerEvent = { type: 'kill', killer: 1, victim: 2, weapon: 'M4A1', how: 'weapon', clip: 'die_back', cause: 5, voiced: true };
    const p = await replayPage(segment([[300, kill]], { end: 600 + BODY_FADE_S * HZ, deadFrom: 300 }));
    p.replay.seek(360);                                    // 1 s after the kill
    expect(p.spies.corpse).toHaveBeenCalledWith(2, 'die_back', 1);
    expect(p.spies.died).not.toHaveBeenCalled();
    expect(p.spies.deathVoice).not.toHaveBeenCalled();
    expect(p.spies.message).not.toHaveBeenCalled();
    p.clear();
    p.replay.seek(300 + (BODY_FADE_S + 1) * HZ);            // NU-4 (research 317 R317.1, R317.3): past 10 s, still in its clip
    expect(p.spies.corpse).toHaveBeenCalledWith(2, 'die_back', BODY_FADE_S + 1);   // was: laid hidden, no clip (`BODY_FADE_S`)
    p.clear();
    p.replay.seek(200);                                    // before the kill: alive, no corpse laid
    expect(p.spies.corpse).not.toHaveBeenCalled();
  });

  it('the turrets occupied at the target are told as a joiner\'s welcome carries them', async () => {
    const p = await replayPage(segment([[150, { type: 'turret', id: 0, occupant: 2, ammo: 100 }]]));
    const told: ServerEvent[] = [];
    p.replay.on((ev) => told.push(ev));
    p.replay.seek(400);
    const w = told.find((e): e is Extract<ServerEvent, { type: 'welcome' }> => e.type === 'welcome');
    expect(w?.turrets).toEqual([{ id: 0, occupant: 2, ammo: 100 }]);
    told.length = 0;
    p.replay.seek(100);
    const before = told.find((e): e is Extract<ServerEvent, { type: 'welcome' }> => e.type === 'welcome');
    expect(before?.turrets).toBeUndefined();
  });
});

describe('RE-6 (research 249 §2): Home lands on the round\'s first tick, where the compass already shows the bomb', () => {
  const START: [number, number, number] = [1279.762, 47.334, 1446.111];
  const reset = { state: BOMB_STATE.ground, pos: START, carrier: null, planter: null, plantingTeam: null, defuser: null, detonateTick: null } as unknown as BombWire;
  const carried = { ...reset, state: BOMB_STATE.carried, pos: [1300, 47, 1450], carrier: 1 } as unknown as BombWire;
  const roundStart = (tick: number): ServerEvent => ({ type: 'roundStart', round: 1, seconds: 600, wins: { seal: 0, terrorist: 0 }, rounds: 5, epoch: 1, startTick: tick });
  /** The bomb's page on the replay's client and the compass marks its HUD frame draws. */
  const compass = (replay: ReplayClient) => {
    const hud = { setExtraMarks: vi.fn(), setDefuseTimer: vi.fn(), setHoldBar: vi.fn(), postMessage: vi.fn() };
    const bomb = new BombPage(replay, {
      id: () => null, team: () => null, alive: () => false, feet: () => null, actions: () => [], look: () => null,
      serverTick: () => replay.serverTick(), bodyAt: () => [1300, 47, 1450],
    }, { hud });
    return Object.assign((): unknown => { bomb.hudFrame(); return hud.setExtraMarks.mock.calls.at(-1)?.[0]; }, { state: () => bomb.state()?.state });
  };

  it('the round reset at tick 1 (the bomb\'s reset, then the `roundStart`, as `Room.startRound` sends them): Home from past the pickup lands at tick 1, never 0, the bomb on the ground in the compass', async () => {
    // `Room.startRound` (packages/match/src/room.ts): `this.bomb?.reset()` then the `roundStart` broadcast, one tick.
    const p = await replayPage(segment([[1, { type: 'bomb', ...reset }], [1, roundStart(1)], [200, { type: 'bomb', ...carried }]]));
    const marks = compass(p.replay);
    p.replay.seek(400);
    expect(marks.state()).toBe(BOMB_STATE.carried);
    expect(marks()).toEqual([]);                           // OT.R99: the carried bomb is marked on nobody's compass
    expect(p.replay.seekStart()).toBe(1);
    expect(p.replay.serverTick()).toBe(1);
    expect(marks()).toEqual([{ bitmap: 'ret_bomb.tif', x: START[0], z: START[2] }]);
    // an explicit seek still goes anywhere: the segment's start, before the round, where no round is in play
    expect(p.replay.seek(0)).toBe(0);
    expect(marks()).toEqual([]);
  });

  it('a round that starts later (the launch hold, its countdown before it): Home lands on that round\'s start', async () => {
    const p = await replayPage(segment([[20, { type: 'countdown', seconds: 3 }], [200, { type: 'bomb', ...reset }], [200, roundStart(200)]]));
    p.replay.seek(500);
    expect(p.replay.seekStart()).toBe(200);
  });

  it('a segment with no round state: Home lands at its start', async () => {
    const p = await replayPage(segment([[100, score(1)]]));
    p.replay.seek(300);
    expect(p.replay.seekStart()).toBe(0);
    expect(p.replay.serverTick()).toBe(0);
  });

  it('a segment opened inside a round (its end comes before any `roundStart`): Home lands at its start, not the next round\'s', async () => {
    const over: ServerEvent = { type: 'roundOver', round: 1, winner: 'seal', wins: { seal: 1, terrorist: 0 }, matchOver: false, screens: [] };
    const p = await replayPage(segment([[100, over], [300, roundStart(300)]]));
    p.replay.seek(500);
    expect(p.replay.seekStart()).toBe(0);
    for (const ev of [{ type: 'timeExpired' }, { type: 'eliminated', winner: 'seal' }, { type: 'roundTime', seconds: 540 }] as ServerEvent[]) {
      const q = await replayPage(segment([[100, ev], [300, roundStart(300)]]));
      expect(q.replay.seekStart(), ev.type).toBe(0);
    }
  });

  it('an abandon in the launch hold (before round 1: room.ts `Room.clock`, :4222) is no round: Home goes on to the `roundStart`', async () => {
    const p = await replayPage(segment([[50, { type: 'abandoned' }], [300, roundStart(300)]]));
    expect(p.replay.seekStart()).toBe(300);
  });
});
