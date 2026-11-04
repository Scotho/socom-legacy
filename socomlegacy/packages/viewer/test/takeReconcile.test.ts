// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { FlyCamera } from '../src/camera';
import { NetClient, type WebSocketLike } from '../src/net/client';
import { encodeSnapshot } from '../src/net/codec';
import { MOUNT_WORD_BOUND_TICKS } from '../src/net/emplacement';
import { MoverSim } from '../src/net/moverSim';
import type { Command, ServerEvent } from '../src/net/protocol';
import { Traversal } from '../src/traversal';
import { groundGrid, groundPolygons, packGround, Walker, WalkMode, type GroundData } from '../src/walk';

/**
 * LATER 530 (F6 of LATER 526's review: the client's reconcile during the wait; a pin of today's behaviour). The page's own
 * turret take is made at send time (`./turretPage` `takeOwn` -> `./matchActions` `took` -> `WalkMode.mountTake`: the body
 * popped, M kept, the walk locked and placed by the hold); the room refuses it (`FUN_005463c0` refuses before its take's
 * steps, D:L412131-412166) and runs the page's commands on foot. The refusal (`untook` -> `WalkMode.mountUntake`) re-runs
 * the body from M - 1 as the room ran it and marks the wait's predictions not compared (`NetClient.replayed(M - 1)`).
 *
 * A real `WalkMode` and a real `NetClient` on a flat synthetic floor (no disc), the room's mover (`MoverSim`) running every
 * command the page sends on foot -- it never takes the body -- and its snapshots acking the command `LAG` commands back.
 * The room tells its refusal as it runs the take's message, before its tick's snapshot (`room.ts` broadcasts the turret
 * event in the message's handling; the snapshot goes at the tick's end), so the refusal reaches the page just before the
 * first snapshot that acks M. That is the order pinned here: no correction during the wait or after it, the page and the
 * room on one body after the refusal. A room that decides the refusal after M (a late word, or the bound) -- its snapshots
 * acking M and on reaching the page before the refusal -- is LATER 528's case (the double snap), not pinned here.
 */

const GROUND: GroundData = packGround(
  { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
  [{
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]),
  }],
  [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }],
);

function fakeSocket(): WebSocketLike & { server(ev: ServerEvent): void } {
  const s = {
    binaryType: 'blob', readyState: 1,
    send() { /* the commands up: read from the walk's tap */ },
    close() { s.readyState = 3; },
    onopen: null as WebSocketLike['onopen'], onclose: null as WebSocketLike['onclose'],
    onmessage: null as WebSocketLike['onmessage'], onerror: null as WebSocketLike['onerror'],
    server(ev: ServerEvent) { s.onmessage?.({ data: JSON.stringify(ev) }); },
  };
  return s;
}

/** The room's acks run `LAG` commands behind the page's sends. */
const LAG = 6;

function page() {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
  const fly = new FlyCamera(c);
  let wish = { forward: 0, right: 0, boost: false };
  fly.groundWish = () => wish;
  const walk = new WalkMode(fly);
  walk.setGround(GROUND, [0, 0, 0]);
  walk.useTraversal((w, g) => new Traversal(w.grid, groundPolygons(g)));
  const grid = groundGrid(GROUND);
  const room = new MoverSim(new Walker(grid), new Traversal(grid, groundPolygons(GROUND)));
  /** The room's mover after each command it ran, by seq. */
  const roomAfter = new Map<number, { x: number; y: number; z: number; yaw: number; pitch: number }>();
  let sent = 0;
  const set = walk.setNetTap.bind(walk);
  walk.setNetTap = (t, n) => set(t && ((cmd, feet, facing) => {
    t(cmd, feet, facing);
    const c: Command = { ...cmd, seq: ++sent };
    room.apply(c);
    const s = room.walker.state;
    roomAfter.set(c.seq, { x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: s.pitch });
  }), n);
  const socket = fakeSocket();
  const client = new NetClient({ url: 'mem', map: 'SYN', name: 'A', socket: () => socket }, walk);
  socket.onopen?.({});
  socket.server({ type: 'welcome', id: 3, version: 11, map: 'SYN', tick: 0, role: 'player', team: 'seal', queue: 0, epoch: 0, env: { revision: 0, epoch: 0, states: [] } } as unknown as ServerEvent);
  socket.server({ type: 'spawn', id: 3, at: [5, 0, 6], yaw: 0, after: 0 });
  const pageWalker = (): Walker => walk['walker'] as Walker;
  room.walker.restoreState(pageWalker().saveState());              // the room's body where the page's spawned
  let acked = 0;
  /** The room's snapshot acking `ack`: its mover after that command. */
  const snapshot = (ack: number): void => {
    const s = roomAfter.get(ack)!;
    socket.onmessage?.({ data: encodeSnapshot({ tick: ack * 2, own: { ack, x: s.x, y: s.y, z: s.z, vx: 0, vy: 0, vz: 0, facing: { yaw: s.yaw, pitch: s.pitch } }, bodies: [] }) });
    acked = ack;
  };
  /** One frame: the page's command sent (the room runs it), then the room's snapshots up to `LAG` back -- `before` first. */
  const frame = (before?: (ack: number) => void): void => {
    fly.update(1 / 60);
    walk.frame(1 / 60);
    for (let ack = acked + 1; ack <= sent - LAG; ack++) { before?.(ack); snapshot(ack); }
  };
  return { walk, client, room, roomAfter, pageWalker, frame, sent: () => sent, setWish: (forward: number) => { wish = { forward, right: 0, boost: false }; } };
}

