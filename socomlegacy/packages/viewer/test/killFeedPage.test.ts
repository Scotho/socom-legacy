import { describe, expect, it } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { Hud, MESSAGE_SCALE, type BannerLine } from '../src/hud';
import { killFeedLine } from '../src/killFeed';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';

/**
 * WM-DATA-FEED (INTAKE 47, look 3B2; a BROWSER ADAPTATION, product track): the page posts each kill as the feed's line
 * (`../src/killFeed` `killFeedLine`) -- the names by the roster's sides -- and marks it orange when its subject (the
 * killer; for a suicide or a fall, the one who died) is this client's seat or the player its view is bound to (a
 * spectator's followed player, in follow or in the player's view over him; a benched player's watched teammate),
 * decided by id once, when the kill is posted. Fake sockets; nothing of the original's measured.
 */
function page(role: 'player' | 'spectator' = 'player') {
  let socket: WebSocketLike | null = null;
  const posted: BannerLine[][] = [];
  const hud = new Hud();
  hud.postMessage = ((lines: string | BannerLine[]) => { if (typeof lines !== 'string') posted.push(lines); }) as Hud['postMessage'];
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
    mode: () => 'walk', feet: () => [0, 0, 0], resumeBody: () => undefined,
  } as unknown as WalkMode;
  const remote = {
    setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined,
    setType: () => undefined, playerType: () => 0, feet: () => [0, 0, 0], setCharacter: () => undefined,
  } as unknown as RemotePlayers;
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    socket: () => {
      socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
      return socket;
    },
  };
  const net = new NetPage(deps, 'ws://test/ws', 'MP2', 'Tester', undefined, role === 'spectator', 'classic');
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  const welcome = (id: number): void => server({
    type: 'welcome', id, version: 9, map: 'MP2', tick: 0, role, team: role === 'player' ? 'seal' : null, queue: 0, name: 'Tester',
    players: [{ id: 2, name: 'Mate', team: 'seal' }, { id: 3, name: 'Enemy', team: 'terrorist' }, { id: 4, name: 'Other', team: 'terrorist' }],
    rules: 'classic', round: 1, rounds: 11, ghost: false,
  } as unknown as ServerEvent);
  welcome(1);
  posted.length = 0;
  // The view's state as the spectator's cycle and the bench leave it (`../src/spectatorView` `SpectatorView`).
  const view = net.spectator as unknown as { modeNow: string; targetNow: number | null; benchedNow: boolean; watchingNow: number | null };
  const follow = (id: number | null): void => { view.modeNow = id === null ? 'free' : 'follow'; view.targetNow = id; };
  const watch = (id: number | null): void => { view.benchedNow = true; view.watchingNow = id; };
  return { net, server, posted, follow, watch, welcome, view };
}
const kill = (killer: number | null, victim: number, how = 'weapon', weapon: string | null = 'M4A1'): ServerEvent =>
  ({ type: 'kill', killer, victim, weapon, how, clip: null } as unknown as ServerEvent);
const S = 'seal' as const, T = 'terrorist' as const;
const marks = (posted: BannerLine[][]): boolean[] => posted.map((l) => l[0]!.feedMark !== undefined);

