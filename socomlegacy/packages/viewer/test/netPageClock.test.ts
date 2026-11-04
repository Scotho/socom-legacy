// test/netPageClock.test.ts -- RE-3 (web sprint 38; W38.R3; research 249 §4): the page's round timer, launch countdown and
// round screens read the replay's clock in the replay mode only; the live page's path is byte-equal (the online seat's
// condition 1), held by a digest of its outputs, as PTT-8 did -- pinned on the base commit's `netPage.ts` (7397c20ed),
// re-pinned by AD-12 (C07, research 315 §13) when the held last round screen became part of what the live page draws.
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import type { ReplayRecord } from '../../match/src/replay/format';
import { ENGINE_READ_S, FINAL_ROUND_S, GAME_COMPLETE_S, ROUND_COMPLETE_S } from '../../match/src/room';
import { DEFAULT_MODEL } from '../src/hud';
import type { WebSocketLike } from '../src/net/client';
import { JOIN_STATE_VERSION, TICK_HZ, type HostageWire, type ServerEvent } from '../src/net/protocol';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { RemotePlayers } from '../src/remotePlayers';
import { PAGE_FIGURE_DEFAULT_S } from '../src/replay/fold';
import { asNetClient, ReplayClient, type LoadedSegment } from '../src/replay/replayClient';
import type { WalkMode } from '../src/walk';
import { ALPHA, BRAVO, body, header } from './replayFixture';

afterEach(() => { vi.restoreAllMocks(); });

/**
 * The live page's outputs over a fixed sequence -- a launch countdown told twice, called off and told again, two rounds
 * (a minute taken off, time expired, an elimination), each round end's screens through `ENGINE_READ_S`, ROUND COMPLETE,
 * FINAL ROUND and GAME COMPLETE, a rejoin's welcome into a standing result, an abandon, the hostages' Lead and Rescue --
 * on a `performance.now` the test steps (`t`), plus a thousandth of a millisecond a call, so a read added to or taken from
 * the live path moves every figure after it.
 */