describe('LATER 530: the client\'s reconcile through a take the room refuses (a pin)', () => {
  it('the hold places the body through the wait, the refusal reaches the page before the snapshot acking M: no correction, the page on the room\'s body after it', () => {
    const p = page();
    p.setWish(1);
    for (let i = 0; i < 30; i++) p.frame();                         // walking forward, the room agreeing
    expect(p.client.corrections.snapped + p.client.corrections.small).toBe(0);
    // The send-time take before the next command (M), the walk locked and placed by the hold (`./turretPage` `setHeld`,
    // `holdTick`): the body predicted at the hold's place for every command of the wait.
    const m = p.sent() + 1;
    (p.walk as unknown as { mountTake(m?: number): void }).mountTake(m);
    p.walk.setLocked(true);
    p.walk.setTurretHold((w) => { w.state.x = 60; w.state.z = 60; });
    let refused = false;
    const replayed: number[] = [];
    /** The room's refusal, told as it runs the take's message: before the snapshot that acks M. */
    const refuse = (ack: number): void => {
      if (refused || ack < m) return;
      refused = true;
      p.walk.setTurretHold(null);
      (p.walk as unknown as { mountUntake(r?: (after: number) => void): void }).mountUntake((after) => { replayed.push(after); p.client.replayed(after); });
      p.walk.setLocked(false);
    };
    for (let i = 0; i < 3 * LAG && !refused; i++) {
      p.frame(refuse);
      if (!refused) expect([p.pageWalker().state.x, p.pageWalker().state.z], 'the wait: at the hold').toEqual([60, 60]);
    }
    expect(refused).toBe(true);
    expect(replayed, "the wait's predictions marked not compared").toEqual([m - 1]);
    expect(p.client.corrections.snapped + p.client.corrections.small, 'none in the wait: the snapshots before M agree').toBe(0);
    for (let i = 0; i < 4 * LAG; i++) {
      p.frame();
      const s = p.pageWalker().state, r = p.roomAfter.get(p.sent())!;
      for (const k of ['x', 'y', 'z'] as const) expect(Math.abs(s[k] - r[k]), `after the refusal, frame ${i}: ${k}`).toBeLessThan(1e-6);
    }
    expect(p.client.corrections.snapped, "the wait's acks not compared, the re-run's agree: nothing snapped").toBe(0);
    expect(p.client.corrections.small, '...nor smoothed').toBe(0);
  });
});

/**
 * LATER 528 (LATER 526's review F2): the room decides the refusal after M -- a late word (`room.ts` `mountWord`,
 * `r.m = Math.max(m, p.sim.seq + 1)`: the take is run before the room's next command, past the page's M), or the bound
 * (`resolveMounts`, a reservation whose word never came taken at `p.sim.seq + 1`, MOUNT_WORD_BOUND_ADAPTATION) -- and
 * refuses it on its own terms (`takeMount`; `FUN_005463c0` refuses before any of its take's steps, D:L412131-412166), so
 * its body ran every command on foot. Its snapshots acking M and on reach the page before the refusal and show that body,
 * while the page predicted the hold: the reconcile corrects the hold's place there (the walk placed by the hold again on
 * its next tick). At the refusal the re-run (`rerunFrom` from M - 1) must start from the body as the room has it after
 * M - 1 -- not moved by those corrections -- and the corrections still being spread must not move the re-run body.
 */
