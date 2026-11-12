import { afterEach, describe, expect, it, vi } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { Hud } from '../src/hud';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import { PROTOCOL_VERSION, RAISED_SINCE_PROTOCOL, type ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';

// ENEMY-RAISE ER-2 (protocol 14): the welcome's version tells the copies whether the raise field is on the wire.
// A replay recorded before 14 carries its recording's version in the welcome (`replayClient.ts`), and `NetPage`'s
// welcome hands `RemotePlayers.setRaiseField(false)` so the copies keep the pre-14 inference (`REMOTE_HAND_RAISE_READING`);
// a 14 welcome hands `true`. Held here at NetPage's socket seam (ER-2's re-review F1, REVIEW-ER2-AND-ER-BATCH.md).
const opened: NetPage[] = [];
afterEach(() => { for (const page of opened.splice(0)) page.close(); });

function page() {
  let socket: WebSocketLike | null = null;
  const remote = {
    setTeam: vi.fn(), setCharacter: vi.fn(), setType: vi.fn(), setKit: vi.fn(), clear: vi.fn(), setRaiseField: vi.fn(),
    forget: () => undefined, died: () => undefined, frame: () => undefined,
  };
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined,
    setMode: () => true, mode: () => 'walk',
  } as unknown as WalkMode;
  const deps: NetPageDeps = {
    walk, remote: remote as unknown as RemotePlayers, hud: new Hud(), clips: () => null, remoteGrenade: () => undefined,
    spectate: () => undefined, respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined,
    weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    socket: () => { socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike; return socket; },
  };
  const net = new NetPage(deps, 'ws://test/ws', 'MP2', 'Tester', undefined, false, 'classic');
  opened.push(net);
  socket!.onopen?.({} as Event);
  return { remote, server: (event: ServerEvent) => socket!.onmessage?.({ data: JSON.stringify(event) } as MessageEvent) };
}

type Welcome = Extract<ServerEvent, { type: 'welcome' }>;
const welcome = (version: number): Welcome => ({
  type: 'welcome', id: 1, version, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
  players: [{ id: 2, name: 'Volkov', team: 'terrorist' }], rules: 'classic', round: 1, rounds: 3, ghost: false, epoch: 0,
  env: { revision: 0, epoch: 0, states: [] },
});

describe("the welcome's version and the copies' raise field (ER-2, protocol 14)", () => {
  it('the raise field arrived with protocol 14', () => {
    expect(RAISED_SINCE_PROTOCOL).toBe(14);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(RAISED_SINCE_PROTOCOL);
  });

  it('a protocol-13 welcome (a replay recorded before 14) turns the raise field off: the copies infer', () => {
    const p = page();
    p.server(welcome(13));
    expect(p.remote.setRaiseField).toHaveBeenCalledTimes(1);
    expect(p.remote.setRaiseField).toHaveBeenLastCalledWith(false);
  });

  it('a protocol-14 welcome turns it on, and a later 13 welcome off again', () => {
    const p = page();
    p.server(welcome(PROTOCOL_VERSION));
    expect(p.remote.setRaiseField).toHaveBeenLastCalledWith(true);
    p.server(welcome(13));
    expect(p.remote.setRaiseField).toHaveBeenLastCalledWith(false);
  });
});
