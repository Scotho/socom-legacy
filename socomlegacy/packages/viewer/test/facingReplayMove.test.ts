// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { NetClient, type WebSocketLike } from '../src/net/client';
import { encodeSnapshot } from '../src/net/codec';
import type { Command, ServerEvent } from '../src/net/protocol';
import { aimPitchLimits, LookGate, OPEN_LOOK_CONTEXT, type LookContext } from '../src/net/lookGate';
import { Button } from '../src/net/protocol';
import { TICK, type TraversalHooks, type Walker } from '../src/mover';
import { packGround, WalkMode } from '../src/walk';
import { MAX_PITCH_RATE, MAX_YAW_RATE } from '../src/look';

/**
 * PTT-8 (LATER 16, NET-WIRE's landing review F3; research 224 §4): the facing's replay (`LookLog.replay`, called by
 * `WalkMode.reconcileFacing`) starts each re-applied step where the mover stood after the tick before -- as the walk's own
 * tick does (`WalkMode.frame`, `tickRef`) -- so a move that holds the yaw and lays its own (a ladder, the "180") is not
 * replayed on the command's yaw. Review focus 7 of sprint 37: a correction landing mid-move costs one correction, not
 * one a snapshot until the move ends.
 *
 * A real `WalkMode` and a real `NetClient` on a flat synthetic floor (no disc). The move is the test's own, not the
 * game's: it lays its yaw in the tick and holds it (`yaw()`) as `Traversal` does (`traversal.ts` `mountBottom` lays the
 * ladder's facing, `turning` lays the 180's `from + angle x time / seconds`). The room is modelled by the same law: from
 * the corrected command on, its gate (the page's as it stood after that command) steps from its own mover's facing, and
 * the move lays the same yaw the page's laid.
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]) };
const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
const ground = () => packGround(PARAMS, [FLOOR], OWNERS);

/** The 180's length (`seal_180`, `motion.rdr` 0.95 s: `traversal.ts` `turning`), in ticks. */
const TURN_180_TICKS = Math.round(0.95 / TICK);
/** A ladder's facing off the wire's yaw grid (360 / 65536): half a step, so the command's quantised yaw is not the lock. */
const LADDER_YAW = 90 + 180 / 65536;

/**
 * The test's move: over each span (`from` to `to`) it lays `lay(k, yaw)` in the tick and holds the yaw after it (`to`:
 * laid, then released).
 */
interface Span { from: number; to: number; lay: (k: number, yaw: number) => number }
class LayingMove implements TraversalHooks {
  private ticks = 0;
  private lock: number | null = null;
  /** The yaw laid at each tick; whether the yaw was held at each tick's gate step (the lock before the tick). */
  readonly laid = new Map<number, number>();
  readonly held = new Map<number, boolean>();
  private readonly spans: readonly Span[];
  constructor(...spans: Span[]) { this.spans = spans; }
  tick(w: Walker): boolean {
    const k = ++this.ticks;
    this.held.set(k, this.lock !== null);
    const span = this.spans.find((s) => k >= s.from && k <= s.to);
    if (!span) return false;
    const yaw = span.lay(k, w.state.yaw);
    w.state.yaw = yaw;
    this.laid.set(k, yaw);
    this.lock = k < span.to ? yaw : null;
    return true;
  }
  yaw(): number | null { return this.lock; }
  pose(): null { return null; }
  rootY(): null { return null; }
  peek(): number { return 0; }
  peeking(): 0 { return 0; }
  action(): void { /* none */ }
  lean(): void { /* none */ }
  reset(): void { /* none */ }
  busy(): boolean { return this.lock !== null; }
  jump(): boolean { return false; }
  dive(): boolean { return false; }
  stanceButton(): boolean { return false; }
}

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

interface Sent { cmd: Omit<Command, 'seq'>; feet: [number, number, number]; facing: [number, number]; gate: LookGate }

