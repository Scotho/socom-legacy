import { describe, expect, it } from 'vitest';
import { Hud } from '../src/hud';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import type { ScoreRow, ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';
import { damagePanelRows, DAMAGE_PANEL_COLUMNS_ADAPTATION } from '../src/damagePanel';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';

/**
 * WM-DATA (`DAMAGE_REPORT_ADAPTATION`, a browser adaptation with no original: the game shows a player no damage
 * numbers): the page keeps the room's damage reports for a later panel to draw -- the latest ROUND report (cleared at
 * the next round's start) and the latest LIFE report (`life: true`, a respawn room's at the player's death; cleared at
 * his respawn or the next round's start) -- and resolves each id to the scoreboard's name where it knows one. A fake
 * socket stands in for the server, as `netPageRound.test.ts` drives it.
 */

function page() {
  let socket: WebSocketLike | null = null;
  const hud = new Hud();
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
    mode: () => 'walk',
  } as unknown as WalkMode;
  const remote = { setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined } as unknown as RemotePlayers;
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, newRound: () => undefined,
    roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    socket: () => {
      socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
      return socket;
    },
  };
  const net = new NetPage(deps, 'ws://test/ws', 'MP2', 'Tester', undefined, false, 'classic');
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  server({
    type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
    players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
  } as ServerEvent);
  return { net, server };
}

const row = (id: number, name: string, team: 'seal' | 'terrorist'): ScoreRow =>
  ({ id, name, team, kills: 0, deaths: 0, score: 0, alive: true, ping: 0 });

const scores = (server: (ev: ServerEvent) => void): void => {
  server({ type: 'score', rows: [row(1, 'Tester', 'seal'), row(2, 'Bravo', 'terrorist'), row(3, 'Charlie', 'terrorist')], timeLeft: null, spectators: [], wins: { seal: 0, terrorist: 0 } });
};

const roundReport = (round = 1): ServerEvent => ({
  type: 'damageReport', round,
  taken: [{ from: 2, hits: 2, health: 40 }],
  dealt: [{ to: 3, hits: 1, health: 25 }, { to: 2, hits: 3, health: 100 }],
});

// `life: true` is the other branch's field (agent/wm-data-life); this base's protocol may not carry it yet.
const lifeReport = (round = 1): ServerEvent => ({
  type: 'damageReport', round, life: true,
  taken: [{ from: 3, hits: 4, health: 100 }],
  dealt: [],
} as unknown as ServerEvent);

const roundStart = (round: number): ServerEvent =>
  ({ type: 'roundStart', round, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: round, startTick: 0 });