function liveOutputs(): string {
  let t = 5000, calls = 0, keepAlive = false;
  // The fake room's keep-alive (below) reads the clock uncounted: it is the sequence's carrier, not a step in it.
  vi.spyOn(performance, 'now').mockImplementation(() => keepAlive ? t : t + (calls++) * 0.001);
  const out: unknown[] = [];
  const log = (what: string) => (...a: unknown[]): void => { out.push([what, ...a]); };
  const hud: NetPageDeps['hud'] = {
    postMessage: log('post'), setTimer: log('timer'), setHealth: log('health'), setScoreRows: log('rows'),
    setRoundScreen: log('screen'), startRound: log('startRound'),
  };
  const remote = {
    setTeam: () => undefined, setType: () => undefined, setKit: () => undefined, forget: () => undefined, died: () => undefined,
    hydrateCorpse: log('corpse'), markGhost: () => undefined, clear: () => undefined, frame: () => undefined,
    setEscortee: () => undefined, setOpacity: () => undefined, feet: () => null, playerType: () => 0,
  } as unknown as RemotePlayers;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setTrigger: () => undefined,
    setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'walk', setFlinchPose: () => undefined,
    feet: () => [0, 0, 0],
  } as unknown as WalkMode;
  let socket: WebSocketLike | null = null;
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined, respawned: () => undefined,
    newRound: log('newRound'), roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    socket: () => { socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike; return socket; },
  };
  const net = new NetPage(deps, 'ws://test/ws', 'MP6', 'Tester', undefined, false, 'classic');
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  const read = (label: string): void => {
    net.frame(1 / 60, {} as never, false);
    out.push([label, net.nextRoundIn(), net.screenUp(), net.hostageMarks(null), net.status(), net.prompt(), net.waitingRoom()]);
  };
  // NET-RES-2d (NET-RES.R9): a live room speaks every tick (a snapshot each 33 ms, a pong each 2 s), so the fake
  // one speaks at each step of the clock -- the link watch's 10 s bound kept.
  const at = (ms: number): void => {
    t = ms;
    keepAlive = true; server({ type: 'pong', t, tick: 0 } as ServerEvent); keepAlive = false;
  };
  const hostage = (id: number): HostageWire => ({
    id, name: `Hostage${id}`, character: 'mp_fem1', at: [id, 0, -id], yaw: 0, alive: true, ai: 0, leader: null, rescuer: null, opacity: 1, unit: 17,
  });
  const welcome = (extra: Record<string, unknown>): ServerEvent => ({
    type: 'welcome', id: 1, version: 9, map: 'MP6', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
    players: [{ id: 2, name: 'Bravo', team: 'terrorist' }], rules: 'classic', round: 1, rounds: 2, ghost: false, epoch: 0,
    env: { revision: 0, epoch: 0, states: [] }, ...extra,
  } as ServerEvent);
  const wins = { seal: 0, terrorist: 0 };

  // The launch countdown: told by the welcome, told again by the broadcast (one line), called off, told again.
  server(welcome({ countdown: 10, hostages: [hostage(50), hostage(51)] }));
  read('welcome');
  at(7000); server({ type: 'countdown', seconds: 8 }); read('countdown again');
  at(8000); server({ type: 'countdown', seconds: null }); read('called off');
  at(9000); server({ type: 'countdown', seconds: 5 }); read('countdown');
  at(12500); read('countdown running');
  // Round 1: 100 s; a minute off (40 s); the hostages led and rescued; time expired; ROUND COMPLETE.
  at(14000); server({ type: 'roundStart', round: 1, seconds: 100, wins, rounds: 2, epoch: 1, startTick: 0 }); read('round 1');
  at(24000); read('round 1 +10 s');
  at(25000); server({ type: 'roundTime', seconds: 40 }); read('minute off');
  at(26000); server({ type: 'hostageState', id: 50, alive: true, ai: 9, leader: 1, rescuer: null, opacity: 1, unit: 0 }); read('lead');
  at(27000); server({ type: 'hostageState', id: 50, alive: true, ai: 0x11, leader: 1, rescuer: 1, opacity: 0.5, unit: 0 }); read('rescued');
  at(28000); server({ type: 'hostageState', id: 50, alive: true, ai: 0, leader: null, rescuer: null, opacity: 1, unit: 17 }); read('reset in round');
  at(40000); read('round 1 +26 s');
  at(54000); server({ type: 'timeExpired' }); read('time expired');
  at(55000); read('expired +1 s');
  const roundComplete = [{ screen: 'roundComplete' as const, seconds: ROUND_COMPLETE_S }];
  at(56000); server({ type: 'roundOver', round: 1, winner: 'seal', wins: { seal: 1, terrorist: 0 }, matchOver: false, screens: roundComplete }); read('round over');
  at(56000 + (ENGINE_READ_S - 0.5) * 1000); read('engine read');
  at(56000 + (ENGINE_READ_S + 1) * 1000); read('round complete');
  at(56000 + (ENGINE_READ_S + ROUND_COMPLETE_S + 0.5) * 1000); read('screens done');
  server({ type: 'score', rows: [], timeLeft: null, spectators: [], wins: { seal: 1, terrorist: 0 } }); read('score, no clock');
  // Round 2: an elimination, then the match's end: FINAL ROUND, GAME COMPLETE.
  at(70000); server({ type: 'roundStart', round: 2, seconds: 120, wins: { seal: 1, terrorist: 0 }, rounds: 2, epoch: 2, startTick: 0 }); read('round 2');
  at(75000); server({ type: 'hostageState', id: 50, alive: true, ai: 0x11, leader: 1, rescuer: 1, opacity: 0.5, unit: 0 }); read('rescued again');
  at(80000); server({ type: 'score', rows: [], timeLeft: 100, spectators: [], wins: { seal: 1, terrorist: 0 } }); read('score, clock');
  at(90000); server({ type: 'eliminated', winner: 'seal' }); read('eliminated');
  const final = [{ screen: 'finalRound' as const, seconds: FINAL_ROUND_S }, { screen: 'gameComplete' as const, seconds: GAME_COMPLETE_S }];
  at(91000); server({ type: 'roundOver', round: 2, winner: 'seal', wins: { seal: 2, terrorist: 0 }, matchOver: true, screens: final }); read('match over');
  at(91000 + (ENGINE_READ_S + 2) * 1000); read('final round');
  at(91000 + (ENGINE_READ_S + FINAL_ROUND_S + 2) * 1000); read('game complete');
  // A rejoin's welcome into the standing result (the join envelope: `applyJoinState`), 4 s after it.
  at(110000);
  server(welcome({
    tick: 600, round: 2, hostages: [hostage(50)],
    join: { v: JOIN_STATE_VERSION, result: { round: 2, winner: 'seal', wins: { seal: 2, terrorist: 0 }, matchOver: true, screens: final, at: 360 }, projectiles: [], corpses: [], ghosts: [], drops: [] },
  }));
  read('rejoined');
  at(112000); read('rejoined +2 s');
  // An abandon; the waiting room; a score's clock.
  at(130000); server({ type: 'abandoned' } as ServerEvent); read('abandoned');
  at(131000); server({ type: 'score', rows: [], timeLeft: 50, spectators: [], wins }); read('score after abandon');
  at(141000); read('+10 s');
  return JSON.stringify(out);
}

