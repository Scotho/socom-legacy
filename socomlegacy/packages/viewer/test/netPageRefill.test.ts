import { describe, expect, it } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import type { WebSocketLike } from '../src/net/client';
import type { NetRefillRule } from '../src/net/netRefill';
import type { ServerEvent } from '../src/net/protocol';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';
import { matchNetDeps, type MatchNetParts } from '../src/matchNet';
import { TESTROOM_CAPABILITIES } from '../src/matchCore';

/**
 * NET-REFILL N3 (research 312 §5, §6 item 3): the match hands the page's `Fire` its network rule. Every port match is a
 * network game (`SOLO_IS_NETWORK_READING`), so a `NetPage` tells its `Fire` the rule from its start (the asked rules),
 * again at the welcome (the room's), and null at its close or release (no match: offline); a page that only watches
 * tells null. The shared deps (`../src/matchNet`, ONE-WIRE) carry it to `Fire.setNetRefill`.
 */

function page(rules: 'classic' | 'respawn', watch = false) {
  const told: (NetRefillRule | null)[] = [];
  const hud: NetPageDeps['hud'] = {
    postMessage: () => undefined, setTimer: () => undefined, setHealth: () => undefined, setScoreRows: () => undefined,
    setRoundScreen: () => undefined, startRound: () => undefined,
  };
  const remote = {
    setTeam: () => undefined, setType: () => undefined, setKit: () => undefined, forget: () => undefined, died: () => undefined,
    hydrateCorpse: () => undefined, markGhost: () => undefined, clear: () => undefined, frame: () => undefined,
    setEscortee: () => undefined, setOpacity: () => undefined, feet: () => null, playerType: () => 0,
  } as unknown as RemotePlayers;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setTrigger: () => undefined,
    setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'walk', setFlinchPose: () => undefined,
    feet: () => [0, 0, 0],
  } as unknown as WalkMode;
  let socket: WebSocketLike | null = null;
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined, respawned: () => undefined,
    newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    socket: () => { socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike; return socket; },
    netRefill: (rule) => { told.push(rule); },
  };
  const net = new NetPage(deps, 'ws://test/ws', 'MP6', 'Tester', undefined, watch, rules);
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  const welcome = (r: 'classic' | 'respawn'): ServerEvent => ({
    type: 'welcome', id: 1, version: 9, map: 'MP6', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
    players: [], rules: r, round: 1, rounds: 2, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
  } as ServerEvent);
  return { net, told, server, welcome };
}

describe('NET-REFILL N3: the match hands Fire its network rule (research 312 §5)', () => {
  it('the asked rules at the start, the room\'s at the welcome, null at the close', () => {
    const p = page('respawn');
    expect(p.told).toEqual([{ respawn: true }]);
    p.server(p.welcome('classic'));
    expect(p.told).toEqual([{ respawn: true }, { respawn: false }]);
    p.net.close();
    expect(p.told.at(-1)).toBeNull();
  });

  it('null at the match\'s release (back to the game lobby); a page that only watches tells null', () => {
    const p = page('classic');
    p.server(p.welcome('classic'));
    p.net.release();
    expect(p.told).toEqual([{ respawn: false }, { respawn: false }, null]);
    const w = page('classic', true);
    expect(w.told).toEqual([null]);
  });

  it('the shared deps (ONE-WIRE) carry the rule to the firearm\'s Fire.setNetRefill', () => {
    const set: (NetRefillRule | null)[] = [];
    const parts = {
      caps: Object.fromEntries(Object.keys(TESTROOM_CAPABILITIES).map((k) => [k, false])),   // no part mounted: the shared hooks alone
      walk: {} as NetPageDeps['walk'], remote: {} as NetPageDeps['remote'], hud: {} as NetPageDeps['hud'],
      fly: { setPose: () => undefined },
      loadouts: { picks: () => [], type: () => 0, seated: () => null, setType: () => true, unseated: () => undefined, roomAnswer: () => undefined },
      firearm: {
        records: () => [HELD_RIFLE, HELD_SIDEARM], roundEffects: () => undefined, roundImpact: () => undefined, died: () => undefined, spawnKit: () => undefined,
        fire: { undoReload: () => true, restoreReload: () => true, refundRound: () => true, setNetRefill: (r: NetRefillRule | null) => { set.push(r); } },
      },
      clips: () => null, map: () => null, side: () => 'seal', followTeam: () => undefined, menuOpen: () => false,
    } as unknown as MatchNetParts;
    const deps = matchNetDeps(parts, {}, {} as never);
    deps.netRefill?.({ respawn: true });
    deps.netRefill?.(null);
    expect(set).toEqual([{ respawn: true }, null]);
  });
});
