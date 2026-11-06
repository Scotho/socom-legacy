import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetClient, type NetWalk, type WebSocketLike } from '../src/net/client';
import { decodeCommands, frameKind } from '../src/net/codec';
import { Frame } from '../src/net/protocol';

/**
 * NCW-8, second half (the netcode wave's B-resync, plan `2026-11-05-netcode-wave.md` section 6): the frame's send order
 * (`NetClient.beginFrame`) and the resume hold, on the client alone. `longGap.test.ts` measures the page and the room
 * through them; this pins the order itself. Unit tests on a recording socket: nothing of the room runs here.
 */

type Tap = Parameters<NetWalk['setNetTap']>[0];
const flush = async (): Promise<void> => { for (let i = 0; i < 3; i++) await Promise.resolve(); };

/** A client on a recording socket, opened and welcomed as a player; `wire()` the socket's messages so far, pings left out. */
function rig(welcomeOver: Record<string, unknown> = {}) {
  let tap: Tap = null;
  const walk = new Proxy({ setNetTap: (t: Tap) => { tap = t; }, respawn: () => true, resume: () => true } as Record<string, unknown>, {
    get: (t, k) => (k in t ? t[k as string] : () => undefined),
  }) as unknown as NetWalk;
  const sent: (string | Uint8Array)[] = [];
  const socket = { binaryType: '', readyState: 1, send: (d: string | Uint8Array) => { sent.push(d); }, close: () => undefined } as unknown as WebSocketLike;
  const client = new NetClient({ url: 'mem', map: 'MP2', name: 'Tester', socket: () => socket }, walk);
  socket.onopen?.({} as Event);
  const server = (ev: Record<string, unknown>): void => { socket.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  server({
    type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
    players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 1, env: { revision: 0, epoch: 1, states: [] }, startTick: 0, ...welcomeOver,
  });
  const tick = (): void => { tap!({ forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 }, [0, 0, 0], [0, 0]); };
  const wire = (): string[] => sent.flatMap((d) => {
    if (typeof d === 'string') {
      const m = JSON.parse(d) as { type: string; seq?: number };
      return m.type === 'ping' ? [] : [`${m.type}${m.seq ?? ''}`];
    }
    return frameKind(d) === Frame.Commands ? [`c${Math.max(...decodeCommands(d).commands.map((c) => c.seq))}`] : [];
  });
  return { client, server, tick, wire, sent };
}

const fire = (seq: number) => ({ type: 'fire', seq, from: [0, 0, 0], dir: [0, 0, -1], weapon: 0, viewTick: 0, eye: [0, 0, 0], aim: [0, 0, -1] }) as never;

afterEach(() => { vi.restoreAllMocks(); });

describe('NCW-8: a frame\'s send order (NetClient.beginFrame)', () => {
  it('a long frame: its first command at once, each event named at a command right after it, the rest at the task\'s end; an unnamed event at once, the events in send order', async () => {
    const r = rig();
    const before = r.wire().length;
    r.client.beginFrame!();
    for (let i = 0; i < 6; i++) r.tick();                         // the walk: a 0.1 s frame's six commands
    expect(r.wire().slice(before)).toEqual(['c1']);
    r.client.send({ type: 'chat', text: 'go' });                  // named at no command: at once, nothing released
    r.client.send(fire(2));                                        // the weapon step: a round at its own tick (LATER 338)
    r.client.send({ type: 'reload', seq: 4 });
    expect(r.wire().slice(before)).toEqual(['c1', 'chat', 'c2', 'fire2', 'c3', 'c4', 'reload4']);
    await flush();                                                 // the frame's task ends
    expect(r.wire().slice(before)).toEqual(['c1', 'chat', 'c2', 'fire2', 'c3', 'c4', 'reload4', 'c5', 'c6']);
  });

  it('an event named at an earlier command than the frame\'s held ones leaves at once; one named at the frame\'s first after it', async () => {
    const r = rig();
    for (let i = 0; i < 3; i++) r.tick();                          // c1..c3, no frame: each at once (as before)
    const before = r.wire().length;
    r.client.beginFrame!();
    for (let i = 0; i < 4; i++) r.tick();                          // c4 at once, c5..c7 held
    r.client.send(fire(3));                                        // the last frame's tick (`tickAim`'s `at < 0`)
    r.client.send(fire(4));                                        // a press's round at its press's first (LATER 347)
    expect(r.wire().slice(before)).toEqual(['c4', 'fire3', 'fire4']);
    await flush();
    expect(r.wire().slice(before)).toEqual(['c4', 'fire3', 'fire4', 'c5', 'c6', 'c7']);
  });

  it('a two-tick frame (a 60 fps game\'s jitter): a round named at its first tick leaves between the two -- `c1 f1 c2`, before the second half `c1 c2 f1` (the room\'s result the same: `longGap.test.ts`)', async () => {
    const r = rig();
    const before = r.wire().length;
    r.client.beginFrame!(); r.tick(); r.tick();
    r.client.send(fire(r.client.lastSeq() - 1));
    await flush();
    expect(r.wire().slice(before)).toEqual(['c1', 'fire1', 'c2']);
  });

  it('a frame of one tick holds nothing, and frames back to back in one task send the last one\'s held commands as the next begins', () => {
    const r = rig();
    const before = r.wire().length;
    r.client.beginFrame!(); r.tick(); r.client.send(fire(1));      // 60 fps: one command, its round after it -- as before
    r.client.beginFrame!(); r.tick();
    expect(r.wire().slice(before)).toEqual(['c1', 'fire1', 'c2']);
    r.client.beginFrame!(); r.tick(); r.tick(); r.tick();          // c3 at once, c4 c5 held
    expect(r.wire().slice(before)).toEqual(['c1', 'fire1', 'c2', 'c3']);
    r.client.beginFrame!(); r.tick();                              // the next frame: the last one's rest first, then its own
    expect(r.wire().slice(before)).toEqual(['c1', 'fire1', 'c2', 'c3', 'c4', 'c5', 'c6']);
  });
});

describe('NCW-8 (b): nothing named at a command between a resumed welcome and its resume', () => {
  it('no command, round, reload or throw leaves before the resume (dropped); an unnamed event does; after it the commands and rounds number on from the room\'s count', async () => {
    const r = rig({ resumed: true });
    expect(r.client.awaitingResume!()).toBe(true);
    const before = r.wire().length;
    r.client.beginFrame!();
    for (let i = 0; i < 6; i++) r.tick();
    r.client.send(fire(2));
    r.client.send({ type: 'reload', seq: 3 });
    r.client.send({ type: 'throw', seq: 4, kind: 'frag', from: [0, 0, 0], velocity: [0, 0, 1] } as never);
    r.client.send({ type: 'chat', text: 'back' });
    await flush();
    expect(r.wire().slice(before)).toEqual(['chat']);
    r.server({
      type: 'resume', id: 1, at: [0, 0, 0], yaw: 0, posture: 'stand', seq: 5000, health: [1, 1, 1, 1, 1, 1], armour: [0, 0, 0, 0, 0, 0],
      loadout: [], rounds: [[], []], pouch: {}, weapon: 0, held: null, turret: null,
    });
    expect(r.client.awaitingResume!()).toBe(false);
    r.client.beginFrame!();
    r.tick(); r.tick();
    r.client.send(fire(r.client.lastSeq() - 1));
    await flush();
    expect(r.wire().slice(before)).toEqual(['chat', 'c5001', 'fire5001', 'c5002']);
  });

  it('a welcome that is not a resume holds nothing back', () => {
    const r = rig();
    expect(r.client.awaitingResume!()).toBe(false);
    const before = r.wire().length;
    r.tick();
    r.client.send(fire(1));
    expect(r.wire().slice(before)).toEqual(['c1', 'fire1']);
  });
});