/**
 * The digest of `liveOutputs()`. AD-12's pin (C07; LATER 52; research 315 §13; the merge controller's ruling, option B):
 * the last round screen is held at GO until the room's `roundStart` or `abandoned` (a client's `ReplayMission` and
 * `CloseAndSwitch` do nothing, `FUN_00280040`, `FUN_00281a70`), so the 'screens done' and 'score, no clock' reads draw
 * ROUND COMPLETE (secondsLeft 0, `screenUp` true; two `performance.now` reads more each -- the frame's `setRoundScreen` and
 * the read's `screenUp()`, each for its TIME PLAYED) where they drew null; nothing else in the sequence moves (the case beside the hash). Was: '0dc8bbe8fbc0d6b89ff6c8d82c46d91a82f04b83c5f92412aded48c3f5d2a4dd',
 * pinned on the base commit's `netPage.ts` (7397c20ed, before RE-3's change), which RE-3 left byte-equal.
 * Re-pinned at B139 for NET-RES-2d (NET-RES.R9, ee04f2583): `NetClient` reads `performance.now` once at its making and
 * once per message heard (`lastHeard`, the link watch's), so every figure after the first message moves by those
 * reads' thousandths; with the per-call offset off, main's (c9a4b6074) and this tree's outputs are byte-equal
 * (ba8e68aa...), so nothing else moved. Was AD-12's 'e88ad2b289689050a1f04fcab26202c5766f4ba9d4187a1b3d56de816da1e365'.
 * Re-pinned at B200 for TAUNT-WRAP (8mqnCJBx, research 87 §14.1; its re-review fold 75380043a, landed in B198 by
 * e3d2c41e3): `eliminationLines` (`./net/rules`) carries each line's script scale as `post`, so the 'eliminated' read's
 * `post` log holds `post: 0.7` and `post: 0.9` beside the two lines' text and scale; netPage.ts is unchanged by it, and with
 * the `post` key dropped from the outputs this tree's digest is the B139 pin's, so nothing else moved. Was B139's
 * '246a943927165d5bbcb560f702fa1f21762569e9d251f09e08cc34bbf3a98519'.
 */
