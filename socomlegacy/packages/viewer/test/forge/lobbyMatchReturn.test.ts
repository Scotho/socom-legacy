import { describe, expect, it, vi } from 'vitest';
import { pinnedMatchSocket } from '../../src/connectHost';
import type { LoadedMap } from '../../src/loadMap';
import type { NetClient } from '../../src/net/client';
import type { ServerEvent } from '../../src/net/protocol';
import type { ForgeLobbyHandOff } from '../../src/forge/lobbyClient';
import type { PageMatchDeps } from '../../src/playerSettings';

/**
 * H460 fix round 2 (the main controller, 2026-11-15: "BUILD THE PAGE's RETURN under H460 as fix round 2, for the FULL GAME
 * only ... THE ABANDON STAYS AS IT IS"; a browser adaptation, product track): the Forge lobby's match
 * (`../../src/forge/match` `startForgeLobbyMatch`) says when the room has come back to its lobby after a FULL GAME --
 * `returned()`, by `../../src/lobbyMatch` `event`'s own rule: a `roundOver` whose `matchOver` is true, or a welcome whose
 * join result says so, then a `gameLobby` not launched; a `roundStart` or an `abandoned` clears it -- and lets go of the
 * lobby's client open (`release()`: the mount's `release`, the player's settings stopped, the audio released, its own
 * listener removed), answering it with the last `gameLobby` view, or null when the mount holds none open.
 *
 * Driven without a real mount: `../../src/matchMount` `mountMatch` is the test's stand-in, as `./lobbyMatch.test.ts`
 * stands it in; the events reach the match through the handed client's listeners.
 */

const seen = vi.hoisted(() => ({ order: [] as string[], releaseGives: 'client' as 'client' | 'none' }));

vi.mock('../../src/matchMount', () => ({
  mountMatch: vi.fn((_target: unknown, o: { client: unknown }) => {
    seen.order.push('mount');
    return {
      ended: () => null,
      close: () => { seen.order.push('unmount'); },
      release: () => { seen.order.push('release'); return seen.releaseGives === 'client' ? o.client : null; },
    };
  }),
}));
vi.mock('../../src/audio', () => ({
  WebAudioOut: class { dispose(): void { seen.order.push('audio'); } },
  GameAudio: class { setData(): void {} },
}));
vi.mock('../../src/net/loopback', () => ({ LoopbackMatch: class {}, simClipsOfPlay: () => null, simMapOfLoaded: () => null }));

const { startForgeLobbyMatch } = await import('../../src/forge/match');

type Listener = (ev: ServerEvent) => void;
function rig(events: ServerEvent[] = []) {
  const listeners = new Set<Listener>();
  const raw = {
    state: 'open',
    reportLoaded: () => {},
    close: () => { seen.order.push('close'); },
    on: (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; },
  };
  const client = raw as unknown as NetClient;
  const h: ForgeLobbyHandOff = { client, welcome: null, roundStart: null, events };
  let stops = 0;
  const player = {
    applyAudio: () => {}, applyBrightness: () => {}, mountDeps: () => ({}), stop: () => { stops++; },
  } as unknown as PageMatchDeps;
  seen.order.length = 0;
  const m = startForgeLobbyMatch({} as HTMLElement, {
    map: { archive: 'MP2', name: 'MP2' } as LoadedMap, clips: null, effects: null, sound: null, handOff: h,
    pinned: pinnedMatchSocket('', { protocol: 'http:', host: '127.0.0.1:5303' }, false),
    gameName: 'Forge: BOXES', lateJoiner: false, player,
  });
  const emit = (...evs: ServerEvent[]): void => { for (const ev of evs) for (const l of [...listeners]) l(ev); };
  return { m, client, emit, listeners, stops: () => stops };
}

const seats = [{ id: 1, name: 'Guest-1', team: 'seal' as const, ready: false, host: true, readyIn: 0 }, { id: 2, name: 'Guest-2', team: 'terrorist' as const, ready: false, host: false, readyIn: 0 }];
const lobby = (launched: boolean): ServerEvent => ({ type: 'gameLobby', seats, countdown: null, launched });
const roundOver = (matchOver: boolean): ServerEvent => ({ type: 'roundOver', round: 1, winner: 'seal', wins: { seal: 1, terrorist: 0 }, matchOver, screens: [] } as ServerEvent);
const roundStart = (round: number): ServerEvent => ({ type: 'roundStart', round, seconds: 30, wins: { seal: 0, terrorist: 0 }, rounds: 1, epoch: 1, startTick: 0 } as unknown as ServerEvent);
const welcomeOver = (matchOver: boolean): ServerEvent => ({
  type: 'welcome', id: 1, version: 17, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Guest-1', players: [], rules: 'classic',
  round: 1, rounds: 1, ghost: false, join: { v: 1, result: { matchOver }, projectiles: [], corpses: [], ghosts: [] },
} as unknown as ServerEvent);
const abandoned: ServerEvent = { type: 'abandoned' };

/** The match's `returned()` once the events are told -- asserted a function first, so a match without it fails on that assertion. */
function returnedAfter(...evs: ServerEvent[]): boolean {
  const { m, emit } = rig();
  expect(typeof (m as unknown as { returned?: unknown }).returned).toBe('function');
  expect(m.returned()).toBe(false);
  emit(...evs);
  return m.returned();
}