describe('the page keeps the damage reports for the panel (WM-DATA, DAMAGE_REPORT_ADAPTATION)', () => {
  it('holds nothing before a report', () => {
    const { net } = page();
    expect(net.damageReports()).toEqual({ round: null, life: null });
  });

  it('keeps a round report and reads it back, names resolved from the score rows', () => {
    const { net, server } = page();
    scores(server);
    server(roundReport(1));
    expect(net.damageReports()).toEqual({
      round: {
        round: 1, life: false,
        taken: [{ id: 2, name: 'Bravo', hits: 2, health: 40 }],
        dealt: [{ id: 3, name: 'Charlie', hits: 1, health: 25 }, { id: 2, name: 'Bravo', hits: 3, health: 100 }],
      },
      life: null,
    });
  });

  it('intake item 2 (C): the page hands the room\'s DMG points to the panel unscaled -- a kill\'s 100 draws "100", a wound\'s 32.4 "32"', () => {
    const { net, server } = page();
    scores(server);
    server({ type: 'damageReport', round: 1, taken: [{ from: 2, hits: 1, health: 32.4 }], dealt: [{ to: 3, hits: 3, health: 100 }] });
    const rows = damagePanelRows(net.damageReports().round);
    const dmg = (row: { cells: { x: number; text: string }[] }): string => row.cells.find((c) => c.x === DAMAGE_PANEL_COLUMNS_ADAPTATION.dmg)!.text;
    expect(dmg(rows.rows[0][0]!)).toBe('100');                   // dealt: Charlie, a kill from full
    expect(dmg(rows.rows[1][0]!)).toBe('32');                    // taken: Bravo, one body wound
  });

  it('clears the round report at the next roundStart', () => {
    const { net, server } = page();
    server(roundReport(1));
    expect(net.damageReports().round).not.toBeNull();
    server(roundStart(2));
    expect(net.damageReports().round).toBeNull();
  });

  it('keeps a life report and clears it at the player\'s respawn', () => {
    const { net, server } = page();
    scores(server);
    server(lifeReport(1));
    expect(net.damageReports().life).toEqual({ round: 1, life: true, taken: [{ id: 3, name: 'Charlie', hits: 4, health: 100 }], dealt: [] });
    server({ type: 'spawn', id: 2, at: [0, 0, 0], yaw: 0, after: 0 });             // another's spawn: kept
    expect(net.damageReports().life).not.toBeNull();
    server({ type: 'spawn', id: 1, at: [0, 0, 0], yaw: 0, after: 0 });             // his own: gone
    expect(net.damageReports().life).toBeNull();
  });

  it('clears a life report at the next roundStart', () => {
    const { net, server } = page();
    server(lifeReport(1));
    server(roundStart(2));
    expect(net.damageReports().life).toBeNull();
  });

  it('a life report does not overwrite the round report, nor the other way round', () => {
    const { net, server } = page();
    server(roundReport(1));
    server(lifeReport(1));
    let r = net.damageReports();
    expect(r.round?.life).toBe(false);
    expect(r.round?.dealt).toHaveLength(2);
    expect(r.life?.life).toBe(true);
    server(roundReport(1));
    r = net.damageReports();
    expect(r.life?.taken[0]?.id).toBe(3);
    // the respawn clears the life report only
    server({ type: 'spawn', id: 1, at: [0, 0, 0], yaw: 0, after: 0 });
    r = net.damageReports();
    expect(r.life).toBeNull();
    expect(r.round).not.toBeNull();
  });

  it('an unknown id and a negative (departed) id stay as ids, with no name', () => {
    const { net, server } = page();
    scores(server);
    server({ type: 'damageReport', round: 1, taken: [{ from: -4, hits: 1, health: 10 }], dealt: [{ to: 9, hits: 2, health: 20 }] });
    expect(net.damageReports().round).toEqual({
      round: 1, life: false,
      taken: [{ id: -4, name: null, hits: 1, health: 10 }],
      dealt: [{ id: 9, name: null, hits: 2, health: 20 }],
    });
  });

  it('a name the scoreboard learns after the report resolves at read', () => {
    const { net, server } = page();
    server(roundReport(1));
    expect(net.damageReports().round?.taken[0]?.name).toBeNull();
    scores(server);
    expect(net.damageReports().round?.taken[0]?.name).toBe('Bravo');
  });

  it('a reused id keeps the name it had when the report came (the review\'s finding: server.ts gives the lowest free id)', () => {
    const { net, server } = page();
    scores(server);
    server(roundReport(1));
    server(lifeReport(1));
    // Bravo leaves and a joiner takes his id 2 before the next round's start.
    server({ type: 'score', rows: [row(1, 'Tester', 'seal'), row(2, 'Delta', 'terrorist'), row(3, 'Charlie', 'terrorist')], timeLeft: null, spectators: [], wins: { seal: 0, terrorist: 0 } });
    const r = net.damageReports();
    expect(r.round?.taken[0]).toEqual({ id: 2, name: 'Bravo', hits: 2, health: 40 });
    expect(r.round?.dealt[1]?.name).toBe('Bravo');
  });

  it('an unrelated event changes neither report', () => {
    const { net, server } = page();
    scores(server);
    server(roundReport(1));
    server(lifeReport(1));
    const before = net.damageReports();
    server({ type: 'countdown', seconds: 5 } as ServerEvent);
    scores(server);
    server({ type: 'spawn', id: 3, at: [0, 0, 0], yaw: 0, after: 0 });
    expect(net.damageReports()).toEqual(before);
  });

  it('the accessor hands out copies: mutating one leaves the page\'s report whole', () => {
    const { net, server } = page();
    server(roundReport(1));
    const r = net.damageReports();
    r.round!.taken.length = 0;
    expect(net.damageReports().round?.taken).toHaveLength(1);
  });
});