const LIVE_DIGEST_BASE = 'ca6290f07c8bbed3ee4e1bfdb5f382d2bb9c584b8504d22bd515a6b9d77a90a6';

describe('RE-3: the live page\'s path is byte-equal (the online seat\'s condition 1)', () => {
  it('the live outputs over a fixed sequence hash to the pinned digest (AD-12\'s; was the base commit\'s)', () => {
    const outputs = liveOutputs();
    expect(outputs.length).toBeGreaterThan(1000);
    expect(createHash('sha256').update(outputs).digest('hex')).toBe(LIVE_DIGEST_BASE);
  });
  it('the sequence is deterministic: two runs, one digest', () => {
    expect(liveOutputs()).toBe(liveOutputs());
  });

  /**
   * AD-12 (C07; LATER 52; research 315 §13): what the live outputs hold at the round ends. The last screen is held past
   * the room's seconds until the room moves on (a client's `ReplayMission` / `CloseAndSwitch` do nothing, `FUN_00280040`
   * D:L127387-127393, `FUN_00281a70` D:L128114-128131): at 'screens done' (`ENGINE_READ_S` + `ROUND_COMPLETE_S` + 0.5 s,
   * no `roundStart` yet) ROUND COMPLETE stays up at GO -- was null --, let go by round 2's `roundStart`; the match's end
   * keeps a screen up from FINAL ROUND through the rejoin's standing result (FINAL ROUND again, its result 4 s old) to
   * 'rejoined +2 s', let go by the `abandoned`.
   */
  it('AD-12 C07: the held last screen at the round ends -- ROUND COMPLETE at GO at \'screens done\', the match\'s end up to the abandon', () => {
    const out = JSON.parse(liveOutputs()) as unknown[][];
    /** The screen the frame of read `label` set (the last `screen` log before it), and that read's `screenUp()`. */
    const at = (label: string): { screen: { kind: string; secondsLeft: number } | null; up: unknown } => {
      const i = out.findIndex((e) => e[0] === label);
      expect(i, label).toBeGreaterThan(0);
      let screen: { kind: string; secondsLeft: number } | null = null;
      for (let j = i - 1; j >= 0; j--) if (out[j]![0] === 'screen') { screen = out[j]![1] as typeof screen; break; }
      return { screen, up: out[i]![2] };
    };
    const done = at('screens done');
    expect(done.screen).toMatchObject({ kind: 'roundComplete', secondsLeft: 0 });
    expect(done.up).toBe(true);
    expect(at('score, no clock').screen).toMatchObject({ kind: 'roundComplete', secondsLeft: 0 });
    expect(at('round 2')).toEqual({ screen: null, up: false });
    expect(at('final round').screen).toMatchObject({ kind: 'finalRound' });
    expect(at('game complete').screen).toMatchObject({ kind: 'gameComplete' });
    for (const label of ['rejoined', 'rejoined +2 s']) {
      expect(at(label).screen, label).toMatchObject({ kind: 'finalRound' });
      expect(at(label).up, label).toBe(true);
    }
    expect(at('abandoned')).toEqual({ screen: null, up: false });
  });
});

// ---- the replay mode: the replay's clock (W38.R3) ----

const HZ = TICK_HZ;
const msOf = (ticks: number): number => (ticks * 1000) / HZ;
const ticksOf = (seconds: number): number => seconds * HZ;

/**
 * A segment of `end` ticks: Alpha and Bravo from tick 0, then the `hostages` record when `roster` is given (before the
 * first snapshot, as the room writes it), `events` at their ticks before that tick's snapshot (the room's order), a
 * snapshot every 2 ticks.
 */
