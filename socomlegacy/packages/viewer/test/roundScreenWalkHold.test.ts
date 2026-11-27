// @vitest-environment jsdom
// test/roundScreenWalkHold.test.ts -- LATER 580 (the walk's half; research 81 §13, research
// 122 §14; reading, pending review): MPExitState alone is ticked under ROUND COMPLETE, FINAL ROUND and GAME COMPLETE
// (`FUN_002aa490` D:L151127-151134 pushes it, `FUN_002ce9e0` D:L171877-171888 ticks the stack's top, `FUN_00223680`
// D:L75935-75936 pops it at the next round's restart; r0001 lines -- at r0004, LATER 580's review sections 1-2,
// reading, pending review: 0x2abf30 on the host's +0x117, the push 0x2ec290 at 0x2ac0a8, the update 0x2eb8f0, the pop
// 0x223680 at 0x22383c, the actor scheduler 0x4a1620 run only from CCoreState's tick 0x1ebed0, the dead included), so
// the local SEAL's walk is not ticked there, alive or dead. The page: from the first screen frame (`NetPage.screenUp`,
// the frame `roundScreenSilence.test.ts` stops the sound at) to the next `roundStart`, its own walk takes no stick and
// no press and its mover is not stepped -- its commands still go to the room, which steps no mover under the screens
// either (match `test/roomScreensWalkHold.test.ts`), so the two agree. A real `WalkMode` on a flat synthetic floor and
// a real `NetPage` on a fake socket; no game data, no server, no browser.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { GameAudio } from '../src/audio';
import { FlyCamera } from '../src/camera';
import { mountSound, silentOut } from '../src/matchSound';
import type { WebSocketLike } from '../src/net/client';
import type { Command, ServerEvent } from '../src/net/protocol';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { RemotePlayers } from '../src/remotePlayers';
import { ROUND_SCREENS_AFTER_S } from '../src/roundScreens';
import { packGround, TICK, type Walker } from '../src/mover';
import { WalkMode } from '../src/walk';

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, 1000, 1000, 0, 1000, 1000, 0, -1000, -1000, 0, -1000]) };
const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
  return c;
};
const made: WalkMode[] = [];
afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); vi.restoreAllMocks(); });

/** A match's walk (a net tap set) on the floor, its stick held full forward; `held` is the round hold's answer. */
function walking() {
  const fly = new FlyCamera(canvas());
  fly.setScale(0.1);
  vi.spyOn(fly, 'groundWish').mockReturnValue({ forward: 1, right: 0, boost: false } as ReturnType<FlyCamera['groundWish']>);
  const m = new WalkMode(fly, () => undefined);
  made.push(m);
  m.setGround(packGround(PARAMS, [FLOOR], OWNERS), null);
  const sent: Omit<Command, 'seq'>[] = [];
  m.setNetTap((cmd) => { sent.push(cmd); });
  expect(m.respawn([0, 0, 0], 0)).toBe(true);
  const w = (m as unknown as { walker: Walker }).walker;
  const hold = { on: false };
  m.setRoundHold(() => hold.on);
  const at = (): [number, number, number] => [w.state.x, w.state.y, w.state.z];
  return { m, w, sent, hold, at };
}

describe('LATER 580: the page\'s own walk under the round screens', () => {
  it('with the stick held: walks before the screens, stands under them (its commands still sent), walks again after', () => {
    const r = walking();
    const a = r.at();
    for (let i = 0; i < 30; i++) r.m.frame(TICK);
    const b = r.at();
    expect(Math.hypot(b[0] - a[0], b[2] - a[2]), 'walks in the round').toBeGreaterThan(10);
    r.hold.on = true;                                            // the first screen frame
    const n0 = r.sent.length;
    for (let i = 0; i < 120; i++) r.m.frame(TICK);
    expect(r.at()).toEqual(b);                                   // the mover not stepped: no walk, no glide on
    expect(r.sent.length - n0, 'a command a tick still goes to the room').toBe(120);
    expect(r.sent.slice(n0).every((c) => c.forward === 0 && c.right === 0 && c.buttons === 0), 'no stick, no press').toBe(true);
    expect(r.m.jump(), 'a press is not taken').toBe(false);
    r.m.frame(TICK);
    expect(r.w.airborne).toBe(false);
    r.hold.on = false;                                           // the next round
    for (let i = 0; i < 30; i++) r.m.frame(TICK);
    const c = r.at();
    expect(Math.hypot(c[0] - b[0], c[2] - b[2]), 'walks again').toBeGreaterThan(10);
  });

  it('a body in the air at the first screen frame is held where it is, not carried nor dropped', () => {
    const r = walking();
    for (let i = 0; i < 20; i++) r.m.frame(TICK);
    expect(r.m.jump()).toBe(true);
    for (let i = 0; i < 4; i++) r.m.frame(TICK);
    expect(r.w.airborne).toBe(true);
    r.hold.on = true;
    const p = r.at();
    for (let i = 0; i < 60; i++) r.m.frame(TICK);
    expect(r.at()).toEqual(p);
    expect(r.w.airborne).toBe(true);
  });

  it('F1 (the review, section 2): the page\'s own corpse, killed in the air just before the screens, stops falling under them', () => {
    const r = walking();
    for (let i = 0; i < 20; i++) r.m.frame(TICK);
    expect(r.m.jump()).toBe(true);
    for (let i = 0; i < 3; i++) r.m.frame(TICK);
    r.m.setDead(true);                                           // dead in the air
    r.m.frame(TICK);
    expect(r.w.airborne).toBe(true);
    r.hold.on = true;
    // The state but its command number, which the held frames still count (a command a tick goes to the room).
    const state = (): string => JSON.stringify({ ...r.w.saveState(), commandSeq: 0 });
    const p = r.at(), kept = state();
    for (let i = 0; i < 60; i++) r.m.frame(TICK);
    expect(r.at(), 'the corpse not carried nor dropped').toEqual(p);
    expect(state(), 'its fall and its death clip not advanced').toBe(kept);
  });

  it('F4: a held trigger (and aim) under the hold sends no buttons -- an empty command at the facing', () => {
    const r = walking();
    for (let i = 0; i < 10; i++) r.m.frame(TICK);
    r.m.setTrigger(true);
    r.hold.on = true;
    const n0 = r.sent.length;
    for (let i = 0; i < 20; i++) r.m.frame(TICK);
    const held = r.sent.slice(n0);
    expect(held.length).toBe(20);
    expect(held.every((c) => c.buttons === 0 && c.stance === 0 && !c.raised), 'no press of any kind').toBe(true);
    expect(held.every((c) => c.yaw === held[0]!.yaw), 'at the facing the mover holds').toBe(true);
  });

  it('F3 (named adaptation cost): a reconcile nudge under the hold still lays the room\'s place on the held body, once', () => {
    const r = walking();
    for (let i = 0; i < 20; i++) r.m.frame(TICK);
    r.hold.on = true;
    for (let i = 0; i < 5; i++) r.m.frame(TICK);
    const p = r.at();
    r.m.nudge(-3, 0, 0);                                         // the page's lead laid back on the room's frozen place
    expect(r.at()).toEqual([p[0] - 3, p[1], p[2]]);
    for (let i = 0; i < 30; i++) r.m.frame(TICK);
    expect(r.at(), 'and held there').toEqual([p[0] - 3, p[1], p[2]]);
  });
});