/**
 * A page: a real walk and client, the walk's every command, its predicted feet and facing and its gate after the step
 * kept by command (the tap wrapped). `look(i)` is the camera's yaw for frame `i` (a held move overrides it, as the walk does).
 */
/**
 * OT.R72 (CTL.R2, the gameplay seat's (b)): the room's bound is now the fastest gain a player can set
 * (`LOOK_RATE_MAX_ADAPTATION`); PTT-8's byte-equal guard below runs the gate at the rates it recorded -- RECRUIT's law,
 * the bound before -- through `LookContext.rateMax`, so it still means "the live gate unchanged by the replay's fix".
 */
const PTT8_RATES = { yaw: MAX_YAW_RATE, pitch: MAX_PITCH_RATE };

function page(move: () => LayingMove, rateMax?: { yaw: number; pitch: number }) {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
  const fly = new FlyCamera(c);
  fly.groundWish = () => ({ forward: 0, right: 0, boost: false });
  const walk = new WalkMode(fly);
  walk.setGround(ground(), [0, 0, 0]);
  if (rateMax) walk.setLookContext(() => ({ ...OPEN_LOOK_CONTEXT, rateMax }));
  let current: LayingMove | null = null;
  walk.useTraversal(() => (current = move()));
  const sent: Sent[] = [];
  const set = walk.setNetTap.bind(walk);
  walk.setNetTap = (t, n) => set(t && ((cmd, feet, facing) => {
    t(cmd, feet, facing);
    sent.push({ cmd: { ...cmd }, feet: [...feet], facing: [facing![0], facing![1]], gate: (walk as unknown as { lookGate: LookGate }).lookGate.clone() });
  }), n);
  const socket = fakeSocket();
  const client = new NetClient({ url: 'mem', map: 'SYN', name: 'A', socket: () => socket }, walk);
  socket.onopen?.({});
  socket.server({ type: 'welcome', id: 3, version: 11, map: 'SYN', tick: 0, role: 'player', team: 'seal', queue: 0, epoch: 0, env: { revision: 0, epoch: 0, states: [] } } as unknown as ServerEvent);
  socket.server({ type: 'spawn', id: 3, at: [0, 0, 0], yaw: 0, after: 0 });
  const frame = (yaw: number, pitch = 0, dt = TICK): void => {
    fly.setPose({ yaw, pitch });
    fly.update(dt);
    walk.frame(dt);
  };
  const snapshot = (ack: number, facing: readonly [number, number]): void => {
    const f = sent[ack - 1]!.feet;
    socket.onmessage?.({ data: encodeSnapshot({ tick: ack * 2, own: { ack, x: f[0], y: f[1], z: f[2], vx: 0, vy: 0, vz: 0, facing: { yaw: facing[0], pitch: facing[1] } }, bodies: [] }) });
  };
  return { client, walk, sent, frame, snapshot, move: () => current!, server: socket.server };
}

/**
 * The room's mover: it agrees with the page up to command `ack0`, faces `error` off there, and from it steps its gate
 * (the page's as it stood after `ack0`) on each command from its own facing, the move laying what it laid on the page.
 */
function room(p: ReturnType<typeof page>, ack0: number, error: readonly [number, number]) {
  const facings: [number, number][] = [];
  let gate: LookGate | null = null;
  return (ack: number): [number, number] => {
    for (let k = facings.length + 1; k <= ack; k++) {
      const s = p.sent[k - 1]!;
      if (k < ack0) { facings.push([...s.facing]); continue; }
      if (k === ack0) { facings.push([s.facing[0] + error[0], s.facing[1] + error[1]]); gate = s.gate.clone(); continue; }
      const [yaw, pitch] = facings[k - 2]!;
      const looked = gate!.step({ yaw, pitch }, { yaw: s.cmd.yaw, pitch: s.cmd.pitch, buttons: 0 }, OPEN_LOOK_CONTEXT, p.move().held.get(k)!, aimPitchLimits('stand'));
      facings.push([p.move().laid.get(k) ?? looked.yaw, looked.pitch]);
    }
    return facings[ack - 1]!;
  };
}