function segment(events: readonly [number, ServerEvent][], o: { end?: number; roster?: HostageWire[] } = {}): LoadedSegment {
  const end = o.end ?? 3600;
  const h = header({ map: 'MP6' });
  const records: ReplayRecord[] = [{ kind: 'header', header: h }, { kind: 'players', tick: 0, players: [ALPHA, BRAVO] }];
  for (let tick = 0; tick <= end; tick++) {
    if (o.roster && tick === 0) records.push({ kind: 'hostages', tick, hostages: o.roster });
    for (const [t, event] of events) if (t === tick) records.push({ kind: 'event', tick, event });
    if (tick % 2 === 0) records.push({ kind: 'snap', tick, bodies: [body(1, tick), body(2, -tick)] });
  }
  records.push({ kind: 'end', tick: end, reason: 'closed' });
  return { header: h, records, truncated: false };
}

/**
 * A watcher's NetPage on a ReplayClient, built as the test room's replay branch builds it: the client alone, the page
 * taking the replay's clock off it (`ReplayClient.pageClock`); `inject`, through the dep instead (`NetPageDeps.replayClock`).
 */
async function replayPage(seg: LoadedSegment, o: { inject?: boolean } = {}) {
  let wall = 0;
  const replay = new ReplayClient(Promise.resolve(seg), { name: 'Watcher', map: 'MP6', now: () => wall });
  const timer: number[] = [], posted: string[] = [], screens: ({ kind: string; secondsLeft: number } | null)[] = [];
  const hud: NetPageDeps['hud'] = {
    postMessage: (text) => { posted.push(typeof text === 'string' ? text : text.map((l) => l.text).join('/')); },
    setTimer: (s) => { timer.push(s); }, setHealth: () => undefined, setScoreRows: () => undefined,
    setRoundScreen: (s) => { screens.push(s ? { kind: s.kind, secondsLeft: s.secondsLeft } : null); }, startRound: () => undefined,
  };
  const remote = {
    setTeam: () => undefined, setType: () => undefined, setKit: () => undefined, forget: () => undefined, died: () => undefined,
    hydrateCorpse: () => undefined, markGhost: () => undefined, clear: () => undefined, frame: () => undefined, bodies: () => [],
    setEscortee: () => undefined, setOpacity: () => undefined, feet: () => null, playerType: () => 0,
  } as unknown as RemotePlayers;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setTrigger: () => undefined,
    setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'fly', setFlinchPose: () => undefined,
    feet: () => [0, 0, 0],
  } as unknown as WalkMode;
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined, respawned: () => undefined,
    newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    client: () => asNetClient(replay), ...(o.inject ? { replayClock: replay.pageClock() } : {}),
  };
  const net = new NetPage(deps, 'replay:', 'MP6', 'Watcher', undefined, true, 'classic');
  await replay.ready;
  const camera = new PerspectiveCamera();
  const frame = (): void => { replay.advance(); net.frame(1 / 60, camera, false); };
  return {
    replay, net, timer, posted, screens, frame,
    /** The wall clock on by `ms`, then one page frame (the mode's: the records played, then the page's frame). */
    wait: (ms: number): void => { wall += ms; frame(); },
    lastTimer: (): number | undefined => timer.at(-1),
    starts: (): number => posted.filter((l) => l.startsWith('GAME STARTS IN')).length,
  };
}

const wins = { seal: 0, terrorist: 0 };
const roundStart = (round: number, seconds: number): ServerEvent => ({ type: 'roundStart', round, seconds, wins, rounds: 11, epoch: round, startTick: 0 });
const scoreLeft = (timeLeft: number | null): ServerEvent => ({ type: 'score', rows: [], timeLeft, spectators: [], wins });
const roundOver = (round: number): ServerEvent => ({
  type: 'roundOver', round, winner: 'seal', wins: { seal: round, terrorist: 0 }, matchOver: false, screens: [{ screen: 'roundComplete', seconds: ROUND_COMPLETE_S }],
});