describe('H460 fix 2: the Forge lobby match says when the room came back after a full game', () => {
  it('H460: a full game returns -- the last roundOver says matchOver, then the lobby not launched', () => {
    expect(returnedAfter(roundStart(1), roundOver(true), lobby(false))).toBe(true);
  });

  it('H460: a welcome whose join result ended the game, then the lobby not launched, returns too', () => {
    expect(returnedAfter(welcomeOver(true), lobby(false))).toBe(true);
    expect(returnedAfter(welcomeOver(false), lobby(false))).toBe(false);
  });

  it('H460: an abandon does not return (its leave stays the page leave): abandoned clears the game over', () => {
    expect(returnedAfter(roundStart(1), abandoned, lobby(false))).toBe(false);
    expect(returnedAfter(roundOver(true), abandoned, lobby(false))).toBe(false);
  });

  it('H460: a lobby not launched with no matchOver before it does not return', () => {
    expect(returnedAfter(lobby(false))).toBe(false);
    expect(returnedAfter(roundStart(1), roundOver(false), lobby(false))).toBe(false);
    expect(returnedAfter(roundOver(true), lobby(true))).toBe(false);          // a launched view is no return
  });

  it('H460: a roundStart after the game over clears it (the next round is under way)', () => {
    expect(returnedAfter(roundOver(true), roundStart(2), lobby(false))).toBe(false);
  });

  it('H460: release lets go of the client open, with the last lobby view: the mount released, settings stopped, audio released, the listener gone', () => {
    const { m, client, emit, listeners, stops } = rig();
    expect(typeof (m as unknown as { release?: unknown }).release).toBe('function');
    expect(listeners.size).toBe(1);                                            // the Forge's own, added after the mount
    const back = lobby(false);
    emit(roundOver(true), back);
    expect(m.returned()).toBe(true);
    const r = m.release();
    expect(r).not.toBeNull();
    expect(r!.client).toBe(client);
    expect(r!.view).toBe(back);
    expect(listeners.size).toBe(0);
    expect(stops()).toBe(1);
    expect(seen.order).toContain('release');
    expect(seen.order).toContain('audio');
    expect(seen.order).not.toContain('unmount');
    expect(seen.order).not.toContain('close');                                 // the client stays open for the lobby
    m.close();                                                                 // once released, close does nothing more
    expect(seen.order).not.toContain('unmount');
    expect(stops()).toBe(1);
  });

  it('H460: release is null when the mount holds no open client (the page then takes the leave)', () => {
    seen.releaseGives = 'none';
    try {
      const { m, emit, listeners, stops } = rig();
      expect(typeof (m as unknown as { release?: unknown }).release).toBe('function');
      emit(roundOver(true), lobby(false));
      expect(m.release()).toBeNull();
      expect(listeners.size).toBe(0);
      expect(stops()).toBe(1);
    } finally { seen.releaseGives = 'client'; }
  });

  // H460 fix round 3 (the fresh review's finding 1): the rule is seeded from the hand-off's events before the listener
  // is attached, as `../../src/lobbyMatch` seeds its own `gameOver` from the hand-off -- a slow page that hands off in
  // GAME COMPLETE's hold (after the last roundOver, before the room's return) still hears the return.
  it('H460 fix 3: a hand-off whose events hold the final roundOver returns at the live lobby not launched', () => {
    const { m, emit } = rig([welcomeOver(false), roundStart(1), roundOver(true)]);
    expect(m.returned()).toBe(false);                                          // the game is over, the room not back yet
    const back = lobby(false);
    emit(back);
    expect(m.returned()).toBe(true);
    expect(m.release()?.view).toBe(back);
  });

  it('H460 fix 3: a hand-off whose events END with the lobby not launched after the final roundOver has returned at once', () => {
    const back = lobby(false);
    const { m } = rig([welcomeOver(false), roundStart(1), roundOver(true), back]);
    expect(m.returned()).toBe(true);                                           // the page goes back at its next frame
    expect(m.release()?.view).toBe(back);
  });

  it('H460 fix 3 (control): the seed keeps the live rule -- a roundStart or an abandon in the hand-off clears the game over', () => {
    const { m, emit } = rig([roundOver(true), roundStart(2)]);
    emit(lobby(false));
    expect(m.returned()).toBe(false);
    const { m: a, emit: emitA } = rig([roundOver(true), abandoned]);
    emitA(lobby(false));
    expect(a.returned()).toBe(false);
  });

  it('H460 fix 3: a hand-off whose welcome says the game ended returns at the live lobby not launched', () => {
    const { m, emit } = rig([welcomeOver(true)]);
    emit(lobby(false));
    expect(m.returned()).toBe(true);
  });

  it('H460 (control): close removes the listener and closes the mount as before', () => {
    const { m, listeners, stops } = rig();
    m.close();
    expect(seen.order).toEqual(['mount', 'unmount', 'audio']);
    expect(stops()).toBe(1);
    expect(listeners.size).toBe(0);
  });
});