describe('the page posts the kill feed\'s line', () => {
  it('another\'s kill: the names by the roster\'s sides, no mark', () => {
    const p = page();
    p.server(kill(2, 3));
    p.server(kill(4, 2, 'weapon', 'AK-47'));
    expect(p.posted).toEqual([
      [killFeedLine('weapon', { name: 'Mate', side: S }, { name: 'Enemy', side: T }, 'M4A1', false, MESSAGE_SCALE)],
      [killFeedLine('weapon', { name: 'Other', side: T }, { name: 'Mate', side: S }, 'AK-47', false, MESSAGE_SCALE)],
    ]);
  });

  it('the local player\'s kill, suicide and fall: marked orange, his name his side\'s; a kill of him by another: not', () => {
    const p = page();
    p.server(kill(1, 3));
    p.server(kill(1, 1, 'suicide', 'M67'));
    p.server(kill(null, 1, 'fall', null));
    p.server(kill(3, 1, 'weapon', 'AK-47'));
    expect(p.posted.map((l) => [l[0]!.text, l[0]!.feedMark !== undefined])).toEqual([
      ['Tester fragged Enemy with M4A1', true],
      ['Tester commits suicide with M67', true],
      ['Tester falls to their death', true],
      ['Enemy fragged Tester with AK-47', false],
    ]);
    expect(p.posted[0]).toEqual([killFeedLine('weapon', { name: 'Tester', side: S }, { name: 'Enemy', side: T }, 'M4A1', true, MESSAGE_SCALE)]);
  });

  it('a spectator\'s followed player (follow, or the player\'s view over him): his kills marked, decided when posted', () => {
    const p = page('spectator');
    p.follow(4);
    p.server(kill(4, 2, 'weapon', 'AK-47'));
    p.server(kill(2, 3));
    p.follow(2);
    p.server(kill(2, 4));
    p.server(kill(4, 2, 'weapon', 'AK-47'));
    expect(marks(p.posted)).toEqual([true, false, true, false]);
    expect(p.net.spectator.target).toBe(2);
    expect(p.posted[0]![0]!.feedMark).toBeDefined();   // the posted line keeps its mark when the view moves on
  });

  it('a spectator in free marks nothing, even with a target left from follow', () => {
    const p = page('spectator');
    p.follow(4);
    p.view.modeNow = 'free';
    p.server(kill(4, 2, 'weapon', 'AK-47'));
    expect(marks(p.posted)).toEqual([false]);
  });

  it('the mark reads the view\'s own bound id (`SpectatorView.boundId`): a benched spectator seat out of follow (review F2)', () => {
    const p = page('spectator');
    p.watch(2);                                          // benched, watching 2, the mode free
    expect(p.view.modeNow).toBe('free');
    const view = p.net.spectator as unknown as { boundId(): number | null };
    expect(view.boundId()).toBe(2);
    p.server(kill(2, 3));
    p.server(kill(3, 2, 'weapon', 'AK-47'));
    expect(marks(p.posted)).toEqual([true, false]);
  });

  it('a benched player watching a teammate: the teammate\'s kills marked; the player\'s own still marked', () => {
    const p = page();
    p.watch(2);
    p.server(kill(2, 3));
    p.server(kill(1, 4, 'weapon', 'M67'));
    p.server(kill(4, 2, 'weapon', 'AK-47'));
    expect(marks(p.posted)).toEqual([true, true, false]);
  });

  it('the mark follows the seat\'s id as the room names it now: a re-seat under a new id marks the new id\'s kills', () => {
    const p = page();
    p.welcome(5);                                        // a takeover seated afresh (`killFeedAdoptedSeat.test.ts`'s case)
    p.posted.length = 0;
    p.server(kill(5, 3));
    p.server(kill(1, 3));
    expect(marks(p.posted)).toEqual([true, false]);
  });

  it('a name the roster no longer holds (a seat that left) draws in colour 0', () => {
    const p = page();
    p.server({ type: 'left', id: 4 } as ServerEvent);
    p.server(kill(4, 2, 'weapon', 'AK-47'));
    const seg = p.posted[0]![0]!.segments!;
    expect(seg[seg.length - 2]!.rgb).toBeDefined();          // Mate, a SEAL still seated
    expect(seg[0]!.rgb).toBeUndefined();
  });

  it('an orphan grenade\'s kept thrower: colour 0, no mark', () => {
    const p = page();
    p.server({ type: 'kill', killer: null, victim: 2, weapon: 'M67', how: 'orphan', killerName: 'Gone', clip: null } as unknown as ServerEvent);
    expect(p.posted[0]![0]!.text).toBe('Gone fragged Mate with M67');
    expect(p.posted[0]![0]!.segments![0]).toEqual({ text: 'Gone' });
    expect(p.posted[0]![0]!.feedMark).toBeUndefined();
  });
});