describe('LATER 528: the room deciding the refusal after M', () => {
  /**
   * The send-time take before the next command (M), the walk locked and placed by `hold`; the room's refusal told just
   * before its snapshot acking M + `late`. Returns M and the corrections counted when the refusal came.
   */
  const refuseLate = (p: ReturnType<typeof page>, late: number, hold: (w: Walker) => void) => {
    const m = p.sent() + 1;
    (p.walk as unknown as { mountTake(m?: number): void }).mountTake(m);
    p.walk.setLocked(true);
    p.walk.setTurretHold(hold);
    let at: { snapped: number; small: number; spreading: number } | null = null;
    const replayed: number[] = [];
    const refuse = (ack: number): void => {
      if (at || ack < m + late) return;
      at = {
        snapped: p.client.corrections.snapped, small: p.client.corrections.small,
        spreading: (p.client as unknown as { correctionTicks: number }).correctionTicks,   // the ticks of a correction still to spread
      };
      p.walk.setTurretHold(null);
      (p.walk as unknown as { mountUntake(r?: (after: number) => void): void }).mountUntake((after) => { replayed.push(after); p.client.replayed(after); });
      p.walk.setLocked(false);
    };
    for (let i = 0; i < late + 3 * LAG && !at; i++) p.frame(refuse);
    expect(at, 'refused').not.toBeNull();
    expect(replayed, "the wait's predictions marked not compared").toEqual([m - 1]);
    return { m, at: at! };
  };
  /** After the refusal: every frame the page's body on the room's, and no correction counted since the refusal. */
  const agrees = (p: ReturnType<typeof page>, at: { snapped: number; small: number }): void => {
    for (let i = 0; i < 4 * LAG; i++) {
      p.frame();
      const s = p.pageWalker().state, r = p.roomAfter.get(p.sent())!;
      for (const k of ['x', 'y', 'z'] as const) expect(Math.abs(s[k] - r[k]), `after the refusal, frame ${i}: ${k}`).toBeLessThan(1e-6);
    }
    expect(p.client.corrections.snapped - at.snapped, 'no second snap after the refusal').toBe(0);
    expect(p.client.corrections.small - at.small, 'nothing smoothed after the refusal').toBe(0);
  };
  const walked = (): ReturnType<typeof page> => {
    const p = page();
    p.setWish(1);
    for (let i = 0; i < 30; i++) p.frame();
    expect(p.client.corrections.snapped + p.client.corrections.small).toBe(0);
    return p;
  };

  it('a late word (the room takes at M + 2): the hold\'s snapped place is not carried into the re-run, the body on the room\'s', () => {
    const p = walked();
    const { at } = refuseLate(p, 2, (w) => { w.state.x = 60; w.state.z = 60; });
    expect(at.snapped, "the snapshot acking M snapped the hold's place (the wait's, before the refusal)").toBeGreaterThan(0);
    agrees(p, at);
  });

  it('the bound (no word: the room takes at its own count, past M): the same', () => {
    const p = walked();
    const { at } = refuseLate(p, MOUNT_WORD_BOUND_TICKS - 2 * LAG, (w) => { w.state.x = 60; w.state.z = 60; });
    expect(at.snapped).toBeGreaterThan(0);
    agrees(p, at);
  });

  it('a correction still being spread at the refusal (the hold\'s place a small one off) does not nudge the re-run body', () => {
    const p = walked();
    const s0 = p.pageWalker().state, hx = s0.x + 2, hz = s0.z + 2;
    const { at } = refuseLate(p, 1, (w) => { w.state.x = hx; w.state.z = hz; });
    expect(at.snapped, 'small: smoothed, not snapped').toBe(0);
    expect(at.small, "the snapshot acking M smoothed the hold's place").toBeGreaterThan(0);
    expect(at.spreading, 'still being spread at the refusal').toBeGreaterThan(0);
    agrees(p, at);
  });
});
