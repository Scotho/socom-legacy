import { describe, expect, it } from 'vitest';
import { FACING_FLOOR_DEG, NetClient, type NetWalk, type WebSocketLike } from '../src/net/client';
import { encodeSnapshot } from '../src/net/codec';
import type { Command, ServerEvent } from '../src/net/protocol';
import { LookGate, LookLog, OPEN_LOOK_CONTEXT } from '../src/net/lookGate';
import { shortTurn } from '../src/yaw';

/**
 * NET-WIRE (protocol 11; NET-LOOK's design call, research 223 §8; research 224 §4): the page reconciles its facing
 * against the own state's `facing` as it does its position -- the error at the acked command taken out of every later
 * prediction and laid on the walk at once (`NetWalk.nudgeFacing`), never smoothed.
 */

function fakeSocket(): WebSocketLike & { server(ev: ServerEvent): void } {
  const s = {
    binaryType: 'blob', readyState: 1,
    send() { /* the commands up: not read here */ },
    close() { s.readyState = 3; },
    onopen: null as WebSocketLike['onopen'], onclose: null as WebSocketLike['onclose'],
    onmessage: null as WebSocketLike['onmessage'], onerror: null as WebSocketLike['onerror'],
    server(ev: ServerEvent) { s.onmessage?.({ data: JSON.stringify(ev) }); },
  };
  return s;
}

type Tap = (cmd: Omit<Command, 'seq'>, feet: [number, number, number], facing?: readonly [number, number]) => void;

function page() {
  let tap: Tap | null = null;
  const turns: [number, number][] = [];
  const walk: NetWalk = {
    setNetTap: (t) => { tap = t; }, respawn: () => true, nudge: () => undefined, setLocked: () => undefined,
    nudgeFacing: (dy, dp) => { turns.push([dy, dp]); },
  };
  const socket = fakeSocket();
  const client = new NetClient({ url: 'mem', map: 'SYN', name: 'A', socket: () => socket }, walk);
  socket.onopen?.({});
  socket.server({ type: 'welcome', id: 3, version: 11, map: 'SYN', tick: 0, role: 'player', team: 'seal', queue: 0, epoch: 0, env: { revision: 0, epoch: 0, states: [] } } as unknown as ServerEvent);
  socket.server({ type: 'spawn', id: 3, at: [0, 0, 0], yaw: 0, after: 0 });
  const cmd: Omit<Command, 'seq'> = { forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
  /** One page tick: its command's look and the facing after the tick as the walk hands it (a mover that reached its look). */
  const tick = (yaw: number, pitch = 0): void => tap!({ ...cmd, yaw, pitch }, [0, 0, 0], [yaw, pitch]);
  const snapshot = (ack: number, yaw: number, pitch = 0): void => {
    socket.onmessage?.({ data: encodeSnapshot({ tick: ack * 2, own: { ack, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, facing: { yaw, pitch } }, bodies: [] }) });
  };
  return { client, turns, tick, snapshot };
}

describe('the page reconciles its facing against the room\'s (protocol 11, NET-WIRE)', () => {
  it('an agreeing facing (to the float32) corrects nothing', () => {
    const { client, turns, tick, snapshot } = page();
    for (let k = 1; k <= 5; k++) tick(10 + k * 2.135, -1.5);
    snapshot(3, 10 + 3 * 2.135, -1.5);
    expect(turns).toEqual([]);
    expect(client.corrections.facing).toBe(0);
    expect(FACING_FLOOR_DEG).toBe(0.001);
  });

  it('a facing the room held (an honest stall: the page turned through ticks the room never ran) is laid on the walk at once, the later commands replayed from it', () => {
    const { client, turns, tick, snapshot } = page();
    // The page's look turned 4 degrees a tick for 20 ticks and its mover faced it; the room held it at 0 after command 10.
    // (4, past the gate's tick at the fastest settable gain -- 3.285 degrees, OT.R72's LOOK_RATE_MAX_ADAPTATION -- so the
    // replay from 0 is held behind the page; it was 2 under RECRUIT's 2.135 before.)
    // The independent review (2026-10-08): the later commands are replayed through the gate from the room's facing, not
    // shifted by one offset -- the expected ending is the same law's, run here on the same steps.
    const model = new LookLog(), gate = new LookGate();
    let ref: { yaw: number; pitch: number } | null = null;
    for (let k = 1; k <= 20; k++) {
      tick(k * 4);
      const c = { yaw: k * 4, pitch: 0, buttons: 0 };
      if (ref) { model.record(k, gate, c, OPEN_LOOK_CONTEXT, false, null); gate.step(ref, c, OPEN_LOOK_CONTEXT, false, null); }
      ref = { yaw: k * 4, pitch: 0 };
    }
    const want = model.replay(10, { yaw: 0, pitch: 0 }, gate)!;
    expect(want.ref.yaw).toBeLessThan(80);                         // the replay from 0 is held behind the page's 80
    snapshot(10, 0);
    expect(turns).toHaveLength(1);
    expect(turns[0]![0]).toBeCloseTo(shortTurn(80, want.ref.yaw), 6);   // the mover turned to where the replay ends
    expect(turns[0]![1]).toBe(0);
    expect(client.corrections.facing).toBe(1);
    expect(client.corrections.largestFacing).toBeCloseTo(40, 4);
    // Command 15's prediction is the replay's; the room's facing there agrees, so no new correction.
    snapshot(15, want.facings.get(15)![0]);
    expect(turns).toHaveLength(1);
    // The short way round: the page at 359, the room at 1 -- +2 degrees, not -358.
    tick(359);
    snapshot(21, 1);
    expect(turns[1]![0]).toBeCloseTo(2, 3);
  });

  it('the pitch is reconciled too, plainly', () => {
    const { turns, tick, snapshot } = page();
    for (let k = 1; k <= 4; k++) tick(0, k * 1.5);
    snapshot(4, 0, 4.5);
    expect(turns).toEqual([[0, -1.5]]);
  });
});