describe('RE-3: the replay\'s clock drives the page\'s timers (W38.R3; research 249 §4)', () => {
  it('paused, the round timer stands still; at 4x it runs at 4x -- the clock off the client, and through the dep alike', async () => {
    for (const inject of [false, true]) {
      const p = await replayPage(segment([[60, roundStart(1, 100)], [60, scoreLeft(100)]]), { inject });
      p.wait(msOf(120));                                   // to tick 120: 1 s into the round
      expect(p.lastTimer()).toBeCloseTo(99, 6);
      p.replay.pause();
      p.wait(5000);                                        // 5 s of wall, paused
      expect(p.lastTimer()).toBeCloseTo(99, 6);
      p.wait(5000);
      expect(p.lastTimer()).toBeCloseTo(99, 6);
      p.replay.play();
      p.replay.speed(4);
      p.wait(1000);                                        // 1 s of wall at 4x: 4 s of the round
      expect(p.lastTimer()).toBeCloseTo(95, 6);
      p.replay.speed(0.25);
      p.wait(2000);                                        // 2 s of wall at a quarter: half a second
      expect(p.lastTimer()).toBeCloseTo(94.5, 6);
    }
  });

  it('the client\'s clock: one object a replay, its time 0 before the recording opens, the replay\'s tick over its rate after', async () => {
    let wall = 0;
    const seg = segment([[60, roundStart(1, 100)]]);
    const replay = new ReplayClient(Promise.resolve(seg), { name: 'W', map: 'MP6', now: () => wall });
    const clock = replay.pageClock();
    expect(replay.pageClock()).toBe(clock);
    expect(clock.now()).toBe(0);
    expect(clock.stoppedFigure()).toBeNull();
    await replay.ready;
    wall = msOf(90);
    expect(clock.now()).toBeCloseTo(msOf(replay.serverTick()), 9);
    replay.pause();
    replay.seek(30);                                       // before round 1: the page's first figure
    expect(clock.now()).toBeCloseTo(msOf(30), 9);
    expect(clock.stoppedFigure()).toBe(PAGE_FIGURE_DEFAULT_S);
  });

  it('the round\'s screens follow it too: ROUND COMPLETE ENGINE_READ_S after the roundOver in replay time, standing while paused', async () => {
    const p = await replayPage(segment([[60, roundStart(1, 100)], [60, scoreLeft(100)], [600, roundOver(1)]]));
    p.wait(msOf(600 + ticksOf(ENGINE_READ_S) - 30));      // half a second before the engine reads the result: no screen
    expect(p.screens.at(-1)).toBeNull();
    p.replay.pause();
    p.wait(10_000);
    expect(p.screens.at(-1)).toBeNull();                   // paused: the engine's read never comes
    expect(p.net.screenUp()).toBe(false);
    p.replay.play();
    p.replay.speed(2);
    p.wait(1000);                                          // 2 s of replay: 1.5 s into ROUND COMPLETE
    expect(p.screens.at(-1)?.kind).toBe('roundComplete');
    expect(p.screens.at(-1)?.secondsLeft).toBeCloseTo(ROUND_COMPLETE_S - 1.5, 6);
  });

  it('a seek into a stopped period keeps the figure the live page kept there: the clock at the round end, 0 after time expired, the page\'s first before any', async () => {
    const p = await replayPage(segment([
      [60, roundStart(1, 100)], [60, scoreLeft(100)],
      [60 + ticksOf(20), { type: 'eliminated', winner: 'seal' }], [60 + ticksOf(20), roundOver(1)],   // 80 s left at the round's end
      [1500, roundStart(2, 100)], [1500, scoreLeft(100)],
      [1500 + ticksOf(100), { type: 'timeExpired' }], [1500 + ticksOf(101), roundOver(2)],
      [1500 + ticksOf(110), roundStart(3, 100)], [1500 + ticksOf(110), scoreLeft(100)],
    ], { end: 1500 + ticksOf(130) }));
    p.replay.seek(1500 + ticksOf(105));                    // round 2's end, after its time expired: the live page's 0
    p.frame();
    expect(p.lastTimer()).toBe(0);
    p.replay.seek(1300);                                   // round 1's end, from round 2's: the 80 s it stopped on
    p.frame(); p.frame();
    expect(p.lastTimer()).toBeCloseTo(80, 6);
    p.replay.seek(1500 + ticksOf(120));                    // round 3 running: 90 s
    p.frame();
    expect(p.lastTimer()).toBeCloseTo(90, 6);
    p.replay.seek(1300);                                   // and back to the stop: 80 again, not round 3's figure
    p.frame();
    expect(p.lastTimer()).toBeCloseTo(80, 6);
    p.replay.seek(30);                                     // before round 1: the page's first figure (the HUD's six minutes)
    p.frame();
    expect(p.lastTimer()).toBe(PAGE_FIGURE_DEFAULT_S);
    expect(PAGE_FIGURE_DEFAULT_S).toBe(DEFAULT_MODEL.timer);
  });

  it('a seek into the launch countdown posts its line once, not again on the fold\'s welcome; its clock is the replay\'s', async () => {
    const p = await replayPage(segment([[120, { type: 'countdown', seconds: 10 }], [120 + ticksOf(10), roundStart(1, 100)], [120 + ticksOf(10), scoreLeft(100)]]));
    p.replay.seek(120 + ticksOf(4));                       // from before the countdown into it: posted once, 6 s
    p.frame();
    expect(p.starts()).toBe(1);
    expect(p.posted.at(-1)).toBe('GAME STARTS IN 6 SECONDS');
    expect(p.lastTimer()).toBeCloseTo(6, 6);
    p.replay.seek(120 + ticksOf(7));                       // within the same countdown: no second line
    p.frame();
    expect(p.starts()).toBe(1);
    expect(p.lastTimer()).toBeCloseTo(3, 6);
    p.replay.seek(120 + ticksOf(2));                       // back within it: none either
    p.frame();
    expect(p.starts()).toBe(1);

    const q = await replayPage(segment([[120, { type: 'countdown', seconds: 10 }], [120 + ticksOf(10), roundStart(1, 100)]]));
    q.wait(msOf(180));                                     // played through the countdown's start: its line, once
    expect(q.starts()).toBe(1);
    q.replay.seek(120 + ticksOf(5));                       // a seek within it: the page holds that countdown, no second line
    q.frame();
    expect(q.starts()).toBe(1);
    expect(q.lastTimer()).toBeCloseTo(5, 6);
  });

  it('a backward seek across a rescue restores the hostage\'s compass mark (hostageSaid cleared by the seek\'s welcome)', async () => {
    const roster: HostageWire[] = [240, 241].map((id) => ({
      id, name: `Hostage${id}`, character: 'mp_fem1', at: [id, 0, -id] as [number, number, number], yaw: 0, alive: true, ai: 0x17,
      leader: null, rescuer: null, opacity: 1, unit: 17,
    }));
    const rescued: ServerEvent = { type: 'hostageState', id: 240, alive: true, ai: 0x11, leader: 1, rescuer: 1, opacity: 0.5, unit: 0 };
    const back: ServerEvent = { type: 'hostageState', id: 240, alive: true, ai: 0x17, leader: null, rescuer: null, opacity: 1, unit: 17 };
    const p = await replayPage(segment([[60, roundStart(1, 100)], [300, rescued], [400, back]], { end: 900, roster }));
    const marked = (): number[] => p.net.hostageMarks(null).filter((m) => m.bitmap === 'ret_hostage.tif').map((m) => m.x);
    p.wait(msOf(200));
    expect(marked()).toEqual([240, 241]);
    p.wait(msOf(250));                                     // played across the rescue (and the state put back at 400)
    expect(marked()).toEqual([241]);                       // the live page's: the rescued one's mark off until the next round
    p.replay.seek(200);                                    // back before the rescue: the mark again
    expect(marked()).toEqual([240, 241]);
  });
});
