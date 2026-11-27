// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { Hud } from '../src/hud';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';

/**
 * LATER 1456 (research 85 §4.3; a network adaptation, additive under the protocol, no bump): the page echoes the serial
 * of the last `hurt` it heard (`hurt.n`) on its release request (`throwStart.hurt`), so the room can refuse a request
 * sent before the page saw the hurt that cancelled it (the victim's console decides: read in r0001, `FUN_00547af0` D:L413023 ->
 * `FUN_005b8920` D:L471751; r0004's twin inferred). Heard its own spawn, the page stamps 0 (the room zeroed the serial there) until a hurt; after
 * a resume it has none until the next hurt and sends no stamp (kept, as before: the named gap, research 85 §4.3).
 */
function page() {
  const sockets: WebSocketLike[] = [];
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
    mode: () => 'walk', resumeBody: () => undefined,
  } as unknown as WalkMode;
  const remote = { setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined } as unknown as RemotePlayers;
  const deps: NetPageDeps = {
    walk, remote, hud: new Hud(), clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    socket: () => {
      const s = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
      sockets.push(s);
      return s;
    },
  };
  const net = new NetPage(deps, 'ws://localhost:8787/ws', 'MP2', 'Tester', undefined, false, 'classic');
  const server = (ev: unknown): void => { sockets.at(-1)!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  sockets.at(-1)!.onopen?.({} as Event);
  server({
    type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
    players: [], rules: 'classic', round: 1, rounds: 11, ghost: false,
  });
  const send = vi.spyOn(net.client, 'send');
  const sentStarts = (): Record<string, unknown>[] =>
    send.mock.calls.map((c) => c[0] as unknown as Record<string, unknown>).filter((m) => m.type === 'throwStart');
  return { net, server, sentStarts };
}

const hurt = (n?: number): unknown => ({ type: 'hurt', health: [30, 30, 30, 30, 30, 30], from: [0, 0, 0], part: 0, ...(n !== undefined ? { n } : {}) });
const resume = {
  type: 'resume', id: 1, at: [0, 0, 0], yaw: 0, posture: 'stand', seq: 40, health: [1, 1, 1, 1, 1, 1], armour: [0, 0, 0, 0, 0, 0],
  loadout: [], rounds: [[], []], pouch: {}, weapon: 0, held: null,
};

it('LATER 1456: a page that heard hurt n 3 stamps its throwStart `hurt: 3`; after a resume, none', () => {
  const { net, server, sentStarts } = page();
  net.throwStartEvent('M67', 3);
  server(hurt(1)); server(hurt(3));
  net.throwStartEvent('M67', 3);
  server(resume);
  net.throwStartEvent('M67', 3);
  expect(sentStarts().map((m) => m.hurt)).toEqual([undefined, 3, undefined]);
  expect('hurt' in sentStarts()[2]!).toBe(false);
  net.close();
});

it("the review F1: heard its own spawn, the page stamps 0 (the room zeroed its serial) until a hurt; then that hurt's n", () => {
  const { net, server, sentStarts } = page();
  server(hurt(2));
  server({ type: 'spawn', id: 1, at: [0, 0, 0], yaw: 0 });
  net.throwStartEvent('M67', 3);
  server(hurt(3));
  net.throwStartEvent('M67', 3);
  server(hurt());                                     // a room that sends no `n` leaves the last stamp
  net.throwStartEvent('M67', 3);
  expect(sentStarts().map((m) => m.hurt)).toEqual([0, 3, 3]);
  net.close();
});

it('the review F1: a held spawn stamps 0 when heard, and a hurt heard before the walk stands it is not overwritten', () => {
  const { net, server, sentStarts } = page();
  let held = true, stand: (() => void) | null = null;
  const client = net.client as unknown as { spawnPending(): boolean };
  client.spawnPending = () => held;
  server({ type: 'spawn', id: 1, at: [0, 0, 0], yaw: 0 });   // held: the walk refused it
  net.throwStartEvent('M67', 3);
  server(hurt(1));
  held = false;
  stand = (net as unknown as { heldSpawn: unknown; ownSpawn(ev: unknown): void }).heldSpawn
    ? () => { const n = net as unknown as { heldSpawn: unknown; ownSpawn(ev: unknown): void }; n.ownSpawn(n.heldSpawn); } : null;
  expect(stand, 'the spawn was held').not.toBeNull();
  stand!();                                                   // the retried respawn stands (`onSpawnHeld`)
  net.throwStartEvent('M67', 3);
  expect(sentStarts().map((m) => m.hurt)).toEqual([0, 1]);
  net.close();
});
