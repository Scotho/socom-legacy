import { describe, expect, it } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { Hud, MESSAGE_SCALE, type BannerLine } from '../src/hud';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import { SPECTATORS_EJECTED_TEXT, type ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';

/**
 * SVC-23f (research 264 §4.5): the vote lines through the page's own handling -- `NetPage`'s event switch posts the
 * room's `spectatorVote`, `spectatorsEjected` and `votes` on the message window as the original's `FUN_002b6530` draws
 * them: colour 2 (64, 64, 96, 100; `FUN_002b7530` D:L158322, D:L158329-158331), the window's own scale, past the
 * leading spaces (D:L157930) -- the Spec Vote's line (`FUN_002b9bd0` D:L159591-159597), the eject's (D:L159601,
 * `FUN_002b9d80` D:L159625) and the team vote's (`FUN_002ba040` D:L159765-159766, S:0x3f26c0). A fake socket stands
 * in for the server; the HUD's posts are recorded.
 */

function page() {
  let socket: WebSocketLike | null = null;
  const sent: Record<string, unknown>[] = [];
  const hud = new Hud();
  const posted: (string | BannerLine[])[] = [];
  hud.postMessage = ((lines: string | BannerLine[]) => { posted.push(lines); }) as typeof hud.postMessage;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
    mode: () => 'walk',
  } as unknown as WalkMode;
  const remote = { setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined } as unknown as RemotePlayers;
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    socket: () => {
      socket = { binaryType: '', readyState: 1, send: (data: string) => { if (typeof data === 'string') sent.push(JSON.parse(data)); }, close: () => undefined } as unknown as WebSocketLike;
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
  return { server, posted, net, sent };
}

describe('teammate votes through the shared NetPage action (research 263 section 5.2)', () => {
  const welcome = (over: Record<string, unknown> = {}) => ({
    type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
    players: [{ id: 2, name: 'Teammate', team: 'seal' }, { id: 3, name: 'Enemy', team: 'terrorist' }],
    rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] }, ...over,
  } as ServerEvent);

  it('sends remove then retain; rejects self, enemies, missing targets and departed teammates', () => {
    const r = page(); r.server(welcome());
    expect([1, 3, 99].map((id) => r.net.toggleVote(id))).toEqual([false, false, false]);
    expect(r.net.toggleVote(2)).toBe(true);
    expect(r.net.votingToRemove(2)).toBe(true);
    expect(r.net.toggleVote(2)).toBe(true);
    expect(r.net.votingToRemove(2)).toBe(false);
    r.net.toggleVote(2);
    r.server({ type: 'left', id: 2 });
    expect([r.net.votingToRemove(2), r.net.toggleVote(2)]).toEqual([false, false]);
    expect(r.sent.filter((e) => e.type === 'vote')).toEqual([
      { type: 'vote', target: 2, remove: true }, { type: 'vote', target: 2, remove: false }, { type: 'vote', target: 2, remove: true },
    ]);
    r.net.close();
  });

  it('refuses a spectator and a disconnected page without changing the flag', () => {
    const r = page();
    r.server(welcome({ role: 'spectator', team: undefined }));
    expect(r.net.toggleVote(2)).toBe(false);
    expect(r.net.votingToRemove(2)).toBe(false);
    r.server(welcome()); r.net.close();
    expect(r.net.toggleVote(2)).toBe(false);
    expect(r.sent.filter((e) => e.type === 'vote')).toEqual([]);
  });

  it('AD-10: a dead player votes -- the row\'s enable FUN_0022f440 D:L81384-81396 and the toggle FUN_0022f3c0 D:L81363-81370 test no life', () => {
    const r = page();
    r.server(welcome());
    r.server({ type: 'kill', victim: 1, killer: null, how: 'fall' } as ServerEvent);
    expect(r.net.gate().alive).toBe(false);
    expect([r.net.toggleVote(2), r.net.votingToRemove(2)]).toEqual([true, true]);
    expect([r.net.toggleVote(2), r.net.votingToRemove(2)]).toEqual([true, false]);
    expect(r.sent.filter((e) => e.type === 'vote')).toEqual([{ type: 'vote', target: 2, remove: true }, { type: 'vote', target: 2, remove: false }]);
    r.net.close();
  });

  it('R4B-08 (r0004, VOTE_ROWS_CAMERA_GATE_READING): a dead player following a teammate is refused the vote; back on his own body he votes', () => {
    // The developer K list and the Chat menu share `toggleVote`, so the gate (r4 0x2d1710's prologue) holds both.
    const r = page();
    r.server(welcome());
    r.server({ type: 'kill', victim: 1, killer: null, how: 'fall' } as ServerEvent);
    (r.net.spectator as unknown as { watchingNow: number | null }).watchingNow = 2;   // the cycle onto teammate 2
    expect(r.net.gate().cameraOnSelf).toBe(false);
    expect([r.net.toggleVote(2), r.net.votingToRemove(2)]).toEqual([false, false]);
    (r.net.spectator as unknown as { watchingNow: number | null }).watchingNow = null; // back on his own body
    expect([r.net.toggleVote(2), r.net.votingToRemove(2)]).toEqual([true, true]);
    expect(r.sent.filter((e) => e.type === 'vote')).toEqual([{ type: 'vote', target: 2, remove: true }]);
    r.net.close();
  });

  it('keeps votes on a resumed seat, prunes departed targets, and resets on a fresh welcome', () => {
    const r = page(); r.server(welcome()); r.net.toggleVote(2);
    r.server(welcome({ resumed: true }));
    expect(r.net.votingToRemove(2)).toBe(true);
    r.server(welcome({ resumed: true, players: [] }));
    expect([r.net.votingToRemove(2), r.net.toggleVote(2)]).toEqual([false, false]);
    r.server(welcome()); r.net.toggleVote(2);
    r.server(welcome());
    expect(r.net.votingToRemove(2)).toBe(false);
    r.net.close();
  });
});

const style = { scale: MESSAGE_SCALE, rgb: [0.5, 0.5, 0.75], opacity: 100 / 128 };

describe('the vote lines through NetPage\'s event switch (SVC-23f)', () => {
  it('spectatorVote and spectatorsEjected: one line each, as the room sends them, colour 2, no leading space', () => {
    const r = page();
    const from = r.posted.length;
    r.server({ type: 'spectatorVote', name: 'kilo', against: true, count: 4 });
    r.server({ type: 'spectatorVote', name: 'kilo', against: false, count: 3 });
    r.server({ type: 'spectatorsEjected' });
    expect(r.posted.slice(from)).toEqual([
      [{ text: 'kilo voting against spectators: 4 votes against.', ...style }],
      [{ text: 'kilo voting for spectators: 3 votes against.', ...style }],
      [{ text: SPECTATORS_EJECTED_TEXT, ...style }],
    ]);
  });

  it('votes: the team vote\'s line, "Voting: You have %d votes against you." (S:0x3f26c0), colour 2, no leading space', () => {
    const r = page();
    const from = r.posted.length;
    r.server({ type: 'votes', count: 2 });
    expect(r.posted.slice(from)).toEqual([[{ text: 'Voting: You have 2 votes against you.', ...style }]]);
  });
});
