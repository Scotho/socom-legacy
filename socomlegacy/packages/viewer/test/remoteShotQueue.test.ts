// @vitest-environment jsdom
// test/remoteShotQueue.test.ts -- R4P-253 (r0004 parity-ready queue; reading, pending review): another player's shots
// are SHOWN from a count, one a game frame, at most ten behind -- the original's IncrementalUpdateRemoteSeal
// `FUN_002be150` adds the replicated shot byte's change to the copy's `+0x224`, clamped 1..10 (D:L162443-162455), and
// CRemoteCtrl::PreTick `FUN_005e6400` takes one and fires the copy's kit once a tick while it is nonzero
// (D:L497481-497495). The room's per-shot wire stays (a transport adaptation); the page queues for display only, and
// no shot's hit, impact, sound record or the page's own damage changes -- only when the shot is shown.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { GAME_FRAME_DT, HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { Hud } from '../src/hud';
import type { FireEvent } from '../src/fire';
import { fireWeaponOf, NetPage, REMOTE_SHOT_DRAIN_PER_TICK_READING, REMOTE_SHOT_QUEUE_CAP_READING, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import { MP_HEALTH } from '../src/net/damage';
import type { ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';

type Round = Extract<FireEvent, { type: 'round' }>;
type Shot = Extract<ServerEvent, { type: 'shot' }>;

/** A tracer weapon by id (the M4A1, 54): every fourth shot seen carries a tracer (`tracerRound`). Its record here is the side's first slot. */
const M4A1 = 54;
const FOE = 2;

function page(extra: Partial<NetPageDeps> = {}) {
  let socket: WebSocketLike | null = null;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
    mode: () => 'walk', feet: () => [0, 0, 0],
  } as unknown as WalkMode;
  const remote = {
    setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined,
    setKit: () => undefined, setType: () => undefined, feet: () => null, playerType: () => 0,
  } as unknown as RemotePlayers;
  const rounds: [Round, number][] = [], impacts: Round[] = [];
  const said = { ownHurt: 0, hurtVoice: 0 };
  const deps: NetPageDeps = {
    walk, remote, hud: new Hud(), clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    roundEffects: (e, id) => { rounds.push([e, id]); },              // the display path: muzzle, tracer, impact, report
    roundImpact: (e) => { impacts.push(e); },
    ownHurt: () => { said.ownHurt++; },
    hurtVoice: () => { said.hurtVoice++; },
    socket: () => {
      socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
      return socket;
    },
  };
  const net = new NetPage({ ...deps, ...extra }, 'ws://test/ws', 'MP2', 'Tester', undefined, false, 'classic');
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  const welcome = (): void => server({
    type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
    players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
  } as ServerEvent);
  welcome();
  server({ type: 'joined', id: FOE, name: 'Foe', team: 'terrorist' } as ServerEvent);
  (net.client as unknown as { bodies: () => unknown[] }).bodies = () => [];
  const camera = new PerspectiveCamera();
  /** One game frame of the page's clock (`GAME_FRAME_DT`, the original's frame; not the room's 60 Hz tick). */
  const tick = (): void => { net.frame(GAME_FRAME_DT, camera, false); };
  return { net, server, welcome, rounds, impacts, said, tick };
}

const shotN = (i: number, over: Partial<Shot> = {}): Shot => ({
  type: 'shot', id: FOE, weapon: M4A1, from: [0, 20, 0], to: [100 + i, 20, 0], normal: null, material: null, ...over,
});

describe('R4P-253: a remote SEAL shots are shown from a count, one per game frame, at most ten (FUN_002be150 D:L162443-162455, FUN_005e6400 D:L497481)', () => {
  it('names the cap and the drain as readings: 10 queued, 1 shown a tick', () => {
    expect(REMOTE_SHOT_QUEUE_CAP_READING).toBe(10);
    expect(REMOTE_SHOT_DRAIN_PER_TICK_READING).toBe(1);
  });

  it('a burst of 15 in one arrival is shown as 10, one per tick; the five past the clamp are never shown', () => {
    const p = page();
    for (let i = 0; i < 15; i++) p.server(shotN(i));
    expect(p.rounds, 'nothing shown on arrival').toHaveLength(0);
    const shown: number[] = [];
    for (let t = 0; t < 14; t++) { p.tick(); shown.push(p.rounds.length); }
    expect(shown).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10, 10]);
    expect(p.rounds.length, 'it reached the display path').toBeGreaterThan(0);
    expect(p.rounds.map(([e]) => e.to[0]), 'the first ten queued; the clamp drops the rest').toEqual([100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
    expect(p.rounds.every(([, id]) => id === FOE)).toBe(true);
  });

  it('a burst of 3 shows 3 over 3 ticks', () => {
    const p = page();
    for (let i = 0; i < 3; i++) p.server(shotN(i));
    expect(p.rounds).toHaveLength(0);
    const shown: number[] = [];
    for (let t = 0; t < 4; t++) { p.tick(); shown.push(p.rounds.length); }
    expect(shown).toEqual([1, 2, 3, 3]);
    expect(p.rounds.length, 'it reached the display path').toBe(3);
  });

  it('a shot arriving while ten wait is dropped; one arriving after a tick drained one is kept (the count clamps at 10, never above)', () => {
    const p = page();
    for (let i = 0; i < 10; i++) p.server(shotN(i));
    p.server(shotN(50));                                     // an eleventh: past the clamp
    p.tick();                                                // one shown: nine wait
    p.server(shotN(60));                                     // the count back to ten
    for (let t = 0; t < 12; t++) p.tick();
    expect(p.rounds.map(([e]) => e.to[0])).toEqual([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 160]);
  });

  it('the hit, the impact, the tracer and the sound record of each shot are those of an immediate play; the damage and the hurt voice come at once', () => {
    const p = page();
    const PERSON = 7;
    const burst: Shot[] = [
      shotN(0, { to: [57.6, 20, 0], normal: [-1, 0, 0], material: PERSON, body: 3, end: [80, 20, 0] }),
      shotN(1, { through: [{ point: [10, 20, 0], normal: [-1, 0, 0], material: 25 }] }),
      shotN(2, { normal: [0, 1, 0], material: 25, to: [5, 0, 5] }),
      shotN(3),
    ];
    for (const s of burst) p.server(s);
    // The page's own damage (the room's `hurt`) and another's hurt voice are not shots: shown on arrival as before.
    p.server({ type: 'hurt', health: MP_HEALTH.map((h) => h / 2), from: [0, 20, 0], part: 1 } as ServerEvent);
    p.server({ type: 'hurtVoice', id: FOE } as ServerEvent);
    // The page's own round's impact (`impact`) is not another player's shot: it plays at once (INT-NET-2).
    p.server({ type: 'impact', id: 1, weapon: HELD_RIFLE.id, from: [0, 20, 0], to: [9, 20, 0], normal: [-1, 0, 0], material: PERSON, body: 2 } as ServerEvent);
    expect(p.said).toEqual({ ownHurt: 1, hurtVoice: 1 });
    expect(p.impacts.map((e) => e.to)).toEqual([[9, 20, 0]]);
    expect(p.rounds).toHaveLength(0);
    for (let t = 0; t < 4; t++) p.tick();
    expect(p.rounds.length, 'it reached the display path').toBe(4);
    const weapon = fireWeaponOf(HELD_RIFLE);                 // the record whose report the effects play (`sounds`)
    const expected: Round[] = [
      { type: 'round', weapon, from: [0, 20, 0], to: [57.6, 20, 0], hit: true, rounds: 0, normal: [-1, 0, 0], material: PERSON, tracerTo: [80, 20, 0] },
      { type: 'round', weapon, from: [0, 20, 0], to: [101, 20, 0], hit: false, rounds: 0, normal: null, material: null },
      { type: 'round', weapon, from: [0, 20, 0], to: [5, 0, 5], hit: true, rounds: 0, normal: [0, 1, 0], material: 25 },
      { type: 'round', weapon, from: [0, 20, 0], to: [103, 20, 0], hit: false, rounds: 0, normal: null, material: null, tracer: true, tracerKind: 'enemy' },
    ];
    expect(p.rounds.map(([e]) => e)).toEqual(expected);
    expect(p.rounds.map(([e]) => e.weapon.sounds)).toEqual(expected.map((e) => e.weapon.sounds));
    // The through-surface of the second shot: shown with its shot, its impact alone.
    expect(p.impacts.slice(1)).toEqual([{ ...expected[1]!, to: [10, 20, 0], normal: [-1, 0, 0], material: 25, hit: true, tracer: undefined, tracerKind: undefined, tracerTo: undefined }]);
    expect(p.said).toEqual({ ownHurt: 1, hurtVoice: 1 });   // nothing re-told at display
  });

  it('a welcome (a join, or a replay seek carrying the fold) drops the shots still waiting', () => {
    const p = page();
    for (let i = 0; i < 3; i++) p.server(shotN(i));
    p.tick();
    expect(p.rounds.length, 'it reached the display path').toBe(1);
    p.welcome();
    p.server({ type: 'joined', id: FOE, name: 'Foe', team: 'terrorist' } as ServerEvent);
    for (let t = 0; t < 3; t++) p.tick();
    expect(p.rounds).toHaveLength(1);
  });
});

/**
 * Review 1 F1: a count unit is a PULL, not a ray. `FUN_002bbf10` bumps the fire byte only on a pull's first pellet (the
 * kit's `+0x880` pellet index 0, D:L479495; the local loop `FUN_005be9a0` resets and steps it, D:L475586, D:L475676), so
 * the copy fires once a pull, in one tick -- one muzzle, one report, the kit's round count `+0x878` (the tracer's
 * every-fourth, D:L479284, D:L479362) once. The room sends one `shot` a ray with nothing naming its pull; the page groups
 * a shooter's consecutive rays of one item with the same `from`, up to the record's `NumProjectilesFired`.
 */
describe('R4P-253 review F1: a remote shotgun pull is one count entry, its rays shown in one game frame with one report', () => {
  const SHOTGUN = { ...HELD_RIFLE, id: M4A1, name: 'pull4', pellets: 4 };
  const pull = (k: number, rays = 4): Shot[] => Array.from({ length: rays }, (_, r) => shotN(10 * k + r, { from: [k, 20, 0] }));
  const shotgunPage = (extra: Partial<NetPageDeps> = {}) => page({ recordOf: (id) => (id === M4A1 ? SHOTGUN : null), ...extra });

  it('a remote 4-pellet pull is shown as one entry: all four rays in one game frame, one round with its report, three impacts alone', () => {
    const p = shotgunPage();
    for (const s of [...pull(0), ...pull(1)]) p.server(s);
    expect([p.rounds.length, p.impacts.length], 'nothing shown on arrival').toEqual([0, 0]);
    p.tick();
    expect(p.rounds.length, 'one round (muzzle, tracer, report) for the pull; it reached the display path').toBe(1);
    expect(p.rounds[0]![0].to).toEqual([100, 20, 0]);
    expect(p.impacts.map((e) => e.to), 'the other three rays: their impacts, no second muzzle or report').toEqual([[101, 20, 0], [102, 20, 0], [103, 20, 0]]);
    p.tick();
    expect(p.rounds.map(([e]) => e.to[0])).toEqual([100, 110]);
    expect(p.impacts).toHaveLength(6);
    p.tick();
    expect([p.rounds.length, p.impacts.length], 'two pulls, two ticks').toEqual([2, 6]);
  });

  it('the cap counts pulls: eleven 4-pellet pulls in one arrival show ten pulls, forty rays, ten reports', () => {
    const p = shotgunPage();
    for (let k = 0; k < 11; k++) for (const s of pull(k)) p.server(s);
    const shown: number[] = [];
    for (let t = 0; t < 12; t++) { p.tick(); shown.push(p.rounds.length); }
    expect(shown).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10]);
    expect(p.impacts.length, 'it reached the display path: thirty other rays').toBe(30);
  });

  it('the every-fourth tracer steps once a pull (the kit +0x878 once a CZKit::Fire), on the fourth pull first ray', () => {
    const p = shotgunPage();
    for (let k = 0; k < 4; k++) for (const s of pull(k)) p.server(s);
    for (let t = 0; t < 4; t++) p.tick();
    expect(p.rounds.map(([e]) => e.tracer ?? false)).toEqual([false, false, false, true]);
    // Which ray carries it (review 2, finding 1): the fourth PULL's first ray (to x 130), not the first pull's fourth ray
    // (to x 103, where a count stepped per ray puts it); one whole round a pull, the other twelve rays impacts alone.
    expect(p.rounds.map(([e]) => e.to[0])).toEqual([100, 110, 120, 130]);
    expect(p.rounds.filter(([e]) => e.tracer).map(([e]) => e.to[0])).toEqual([130]);
    expect(p.impacts.length, 'it reached the display path').toBe(12);
    expect(p.impacts.every((e) => e.tracer === undefined)).toBe(true);
  });

  it('a pull whose rays straddle a game frame is still one entry: the late ray shown at once as an impact alone', () => {
    const p = shotgunPage();
    for (const s of pull(0, 2)) p.server(s);
    p.tick();
    for (const s of pull(0, 4).slice(2)) p.server(s);
    expect(p.rounds.length).toBe(1);
    expect(p.impacts.map((e) => e.to[0]), 'it reached the display path').toEqual([101, 102, 103]);
    for (let t = 0; t < 3; t++) p.tick();
    expect([p.rounds.length, p.impacts.length]).toEqual([1, 3]);
  });
});

