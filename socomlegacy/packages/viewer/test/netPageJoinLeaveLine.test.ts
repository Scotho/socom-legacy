import { describe, expect, it } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { Hud, type BannerLine } from '../src/hud';
import { JOIN_LEAVE_LINE_ADAPTATION } from '../src/joinLeaveLine';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';

/**
 * JOIN-LEAVE-LINE (a BROWSER ADAPTATION, product track; no original -- `../src/joinLeaveLine`) through the page's own
 * handling: `NetPage`'s event switch hands the room's `joined` and `left` to the lines, its `frame` runs a leave's hold,
 * and a welcome's roster posts nothing. A fake socket stands in for the server; the HUD's posts are recorded.
 */

/** `lines`: this browser's Join/leave lines setting as the page's mount reads it (`joinLeaveLines`); on unless said. */
function page(o: { lines?: boolean | undefined } = { lines: true }) {
  let socket: WebSocketLike | null = null;
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
      socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
      return socket;
    },
    ...(o.lines !== undefined ? { joinLeaveLines: o.lines } : {}),
  };
  const net = new NetPage(deps, 'ws://test/ws', 'MP2', 'Tester', undefined, false, 'respawn');
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  /** Frames of 1/60 s for `seconds`. */
  const run = (seconds: number): void => { for (let i = 0; i < Math.ceil(seconds * 60); i++) net.frame(1 / 60, {} as never, false); };
  /** The join and leave lines posted so far (the page posts other lines of its own). */
  const lines = (): string[] => posted.filter((p): p is string => typeof p === 'string' && / has (joined|left) the game\.$/.test(p));
  return { server, run, lines, net };
}

const welcome = (over: Record<string, unknown> = {}) => ({
  type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
  players: [{ id: 2, name: 'Machete', team: 'seal' }, { id: 3, name: 'Wardog', team: 'terrorist' }, { id: 4, name: 'JESTER', team: 'terrorist', bot: true }],
  rules: 'respawn', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] }, phase: 'play', startTick: 0, ...over,
} as ServerEvent);
/** A room no round has started in: waiting for its sides or its countdown (`phase`), with no round's `startTick`. */
const waiting = (phase: 'waiting' | 'loading' = 'waiting') => welcome({ phase, startTick: undefined, rules: 'classic' });
const roundStart = { type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 } as unknown as ServerEvent;
const roundOver = (matchOver: boolean) => ({ type: 'roundOver', round: 1, winner: 'seal', wins: { seal: 1, terrorist: 0 }, matchOver, screens: [] } as unknown as ServerEvent);

const HOLD = JOIN_LEAVE_LINE_ADAPTATION.reseatHoldS;