const READ_MS = ROUND_SCREENS_AFTER_S * 1000;
const roundStart = (round: number): ServerEvent => ({ type: 'roundStart', round, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: round, startTick: 0 });
const roundOver = (): ServerEvent => ({
  type: 'roundOver', round: 1, winner: 'seal', wins: { seal: 1, terrorist: 0 }, matchOver: false, screens: [{ screen: 'roundComplete', seconds: 5 }],
} as ServerEvent);

describe('LATER 580: the NetPage holds its walk from the first screen frame to roundStart', () => {
  it('lays the round hold on the walk, answering screenUp', () => {
    let t = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => t);
    let socket: WebSocketLike | null = null;
    let hold: (() => boolean) | null = null;
    const hud: NetPageDeps['hud'] = {
      postMessage: () => undefined, setTimer: () => undefined, setHealth: () => undefined, setScoreRows: () => undefined,
      setRoundScreen: () => undefined, startRound: () => undefined,
    };
    const remote = {
      setTeam: () => undefined, setType: () => undefined, setKit: () => undefined, forget: () => undefined, died: () => undefined,
      hydrateCorpse: () => undefined, markGhost: () => undefined, clear: () => undefined, frame: () => undefined, bodies: () => [],
      setEscortee: () => undefined, setOpacity: () => undefined, feet: () => null, playerType: () => 0,
    } as unknown as RemotePlayers;
    const walk = {
      setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setTrigger: () => undefined,
      setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'walk', setFlinchPose: () => undefined,
      setDead: () => undefined, feet: () => [0, 0, 0], setRoundHold: (h: (() => boolean) | null) => { hold = h; },
    } as unknown as WalkMode;
    const audio = new GameAudio(silentOut(), () => 0.5, { now: () => t / 1000 });
    const sound = mountSound({
      audio,
      walk: { mode: () => 'walk', drawnFeet: () => [1, 2, 3], posture: () => 'stand', grid: () => null },
      fly: { groundWish: () => ({ forward: 1, right: 0, boost: false }) },
      loadouts: { type: () => 1 }, side: () => 'seal',
      seat: () => ({ id: 1, role: 'player', team: 'seal' }),
      others: () => ({ teamOf: () => 'seal', playerType: () => 1, feet: () => [5, 6, 7] }) as never,
    });
    const deps: NetPageDeps = {
      walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined, respawned: () => undefined,
      newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
      socket: () => {
        socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
        return socket;
      },
      ...sound.netDeps(),
    };
    const net = new NetPage(deps, 'ws://test/ws', 'MP2', 'Tester', undefined, false, 'classic');
    socket!.onopen?.({} as Event);
    const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
    const camera = new PerspectiveCamera();
    const at = (ms: number): void => { t = ms; server({ type: 'pong', t, tick: 0 } as ServerEvent); net.frame(1 / 60, camera, false); };
    server({
      type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
      players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
    } as ServerEvent);
    expect(hold, 'the hold laid on the walk').not.toBeNull();
    server(roundStart(1));
    at(t + 16);
    expect(hold!()).toBe(false);
    const t0 = t;
    server(roundOver());
    at(t0 + READ_MS - 500);                                      // the engine's 3 s: the round still ticked
    expect(hold!()).toBe(false);
    at(t0 + READ_MS + 1_000);                                    // ROUND COMPLETE
    expect(net.screenUp()).toBe(true);
    expect(hold!()).toBe(true);
    at(t0 + READ_MS + 30_000);                                   // held until the room's next round
    expect(hold!()).toBe(true);
    server(roundStart(2));
    at(t + 16);
    expect(hold!()).toBe(false);
    net.close();
    expect(hold, 'the page\'s close lets the walk go').toBeNull();
  });
});
