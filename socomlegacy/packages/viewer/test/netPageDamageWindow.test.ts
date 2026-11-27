// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { Hud } from '../src/hud';
import { NetPage } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import type { Rules, ScoreRow, ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';

/**
 * WM-13 (the DAMAGE REPORT PANEL, a BROWSER ADAPTATION: the original has no damage report): the page's one accessor for
 * "the window" -- the result window (the round's result in, `roundOver`, no round screen yet: `ENGINE_READ_S`) with the
 * round's report, and a respawn room's respawn wait (from `respawnReady` until the page's own spawn) with the life's;
 * closed otherwise. Its lines carry the page's own kill marks (KILL / KILLED YOU). The harness is respawnPrompt.test.ts's.
 */
function page(rules: Rules) {
  let socket: WebSocketLike | null = null, dead = false;
  const hud = new Hud();
  hud.setVisible(true);
  const walk = {
    setNetTap: () => {}, setLocked: () => {}, respawn: () => true, nudge: () => {},
    setTrigger: () => {}, setDead: (on: boolean) => { dead = on; },
    setDeathPose: (pose: unknown) => { if (pose !== null) dead = true; },
    setDeathKiller: () => {}, mode: () => 'walk', isDead: () => dead, queueRespawnAction: () => true,
  } as unknown as WalkMode;
  const remote = { setTeam: () => {}, forget: () => {}, died: () => {}, clear: () => {}, frame: () => {} } as unknown as RemotePlayers;
  const net = new NetPage({
    walk, remote, hud, clips: () => null, remoteGrenade: () => {}, spectate: () => {}, respawned: () => {},
    ownCorpseExpired: () => false, roundEffects: () => {}, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    socket: () => {
      socket = { binaryType: '', readyState: 1, send: () => {}, close: () => {} } as unknown as WebSocketLike;
      return socket;
    },
  }, 'ws://test/ws', 'MP2', 'Tester', undefined, false, rules);
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  server({
    type: 'welcome', id: 1, version: 4, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
    players: [], rules, round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
  });
  const row = (id: number, name: string, team: 'seal' | 'terrorist'): ScoreRow => ({ id, name, team, kills: 0, deaths: 0, score: 0, alive: true, ping: 0 });
  server({ type: 'score', rows: [row(1, 'Tester', 'seal'), row(2, 'Bravo', 'terrorist'), row(3, 'Charlie', 'terrorist')], timeLeft: null, spectators: [], wins: { seal: 0, terrorist: 0 } });
  const at = (ms: number): void => {
    vi.mocked(performance.now).mockReturnValue(ms);
    if (net.client.state === 'open') server({ type: 'pong', t: ms, tick: 0 } as ServerEvent);
    net.frame(0, {} as never, false);
  };
  return { net, server, at };
}

const roundOver = (): ServerEvent => ({
  type: 'roundOver', round: 1, winner: 'seal', wins: { seal: 1, terrorist: 0 }, matchOver: false,
  screens: [{ screen: 'roundComplete', seconds: 5 }],
});

beforeEach(() => { vi.spyOn(performance, 'now').mockReturnValue(0); });
afterEach(() => { vi.restoreAllMocks(); });

describe('NetPage.damageWindow (WM-13)', () => {
  it('closed in a live round, open with the round\'s report from the result until the first round screen', () => {
    const p = page('classic');
    try {
      p.at(1000);
      expect(p.net.damageWindow()).toBeNull();
      p.server(roundOver());
      p.server({ type: 'damageReport', round: 1, taken: [{ from: 2, hits: 2, health: 0.4 }], dealt: [{ to: 3, hits: 1, health: 0.25 }] });
      p.at(1001);
      expect(p.net.damageWindow()).toEqual({
        kind: 'round',
        report: { round: 1, life: false, taken: [{ id: 2, name: 'Bravo', hits: 2, health: 0.4 }], dealt: [{ id: 3, name: 'Charlie', hits: 1, health: 0.25 }] },
      });
      p.at(3999);
      expect(p.net.damageWindow()?.kind).toBe('round');
      p.at(4001);                                                       // ENGINE_READ_S past the result: ROUND COMPLETE is up
      expect(p.net.screenUp()).toBe(true);
      expect(p.net.damageWindow()).toBeNull();
    } finally { p.net.close(); }
  });

  it('open in the result window before the report arrives (report null)', () => {
    const p = page('classic');
    try {
      p.server(roundOver());
      p.at(10);
      expect(p.net.damageWindow()).toEqual({ kind: 'round', report: null });
    } finally { p.net.close(); }
  });

  it('closed again at the next round\'s start', () => {
    const p = page('classic');
    try {
      p.server(roundOver());
      p.at(10);
      p.server({ type: 'roundStart', round: 2, seconds: 360, wins: { seal: 1, terrorist: 0 }, rounds: 11, epoch: 2, startTick: 0 } as ServerEvent);
      p.at(20);
      expect(p.net.damageWindow()).toBeNull();
    } finally { p.net.close(); }
  });

  it('a respawn room: open with the life\'s report from respawnReady until the page\'s own spawn', () => {
    const p = page('respawn');
    try {
      p.at(20000);
      p.server({ type: 'deadAtLoad', id: 1 } as ServerEvent);
      p.server({ type: 'damageReport', round: 1, life: true, taken: [{ from: 3, hits: 4, health: 1 }], dealt: [] } as ServerEvent);
      p.at(25000);
      expect(p.net.prompt()).toMatchObject({ respawnReady: false });
      expect(p.net.damageWindow()).toBeNull();                           // dead, not yet ready: closed
      p.at(25001);
      expect(p.net.prompt()).toMatchObject({ respawnReady: true });
      expect(p.net.damageWindow()).toEqual({
        kind: 'life', report: { round: 1, life: true, taken: [{ id: 3, name: 'Charlie', hits: 4, health: 1 }], dealt: [] },
      });
      p.server({ type: 'spawn', id: 1, at: [0, 0, 0], yaw: 0, after: 0 });
      p.at(25016);
      expect(p.net.damageWindow()).toBeNull();
    } finally { p.net.close(); }
  });

  it('a classic room\'s dead seat has no window (a live round)', () => {
    const p = page('classic');
    try {
      p.at(1000);
      p.server({ type: 'kill', killer: 3, victim: 1, weapon: '552', how: 'weapon', clip: 'death_stand_chest01' } as ServerEvent);
      p.at(20000);
      expect(p.net.damageWindow()).toBeNull();
    } finally { p.net.close(); }
  });

  it('marks the kills the page saw: KILLED YOU on the life\'s killer, KILL on the round\'s victims', () => {
    const p = page('respawn');
    try {
      p.at(1000);
      p.server({ type: 'kill', killer: 1, victim: 2, weapon: '552', how: 'weapon', clip: 'death_stand_chest01' } as ServerEvent);
      p.server({ type: 'kill', killer: 3, victim: 1, weapon: '552', how: 'weapon', clip: 'death_stand_chest01' } as ServerEvent);
      p.server({ type: 'damageReport', round: 1, life: true, taken: [{ from: 3, hits: 4, health: 1 }, { from: 2, hits: 1, health: 0.1 }], dealt: [{ to: 2, hits: 3, health: 1 }] } as ServerEvent);
      p.server(roundOver());
      p.server({ type: 'damageReport', round: 1, taken: [{ from: 3, hits: 4, health: 1 }], dealt: [{ to: 2, hits: 3, health: 1 }, { to: 3, hits: 1, health: 0.2 }] });
      p.at(1010);
      const w = p.net.damageWindow();
      expect(w?.kind).toBe('round');                                     // the result window first, dead or not
      expect(w?.report?.taken).toEqual([{ id: 3, name: 'Charlie', hits: 4, health: 1, kill: true }]);
      expect(w?.report?.dealt).toEqual([{ id: 2, name: 'Bravo', hits: 3, health: 1, kill: true }, { id: 3, name: 'Charlie', hits: 1, health: 0.2 }]);
      const life = p.net.damageReports().life;
      expect(life?.taken).toEqual([{ id: 3, name: 'Charlie', hits: 4, health: 1, kill: true }, { id: 2, name: 'Bravo', hits: 1, health: 0.1 }]);
      expect(life?.dealt).toEqual([{ id: 2, name: 'Bravo', hits: 3, health: 1, kill: true }]);
    } finally { p.net.close(); }
  });

  it("the kill marks clear at the page's own spawn (the life's) and at the next round's start (both)", () => {
    const p = page('respawn');
    try {
      p.at(1000);
      p.server({ type: 'kill', killer: 1, victim: 2, weapon: '552', how: 'weapon', clip: 'death_stand_chest01' } as ServerEvent);
      p.server({ type: 'kill', killer: 3, victim: 1, weapon: '552', how: 'weapon', clip: 'death_stand_chest01' } as ServerEvent);
      p.server({ type: 'spawn', id: 1, at: [0, 0, 0], yaw: 0, after: 0 });     // his own spawn: the life's marks go
      const life = { type: 'damageReport', round: 1, life: true, taken: [{ from: 3, hits: 1, health: 0.2 }], dealt: [{ to: 2, hits: 1, health: 0.2 }] } as ServerEvent;
      const round: ServerEvent = { type: 'damageReport', round: 1, taken: [{ from: 3, hits: 4, health: 1 }], dealt: [{ to: 2, hits: 3, health: 1 }] };
      p.server(life);
      expect(p.net.damageReports().life?.taken[0]).not.toHaveProperty('kill');
      expect(p.net.damageReports().life?.dealt[0]).not.toHaveProperty('kill');
      p.server(round);                                                           // the round's marks still stand
      expect(p.net.damageReports().round?.taken[0]?.kill).toBe(true);
      expect(p.net.damageReports().round?.dealt[0]?.kill).toBe(true);
      p.server({ type: 'roundStart', round: 2, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 2, startTick: 0 } as ServerEvent);
      p.server(round);                                                           // a new round: no mark carried over
      expect(p.net.damageReports().round?.taken[0]).not.toHaveProperty('kill');
      expect(p.net.damageReports().round?.dealt[0]).not.toHaveProperty('kill');
    } finally { p.net.close(); }
  });

  it('a spectator has no window', () => {
    const p = page('classic');
    try {
      (p.net.client as { role: string }).role = 'spectator';
      p.server(roundOver());
      p.at(10);
      expect(p.net.damageWindow()).toBeNull();
    } finally { p.net.close(); }
  });
});
