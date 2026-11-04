import { afterEach, describe, expect, it, vi } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import { NetPage, type NetPageDeps } from '../src/netPage';
import { lessWait, restartedScore } from '../src/gameLobbyHost';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';

/**
 * LATER 152 (`DEFUSE_CLOCK_HELD_READING`): a defuse stops the original's round clock at the fuse's remainder (`FUN_002c1c30`
 * D:L163937 clears its running flag +0xf5; the clock refreshes only while +0xf4 and +0xf5 are set, `FUN_002aa490`
 * D:L151092) -- the room's `score` says so (`clockHeld`), and the page holds its timer at the figure until the next round.
 * And the review's finding 4: a called-off launch countdown shows the round's length, not a planted round's clock total.
 */

afterEach(() => { vi.restoreAllMocks(); });

function page() {
  let t = 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => t);
  const timers: number[] = [];
  const hud = {
    postMessage: () => undefined, setTimer: (s: number) => { timers.push(s); }, setHealth: () => undefined, setScoreRows: () => undefined,
    setRoundScreen: () => undefined, startRound: () => undefined,
  } as unknown as NetPageDeps['hud'];
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
  };
  const net = new NetPage(deps, 'ws://test/ws', 'MP61', 'Tester', undefined, false, 'classic');
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  const frames = (ms: number): void => { for (let i = 0; i < Math.round(ms / 100); i++) { t += 100; net.frame(0.1, {} as never, false); } };
  const score = (timeLeft: number | null, clockHeld?: true) =>
    ({ type: 'score', rows: [], timeLeft, spectators: [], wins: { seal: 0, terrorist: 0 }, ...(clockHeld ? { clockHeld } : {}) }) as ServerEvent;
  return { net, server, frames, score, timers };
}

const roundStart = (round: number, seconds: number) =>
  ({ type: 'roundStart', round, seconds, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: round, startTick: 0 }) as unknown as ServerEvent;

describe('LATER 152: a defuse holds the page\'s round clock', () => {
  it('a held score stops the timer at its figure over seconds of frames; the next roundStart runs the clock again', () => {
    const p = page();
    p.server(roundStart(1, 360));
    p.server(p.score(30));                                                    // a planted bomb's fuse (LATER 148)
    p.frames(2000);
    expect(p.timers.at(-1)).toBeCloseTo(28, 1);                               // counting
    const n0 = p.timers.length;
    p.server(p.score(17.5, true));                                            // the defuse: held at 17.5 s
    p.frames(5000);
    expect(p.timers.at(-1)).toBeCloseTo(17.5, 5);
    expect(p.timers.slice(n0).every((v) => v === 17.5)).toBe(true);           // held, not counting
    p.server(roundStart(2, 360));
    p.server(p.score(360));
    p.frames(2000);
    expect(p.timers.at(-1)).toBeCloseTo(358, 1);                              // runs again
  });

  it('a score without clockHeld counts down as before (an older room; no defuse)', () => {
    const p = page();
    p.server(roundStart(1, 360));
    p.server(p.score(20));
    p.frames(3000);
    expect(p.timers.at(-1)).toBeCloseTo(17, 1);
  });
});

describe('LATER 152 (LATER 148\'s review, finding 4): the round\'s length apart from the clock\'s total', () => {
  it('a called-off launch countdown after a planted round shows the round\'s length, not the fractional total', () => {
    const p = page();
    p.server(roundStart(1, 360));
    p.server({ type: 'roundTime', seconds: 72.25 } as ServerEvent);           // a plant 42.25 s in: the clock's total moved
    p.server({ type: 'abandoned' } as ServerEvent);
    p.server({ type: 'countdown', seconds: 10 } as ServerEvent);
    p.frames(500);
    p.server({ type: 'countdown', seconds: null } as ServerEvent);
    p.frames(200);
    expect(p.timers.at(-1)).toBe(360);
  });
});

describe('LATER 152: the menu match\'s readers of a held clock (the gameplay seat\'s notes)', () => {
  it('lessWait runs a counting clock on by the wait, never a held one', () => {
    const base = { type: 'score', rows: [], spectators: [], wins: { seal: 0, terrorist: 0 } } as const;
    expect(lessWait({ ...base, timeLeft: 20 } as never, 5).timeLeft).toBe(15);
    expect(lessWait({ ...base, timeLeft: 17.5, clockHeld: true } as never, 5).timeLeft).toBe(17.5);
  });
});

describe('LATER 152 (the review\'s F1): an earlier round\'s score handed on with the new round\'s clock is never held', () => {
  it('restartedScore takes the new round\'s figure and drops clockHeld', () => {
    const base = { type: 'score', rows: [], spectators: [], wins: { seal: 0, terrorist: 0 } } as const;
    const r = restartedScore({ ...base, timeLeft: 17.5, clockHeld: true } as never, 355);
    expect(r.timeLeft).toBe(355);
    expect('clockHeld' in r).toBe(false);
  });
});
