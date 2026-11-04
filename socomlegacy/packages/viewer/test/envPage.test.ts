import { describe, expect, it, vi } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { Hud } from '../src/hud';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { Simulate, WebSocketLike } from '../src/net/client';
import { encodeSnapshot } from '../src/net/codec';
import type { EnvWire, ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';
import { CRATE, CRATE_ID, WALL, WALL_ID, wallWorld } from './helpers/wallWorld';

/**
 * MAP-03 (research 209 s11): the page follows the room's world through protocol 10's environment -- the welcome's and
 * every snapshot's, laid on the page's `WorldState` (`NetPageDeps.world`). A joiner takes the world as it stands
 * silently (the game's `skip_effects`: no destroy program replayed, no damage); a change after the first snapshot is
 * applied with its effects, once; the round's start resets the page's world and moves the epoch, and a state of an
 * older round (a snapshot overtaken by the round's start) is not applied. A fake socket stands in for the server.
 */

function page(simulate?: Simulate) {
  const { world, visible } = wallWorld();
  // What the world applied, and whether silently: an apply that changed a node with `silent` false is an effect played
  // (MAP-06 runs the destroy programs there; none run yet, so the call is what is counted).
  const applied: { silent: boolean; changed: boolean }[] = [];
  // The world's calls in order: each reset, and each apply with whether it was silent and changed a node.
  const log: string[] = [];
  const reset = world.reset.bind(world);
  vi.spyOn(world, 'reset').mockImplementation(() => { reset(); log.push('reset'); });
  const apply = world.apply.bind(world);
  vi.spyOn(world, 'apply').mockImplementation((states, silent) => {
    const was = world.revision;
    apply(states, silent);
    applied.push({ silent, changed: world.revision !== was });
    log.push(`apply silent=${silent} changed=${world.revision !== was}`);
  });
  let socket: WebSocketLike | null = null;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
    mode: () => 'walk',
  } as unknown as WalkMode;
  const remote = { setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined } as unknown as RemotePlayers;
  const deps: NetPageDeps = {
    walk, remote, hud: new Hud(), clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM], world: () => world,
    socket: () => {
      socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
      return socket;
    },
  };
  new NetPage(deps, 'ws://test/ws', 'SYN', 'Tester', simulate, false, 'classic');
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  let tick = 0;
  const snapshot = (env: EnvWire): void => { socket!.onmessage?.({ data: encodeSnapshot({ tick: ++tick, own: null, bodies: [], env }) } as unknown as MessageEvent); };
  return { world, visible, applied, log, server, snapshot };
}

describe('the environment on the page (MAP-03, protocol 10)', () => {
  it('a late joiner sees an inactive instance inactive with no effect played; a change after its first snapshot plays its effects once; an older epoch\'s change is ignored', () => {
    const { world, visible, applied, server, snapshot } = page();
    // The room's wall fell before this page joined (round 3 of the room, epoch 2).
    const fallen: EnvWire = { revision: 9, epoch: 2, states: [{ id: WALL_ID, active: false }] };
    server({
      type: 'welcome', id: 1, version: 11, map: 'SYN', tick: 400, role: 'player', team: 'seal', queue: 0, name: 'Tester',
      players: [], rules: 'classic', round: 3, rounds: 11, ghost: false, epoch: 2, startTick: 300, env: fallen,
    } as ServerEvent);
    expect(world.isActive(WALL)).toBe(false);
    expect(visible).toEqual([[WALL, false]]);                                 // hidden, at once
    snapshot(fallen);                                                          // the welcome's revision repeated: dropped (protocol 11)
    expect(applied.every((a) => a.silent)).toBe(true);
    expect(applied.filter((a) => a.changed)).toHaveLength(1);
    // The crate goes up in the room: that change is the page's to play, once however many snapshots repeat it.
    const crate: EnvWire = { revision: 10, epoch: 2, states: [{ id: WALL_ID, active: false }, { id: CRATE_ID, active: true }] };
    snapshot(crate); snapshot(crate); snapshot(crate);
    expect(world.isActive(CRATE)).toBe(true);
    expect(applied.filter((a) => a.changed && !a.silent)).toHaveLength(1);
    // The next round: the page's world reset (the crate saved off at the opening, the wall no reference saves left as
    // it is: WORLD_RESET_SAVED_READING), the epoch moved; a snapshot of the round before, overtaken, is not applied.
    server({ type: 'roundStart', round: 4, seconds: 360, wins: { seal: 1, terrorist: 2 }, rounds: 11, epoch: 3, startTick: 900 } as ServerEvent);
    expect(world.isActive(CRATE)).toBe(false);
    const calls = applied.length;
    snapshot(crate);
    expect(applied).toHaveLength(calls);
    expect(world.isActive(CRATE)).toBe(false);
    // The new round's own state is applied, with its effects (a change after the first snapshot).
    snapshot({ revision: 12, epoch: 3, states: [{ id: WALL_ID, active: true }] });
    expect(world.isActive(WALL)).toBe(true);
    expect(applied.at(-1)).toEqual({ silent: false, changed: true });
  });

  // The review's fix round: the room sends the round start, then the new round's snapshot; the injector's jitter
  // (`Simulate`, `NetClient.delayed`) delivers the snapshot first. The boundary is crossed there: the page's world is
  // reset (as the round start would) before that snapshot's state is laid on it, so no restore is applied as a change
  // with its effects; the round start that arrives after resets nothing more.
  it("under the latency injector's jitter, a newer-epoch snapshot before its roundStart resets the world once, silently, and the roundStart after it resets nothing", () => {
    vi.useFakeTimers();
    try {
      // The injector's draws: 0.5 (no jitter) unless queued; each delivery takes one (latency 50 +- 40 ms).
      const draws: number[] = [];
      vi.spyOn(Math, 'random').mockImplementation(() => draws.shift() ?? 0.5);
      const { world, log, server, snapshot } = page({ latencyMs: 50, jitterMs: 40 });
      // A joiner in round 3 (epoch 2) of a room whose crate is up.
      const up: EnvWire = { revision: 9, epoch: 2, states: [{ id: CRATE_ID, active: true }] };
      server({
        type: 'welcome', id: 1, version: 11, map: 'SYN', tick: 400, role: 'player', team: 'seal', queue: 0, name: 'Tester',
        players: [], rules: 'classic', round: 3, rounds: 11, ghost: false, epoch: 2, startTick: 300, env: up,
      } as ServerEvent);
      snapshot(up);
      vi.advanceTimersByTime(200);
      expect(world.isActive(CRATE)).toBe(true);
      expect(log).not.toContain('reset');
      // The room's round 4 (epoch 3): its round start (90 ms on the way), then its first snapshot (10 ms): the crate
      // back down with the reset (saved off at the opening), nothing else changed in the new round.
      draws.push(0.99, 0);
      server({ type: 'roundStart', round: 4, seconds: 360, wins: { seal: 1, terrorist: 2 }, rounds: 11, epoch: 3, startTick: 900 });
      snapshot({ revision: 11, epoch: 3, states: [] });
      log.length = 0;
      vi.advanceTimersByTime(20);
      expect(log).toEqual(['reset', 'apply silent=false changed=false']);   // reset first; the snapshot then changes nothing
      expect(world.isActive(CRATE)).toBe(false);
      vi.advanceTimersByTime(100);                                            // the round start arrives
      expect(log).toEqual(['reset', 'apply silent=false changed=false']);   // no second reset
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });
});
