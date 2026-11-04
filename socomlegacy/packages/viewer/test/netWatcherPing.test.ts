import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetClient, type NetWalk, type WebSocketLike } from '../src/net/client';
import { encodeSnapshot } from '../src/net/codec';
import type { ServerEvent } from '../src/net/protocol';

/**
 * HARD-FLOOD (research 169 measure 8, D9 (a): "watchers idle-limited as players are"): the room closes a watcher that
 * sends nothing for its idle time (`Room.idle`, `WATCHER_IDLE_CLOSE`), so a watching page -- which sends no commands --
 * answers its snapshots with the player's own 2 s ping. A browser adaptation with no original: the transport's
 * keep-alive, nothing the game shows.
 */

const walk: NetWalk = { setNetTap: () => undefined, respawn: () => true, nudge: () => undefined, setLocked: () => undefined, setDead: () => undefined };

function fakeSocket() {
  const s = {
    binaryType: 'arraybuffer', readyState: 1, sent: [] as unknown[],
    send(data: string | Uint8Array) { s.sent.push(data); },
    close() { s.readyState = 3; },
    onopen: null as WebSocketLike['onopen'], onclose: null as WebSocketLike['onclose'],
    onmessage: null as WebSocketLike['onmessage'], onerror: null as WebSocketLike['onerror'],
  };
  return s;
}

const pings = (sent: unknown[]): number => sent.filter((d) => typeof d === 'string' && JSON.parse(d).type === 'ping').length;

afterEach(() => { vi.restoreAllMocks(); });

describe('a watching page pings while its snapshots come (the room\'s watcher idle limit)', () => {
  it('one ping a 2 s at most, from the snapshots, as a spectator; none before the welcome', () => {
    let now = 10_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const socket = fakeSocket();
    new NetClient({ url: 'mem', map: 'MP1', name: 'W', watch: true, socket: () => socket }, walk);
    socket.onopen?.({} as never);
    const snap = (): void => { socket.onmessage?.({ data: encodeSnapshot({ tick: 1, own: null, bodies: [] }) }); };
    const before = pings(socket.sent);
    socket.onmessage?.({ data: JSON.stringify({ type: 'welcome', id: 9, version: 0, map: 'MP1', tick: 0, role: 'spectator', team: null, queue: 0 } as unknown as ServerEvent) });
    for (let i = 0; i < 30; i++) { snap(); now += 33; }                      // one second of snapshots
    expect(pings(socket.sent) - before).toBe(1);
    for (let i = 0; i < 90; i++) { snap(); now += 33; }                      // three more
    expect(pings(socket.sent) - before).toBe(2);
  });
});