/** Frames `1..n`, one tick each; from frame `lag` a snapshot every second frame acking the command `lag` ticks back. */
function play(p: ReturnType<typeof page>, n: number, lag: number, look: (i: number) => number, roomAt: (ack: number) => [number, number]): void {
  for (let i = 1; i <= n; i++) {
    p.frame(look(i));
    if (i > lag && i % 2 === 0) p.snapshot(i - lag, roomAt(i - lag));
  }
}

describe('the facing replay starts each step where the mover stood (PTT-8, LATER 16; review focus 7)', () => {
  it('on a ladder: a correction landing mid-ladder replays the in-flight steps on the ladder\'s yaw -- one correction, not one a snapshot', () => {
    // Turning 1 degree a tick; the ladder taken at tick 12 (its facing laid in that tick), held to tick 40. The room's
    // mover stood 4 degrees further round after command 10; that snapshot lands at frame 18, mid-ladder.
    const p = page(() => new LayingMove({ from: 12, to: 40, lay: () => LADDER_YAW }));
    const roomAt = room(p, 10, [4, 0]);
    play(p, 64, 8, (i) => i, roomAt);
    expect(p.sent).toHaveLength(64);
    expect(p.move().laid.get(20)).toBe(LADDER_YAW);
    expect(Math.abs(p.sent[19]!.cmd.yaw - LADDER_YAW)).toBeGreaterThan(0.001);   // the command's yaw is the wire's, not the lock
    expect(p.client.corrections.facing).toBe(1);
    // The page and the room agree on every command after the correction, the ladder's and the slew after it.
    for (let k = 19; k <= 56; k++) {
      const [ry, rp] = roomAt(k), [py, pp] = p.sent[k - 1]!.facing;
      expect([k, Math.abs(py - ry) < 1e-3, Math.abs(pp - rp) < 1e-3]).toEqual([k, true, true]);
    }
  });

  it('on the 180: a correction landing mid-turn replays the in-flight steps on the turn\'s own yaw -- one correction, not one a snapshot', () => {
    // The 180 (here 170 degrees) starts at tick 20 from the yaw the gate left (laid unchanged, `mountTop`), then turns
    // by code each tick (`turning`); the room's mover stood 3 degrees lower after command 30, mid-turn.
    let from = 0;
    const end = 20 + TURN_180_TICKS;
    const p = page(() => new LayingMove({ from: 20, to: end, lay: (k, yaw) => {
      if (k === 20) { from = yaw; return yaw; }
      return from + (170 * (k - 20)) / TURN_180_TICKS;
    } }));
    const roomAt = room(p, 30, [0, -3]);
    play(p, end + 24, 8, (i) => i * 0.5, roomAt);
    expect(p.client.corrections.facing).toBe(1);
    for (let k = 39; k <= end + 16; k++) {
      const [ry, rp] = roomAt(k), [py, pp] = p.sent[k - 1]!.facing;
      expect([k, Math.abs(py - ry) < 1e-3, Math.abs(pp - rp) < 1e-3]).toEqual([k, true, true]);
    }
  });
});

describe('a correction for a command from life, landing after the death (PTT-8 review F1)', () => {
  it("the dead ticks' facing is not taken for a move's: the newest recorded step replays from its own output -- one correction", () => {
    // Turning 1 degree a tick (the spawn's grace ended by the first), then 3 from tick 11 (over the cap: the gate's
    // outputs held, off the wire's grid); killed after tick 20, so ticks 21
    // on are dead -- unrecorded (`WalkMode.frame`: no look step for a dead body) while `tickRef` follows the body's
    // quantised look. The room stood 4 degrees further round after command 10; that snapshot lands at frame 26, dead.
    const p = page(() => new LayingMove());
    const roomAt = room(p, 10, [4, 0]);
    for (let i = 1; i <= 40; i++) {
      p.frame(i <= 10 ? i : 10 + (i - 10) * 3);
      if (i === 20) p.server({ type: 'kill', killer: null, victim: 3, weapon: null, how: 'fall' } as unknown as ServerEvent);
      if (i >= 26 && i <= 36 && i % 2 === 0) p.snapshot(i - 16, roomAt(i - 16));   // acks 10 to 20: every one from life
    }
    expect(p.client.corrections.facing).toBe(1);
  });
});