/** Review 1 F2: a hidden tab or the PK-3 pause runs no `frame`; the queue never holds shots across them. */
describe('R4P-253 review F2: no queue while the page is hidden or its frame held', () => {
  const hiding = () => {
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    return (on: boolean): void => { hidden = on; document.dispatchEvent(new Event('visibilitychange')); };
  };

  it('a shot arriving while the tab is hidden is shown at once (its report plays; matchFirearm skips the effect run)', () => {
    const setHidden = hiding();
    const p = page();
    setHidden(true);
    for (let i = 0; i < 3; i++) p.server(shotN(i));
    expect(p.rounds.length, 'it reached the display path').toBe(3);
    setHidden(false);
    for (let t = 0; t < 3; t++) p.tick();
    expect(p.rounds).toHaveLength(3);
    setHidden(false);
  });

  it('shots waiting when the tab hides are shown at the hide, and none plays as a burst on return', () => {
    const setHidden = hiding();
    const p = page();
    for (let i = 0; i < 5; i++) p.server(shotN(i));
    p.tick();
    expect(p.rounds).toHaveLength(1);
    setHidden(true);
    expect(p.rounds.length, 'it reached the display path').toBe(5);
    setHidden(false);
    for (let t = 0; t < 5; t++) p.tick();
    expect(p.rounds).toHaveLength(5);
  });

  it('a shot arriving while the page frame is held (displayHeld, the PK-3 pause) is shown at once', () => {
    let held = true;
    const p = page({ displayHeld: () => held });
    for (let i = 0; i < 3; i++) p.server(shotN(i));
    expect(p.rounds.length, 'it reached the display path').toBe(3);
    held = false;
    p.server(shotN(3));
    expect(p.rounds).toHaveLength(3);
    p.tick();
    expect(p.rounds).toHaveLength(4);
  });
});

describe('R4P-253 review F3: a player who leaves takes the shots still waiting with him', () => {
  it('left drops that shooter queue; another shooter queue drains on', () => {
    const p = page();
    p.server({ type: 'joined', id: 3, name: 'Other', team: 'terrorist' } as ServerEvent);
    for (let i = 0; i < 3; i++) p.server(shotN(i));
    for (let i = 0; i < 2; i++) p.server(shotN(50 + i, { id: 3 }));
    p.tick();
    expect(p.rounds.map(([, id]) => id), 'it reached the display path').toEqual([FOE, 3]);
    p.server({ type: 'left', id: FOE } as ServerEvent);
    for (let t = 0; t < 3; t++) p.tick();
    expect(p.rounds.map(([, id]) => id)).toEqual([FOE, 3, 3]);
  });
});
