// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import {
  HELD_RIFLE, HELD_SIDEARM, type CollisionOwner, type GridParams, type SpawnSlot, type WorldPoly,
} from '@s2u/scene';
import { FIRE_ARRIVAL_JITTER_TICKS } from '../../match/src/room';
import { Fire } from '../src/fire';
import { FrameTime } from '../src/frameTime';
import { Hud } from '../src/hud';
import { MAX_TICKS, TICK, Walker } from '../src/mover';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import { decodeCommands, frameKind } from '../src/net/codec';
import { Frame } from '../src/net/protocol';
import { LoopbackMatch, simMapOfLoaded } from '../src/net/loopback';
import type { ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import { packGround, TICK_HZ } from '../src/sim';
import { WalkMode } from '../src/walk';

/**
 * NCW-8, first half (the netcode wave's B-resync, plan `2026-11-05-netcode-wave.md` sections 4 and 6): the page's
 * long-gap path MEASURED, before any change. A characterisation: every number below is today's behaviour, pinned as the
 * "before" the resync (the second half) is judged against. No behaviour changes here.
 *
 * What is the page's own code and what is modelled:
 * - real: `NetPage` (the rounds' naming: `fireEvent`, LATER 347's held press round `flushPressRounds`), `NetClient` (the
 *   commands' numbering and send, one frame a tick: `tick`; since the second half, the frame's send order), `FrameTime`,
 *   the walk's tick loop (`Walker.advance`, `MAX_TICKS`), the round's own tick (`WalkMode.tickAim`, LATER 338), the kit's
 *   step loop (`Fire.update`, LATER 326), and the room (`Room` behind `LoopbackMatch`: its arrival check `timed`,
 *   `signals.staleFires`, and `decide`'s `stale`).
 * - stubbed (the first half's review, finding 3): the round's emit is the test's `kit.pullRound`, NOT `Fire.pullRound`.
 *   `Fire.update`'s step loop is real and calls it, but the stub leaves out LATER 587's online gate mirror
 *   (`ROOM_GATE_MIRROR_ADAPTATION`, `fire.ts` `FireSource.roundSeq`, `:1110-1125`) and the kit's raise and ready checks:
 *   a round the real kit would hold back on the room's gate is fired here. The second half changes no round's naming
 *   (only the order the frame's messages leave in, `NetClient`), so the stub's naming stays the page's and the stub is kept.
 * - mirrored from the page's frame (not exported): the frame's clamp `Math.min(frameTime.frame(now), 0.1)`
 *   (`src/matchMount.ts:1188`, `src/main.ts:1901`), and the frame's order -- `net.trigger`, `walk.frame` (the commands),
 *   `net.frame` (the held press round), `firearm.fireFrame` (`Fire.update`, the held trigger's rounds)
 *   (`src/matchMount.ts:1193-1207`); the walk's per-tick bookkeeping of `walk.ts:2423-2427` (`frameTicks`, `noteTick`'s
 *   `at`); a round's emit as `Fire.pullRound` names it (`fire.ts:2006` the wait set to `fireWait`, `fire.ts:2021` the
 *   round's `seq` its tick's command). The weapon is the disc's M4A1 SD record (`HELD_RIFLE`, `fireWait` 0.14 s).
 * - a hidden tab: no frames at all (the browser stops `requestAnimationFrame`; the page has no `visibilitychange` path
 *   of its own for the match -- `src/main.ts:2653` stops only the shot driver and the solo agent), the socket left open
 *   (the server's heartbeat is answered by the browser itself), the room stepping on at 60 Hz with no commands from the
 *   seat (a silent seat is not stepped: `room.ts` `RECONNECT_ALIVE_WINDOW_MS_ADAPTATION`'s note).
 * - the room's step relative to the page's frame: `after` -- the room steps only once the frame's commands and rounds
 *   have all arrived (they leave in one JavaScript task); `between` -- one room step lands just before the frame's first
 *   round reaches the room, after every message the page sent ahead of it (before the second half: after all the frame's
 *   commands, which left during `walk.frame`, the rounds later in `fireFrame`; on a socket they are separate messages,
 *   and the server's step timer can run between two of its reads); a frame with no round takes it after its messages.
 *   The page's frame runs as one task, as `src/matchMount.ts:1185-1207`'s does: no await inside it, so the page's
 *   microtasks (the second half's held commands) run only at its end. `between` is applied to EVERY frame that owes a
 *   step (the first half's review, finding 2), so its rates are an upper bound on what a server's timer would land.
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };

/** The loopback suite's flat map (`./loopback.test.ts` `loaded`): one floor, a slot a side. */
function loaded() {
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: 2, facing: [1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  return {
    path: 'RUN/MP99.ZDB', name: 'FLAT', ground: packGround(PARAMS, [floor], owners),
    slots: [slot(0, 0, -100, 0), slot(1, 0, 100, 0)], respawns: [slot(0, 0, -300, 0)], doors: [],
  };
}

/** The page's frame clamp (`src/matchMount.ts:1188`, `src/main.ts:1901`): "a backgrounded tab must not teleport the camera". */
const FRAME_CLAMP_S = 0.1;
const FRAME_MS = 1000 / 60;

const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

/** A stand-in with no-op methods for whatever a dependency is asked that the measure does not read. */
function inert<T extends object>(base: T): T {
  return new Proxy(base, { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => undefined) });
}

/** The walk's mover as `Walker.advance`, `alpha` and `ticksFor` read it: its accumulator and a tick that moves nothing. */
const walkerStub = (): Walker => Object.assign(Object.create(Walker.prototype) as object, { accumulator: 0, tick: () => undefined }) as unknown as Walker;

type Arrival = { seq: number; ran: number; synced: boolean; at: 'steady' | 'back'; sent: number };
/** One round as the room receives it: its named command and its claim (the 60 fps pin's "same rounds, ticks and looks"). */
type Fired = { seq: number; viewTick: number; from: number[]; eye: number[]; aim: number[] };

/** The page and the room, joined: the page's frame as `src/matchMount.ts` orders it, the room behind the loopback socket. */
async function rig() {
  let now = 1_000_000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const match = new LoopbackMatch(simMapOfLoaded(loaded()), null, { rules: 'respawn', auto: false, respawnRules: true });
  let tap: ((cmd: Record<string, number>, feet: [number, number, number], facing?: readonly [number, number]) => void) | null = null;
  const walk = inert({
    setNetTap: (t: typeof tap) => { tap = t; }, respawn: () => true, mode: () => 'walk', setMode: () => true,
  }) as unknown as WalkMode;
  const stale: number[] = [];
  const arrivals: Arrival[] = [];
  const fired: Fired[] = [];
  /** The wire in arrival order: `c<seq>` a command frame (its newest command), `f<seq>` a round. */
  const wire: string[] = [];
  let phase: Arrival['at'] = 'steady';
  let lastCmd = 0;
  /** `between`: the frame's owed step, taken just before the frame's first round reaches the room. */
  let armed = false;
  const player = () => match.room.player(1) as unknown as { sim: { seq: number }; synced: boolean; signals: { staleFires: number } } | undefined;
  const deps: NetPageDeps = {
    walk, remote: inert({}) as unknown as RemotePlayers, hud: new Hud(), clips: () => null, remoteGrenade: () => undefined,
    spectate: () => undefined, respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined,
    weapons: () => [HELD_RIFLE, HELD_SIDEARM], solo: true, staleRound: (shot) => { stale.push(shot); },
    socket: () => {
      const s = match.socket('loopback:');
      const send = s.send.bind(s);
      // Each round's arrival: the room's last run command (`p.sim.seq`) as the round reaches `timed`.
      s.send = (d: string | Uint8Array) => {
        if (typeof d === 'string') {
          const m = JSON.parse(d) as Fired & { type: string };
          if (m.type === 'fire' && armed) { armed = false; step(); }
          const p = player();
          if (m.type === 'fire' && p) arrivals.push({ seq: m.seq, ran: p.sim.seq, synced: p.synced, at: phase, sent: lastCmd });
          if (m.type === 'fire') { fired.push({ seq: m.seq, viewTick: m.viewTick, from: m.from, eye: m.eye, aim: m.aim }); wire.push(`f${m.seq}`); }
        } else if (frameKind(d) === Frame.Commands) {
          const seqs = decodeCommands(d).commands.map((c) => c.seq);
          lastCmd = Math.max(lastCmd, ...seqs);
          wire.push(`c${Math.max(...seqs)}`);
        }
        send(d);
      };
      return s as WebSocketLike;
    },
  };
  const net = new NetPage(deps, 'loopback:', 'MP99', 'Solo', undefined, false, 'respawn');
  await flush();
  const t0 = now;
  let roomSteps = 0;
  const step = (): void => { match.step(); roomSteps++; };
  const dueSteps = (): number => Math.floor(((now - t0) * TICK_HZ) / 1000) - roomSteps;

  // The page's pieces, each the page's own code run on a stand-in that holds only what it reads.
  const camera = new PerspectiveCamera();
  const frameTime = new FrameTime();
  const walker = walkerStub();
  type Tick = { seq: number; eye: [number, number, number]; far: [number, number, number] };
  const view = { walking: true, frameTicks: [] as (Tick & { at: number })[] };
  let lastTick: Tick | null = null;
  let shot = 0;
  const from: [number, number, number] = [-100, 16.4, 0];
  const round = (seq?: number) => ({
    type: 'round', weapon: HELD_RIFLE, from, to: [-100, 16.4, -500], eye: from, aim: [0, 0, -1], hit: false, rounds: 1,
    shot: ++shot, ...(seq !== undefined ? { seq } : {}),
  }) as never;
  const kit = {
    takeKept: null, reloadPending: -1, afterShotPending: -1, reloadLeft: 0, afterShotLeft: 0, gameTime: 0, wait: 0, held: false,
    gateOpened: false, dryRan: false, shots: 0, shotsSeen: 0, tracerFrames: 0, gun: null, source: { look: () => null },
    kick: { reset: () => undefined }, tracerFrame: () => undefined, shadeLate: () => undefined, clipLate: () => undefined,
    dryFrame: () => undefined,
    /** `Fire.pullRound`: the round named at its own step's tick (`tickAim`, `fire.ts:1981`, `:2021`), the wait set (`:2006`). */
    pullRound(at?: number) {
      const own = at !== undefined ? WalkMode.prototype.tickAim.call(view as unknown as WalkMode, at)?.seq : undefined;
      this.wait = HELD_RIFLE.fireWait;
      this.shots++;
      net.fireEvent(round(own));
      return {};
    },
  };

  /** One page frame `ms` after the last, the trigger `held`; `press`: the pad's read pressed it this frame (`Fire.pull`). */
  const frame = async (ms: number, held: boolean, place: 'after' | 'between', press = false): Promise<void> => {
    now += ms;
    const due = dueSteps(), between = place === 'between' && due > 0 ? 1 : 0;
    for (let i = 0; i < due - between; i++) step();
    await flush();
    armed = between === 1;                                       // taken before the frame's first round (the socket's tap)
    const dt = Math.min(frameTime.frame(now), FRAME_CLAMP_S);
    if (press) { kit.held = true; kit.pullRound(); }             // `Fire.pull` in the pad's read: a round with no tick
    kit.held = held;
    net.trigger(held);                                           // `matchMount.ts:1193`
    // `walk.frame` (`walk.ts:2423-2427`): the frame's ticks from the time already run, each a command sent at once.
    const since = Walker.prototype.alpha.call(walker) * TICK;
    view.frameTicks = lastTick ? [{ ...lastTick, at: -since }] : [];
    let ran = 0;
    Walker.prototype.advance.call(walker, dt, { forward: 0, right: 0, boost: false }, () => {
      tap!({ forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 }, from, [0, 0]);
      const t: Tick = { seq: net.client.lastSeq(), eye: [...from], far: [-100, 16.4, -1000] };
      view.frameTicks.push({ ...t, at: ++ran * TICK - since });
      lastTick = t;
    });
    net.frame(dt, camera, held);                                 // `matchMount.ts:1201`: LATER 347's held press round
    (Fire.prototype as unknown as { update(this: typeof kit, dt: number): number }).update.call(kit, dt);   // `:1207`
    await flush();                                               // the frame's task ends: the page's microtasks run
    if (armed) { armed = false; step(); }                        // a frame with no round: its step after its messages
    await flush();
  };

  /** A hidden tab for `seconds`: no page frame, the room stepping at 60 Hz, its frames still reaching the page. */
  const hidden = async (seconds: number): Promise<void> => {
    const until = now + seconds * 1000;
    while (now + FRAME_MS <= until) {
      now += FRAME_MS;
      const due = dueSteps();
      for (let i = 0; i < due; i++) step();
      if (roomSteps % 60 === 0) await flush();
    }
    now = until;
    await flush();
  };

  return {
    net, match, stale, arrivals, fired, wire, frame, hidden, player, steps: () => roomSteps,
    mark: (at: Arrival['at']) => { phase = at; },
  };
}


type Row = {
  gap: number; place: 'after' | 'between'; trigger: 'held' | 'pressed'; fps: number;
  steadyRounds: number; steadyStale: number;
  gapSteps: number; firstFrameSent: number;
  backRounds: number; behind: number[]; staleOnArrival: number; staleFires: number; staleTold: number;
  /** Per round back: the newest command the room had been sent when the round reached it, less the round's named one. */
  ahead: number[];
};

/**
 * 2 s of 60 fps fire, a hidden tab for `gap` s (0: none), then the first second back at `fps` (the first frame back the
 * clamp's 0.1 s whatever the gap); `trigger` 'held': held through the gap (a pad's), 'pressed': let go before it and
 * pressed in the first frame back's pad read (`Fire.pull`, LATER 347's held press round).
 */
async function measure(gap: number, place: Row['place'], trigger: Row['trigger'], fps: number): Promise<Row> {
  const r = await rig();
  for (let i = 0; i < 30; i++) await r.frame(FRAME_MS, false, place);        // joined and synced, the trigger up
  for (let i = 0; i < 120; i++) await r.frame(FRAME_MS, true, place);        // 2 s of an automatic held
  const held = trigger === 'held';
  if (!held) await r.frame(FRAME_MS, false, place);                          // let go before the tab goes
  const steadyStale = r.player()!.signals.staleFires;
  const steadyTold = r.stale.length;
  const steady = r.arrivals.length;
  const stepsBefore = r.steps(), lastBefore = r.net.client.lastSeq();
  await r.hidden(gap);
  const gapSteps = r.steps() - stepsBefore;
  r.mark('back');
  const firesBefore = r.player()!.signals.staleFires;
  const ms = 1000 / fps;
  await r.frame(gap > 0 ? ms : 100, true, place, !held);                     // the first frame back: the clamp's 0.1 s
  const firstFrameSent = r.net.client.lastSeq() - lastBefore;
  for (let i = 1; i < fps; i++) await r.frame(ms, true, place);              // the rest of the first second
  for (let i = 0; i < 6; i++) { r.match.step(); await Promise.resolve(); }   // the room's answers back
  await new Promise((done) => setTimeout(done, 0));
  const back = r.arrivals.filter((a) => a.at === 'back');
  r.match.stop();
  return {
    gap, place, trigger, fps, steadyRounds: steady, steadyStale: steadyStale + steadyTold, gapSteps, firstFrameSent,
    backRounds: back.length,
    behind: back.map((a) => a.ran - a.seq),
    ahead: back.map((a) => a.sent - a.seq),
    staleOnArrival: back.filter((a) => a.synced && a.ran - a.seq > FIRE_ARRIVAL_JITTER_TICKS).length,
    staleFires: r.player()!.signals.staleFires - firesBefore,
    staleTold: r.stale.length - steadyTold,
  };
}

afterEach(() => { vi.restoreAllMocks(); });

/**
 * The first half's "before" (`agent/ncw-8` 68a54d347, the page before the second half), per first second back -- (fps,
 * the room's step, the trigger): the rounds sent, each round's "behind" as it arrived, the rounds stale on arrival, the
 * room's `staleFires` and the `stale` answers the page heard. The 20 and 30 fps rows are the second half's RED run on the
 * same code (this file's rig, run before the change). Every gap's row was its no-gap control's. Kept for the record and
 * printed beside the after; the assertions are the after's.
 */
const BEFORE: Record<string, [number, number[], number, number, number]> = {
  '60 after held': [7, [-1, 0, 0, 0, 0, 0, 0], 0, 0, 0],
  '60 after pressed': [7, [-1, 0, 0, 0, 0, 0, 0], 0, 0, 0],
  '60 between held': [7, [5, 1, 1, 1, 1, 1, 1], 1, 1, 1],
  '60 between pressed': [7, [5, 1, 1, 1, 1, 1, 1], 1, 1, 1],
  '10 after held': [6, [-1, -5, -3, -1, -5, -3], 0, 0, 0],
  '10 after pressed': [7, [-1, -2, 0, -4, -2, 0, -4], 0, 0, 0],
  '10 between held': [6, [5, 1, 3, 5, 1, 3], 2, 2, 2],
  '10 between pressed': [7, [5, 4, 6, 2, 4, 6, 2], 5, 5, 5],
  '20 after held': [7, [-1, -2, 0, -1, -2, 0, -1], 0, 0, 0],
  '20 after pressed': [7, [-1, -2, 0, -1, -2, 0, -1], 0, 0, 0],
  '20 between held': [7, [5, 1, 3, 2, 1, 3, 2], 1, 1, 1],
  '20 between pressed': [7, [5, 1, 3, 2, 1, 3, 2], 1, 1, 1],
  '30 after held': [7, [-1, -1, -1, -1, -1, -1, -1], 0, 0, 0],
  '30 after pressed': [7, [-1, 0, 0, 0, 0, 0, 0], 0, 0, 0],
  '30 between held': [7, [5, 1, 1, 1, 1, 1, 1], 1, 1, 1],
  '30 between pressed': [7, [5, 2, 2, 2, 2, 2, 2], 1, 1, 1],
};

/**
 * The 60 fps pin, from the second half's RED run on the first half's code (68a54d347): the wire in arrival order (`c<n>`
 * a command frame, `f<n>` a round named at command n) and each round's named command and view clock -- the same with
 * the room stepping after the frame or between its messages. A round named a command behind the newest sent
 * (`c41 f40`) is LATER 338's own tick: the step's time fell before the frame's tick (`WalkMode.tickAim`'s `at < 0`).
 */
const WIRE_60 = [
  'c1 c2 c3 c4 c5 c6 c7 c8 c9 c10 c11 c12 c13 c14 c15 c16 c17 c18 c19 c20 c21 c22 c23 c24 c25 c26 c27',
  'c28 c29 c30 f30 c31 c32 c33 c34 c35 c36 c37 c38 c39 c40 c41 f40 c42 c43 c44 c45 c46 c47 c48 c49 c50',
  'c51 f50 c52 c53 c54 c55 c56 c57 c58 c59 c60 c61 f60 c62 c63 c64 c65 c66 c67 c68 c69 c70 c71 f70 c72',
  'c73 c74 c75 c76 c77 c78 c79 c80 c81 f80 c82 c83 c84 c85 c86 c87 c88 c89 c90 c91 f90 c92 c93 c94 c95',
  'c96 c97 c98 c99 c100 c101 f100 c102 c103 c104 c105 c106 c107 c108 c109 c110 c111 f110 c112 c113 c114',
  'c115 c116 c117 c118 c119 c120 c121 f120 c122 c123 c124 c125 c126 c127 c128 c129 c130 c131 f130 c132',
  'c133 c134 c135 c136 c137 c138 c139 c140 c141 f140 c142 c143 c144 c145 c146 c147 c148 c149 c150 c151',
  'c152 c153 c154 c155 c156 c157 c158 c159 c160 f160 c161 c162 c163 c164 c165',
].join(' ');
const PIN_60: Record<string, { wire: string; fired: string }> = {
  after: { wire: WIRE_60, fired: '30@24.000 40@35.000 50@45.000 60@55.000 70@65.000 80@75.000 90@85.000 100@95.000 110@105.000 120@115.000 130@125.000 140@135.000 160@154.000' },
  between: { wire: WIRE_60, fired: '30@24.000 40@35.000 50@45.000 60@55.000 70@65.000 80@75.000 90@85.000 100@95.000 110@105.000 120@115.000 130@125.000 140@135.000 160@154.000' },
};

describe('NCW-8: the page back from a long gap -- the first half\'s "before", the second half\'s after', () => {
  it('the frame clamp binds before MAX_TICKS: a 70 s frame runs the clamp\'s 6 ticks, not 30 (`mover.ts` MAX_TICKS is never reached through the page)', () => {
    const fresh = walkerStub;
    expect(MAX_TICKS).toBe(30);
    expect(fresh().ticksFor(Math.min(70, FRAME_CLAMP_S))).toBe(6);
    expect(fresh().ticksFor(70)).toBe(MAX_TICKS);                // only an unclamped caller would reach it
  });

  it('a field-sized gap (70, 120, 180 s; 0 the control), then frames at 10, 20, 30 and 60 fps: no round stale on arrival, the room stepping after the frame or between its messages', async () => {
    const rows: Row[] = [];
    const runs: [number, number[]][] = [[60, [0, 70, 120, 180]], [10, [0, 70, 120, 180]], [20, [0, 70]], [30, [0, 70]]];
    for (const [fps, gaps] of runs) {
      for (const gap of gaps) {
        for (const place of ['after', 'between'] as const) {
          for (const trigger of ['held', 'pressed'] as const) rows.push(await measure(gap, place, trigger, fps));
        }
      }
    }
    const key = (r: Row): string => `${r.fps} ${r.place} ${r.trigger}`;
    const line = (r: Row): string => [
      `${r.gap} s`.padStart(5), String(r.fps).padStart(3), r.place.padEnd(7), r.trigger.padEnd(7), `${r.steadyRounds} / ${r.steadyStale}`.padEnd(14),
      String(r.gapSteps).padStart(9), String(r.firstFrameSent).padStart(15), String(r.backRounds).padStart(4),
      r.behind.join(',').padEnd(22), String(r.staleOnArrival).padStart(3), String(r.staleFires).padStart(10), String(r.staleTold).padStart(10),
      r.ahead.join(',').padEnd(16), (BEFORE[key(r)] ? String(BEFORE[key(r)]![2]) : '?').padStart(9),
    ].join(' | ');
    console.log([
      '',
      'NCW-8 long gap: "between" is applied to EVERY frame owing a room step (the first half\'s review, finding 2), so its rates are an UPPER BOUND.',
      'An M4A1 SD (fireWait 0.14 s), 2 s of fire at 60 fps, a hidden tab of `gap` s, then the first second back at `fps`.',
      '"behind" = the room\'s last run command less the round\'s named command as each round arrives (> 3: stale on arrival);',
      '"ahead" = the newest command sent ahead of the round less its named one; "before >3" = the first half\'s count.',
      '  gap | fps | room    | trigger | steady / stale | gap steps | sent in frame 1 | back | behind                 |  >3 | staleFires | stale told | ahead            | before >3',
      ...rows.map(line),
    ].join('\n'));
    // The room stepped through the gap (70 s is 4,199 steps on the rig's summed 16.67 ms clock, the others whole); the
    // 2 s before it refused nothing; every first frame back sent the clamp's six commands.
    expect(rows.map((r) => [r.gap, r.gapSteps, r.steadyRounds, r.steadyStale, r.firstFrameSent])).toEqual(
      rows.map((r) => [r.gap, ({ 0: 0, 70: 4199, 120: 7200, 180: 10800 } as Record<number, number>)[r.gap], 12, 0, 6]));
    // The after: the same rounds as before (the naming is LATER 338's and 347's, unchanged), none stale on arrival, none
    // refused `stale`, none told -- and each round reached the room with at most one command newer than the one it names
    // sent ahead of it (a round named at the previous frame's last tick, `WalkMode.tickAim`'s `at < 0`), so no placement
    // of the room's step can leave it more than `FIRE_ARRIVAL_JITTER_TICKS` behind.
    expect(rows.map((r) => [key(r), r.gap, r.backRounds, r.staleOnArrival, r.staleFires, r.staleTold, Math.max(...r.ahead) <= 1])).toEqual(
      rows.map((r) => [key(r), r.gap, BEFORE[key(r)]![0], 0, 0, 0, true]));
    expect(rows.every((r) => r.backRounds > 0)).toBe(true);
    // The first half's headline holds after: the gap's length changes nothing -- each gap's first second back is its
    // no-gap control's (a single 0.1 s hitch).
    for (const r of rows.filter((x) => x.gap > 0)) {
      const control = rows.find((x) => x.gap === 0 && key(x) === key(r))!;
      expect([r.backRounds, r.behind, r.staleOnArrival, r.staleFires, r.staleTold]).toEqual([control.backRounds, control.behind, control.staleOnArrival, control.staleFires, control.staleTold]);
    }
  }, 600_000);

  /**
   * A low-ping, normal-frame-rate game is exactly as before: 60 fps frames of one tick each, the room after the frame or
   * between its messages -- the same wire (every command and round, in the same order) and the same rounds (the named
   * command and the view clock; the stub's claim -- `from`, `eye`, `aim` -- is a constant, so a round's look is its named
   * tick). Pinned from the first half's code (68a54d347), the second half's RED run.
   */
  it('60 fps, low ping: the same wire and the same rounds as before the second half', async () => {
    const got: Record<string, { wire: string; fired: string }> = {};
    for (const place of ['after', 'between'] as const) {
      const r = await rig();
      for (let i = 0; i < 30; i++) await r.frame(FRAME_MS, false, place);
      for (let i = 0; i < 120; i++) await r.frame(FRAME_MS, true, place);
      for (let i = 0; i < 10; i++) await r.frame(FRAME_MS, false, place);
      for (let i = 0; i < 6; i++) await r.frame(FRAME_MS, i < 3, place, i === 0);   // a press in the pad's read
      r.match.stop();
      got[place] = { wire: r.wire.join(' '), fired: r.fired.map((f) => `${f.seq}@${f.viewTick.toFixed(3)}`).join(' ') };
      expect(r.player()!.signals.staleFires).toBe(0);
    }
    console.log(`\nNCW-8 60 fps pin:\n${JSON.stringify(got, null, 1)}`);
    expect(got).toEqual(PIN_60);
  }, 120_000);

  /**
   * The review's finding 1: a real 60 fps game's frames jitter, and a two-tick frame is held (`NetClient.beginFrame`): a
   * round named at its first tick now leaves `c1 f1 c2`, before the second half `c1 c2 f1`. The wire reorders only so, and
   * the room's result is the same. The before is the same page with the hold taken off (`beginFrame` absent, as on a
   * replay's client): the second half's own code otherwise, so the two runs differ in the send order alone. The limit of
   * "the same room result" here: the stub's claim (`kit.pullRound`'s constant `from`/`eye`/`aim`, the header's finding 3)
   * is refused `fire: cone: eye` by the room every time, both ways (24 of 24, the run's print), so what is the same is
   * that refusal tally and `staleFires` 0 -- no round is decided past the cone here, either way.
   */
  it('60 fps with jitter (two-tick frames): the wire reorders only so each round follows its own command; the same rounds and the same room result as before', async () => {
    const run = async (hold: boolean, place: 'after' | 'between') => {
      const r = await rig();
      if (!hold) (r.net.client as { beginFrame?: () => void }).beginFrame = undefined;
      for (let i = 0; i < 30; i++) await r.frame(FRAME_MS, false, place);
      // A seeded jitter (an LCG) of a 60 fps frame: 0.5, 1 or 1.5 frames long -- some frames two ticks, some none.
      let x = 7;
      for (let i = 0; i < 240; i++) {
        x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
        await r.frame(FRAME_MS * [0.5, 1, 1.5][x % 3]!, true, place);
      }
      r.match.stop();
      const p = r.player()!;
      return {
        wire: r.wire.join(' '), fired: r.fired.map((f) => `${f.seq}@${f.viewTick.toFixed(3)}`).join(' '),
        room: { staleFires: p.signals.staleFires, refused: { ...(p as unknown as { signals: { refused: Record<string, number> } }).signals.refused } },
        ahead: r.arrivals.map((a) => a.sent - a.seq),
      };
    };
    for (const place of ['after', 'between'] as const) {
      const after = await run(true, place), before = await run(false, place);
      console.log(`
NCW-8 60 fps jitter (${place}): rounds ${after.fired.split(' ').length}; ahead after ${after.ahead.join(',')}; before ${before.ahead.join(',')}; room ${JSON.stringify(after.room)}`);
      expect(after.fired).toBe(before.fired);                    // the same rounds, named at the same commands
      expect(after.room).toEqual(before.room);                   // the room's result the same
      expect(after.room.staleFires).toBe(0);
      expect(after.wire).not.toBe(before.wire);                  // the reorder is real ...
      expect(after.wire.split(' ').sort()).toEqual(before.wire.split(' ').sort());   // ... and only a reorder
      expect(Math.max(...after.ahead)).toBeLessThanOrEqual(Math.max(...before.ahead));
      expect(after.wire).toMatch(/c(\d+) f\1 c/);                // a round right after its own command, the frame's next held
      expect(before.wire).toMatch(/c(\d+) c\d+ f\1\b/);          // before: behind its frame's second command
    }
  }, 120_000);

  /**
   * (d) The reconnect. The loopback's hello carries no account (`LoopbackSocket.deliver` calls `room.hello` with none), so
   * the room's resume (`Room.resumable`, `RECONNECT_ALIVE_WINDOW_MS_ADAPTATION` 10 s) cannot be staged through it; the
   * page is measured against a fake socket and the room's rule computed (`FIRE_ARRIVAL_JITTER_TICKS` against the resumed
   * seat's `sim.seq`, which the room's `resume` carries: `room.ts` `resumeEvent`). A drop of 70-181 s is past the window:
   * the room's hello takes the seat over (`takeOver`, a new `Player`, synced at its first command, `room.ts` `run`), so
   * only a drop inside the window resumes. The page's new client numbers from 0 (`client.ts` `seq = 0`) until the
   * `resume` (`resumed`: `seq = max(seq, ev.seq)`); a frame that runs between the welcome and the resume -- two socket
   * messages, two tasks -- names its rounds at the new client's low count.
   */
  it('a reconnect inside the resume window: a frame between the welcome and the resume sends nothing -- no command, round, reload or throw; after it, rounds name the resumed count', async () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    let tap: ((cmd: Record<string, number>, feet: [number, number, number], facing?: readonly [number, number]) => void) | null = null;
    const sockets: (WebSocketLike & { sent: (string | Uint8Array)[] })[] = [];
    const walk = inert({
      setNetTap: (t: typeof tap) => { tap = t; }, respawn: () => true, resume: () => true, mode: () => 'walk', setMode: () => true,
    }) as unknown as WalkMode;
    const deps: NetPageDeps = {
      walk, remote: inert({ bodies: () => [] }) as unknown as RemotePlayers, hud: new Hud(), clips: () => null, remoteGrenade: () => undefined,
      spectate: () => undefined, respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined,
      weapons: () => [HELD_RIFLE, HELD_SIDEARM], session: { token: () => 'tab-token-0000000000', renew: () => 'tab-token-1111111111' },
      socket: () => {
        const sent: (string | Uint8Array)[] = [];
        const s = { binaryType: '', readyState: 1, send: (d: string | Uint8Array) => sent.push(d), close: () => undefined, sent } as unknown as WebSocketLike & { sent: (string | Uint8Array)[] };
        sockets.push(s);
        return s;
      },
    };
    const net = new NetPage(deps, 'ws://localhost:8787/ws', 'MP2', 'Tester', undefined, false, 'classic');
    const socket = () => sockets.at(-1)!;
    const server = (ev: Record<string, unknown>): void => { socket().onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
    const welcome = (over: Record<string, unknown> = {}) => ({
      type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
      players: [], rules: 'classic', round: 2, rounds: 11, ghost: false, epoch: 2, env: { revision: 0, epoch: 2, states: [] }, startTick: 0, ...over,
    });
    const camera = new PerspectiveCamera();
    const fired = (): number[] => socket().sent.filter((d): d is string => typeof d === 'string').map((d) => JSON.parse(d) as { type: string; seq: number }).filter((m) => m.type === 'fire').map((m) => m.seq);
    const round = (seq?: number) => ({ type: 'round', weapon: HELD_RIFLE, from: [0, 0, 0], to: [0, 0, -10], hit: false, rounds: 1, shot: 1, ...(seq !== undefined ? { seq } : {}) }) as never;
    const clampedFrame = (): void => {                            // a 0.1 s frame: the clamp's six commands, a held trigger's round at the second
      net.trigger(true);
      for (let i = 0; i < 6; i++) tap!({ forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 }, [0, 0, 0], [0, 0]);
      net.frame(0.1, camera, true);
      net.fireEvent(round(net.client.lastSeq() - 4));           // LATER 338: its own step's tick, as `Fire.update` names it
    };
    socket().onopen?.({} as Event);
    server(welcome());
    net.trigger(false);
    for (let i = 0; i < 40; i++) tap!({ forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 }, [0, 0, 0], [0, 0]);
    net.fireEvent(round());                                       // a press's round held (LATER 347), the socket then dropped
    socket().onclose?.({ code: 1006, reason: '' });
    for (let i = 0; i < 20; i++) { now += 100; net.frame(0.1, camera, false); }   // the retry: a new client
    expect(sockets.length).toBe(2);
    socket().onopen?.({} as Event);
    server(welcome({ resumed: true }));
    const sentAtWelcome = socket().sent.length;
    clampedFrame();                                               // a frame between the welcome and the resume
    net.fireEvent({ type: 'reloadStart' } as never);              // a reload, and a throw, in it
    net.client.send({ type: 'throw', seq: net.client.lastSeq(), kind: 'frag', from: [0, 0, 0], velocity: [0, 0, 1] } as never);
    await flush();                                                // the frame's task ends
    const sentBetween = socket().sent.slice(sentAtWelcome).map((d) => (typeof d === 'string' ? (JSON.parse(d) as { type: string }).type : 'commands'));
    const between = fired();
    const RESUMED = 5000;                                         // the resumed seat's `sim.seq` (the resume's `seq`)
    server({ type: 'resume', id: 1, at: [0, 0, 0], yaw: 0, posture: 'stand', seq: RESUMED, health: [1, 1, 1, 1, 1, 1], armour: [0, 0, 0, 0, 0, 0], loadout: [], rounds: [[], []], pouch: {}, weapon: 0, held: null });
    clampedFrame();
    await flush();
    const after = fired().slice(between.length);
    const behind = (seqs: number[]) => seqs.map((s) => RESUMED - s);
    console.log(`\nNCW-8 reconnect (resume window): rounds between welcome and resume named ${between.join(',')} (behind the room's ${RESUMED}: ${behind(between).join(',')}); after the resume ${after.join(',')} (behind: ${behind(after).join(',')})`);
    // The first half's "before": the held trigger's round of the frame between was sent, named at the new client's count
    // (2), 4,998 behind -- stale on arrival -- with the frame's commands, a reload and a throw named there too. The after
    // (the second half, part (b)): the old client's held press round is dropped (LATER 347: never on another client);
    // between the welcome and the resume nothing named at a command leaves -- the commands, the round, the reload and the
    // throw are DROPPED (the resume lays the room's own magazines, pouch and kit, `NetPage`'s 'resume', so nothing the
    // page spent there is owed back); after the resume the rounds name the room's count on.
    expect({ sentBetween, between, after, staleAfter: behind(after).filter((b) => b > FIRE_ARRIVAL_JITTER_TICKS).length })
      .toEqual({ sentBetween: [], between: [], after: [RESUMED + 2], staleAfter: 0 });
  });
});