/** The SHA-256 of numbers as little-endian float64 bytes: two runs agree only if every value agrees to the bit. */
function digest(values: readonly number[]): string {
  return createHash('sha256').update(new Uint8Array(Float64Array.from(values).buffer)).digest('hex');
}

/**
 * The online seat's condition for PTT-8 (sprint 37's plan, "PTT-8"): the live look gate's outputs are byte-equal before
 * and after the change -- the room's per-tick turn cap and the stick's law (OT.R38 / H115) untouched. The digests below
 * were produced by running these two tests on the base commit b0d2f4180 (agent/playtest, before PTT-8's change to
 * `LookLog` and `WalkMode`'s record and replay calls) and copied from the failing expectation's "received" value; a
 * reviewer reproduces them by running this file on that commit. The gate's own digest (the third test) re-derived
 * 2026-11-02 at P13 (the online-parity sweep's AR-5: the kick's rate rides a scoped or binoculars command only,
 * `lookGate.ts` `kickingView`): its M4A1 pitch steps are unscoped, so their clamps moved. Was
 * 'd35d0b890589e6bb95a8eabf22d58e233a7834b9bef8b927a228656e785479d0' -- which the P13 head reproduces with `kickingView`
 * answering true on every command, so the kick's term is the one change.
 */
describe("the live look gate is unchanged by the replay's fix (byte-equal to the base commit)", () => {
  it('the real walk, live: turns under and over the cap, a snap, two-tick frames, the pitch, a ladder and a 180 -- every command and facing', () => {
    let from = 0;
    const p = page(() => new LayingMove(
      { from: 40, to: 60, lay: () => LADDER_YAW },
      { from: 70, to: 70 + TURN_180_TICKS, lay: (k, yaw) => { if (k === 70) { from = yaw; return yaw; } return from + (170 * (k - 70)) / TURN_180_TICKS; } },
    ), PTT8_RATES);
    let yaw = 0, pitch = 0;
    for (let i = 1; i <= 150; i++) {
      if (i <= 10) yaw += 2;                                     // under the cap (2.135 degrees a tick)
      else if (i <= 14) yaw += 3;                                // over it: the bank, then held
      else if (i === 15) yaw += 40;                              // a snap: held to the cap
      else if (i >= 21 && i <= 24) yaw -= 4;                     // two ticks a frame (below), the turn spread over them
      else if (i >= 80) yaw += 2.5;
      if (i >= 25 && i <= 30) pitch += 12;
      if (i === 31) pitch = -50;
      p.frame(yaw, pitch, i >= 21 && i <= 24 ? 2 * TICK : TICK);
    }
    expect(p.client.corrections.facing).toBe(0);
    // What the sequence exercised: the cap held some commands, the ladder and the 180 laid their yaws and held it.
    expect(p.sent[p.sent.length - 1]!.gate.clamps).toBeGreaterThan(0);
    expect(p.move().laid.get(50)).toBe(LADDER_YAW);
    expect(p.move().held.get(50)).toBe(true);
    expect(p.move().laid.get(70 + TURN_180_TICKS)).toBeCloseTo(p.move().laid.get(70)! + 170, 9);
    const out: number[] = [];
    for (const s of p.sent) out.push(s.cmd.yaw, s.cmd.pitch, s.cmd.turn, s.facing[0], s.facing[1], s.gate.clamps);
    expect(out.length).toBe(6 * 154);
    expect(digest(out)).toBe('343a3e00077202cae7784a7fffe523af98a52adee86eaadd43fbfdf8d5142b8c');
  });

  it('OT.R72: at the new bound (the fastest settable gain, LOOK_RATE_MAX_ADAPTATION) the replay\'s fix holds too: no facing correction, the ladder and the 180 laid and held', () => {
    let from = 0;
    const p = page(() => new LayingMove(
      { from: 40, to: 60, lay: () => LADDER_YAW },
      { from: 70, to: 70 + TURN_180_TICKS, lay: (k, yaw) => { if (k === 70) { from = yaw; return yaw; } return from + (170 * (k - 70)) / TURN_180_TICKS; } },
    ));
    let yaw = 0, pitch = 0;
    for (let i = 1; i <= 150; i++) {
      if (i <= 10) yaw += 2;
      else if (i <= 14) yaw += 4.5;                              // over the new cap (3.285 degrees a tick): the bank, then held
      else if (i === 15) yaw += 40;                              // a snap: held to the cap
      else if (i >= 21 && i <= 24) yaw -= 6;
      else if (i >= 80) yaw += 2.5;
      if (i >= 25 && i <= 30) pitch += 12;
      if (i === 31) pitch = -50;
      p.frame(yaw, pitch, i >= 21 && i <= 24 ? 2 * TICK : TICK);
    }
    expect(p.client.corrections.facing).toBe(0);
    expect(p.sent[p.sent.length - 1]!.gate.clamps).toBeGreaterThan(0);
    expect(p.move().laid.get(50)).toBe(LADDER_YAW);
    expect(p.move().held.get(50)).toBe(true);
    expect(p.move().laid.get(70 + TURN_180_TICKS)).toBeCloseTo(p.move().laid.get(70)! + 170, 9);
  });

  it("the gate itself: the cap and the bank, the scope and the binoculars, the kick, a stance's limits, a held move, the grace, a mount", () => {
    const M4A1: LookContext = { scopeScale: 1 / 2.5, kickRate: 0.5, rateMax: PTT8_RATES };
    const OPEN: LookContext = { ...OPEN_LOOK_CONTEXT, rateMax: PTT8_RATES };
    const gate = new LookGate(), ref = { yaw: 0, pitch: 0 }, out: number[] = [];
    const step = (yaw: number, pitch: number, buttons = 0, ctx: LookContext = OPEN, held = false, posture = 'stand', laid: number | null = null): void => {
      const o = gate.step(ref, { yaw, pitch, buttons }, ctx, held, aimPitchLimits(posture));
      out.push(o.yaw, o.pitch, o.turn, o.clampedYaw ? 1 : 0, o.clampedPitch ? 1 : 0, gate.clamps);
      ref.yaw = laid ?? o.yaw; ref.pitch = o.pitch;
    };
    step(0, 0);                                                  // the grace: armed by a command facing the mover
    for (let k = 1; k <= 8; k++) step(k * 2, 0);
    for (let k = 1; k <= 8; k++) step(16 + k * 3, 0);
    step(ref.yaw + 120, 0);
    for (let k = 1; k <= 6; k++) step(ref.yaw + 1, 0, Button.Scope, M4A1);
    for (let k = 1; k <= 6; k++) step(ref.yaw + 1, 0, Button.Binoculars, M4A1);
    for (let k = 1; k <= 6; k++) step(ref.yaw, k * 4, 0, M4A1);
    step(ref.yaw, -60, 0, M4A1, false, 'prone');                 // the limits narrow: the edge at once
    step(ref.yaw, -20, 0, M4A1, false, 'prone');
    for (let k = 1; k <= 5; k++) step(ref.yaw + 30, 0, 0, OPEN, true, 'stand', 271.5);   // a held move lays its own
    for (let k = 1; k <= 5; k++) step(ref.yaw - 5, 0);
    gate.allowSnap();
    step(10, 0);
    step(200, 0);
    gate.cover(3);
    step(ref.yaw + 9, 0);
    expect(gate.clamps).toBeGreaterThan(0);
    expect(digest(out)).toBe('4b4d868c6b869b94f348d5113f191f1b03a1641537733d53f5cd3e97f652d1c7');
  });
});