describe('JOIN-LEAVE-LINE through NetPage', () => {
  it('a welcome\'s roster posts no line: the players already there did not join', () => {
    const r = page(); r.server(welcome()); r.run(HOLD * 4);
    expect(r.lines()).toEqual([]);
    r.net.close();
  });

  it('a player who joins is named at once; one who leaves, once the hold has run', () => {
    const r = page(); r.server(welcome());
    r.server({ type: 'joined', id: 5, name: 'Vandal', team: 'seal' });
    expect(r.lines()).toEqual(['Vandal has joined the game.']);
    r.server({ type: 'left', id: 2 });
    expect(r.lines()).toEqual(['Vandal has joined the game.']);
    r.run(HOLD * 2);
    expect(r.lines()).toEqual(['Vandal has joined the game.', 'Machete has left the game.']);
    r.net.close();
  });

  it('a team switch (`left`, then `joined` on the other side) posts nothing', () => {
    const r = page(); r.server(welcome());
    r.server({ type: 'left', id: 2 });
    r.server({ type: 'joined', id: 2, name: 'Machete', team: 'terrorist' });
    r.run(HOLD * 4);
    expect(r.lines()).toEqual([]);
    r.net.close();
  });

  it('a CPU player\'s join and leave post nothing; a player taking its place is named', () => {
    const r = page(); r.server(welcome());
    r.server({ type: 'left', id: 4 });
    r.server({ type: 'joined', id: 4, name: 'Vandal', team: 'terrorist' });
    r.server({ type: 'joined', id: 6, name: 'SABRE', team: 'seal', bot: true });
    r.run(HOLD * 4);
    expect(r.lines()).toEqual(['Vandal has joined the game.']);
    r.net.close();
  });

  it('a second `left` for a seat already gone (a demotion\'s, then the watcher\'s own leave) posts no second line', () => {
    const r = page(); r.server(welcome());
    r.server({ type: 'left', id: 3 }); r.run(HOLD * 2);
    r.server({ type: 'left', id: 3 }); r.run(HOLD * 2);
    expect(r.lines()).toEqual(['Wardog has left the game.']);
    r.net.close();
  });

  it('before the match starts nobody is named as joining -- waiting, the countdown, the load hold -- and from round 1 on they are', () => {
    for (const phase of ['waiting', 'loading'] as const) {
      const r = page(); r.server(waiting(phase));
      r.server({ type: 'joined', id: 5, name: 'Vandal', team: 'seal' });
      r.server({ type: 'countdown', seconds: 10 });
      r.server({ type: 'joined', id: 6, name: 'Sabre', team: 'terrorist' });
      r.run(HOLD * 4);
      expect(r.lines(), phase).toEqual([]);
      r.server(roundStart);
      r.server({ type: 'joined', id: 7, name: 'Orion', team: 'seal' });
      expect(r.lines(), phase).toEqual(['Orion has joined the game.']);
      r.net.close();
    }
  });

  it('an older room\'s welcome (no `phase`): its `startTick` says a round has started', () => {
    const on = page(); on.server(welcome({ phase: undefined, startTick: 120 }));
    on.server({ type: 'joined', id: 5, name: 'Vandal', team: 'seal' });
    expect(on.lines()).toEqual(['Vandal has joined the game.']);
    on.net.close();
    const off = page(); off.server(welcome({ phase: undefined, startTick: undefined }));
    off.server({ type: 'joined', id: 5, name: 'Vandal', team: 'seal' });
    expect(off.lines()).toEqual([]);
    off.net.close();
  });

  it('between rounds a join is named; once the match is over, or the room is abandoned or counts down again, it is not', () => {
    const r = page(); r.server(welcome());
    r.server(roundOver(false));
    r.server({ type: 'joined', id: 5, name: 'Vandal', team: 'seal' });
    expect(r.lines()).toEqual(['Vandal has joined the game.']);
    r.server(roundStart); r.server(roundOver(true));
    r.server({ type: 'joined', id: 6, name: 'Sabre', team: 'terrorist' });
    r.server(roundStart); r.server({ type: 'abandoned' } as ServerEvent);
    r.server({ type: 'joined', id: 7, name: 'Orion', team: 'seal' });
    r.server(roundStart); r.server({ type: 'countdown', seconds: null });
    r.server({ type: 'joined', id: 8, name: 'Kahuna', team: 'seal' });
    expect(r.lines()).toEqual(['Vandal has joined the game.']);
    r.net.close();
  });

  it('a leave before the match starts is still named', () => {
    const r = page(); r.server(waiting());
    r.server({ type: 'left', id: 2 }); r.run(HOLD * 2);
    expect(r.lines()).toEqual(['Machete has left the game.']);
    r.net.close();
  });

  it('PRS-888: off (the setting turned off, or no dep at all) posts no join and no leave line -- the game\'s own behaviour', () => {
    for (const lines of [false, undefined]) {
      const r = page({ lines }); r.server(welcome());
      r.server({ type: 'joined', id: 5, name: 'Vandal', team: 'seal' });
      r.server({ type: 'left', id: 2 }); r.run(HOLD * 4);
      expect(r.lines(), String(lines)).toEqual([]);
      r.net.close();
    }
  });

  it('PRS-888: a welcome on the end screens (phase `over`) posts no join line; the next round\'s start does', () => {
    const r = page(); r.server(welcome({ phase: 'over' }));
    r.server({ type: 'joined', id: 5, name: 'Vandal', team: 'seal' });
    expect(r.lines()).toEqual([]);
    r.server(roundStart);
    r.server({ type: 'joined', id: 6, name: 'Sabre', team: 'terrorist' });
    expect(r.lines()).toEqual(['Sabre has joined the game.']);
    r.net.close();
  });

  it('a new welcome inside a leave\'s hold drops it: the roster is the room\'s again', () => {
    const r = page(); r.server(welcome());
    r.server({ type: 'left', id: 2 });
    r.server(welcome({ resumed: true }));
    r.run(HOLD * 4);
    expect(r.lines()).toEqual([]);
    r.net.close();
  });
});
