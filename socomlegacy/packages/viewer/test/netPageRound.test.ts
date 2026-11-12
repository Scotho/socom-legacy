import { describe, expect, it, vi } from 'vitest';
import { Hud } from '../src/hud';
import { ABANDON_LINE_READING, GAME_ENDED_DIALOG_READING, killLine, LEAD_ONCE_READING, NetPage, WAITING_LINE_READING, type NetPageDeps } from '../src/netPage';
import { countdownLine, eliminationLines } from '../src/net/rules';
import { RoundAudioHost } from '../src/roundAudioHost';
import type { RoundCues } from '../src/roundCues';
import type { AiMaps } from '@s2u/scene';
import { pinnedMatchSocket } from '../src/connectHost';
import type { WebSocketLike } from '../src/net/client';
import { JOIN_STATE_VERSION, TICK_HZ, type DropWire, type ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { ENGINE_READ_S, FINAL_ROUND_S, GAME_COMPLETE_S, ROUND_COMPLETE_S } from '../../match/src/room';
import type { ReplayRecord } from '../../match/src/replay/format';
import { asNetClient, ReplayClient } from '../src/replay/replayClient';
import { ALPHA, BRAVO, body, header } from './replayFixture';

/**
 * The page at a classic round's turn (review 2, M-5): the game's round end runs CMPExitState (`FUN_00223970`), whose
 * L76084 `FUN_0031c880` ends in `FUN_003bf050(0x4b5030)` and `FUN_003bf050(0x4b5050)` (L219059-219060) -- both decal
 * pools emptied, the marks and footprints and the scorches. So the page clears them at each round's start, and never
 * at a mid-round spawn. A fake socket stands in for the server.
 */

function page(game?: NetPageDeps['game']) {
  let socket: WebSocketLike | null = null;
  const hud = new Hud();
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
    mode: () => 'walk',
  } as unknown as WalkMode;
  const remote = { setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined } as unknown as RemotePlayers;
  const calls: string[] = [];
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => { calls.push('respawned'); },
    newRound: () => { calls.push('newRound'); },
    roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    socket: () => {
      socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
      return socket;
    },
    ...(game ? { game } : {}),
  };
  const net = new NetPage(deps, 'ws://test/ws', 'MP2', 'Tester', undefined, false, 'classic');
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  server({
    type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
    players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
  } as ServerEvent);
  return { net, server, calls, walk, socket: () => socket! };
}

describe('the page closed while its player is dead (MATCH-FIX review finding 3)', () => {
  it('takes the death clip off the walk: the free walk\'s body is not drawn lying dead', () => {
    const poses: (unknown | null)[] = [];
    const { net, server, walk } = page();
    (walk as unknown as { setDeathPose: (p: unknown) => void }).setDeathPose = (p) => { poses.push(p); };
    server({ type: 'kill', killer: null, victim: 1, weapon: null, how: 'fall', clip: 'seal_death' } as unknown as ServerEvent);
    expect(poses.at(-1)).not.toBeNull();
    net.close();
    expect(poses.at(-1)).toBeNull();
  });

  // MATCH-FIX review 2, finding 2: the server drops while the player is dead; the client gives the walk back alive and
  // unlocked (`NetClient.release`), so during the retry window (1-10 s) the free walk must not draw the body lying dead.
  it('the server drops while dead: the page\'s next frame takes the death clip off, before any reconnect', () => {
    const poses: (unknown | null)[] = [];
    const { net, server, walk, socket } = page();
    (walk as unknown as { setDeathPose: (p: unknown) => void }).setDeathPose = (p) => { poses.push(p); };
    server({ type: 'kill', killer: null, victim: 1, weapon: null, how: 'fall', clip: 'seal_death' } as unknown as ServerEvent);
    expect(poses.at(-1)).not.toBeNull();
    socket().onclose?.({ code: 1006, reason: '' } as CloseEvent);
    net.frame(1 / 60, {} as never, false);
    expect(poses.at(-1)).toBeNull();
    expect(net.prompt()).toBeNull();                                         // no dead's lines over the free walk
  });
});

describe('a round\'s end empties the decal pools (CMPExitState FUN_00223970 L76084 -> FUN_0031c880)', () => {
  it('roundStart calls newRound once; a spawn does not', () => {
    const { server, calls } = page();
    server({ type: 'spawn', id: 1, at: [0, 0, 0], yaw: 0, after: 0 });
    expect(calls).toEqual(['respawned']);
    server({ type: 'roundStart', round: 2, seconds: 360, wins: { seal: 1, terrorist: 0 }, rounds: 11, epoch: 2, startTick: 0 });
    expect(calls).toEqual(['respawned', 'newRound']);
    server({ type: 'spawn', id: 1, at: [0, 0, 0], yaw: 0, after: 0 });
    expect(calls.filter((c) => c === 'newRound')).toHaveLength(1);
  });
});

/**
 * Review 3 B2 (protocol 7): the room's other way out of a round is its abandon (a side left empty, `room.ts`
 * `abandonIfSideEmpty`); the original's abandon leaves the level, whose teardown empties both decal pools
 * (`FUN_0031af70` 218218-218219, `markClip.ts`). So `abandoned` ends the round on the page: the decals, the timer and
 * the round screens go. A bare score with timeLeft null (the respawn hold's) is not a round's end.
 */
describe('an abandoned round empties the decal pools and stops the timer (FUN_0031af70 218218-218219)', () => {
  const internals = (net: NetPage) => net as unknown as { endsAt: number | null; screens: unknown };

  it("abandoned in a game ends the match on dialog #528 (dlgNetAbandoned.rdr: DisconnectFromGameServer, POPUP 528, ReturnToWorldOfSOCOM; FUN_002bc530 D:L161109-161146) and posts no ABANDONED line; on /testroom the page posts UIMnLOC 528's text (ABANDON_LINE_READING)", () => {
    const { net, server, calls } = page();
    const posted: string[] = [];
    const hud = (net as unknown as { deps: { hud: Hud } }).deps.hud;
    const post = hud.postMessage.bind(hud);
    hud.postMessage = ((text: string | readonly string[], ...rest: unknown[]) => {
      posted.push(Array.isArray(text) ? text.join('/') : String(text));
      return (post as (...a: unknown[]) => unknown)(text, ...rest);
    }) as typeof hud.postMessage;
    server({ type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
    expect(internals(net).endsAt).not.toBeNull();
    const rounds = calls.filter((c) => c === 'newRound').length;
    server({ type: 'abandoned' } as ServerEvent);
    expect(calls.filter((c) => c === 'newRound').length).toBe(rounds + 1);
    expect(internals(net).endsAt).toBeNull();
    expect(internals(net).screens).toBeNull();
    expect(posted).not.toContain('ABANDONED');                    // PF-27 (PF.R48): no in-round line anywhere
    expect(posted).toContain(ABANDON_LINE_READING);                  // /testroom: UIMnLOC 528's text, no dialog runtime
    expect(ABANDON_LINE_READING).toBe('All players left the game before you were able to join. Please try again.');
    server({ type: 'score', rows: [], timeLeft: null, spectators: [], wins: { seal: 0, terrorist: 0 } });
    expect(internals(net).endsAt).toBeNull();
    expect(calls.filter((c) => c === 'newRound').length).toBe(rounds + 1);

    // In a game (`NetPageDeps.game`): the match ends on #528 -- `ended(528)` once, the session released, no retry --
    // and neither the ABANDONED line, the 528 line nor the waiting room's line is posted (the dialog says it).
    const ended: number[] = [], holds: boolean[] = [], lines: string[] = [];
    const g = page({ id: 7, ticket: 'tkt', pinned: pinnedMatchSocket('', { protocol: 'https:', host: 'site.test', origin: 'https://site.test' }, false), holds: (h) => { holds.push(h); }, ended: (d) => { ended.push(d); } });
    const ghud = (g.net as unknown as { deps: { hud: Hud } }).deps.hud;
    ghud.postMessage = ((text: string | readonly string[]) => { lines.push(Array.isArray(text) ? text.join('/') : String(text)); }) as typeof ghud.postMessage;
    g.server({ type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
    g.server({ type: 'abandoned' } as ServerEvent);
    expect(ended).toEqual([GAME_ENDED_DIALOG_READING]);
    expect(GAME_ENDED_DIALOG_READING).toBe(528);
    expect(holds.at(-1)).toBe(false);
    expect(lines.filter((l) => l === 'ABANDONED' || l === ABANDON_LINE_READING || l === WAITING_LINE_READING)).toEqual([]);
    expect(g.net.status().state).not.toBe('retrying');
  });

  it('repair 2: with its own `abandoned` hook the page calls that, not newRound (the ARMORY stays, a change is sent)', () => {
    const { net, server, calls } = page();
    const deps = (net as unknown as { deps: { abandoned?: () => void } }).deps;
    deps.abandoned = () => { calls.push('abandoned'); };
    server({ type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
    const rounds = calls.filter((c) => c === 'newRound').length;
    server({ type: 'abandoned' } as ServerEvent);
    expect(calls.filter((c) => c === 'abandoned')).toHaveLength(1);
    expect(calls.filter((c) => c === 'newRound').length).toBe(rounds);
    expect(internals(net).endsAt).toBeNull();
  });

  it('a bare score with timeLeft null does not call newRound', () => {
    const { server, calls } = page();
    server({ type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
    const rounds = calls.filter((c) => c === 'newRound').length;
    server({ type: 'score', rows: [], timeLeft: null, spectators: [], wins: { seal: 0, terrorist: 0 } });
    expect(calls.filter((c) => c === 'newRound').length).toBe(rounds);
  });
});

describe('the kill line of a grenade whose thrower has left (review 2, m-13)', () => {
  it('names the thrower the server kept; never a suicide', () => {
    expect(killLine('orphan', 'Alpha', 'Bravo', 'M67')).toBe('Alpha fragged Bravo with M67');
    expect(killLine('orphan', null, 'Bravo', 'M67')).not.toMatch(/suicide/);
    expect(killLine('suicide', null, 'Bravo', 'M67')).toBe('Bravo commits suicide with M67');
  });

  it('the page reads the kept name off an orphan kill', () => {
    const { net, server } = page();
    const posted: string[] = [];
    const hud = (net as unknown as { deps: { hud: Hud } }).deps.hud;
    const post = hud.postMessage.bind(hud);
    hud.postMessage = ((text: string | readonly string[], ...rest: unknown[]) => {
      posted.push(Array.isArray(text) ? text.join('/') : String(text));
      return (post as (...a: unknown[]) => unknown)(text, ...rest);
    }) as typeof hud.postMessage;
    server({ type: 'kill', killer: null, victim: 1, weapon: 'M67', how: 'orphan', killerName: 'Alpha', clip: null } as unknown as ServerEvent);
    expect(posted.some((p) => /^Alpha fragged \S+ with M67$/.test(p))).toBe(true);
    // The area (c) re-read's finding 5: a kept name is untrusted text -- a human who named himself with the marker's
    // bytes draws no gold BOT after leaving; his name reaches the line as plain text.
    posted.length = 0;
    server({ type: 'kill', killer: null, victim: 1, weapon: 'M67', how: 'orphan', killerName: '\u0001BOT\u0002 Alpha', clip: null } as unknown as ServerEvent);
    const line = posted.find((p) => p.includes('fragged'))!;
    expect(line).not.toContain('\u0001');
    expect(line).toMatch(/^BOT Alpha fragged \S+ with M67$/);
  });
});

/**
 * The others' reload heard (2026-10-02, ported from Chris's browser-beta-v5, d578f347; research 91 section 22.2): the
 * room's `reloadSound` names the item by id; the page plays its record's `ReloadSound` at the body as drawn (the room's
 * feet while none is), never for its own id (its own reload played already). REMOTE_RELOAD_SOUND_READING.
 */
describe('another player\'s reload heard (reloadSound)', () => {
  it('plays the item\'s record at the drawn body, the room\'s feet without one; never the page\'s own', () => {
    const { net, server } = page();
    const deps = (net as unknown as { deps: NetPageDeps }).deps;
    const heard: [string, number[]][] = [];
    deps.reloadSound = (w, at) => { heard.push([w.name, [...at]]); };
    deps.recordOf = (id) => (id === HELD_SIDEARM.id ? HELD_SIDEARM : null);
    (deps.remote as unknown as { feet: (id: number) => number[] | null }).feet = (id) => (id === 2 ? [5, 0, 5] : null);
    server({ type: 'reloadSound', id: 2, weapon: HELD_SIDEARM.id, at: [1, 2, 3] } as ServerEvent);
    server({ type: 'reloadSound', id: 3, weapon: HELD_SIDEARM.id, at: [1, 2, 3] } as ServerEvent);
    server({ type: 'reloadSound', id: 1, weapon: HELD_SIDEARM.id, at: [1, 2, 3] } as ServerEvent);
    expect(heard).toEqual([[HELD_SIDEARM.name, [5, 0, 5]], [HELD_SIDEARM.name, [1, 2, 3]]]);
  });

  it('an item the page has no record of plays nothing (not another weapon\'s sound)', () => {
    const { net, server } = page();
    const deps = (net as unknown as { deps: NetPageDeps }).deps;
    const heard: string[] = [];
    deps.reloadSound = (w) => { heard.push(w.name); };
    deps.recordOf = () => null;
    (deps.remote as unknown as { feet: () => null }).feet = () => null;
    server({ type: 'reloadSound', id: 2, weapon: 254, at: [0, 0, 0] } as ServerEvent);
    expect(heard).toEqual([]);
  });

  // REMOTE-RELOAD (REMOTE_RELOAD_MOTION_READING, research 91 section 22.2): the room's take -- posture, seconds, family,
  // moving -- reaches the other body's copy (`RemotePlayers.reload`), never the page's own (its own reload drew it); a
  // 14 room's event without the fields (an older room) reaches it bare, and the copy starts none (sound only).
  it("another body's reloadSound reaches remote.reload with the room's take; the page's own never; an older room's bare", () => {
    const { net, server } = page();
    const deps = (net as unknown as { deps: NetPageDeps }).deps;
    const heard: string[] = [];
    deps.reloadSound = (w) => { heard.push(w.name); };
    deps.recordOf = (id) => (id === HELD_RIFLE.id ? HELD_RIFLE : null);
    const reloads: unknown[][] = [];
    const stub = deps.remote as unknown as { feet: () => null; reload: (id: number, r: unknown) => void };
    stub.feet = () => null;
    stub.reload = (id, r) => { reloads.push([id, r]); };
    server({ type: 'reloadSound', id: 2, weapon: HELD_RIFLE.id, at: [1, 2, 3], posture: 'crouch', moving: false, family: 'rifle', seconds: 1.9 } as ServerEvent);
    server({ type: 'reloadSound', id: 1, weapon: HELD_RIFLE.id, at: [1, 2, 3], posture: 'stand', moving: true, family: 'rifle', seconds: 1.2 } as ServerEvent);
    server({ type: 'reloadSound', id: 3, weapon: HELD_RIFLE.id, at: [1, 2, 3] } as ServerEvent);
    expect(reloads).toEqual([
      [2, { posture: 'crouch', moving: false, family: 'rifle', seconds: 1.9 }],
      [3, { posture: undefined, moving: undefined, family: undefined, seconds: undefined }],
    ]);
    expect(heard).toEqual([HELD_RIFLE.name, HELD_RIFLE.name]);   // the sound as before, the page's own none
  });
});

/**
 * Another player's charge and Detonator carry his id to the page (2026-10-02, ported from Chris's browser-beta-v5,
 * d578f347): the room's `grenade` event names the thrower (`id`), and the page's copies of a claymore are set off by
 * their owner's Detonator only (`GrenadeThrower.launchRemote`'s `owner`; `CZKit_DetonateRemoteExplosives` +0xac).
 */
describe('the others\' throws reach the page with their owner (grenade)', () => {
  it('passes the thrower\'s id with the charge and the Detonator', () => {
    const { net, server } = page();
    const deps = (net as unknown as { deps: NetPageDeps }).deps;
    const seen: unknown[][] = [];
    deps.remoteGrenade = (...args: unknown[]) => { seen.push(args); };
    server({ type: 'grenade', id: 2, kind: 'Claymore', from: [1, 2, 3], velocity: [1, 0, 0], pid: 7 } as ServerEvent);
    server({ type: 'grenade', id: 3, kind: 'Detonator', from: [4, 5, 6], velocity: [0, 0, 0] } as ServerEvent);
    expect(seen).toEqual([['Claymore', [1, 2, 3], [1, 0, 0], 2, 7], ['Detonator', [4, 5, 6], [0, 0, 0], 3, undefined]]);
  });

  // LATER 643 (research 85 §6.1): the room's age for the throw (ticks from its release, as the room flew it) reaches the
  // copy's start; a malformed one is none.
  it('passes the throw\'s age with the grenade, and none for a malformed one', () => {
    const { net, server } = page();
    const deps = (net as unknown as { deps: NetPageDeps }).deps;
    const seen: unknown[][] = [];
    deps.remoteGrenade = (...args: unknown[]) => { seen.push(args); };
    server({ type: 'grenade', id: 2, kind: 'M67', from: [1, 2, 3], velocity: [1, 0, 0], pid: 7, age: 30 } as ServerEvent);
    server({ type: 'grenade', id: 2, kind: 'M67', from: [1, 2, 3], velocity: [1, 0, 0], pid: 8, age: -4 } as unknown as ServerEvent);
    server({ type: 'grenade', id: 2, kind: 'M67', from: [1, 2, 3], velocity: [1, 0, 0], pid: 9, age: 'x' } as unknown as ServerEvent);
    expect(seen).toEqual([
      ['M67', [1, 2, 3], [1, 0, 0], 2, 7, undefined, 30],
      ['M67', [1, 2, 3], [1, 0, 0], 2, 8],
      ['M67', [1, 2, 3], [1, 0, 0], 2, 9],
    ]);
  });
});

/**
 * PF-26 (research 216; 179 s10 s6): GAME COMPLETE's YOUR STATS are the local seat's -- its scoreboard row's SCORE,
 * KILLS, DEATHS and the room's match counters on `roundOver.stats` (`FUN_00225a00` D:L76886-76933) -- and each screen
 * knows how long it has been up (the lists' reveal, the counters, the 90 s timeout run on it).
 */
describe('the round screens\' feed (PF-26)', () => {
  it('ROUND COMPLETE and FINAL ROUND list the round block the rows carry (roundKills, roundDeaths, roundScore: the getter 0x225fe0 = +0x58c); GAME COMPLETE and YOUR STATS keep the match totals (0x225f20 = +0x544); an older room\'s rows without it list the totals', () => {
    let now = 1000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      const { net, server } = page();
      const hud = (net as unknown as { deps: { hud: Hud } }).deps.hud;
      const rowsOf = () => hud.state().model.roundScreen!.rows.map((r) => ({ id: r.id, kills: r.kills, deaths: r.deaths, score: r.score }));
      server({ type: 'score', rows: [
        { id: 1, name: 'Tester', team: 'seal', kills: 4, deaths: 2, score: 9, alive: true, ping: 0, roundKills: 1, roundDeaths: 0, roundScore: 8 },
        { id: 2, name: 'Other', team: 'terrorist', kills: 2, deaths: 4, score: 3, alive: false, ping: 0, roundKills: 0, roundDeaths: 1, roundScore: 0 },
      ], timeLeft: null, spectators: [], wins: { seal: 1, terrorist: 0 } });
      server({ type: 'roundOver', round: 1, winner: 'seal', wins: { seal: 1, terrorist: 0 }, matchOver: false, screens: [{ screen: 'roundComplete', seconds: ROUND_COMPLETE_S }] });
      now += (ENGINE_READ_S + 0.5) * 1000;
      net.frame(1 / 60, {} as never, false);
      expect(hud.state().model.roundScreen).toMatchObject({ kind: 'roundComplete' });
      expect(rowsOf()).toEqual([{ id: 1, kills: 1, deaths: 0, score: 8 }, { id: 2, kills: 0, deaths: 1, score: 0 }]);
      server({ type: 'roundOver', round: 2, winner: 'seal', wins: { seal: 2, terrorist: 0 }, matchOver: true,
        screens: [{ screen: 'finalRound', seconds: FINAL_ROUND_S }, { screen: 'gameComplete', seconds: GAME_COMPLETE_S }] });
      now += (ENGINE_READ_S + 0.5) * 1000;
      net.frame(1 / 60, {} as never, false);
      expect(hud.state().model.roundScreen).toMatchObject({ kind: 'finalRound' });
      expect(rowsOf()).toEqual([{ id: 1, kills: 1, deaths: 0, score: 8 }, { id: 2, kills: 0, deaths: 1, score: 0 }]);
      now += FINAL_ROUND_S * 1000;
      net.frame(1 / 60, {} as never, false);
      expect(hud.state().model.roundScreen).toMatchObject({ kind: 'gameComplete' });
      expect(rowsOf()).toEqual([{ id: 1, kills: 4, deaths: 2, score: 9 }, { id: 2, kills: 2, deaths: 4, score: 3 }]);
      expect(hud.state().model.roundScreen!.you).toMatchObject({ score: 9, kills: 4, deaths: 2 });
      // An older room's rows carry no round block: the totals, as before.
      server({ type: 'score', rows: [
        { id: 1, name: 'Tester', team: 'seal', kills: 4, deaths: 2, score: 9, alive: true, ping: 0 },
        { id: 2, name: 'Other', team: 'terrorist', kills: 2, deaths: 4, score: 3, alive: true, ping: 0 },
      ], timeLeft: null, spectators: [], wins: { seal: 2, terrorist: 0 } });
      server({ type: 'roundOver', round: 1, winner: 'seal', wins: { seal: 1, terrorist: 0 }, matchOver: false, screens: [{ screen: 'roundComplete', seconds: ROUND_COMPLETE_S }] });
      now += (ENGINE_READ_S + 0.5) * 1000;
      net.frame(1 / 60, {} as never, false);
      expect(rowsOf()).toEqual([{ id: 1, kills: 4, deaths: 2, score: 9 }, { id: 2, kills: 2, deaths: 4, score: 3 }]);
    } finally {
      clock.mockRestore();
    }
  });

  it('roundOver\'s stats feed GAME COMPLETE\'s YOUR STATS for the local seat, and the screen knows how long it has been up', () => {
    let now = 1000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      const { net, server } = page();
      // NET-RES-2d (NET-RES.R9): a live room speaks every tick (a snapshot each 33 ms, a pong each 2 s), so the
      // fake one speaks before each frame -- the link watch's 10 s bound kept.
      const frame = (): void => { server({ type: 'pong', t: now, tick: 0 } as ServerEvent); net.frame(1 / 60, {} as never, false); };
      const hud = (net as unknown as { deps: { hud: Hud } }).deps.hud;
      server({ type: 'score', rows: [
        { id: 1, name: 'Tester', team: 'seal', kills: 4, deaths: 2, score: 9, alive: true, ping: 0 },
        { id: 2, name: 'Other', team: 'terrorist', kills: 2, deaths: 4, score: 3, alive: true, ping: 0 },
      ], timeLeft: null, spectators: [], wins: { seal: 1, terrorist: 0 } });
      const zero = { shotsFired: 0, shotsHit: 0, headshots: 0, teamKills: 0, suicides: 0, primaryObjs: 0, bonusObjs: 0 };
      server({
        type: 'roundOver', round: 1, winner: 'seal', wins: { seal: 1, terrorist: 0 }, matchOver: true,
        screens: [{ screen: 'finalRound', seconds: FINAL_ROUND_S }, { screen: 'gameComplete', seconds: GAME_COMPLETE_S }],
        stats: { 1: { ...zero, shotsFired: 3, shotsHit: 2, headshots: 1, teamKills: 1, suicides: 2 }, 2: zero },
      });
      now += (ENGINE_READ_S + 0.5) * 1000;
      frame();
      expect(hud.state().model.roundScreen).toMatchObject({ kind: 'finalRound' });
      expect(hud.state().model.roundScreen!.elapsed).toBeCloseTo(0.5, 6);
      now += FINAL_ROUND_S * 1000;
      frame();
      const screen = hud.state().model.roundScreen!;
      expect(screen.kind).toBe('gameComplete');
      expect(screen.elapsed).toBeCloseTo(0.5, 6);
      expect(screen.you).toEqual({ score: 9, kills: 4, deaths: 2, hitPct: 67, headshots: 1, primaryObjs: 0, bonusObjs: 0, friendlyKills: 1, suicides: 2 });
      now += 3500;
      frame();
      expect(hud.state().model.roundScreen!.elapsed).toBeCloseTo(4, 6);
      // An older room's roundOver carries no stats: the row's three numbers and zeros.
      server({ type: 'roundOver', round: 1, winner: 'seal', wins: { seal: 1, terrorist: 0 }, matchOver: true,
        screens: [{ screen: 'gameComplete', seconds: GAME_COMPLETE_S }] });
      now += (ENGINE_READ_S + 1) * 1000;
      frame();
      expect(hud.state().model.roundScreen!.you).toEqual({ score: 9, kills: 4, deaths: 2, hitPct: 0, headshots: 0, primaryObjs: 0, bonusObjs: 0, friendlyKills: 0, suicides: 0 });
    } finally {
      clock.mockRestore();
    }
  });
});

/**
 * PF-34 (research 234 s6; sprint 30 wave 4, the page side): the room's `drop`, `taken` and `kit` reach the page's
 * optional deps -- `drops.place` / `drops.remove` (`./drops` `WorldDrops`), the taker's live kit on his remote body
 * (`RemotePlayers.setKit`), and the page's own kit through `kitChanged` (`./takeKit`) with the rings exactly as the room
 * holds them and, after an ammunition transfer, the slots it filled. `pickup(did)` is the action button's claim.
 */
describe('the world drops and the pickup reach the page (PF-34, research 234 s6)', () => {
  const drop = { did: 4, kind: 'weapon', item: HELD_RIFLE.id, at: [1, 2, 3], yaw: 90, from: 2 } as const;
  const kitSink = (deps: NetPageDeps, out: unknown[][]): void => {
    (deps.remote as unknown as { setKit: (id: number, kit: readonly number[]) => void }).setKit = (id, kit) => { out.push(['setKit', id, [...kit]]); };
  };

  it('drop, taken and kit reach the deps: the drop placed, the taker\'s kit set on the remote body, the page\'s own kit changed with the exact rings and the slots filled; pickup(did) sends the client event with the last seq', () => {
    const { net, server, socket } = page();
    const deps = (net as unknown as { deps: NetPageDeps }).deps;
    const seen: unknown[][] = [];
    deps.drops = {
      place: (d) => { seen.push(['place', d]); },
      remove: (did) => { seen.push(['remove', did]); },
      replaceAll: (all) => { seen.push(['replaceAll', all]); },
    };
    deps.kitChanged = (...a) => { seen.push(['kit', ...a]); };
    kitSink(deps, seen);
    server({ type: 'drop', ...drop } as ServerEvent);
    server({ type: 'taken', did: 4, by: 3, kit: [10, 11, 12, 13, 14] } as ServerEvent);
    server({ type: 'taken', did: 5, by: 2 } as ServerEvent);                       // a bundle emptied: no kit told
    const rounds: [number[], number[]] = [[30, 30, 0, 0, 0, 0, 0, 0, 0, 0], [15, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
    server({ type: 'kit', loadout: [10, 11, 12, 13, 14], slot: 0, rounds } as ServerEvent);
    const filled: [number[], number[]] = [[2, 3], []];
    server({ type: 'kit', loadout: [10, 11, 12, 13, 14], rounds, filled } as ServerEvent);
    expect(seen).toEqual([
      ['place', { type: 'drop', ...drop }],
      ['remove', 4], ['setKit', 3, [10, 11, 12, 13, 14]],
      ['remove', 5],
      ['kit', [10, 11, 12, 13, 14], 0, rounds, undefined],
      ['kit', [10, 11, 12, 13, 14], null, rounds, filled],                     // an ammunition transfer: no slot, `filled` passed
    ]);

    const sent: string[] = [];
    socket().send = (f: string | Uint8Array) => { sent.push(String(f)); };
    const seq = (net as unknown as { client: { lastSeq(): number } }).client.lastSeq();
    expect(net.pickup(4)).toBe(true);
    expect(sent.map((s) => JSON.parse(s) as unknown)).toEqual([{ type: 'pickup', seq, did: 4 }]);
  });

  it("OBF-15: a drop laid from the page's own seat is placed as its own (`place(d, true)`), another seat's as not (FUN_0059f730 D:L458419-458432 takes the victim's weapon off its body)", () => {
    const { net, server } = page();
    const deps = (net as unknown as { deps: NetPageDeps }).deps;
    const me = (net as unknown as { client: { id: number } }).client.id;
    const seen: [number, boolean | undefined][] = [];
    deps.drops = { place: (d, own) => { seen.push([d.did, own]); }, remove: () => undefined, replaceAll: () => undefined };
    server({ type: 'drop', ...drop, did: 7, from: me } as ServerEvent);
    server({ type: 'drop', ...drop, did: 8, from: me + 1 } as ServerEvent);
    expect(seen).toEqual([[7, true], [8, false]]);
  });

  it('a page built without drops or kitChanged ignores drop, taken and kit (each dep optional); taken still sets the taker\'s kit', () => {
    const { net, server } = page();
    const deps = (net as unknown as { deps: NetPageDeps }).deps;
    expect(deps.drops).toBeUndefined();
    expect(deps.kitChanged).toBeUndefined();
    const kits: unknown[][] = [];
    kitSink(deps, kits);
    expect(() => {
      server({ type: 'drop', ...drop } as ServerEvent);
      server({ type: 'taken', did: 4, by: 3, kit: [1, 2, 3, 4, 5] } as ServerEvent);
      server({ type: 'kit', loadout: [1, 2, 3, 4, 5], slot: 1, rounds: [[], []], filled: [[], [0]] } as ServerEvent);
    }).not.toThrow();
    expect(kits).toEqual([['setKit', 3, [1, 2, 3, 4, 5]]]);
    deps.drops = null;                                                              // a page with no world drops
    expect(() => { server({ type: 'drop', ...drop } as ServerEvent); server({ type: 'taken', did: 4, by: 3 } as ServerEvent); }).not.toThrow();
  });
});

/**
 * PF-36 (research 235 s4-s5; sprint 30 wave 4, the page side): the room's `placed` (to the thrower or placer alone: his
 * own copy's pid, `OWN_PID_READING`) and `detonate` (a resting charge damaged in the room) reach the page's optional
 * deps `tagOwnProjectile` (`GrenadeThrower.tagOwn`) and `detonateProjectile` (`GrenadeThrower.detonateRemote`).
 */
describe('the Volitile charges reach the page (PF-36, research 235 s5)', () => {
  it('placed and detonate reach the deps (tagOwnProjectile, detonateProjectile); an older room sends neither and nothing changes', () => {
    const { net, server } = page();
    const deps = (net as unknown as { deps: NetPageDeps }).deps;
    const seen: unknown[][] = [];
    deps.tagOwnProjectile = (...a) => { seen.push(['tag', ...a]); };
    deps.detonateProjectile = (...a) => { seen.push(['detonate', ...a]); };
    server({ type: 'placed', pid: 7, kind: 'Claymore', from: [1, 2, 3] } as ServerEvent);
    server({ type: 'detonate', pid: 7, by: 2 } as ServerEvent);
    server({ type: 'detonate', pid: 8, by: null } as ServerEvent);
    expect(seen).toEqual([['tag', 'Claymore', [1, 2, 3], 7], ['detonate', 7], ['detonate', 8]]);
    // An older room: only the events it always sent (the charge's `grenade`) -- neither dep is called.
    seen.length = 0;
    server({ type: 'grenade', id: 2, kind: 'Claymore', from: [1, 2, 3], velocity: [0, 0, 0], pid: 9 } as ServerEvent);
    expect(seen).toEqual([]);
  });

  it('a page built without tagOwnProjectile or detonateProjectile ignores placed and detonate (each dep optional)', () => {
    const { net, server } = page();
    const deps = (net as unknown as { deps: NetPageDeps }).deps;
    expect(deps.tagOwnProjectile).toBeUndefined();
    expect(deps.detonateProjectile).toBeUndefined();
    expect(() => {
      server({ type: 'placed', pid: 7, kind: 'Claymore', from: [1, 2, 3] } as ServerEvent);
      server({ type: 'detonate', pid: 7, by: 2 } as ServerEvent);
    }).not.toThrow();
  });
});

/**
 * HX-5 (research 239 s6): the lines the page posts for the hostages, by event -- the script's one-shots (Lead once per
 * hostage a round, Rescue, the two kills by the killer's side) and `start`'s rescue-win branch on `eliminated.reason`,
 * through the round's audio (`RoundAudioHost` on the map's cues: here synthetic, shaped as MP6's `roundCues` reads them).
 */
describe('the hostages\' lines and cues (HX-5; research 239 s6)', () => {
  const line = (text: string, waitBefore = 0) => ({ text, locId: null, scale: 0.7, waitBefore });
  const CUES: RoundCues = {
    map: 'MP6', intro: {}, introRespawn: null, timeExpired: [], objective: {},
    elimination: { seal: { 0: [{ sound: '^PH_0014', slot: false }, { wait: 2 }, { sound: 'MUS_MP_SEAL_WIN_ALG', slot: true }] }, terrorist: {} },
    hostages: {
      lead: { sound: '^PH_0006', lines: [line('A HOSTAGE IS BEING ESCORTED')] },
      rescued: { sound: '^PH_0013', lines: [line('A HOSTAGE HAS BEEN RESCUED')] },
      killedByTerrorists: { sound: '^PH_0008', lines: [line('THE TERRORISTS HAVE KILLED A HOSTAGE'), line('THE SEALS HAVE BEEN CREDITED WITH RESCUING THAT HOSTAGE', 2)] },
      killedBySeals: { sound: '^PH_0007', lines: [line('THE SEALS HAVE KILLED A HOSTAGE'), line('ONE MINUTE HAS BEEN DEDUCTED FROM THE MISSION TIMER', 2)] },
    },
    decided: {
      rescue: { 0: [{ wait: 2 }, { message: 'SEALS VICTORIOUS!', locId: null, scale: 0.9 }, { sound: '^PH_0014', slot: false }, { wait: 2 }, { sound: 'MUS_MP_SEAL_WIN_ALG', slot: true }] },
      hostageKills: {},
    },
  };

  function hostagePage(withAudio = true, cues: RoundCues = CUES) {
    let socket: WebSocketLike | null = null;
    const hud = new Hud();
    const posted: string[] = [];
    const post = hud.postMessage.bind(hud);
    hud.postMessage = ((text: Parameters<Hud['postMessage']>[0], scale?: number) => {
      for (const l of typeof text === 'string' ? [text] : text) posted.push(typeof l === 'string' ? l : l.text);
      post(text as never, scale);
    }) as Hud['postMessage'];
    const clock = { t: 0 };
    const plays: string[] = [];
    const audio = new RoundAudioHost({
      playMusic: (n: string) => { plays.push(`${clock.t} music ${n}`); return 'played' as const; },
      playStream: (n: string) => { plays.push(`${clock.t} voice ${n}`); return 'played' as const; },
      stopMusic: () => undefined, roundCues: () => cues,
    } as never, () => clock.t);
    const walk = {
      setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
      setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'walk',
    } as unknown as WalkMode;
    const remote = {
      setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined, setOpacity: () => undefined,
      feet: () => null, setEscortee: () => undefined, hydrateCorpse: () => undefined,
    } as unknown as RemotePlayers;
    const deps: NetPageDeps = {
      walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined, respawned: () => undefined,
      newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
      socket: () => (socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike),
      ...(withAudio ? { roundAudio: audio } : {}),
    };
    const net = new NetPage(deps, 'ws://test/ws', 'MP6', 'Tester', undefined, false, 'classic');
    socket!.onopen?.({} as Event);
    const server = (ev: unknown): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
    server({
      type: 'welcome', id: 1, version: 11, map: 'MP6', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
      players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
      hostages: [240, 241, 242].map((id, i) => ({
        id, name: i ? `Hostage${i + 1}` : 'Hostage', character: `mp_fem${i + 1}`, at: [100 * i, 0, 50], yaw: 0, alive: true, ai: 0x17,
        leader: null, rescuer: null, opacity: 1, unit: 17,
      })),
    });
    server({ type: 'joined', id: 2, name: 'Seal2', team: 'seal' });
    server({ type: 'joined', id: 3, name: 'Terr3', team: 'terrorist' });
    const at = (t: number): void => { clock.t = t; audio.frame(); };
    const state = (id: number, ai: number, leader: number | null = null) => server({ type: 'hostageState', id, alive: true, ai, leader, rescuer: ai === 0x11 ? leader : null, opacity: 1, unit: leader === null ? 17 : leader + 0x20 });
    return { net, server, posted, plays, at, state, audio };
  }

  it("the page posts the Lead line once per hostage on its first state 9 (LEAD_ONCE_READING), the Rescue line on 0x11, the two kill lines by the killer's side with their WAIT 2 and stream, and on eliminated reason 'rescue' the rescue-win branch after 2 s instead of the elimination's lines; an older room's eliminated without a reason posts the elimination's", () => {
    expect(LEAD_ONCE_READING).toBe('once per hostage a round');
    const { server, posted, plays, at, state } = hostagePage();
    const ESCORTED = 'A HOSTAGE IS BEING ESCORTED';
    state(240, 9, 2);
    expect(posted.filter((t) => t === ESCORTED)).toHaveLength(1);
    expect(plays).toContain('0 voice ^PH_0006');
    state(240, 0x17); state(240, 9, 2);                                       // HOLD then FOLLOW again: no second line
    expect(posted.filter((t) => t === ESCORTED)).toHaveLength(1);
    state(241, 9, 3);                                                         // another hostage, a Terrorist's lead
    expect(posted.filter((t) => t === ESCORTED)).toHaveLength(2);
    state(240, 0x11, 2);
    expect(posted).toContain('A HOSTAGE HAS BEEN RESCUED');
    expect(plays).toContain('0 voice ^PH_0013');
    // A SEAL's kill: the first line and ^PH_0007 now, the minute's line after WAIT 2.
    at(10);
    server({ type: 'kill', killer: 2, victim: 241, weapon: 'M4A1', how: 'weapon', clip: null, cause: 5, voiced: true, victimKind: 'hostage' });
    expect(posted.at(-1)).toBe('THE SEALS HAVE KILLED A HOSTAGE');
    expect(plays).toContain('10 voice ^PH_0007');
    at(11.5);
    expect(posted).not.toContain('ONE MINUTE HAS BEEN DEDUCTED FROM THE MISSION TIMER');
    at(12);
    expect(posted.at(-1)).toBe('ONE MINUTE HAS BEEN DEDUCTED FROM THE MISSION TIMER');
    // A Terrorist's kill: HostKill's two; no kill line ("X killed Y") for a hostage.
    server({ type: 'kill', killer: 3, victim: 242, weapon: 'AK-47', how: 'weapon', clip: null, cause: 5, voiced: true, victimKind: 'hostage' });
    expect(posted.at(-1)).toBe('THE TERRORISTS HAVE KILLED A HOSTAGE');
    at(14);
    expect(posted.at(-1)).toBe('THE SEALS HAVE BEEN CREDITED WITH RESCUING THAT HOSTAGE');
    expect(plays).toContain('12 voice ^PH_0008');
    expect(posted.some((t) => /killed/i.test(t) && /Seal2|Terr3/.test(t))).toBe(false);
    // The rescue win: WAIT 2, then SEALS VICTORIOUS! and ^PH_0014 -- not "ALL TERRORISTS ELIMINATED".
    const before = posted.length;
    server({ type: 'eliminated', winner: 'seal', reason: 'rescue' });
    expect(posted.length).toBe(before);
    at(15.5);
    expect(posted.length).toBe(before);
    at(16);
    expect(posted.slice(before)).toEqual(['SEALS VICTORIOUS!']);
    expect(plays).toContain('16 voice ^PH_0014');
    expect(posted).not.toContain('ALL TERRORISTS ELIMINATED');
    // A new round: the Lead line again for the same hostage.
    server({ type: 'roundStart', round: 2, seconds: 360, wins: { seal: 1, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
    state(240, 9, 2);
    expect(posted.filter((t) => t === ESCORTED)).toHaveLength(3);

    // An older room's eliminated (no reason): the elimination's lines.
    const old = hostagePage();
    old.server({ type: 'eliminated', winner: 'seal' });
    expect(old.posted).toEqual(expect.arrayContaining(eliminationLines('seal').map((l) => l.text)));
    // A page with no round audio: the elimination's lines for a reason too (nothing to read the branch from).
    const silent = hostagePage(false);
    silent.server({ type: 'eliminated', winner: 'seal', reason: 'rescue' });
    expect(silent.posted).toEqual(expect.arrayContaining(eliminationLines('seal').map((l) => l.text)));
  });

  // LATER 125 (research 175 §4): an escort map's cues, synthetic, shaped as MP52's `roundCues` reads them -- `decided`
  // with escort's three outcomes, `elimination` the SEALs' win alone.
  const msg = (message: string, scale = 0.7) => ({ message, locId: null, scale });
  const ESCORT_CUES: RoundCues = {
    ...CUES, map: 'MP52', hostages: undefined,
    elimination: { seal: { 0: [{ sound: '^PH_0014', slot: false }] }, terrorist: {} },
    decided: {
      rescue: { 0: [{ sound: '^*PT_0055', slot: false }, msg('THE TERRORISTS FAILED TO ELIMINATE THE VIPS.'), msg('SEALS VICTORIOUS!', 0.9), { wait: 2 }, { sound: 'MUS_MP_SEAL_WIN_ALB', slot: true }] },
      hostageKills: { 0: [msg('THE VIPS HAVE BEEN ELIMINATED.'), msg('TERRORISTS WIN!', 0.9), { sound: '^PH_0050', slot: false }, { sound: 'MUS_MP_TERR_WIN_ALB', slot: true }] },
      elimination: { 0: [msg('ALL TERRORISTS ELIMINATED'), { sound: '^PH_0014', slot: false }, msg('THE TERRORISTS FAILED TO ELIMINATE THE VIPS.'), msg('SEALS VICTORIOUS!', 0.9), { wait: 2 }, { sound: 'MUS_MP_SEAL_WIN_ALB', slot: true }] },
    },
  };

  it("LATER 125: on an escort map a SEAL elimination posts start's line then escort_success's, an extraction the VIP lines, three kills THE VIPS HAVE BEEN ELIMINATED. -- never elimination's two; a Terrorist win and a map without decided.elimination as before", () => {
    const seal = hostagePage(true, ESCORT_CUES);
    const seal0 = seal.posted.length, sealP = seal.plays.length;
    seal.server({ type: 'eliminated', winner: 'seal' });
    seal.at(2);
    expect(seal.posted.slice(seal0)).toEqual(['ALL TERRORISTS ELIMINATED', 'THE TERRORISTS FAILED TO ELIMINATE THE VIPS.', 'SEALS VICTORIOUS!']);
    expect(seal.plays.slice(sealP)).toEqual(['0 voice ^PH_0014', '2 music MUS_MP_SEAL_WIN_ALB']);
    const rescue = hostagePage(true, ESCORT_CUES);
    const rescue0 = rescue.posted.length, rescueP = rescue.plays.length;
    rescue.server({ type: 'eliminated', winner: 'seal', reason: 'rescue' });
    rescue.at(2);
    expect(rescue.posted.slice(rescue0)).toEqual(['THE TERRORISTS FAILED TO ELIMINATE THE VIPS.', 'SEALS VICTORIOUS!']);
    const kills = hostagePage(true, ESCORT_CUES);
    const kills0 = kills.posted.length, killsP = kills.plays.length;
    kills.server({ type: 'eliminated', winner: 'terrorist', reason: 'hostageKills' });
    expect(kills.posted.slice(kills0)).toEqual(['THE VIPS HAVE BEEN ELIMINATED.', 'TERRORISTS WIN!']);
    // The SEALs eliminated: no decided branch for it -- the elimination's two lines, as before.
    const terr = hostagePage(true, ESCORT_CUES);
    const terr0 = terr.posted.length, terrP = terr.plays.length;
    terr.server({ type: 'eliminated', winner: 'terrorist' });
    expect(terr.posted.slice(terr0)).toEqual(eliminationLines('terrorist').map((l) => l.text));
    // A map without decided.elimination (MP6's shape): a SEAL elimination posts the elimination's two lines (e3's guard).
    const extraction = hostagePage(true, CUES);
    const extraction0 = extraction.posted.length, extractionP = extraction.plays.length;
    extraction.server({ type: 'eliminated', winner: 'seal' });
    expect(extraction.posted.slice(extraction0)).toEqual(eliminationLines('seal').map((l) => l.text));
  });

  // LATER 131 (research 175 §4): the room's `escort` plays the map's escort cues -- RescueN's, EndRescueN's by the VIP the
  // event names, VIPcheck's by the local team -- and the rescue's decision at EndRescue's WAIT 2 keeps its music.
  const ESCORT_LINES: RoundCues = {
    ...ESCORT_CUES,
    escort: {
      staged: { VIP1: [msg('A VIP IS IN THE EXTRACTION ZONE')] },
      extracted: { VIP2: [msg('A VIP HAS BEEN EXTRACTED'), { sound: '^*PT_0051', slot: false }, { wait: 2 }, { sound: 'MUS_MP_VIP_RESC_2', slot: true }] },
      aborted: { 0: [msg('MISSION COMPROMISED, TWO OF THE THREE VIPS HAVE BEEN KILLED.')], 8: [msg('EXTRACTION ABORTED, TWO OF THE THREE VIPS HAVE BEEN KILLED.')] },
    },
  };

  it("LATER 131: the room's escort -- staged and extracted by the VIP it names, aborted by the local team; the rescue at WAIT 2 keeps MUS_MP_VIP_RESC_2; no cues, nothing", () => {
    const page = hostagePage(true, ESCORT_LINES);
    const p0 = page.posted.length, pP = page.plays.length;
    page.server({ type: 'escort', kind: 'staged', vip: 'VIP1' } as ServerEvent);
    page.server({ type: 'escort', kind: 'aborted' } as ServerEvent);
    page.server({ type: 'escort', kind: 'extracted', vip: 'VIP2' } as ServerEvent);
    page.at(2);
    page.server({ type: 'eliminated', winner: 'seal', reason: 'rescue' });
    page.at(4);
    expect(page.posted.slice(p0)).toEqual(['A VIP IS IN THE EXTRACTION ZONE', 'MISSION COMPROMISED, TWO OF THE THREE VIPS HAVE BEEN KILLED.', 'A VIP HAS BEEN EXTRACTED',
      'THE TERRORISTS FAILED TO ELIMINATE THE VIPS.', 'SEALS VICTORIOUS!']);
    expect(page.plays.slice(pP)).toEqual(['0 voice ^*PT_0051', '2 music MUS_MP_VIP_RESC_2', '2 voice ^*PT_0055', '4 music MUS_MP_SEAL_WIN_ALB']);
    for (const p of [hostagePage(true, ESCORT_CUES), hostagePage(false)]) {
      const q0 = p.posted.length;
      p.server({ type: 'escort', kind: 'staged', vip: 'VIP1' } as ServerEvent);
      p.at(3);
      expect(p.posted.slice(q0)).toEqual([]);
    }
  });

  // LATER 130 (MP61's `objectives`: `start`'s SEALs-eliminated branch @1640, `breach_success` @6504): a breach map's
  // cues, synthetic, shaped as `roundCues` reads them -- `decided.terroristElimination`, the Terrorists' elimination win.
  const BREACH_CUES: RoundCues = {
    ...CUES, map: 'MP61', hostages: undefined,
    decided: {
      rescue: {}, hostageKills: {},
      terroristElimination: { 0: [msg('ALL SEALS ELIMINATED'), { sound: 'MUS_MP_TERR_WIN_BRA', slot: true }, { sound: '^*PT_0021', slot: false },
        msg('THE SEALS FAILED TO BREACH AND DESTROY THE ENEMY BASE.'), msg('TERRORISTS WIN!', 0.9), { wait: 2 }, { sound: 'MUS_MP_TERR_WIN_BRA', slot: true }] },
    },
  };

  it("LATER 130: on a breach map a Terrorist elimination posts start's line then breach_success's -- never elimination's two; a SEAL win there, and a Terrorist win on escort and extraction maps, as before", () => {
    const terr = hostagePage(true, BREACH_CUES);
    const terr0 = terr.posted.length, terrP = terr.plays.length;
    terr.server({ type: 'eliminated', winner: 'terrorist' });
    terr.at(2);
    expect(terr.posted.slice(terr0)).toEqual(['ALL SEALS ELIMINATED', 'THE SEALS FAILED TO BREACH AND DESTROY THE ENEMY BASE.', 'TERRORISTS WIN!']);
    expect(terr.plays.slice(terrP)).toEqual(['0 music MUS_MP_TERR_WIN_BRA', '0 voice ^*PT_0021', '2 music MUS_MP_TERR_WIN_BRA']);
    // A SEAL elimination on a breach map: no decided branch for it -- the elimination's two lines.
    const seal = hostagePage(true, BREACH_CUES);
    const seal0 = seal.posted.length;
    seal.server({ type: 'eliminated', winner: 'seal' });
    expect(seal.posted.slice(seal0)).toEqual(eliminationLines('seal').map((l) => l.text));
    // e3's guard: a Terrorist win on an escort map (MP52's shape) and on an extraction map (MP6's): the elimination's lines.
    for (const cues of [ESCORT_CUES, CUES]) {
      const p = hostagePage(true, cues);
      const p0 = p.posted.length;
      p.server({ type: 'eliminated', winner: 'terrorist' });
      expect(p.posted.slice(p0), cues.map).toEqual(eliminationLines('terrorist').map((l) => l.text));
    }
  });

  // LATER 127 / 138: the time-out's win on ESCORT and BREACH, the room's `timedOut` -- its own event, so an older page
  // ignores it (the client drops a type it does not know) and none reads it as an elimination (e3's condition 1).
  const timeoutCues = (cues: RoundCues, steps: NonNullable<NonNullable<RoundCues['decided']>['timeout']>): RoundCues =>
    ({ ...cues, decided: { ...cues.decided!, timeout: steps } });

  it("LATER 127 / 138: timedOut posts the map's success lines (escort_success's on ESCORT, breach_success's on BREACH) -- never elimination's; with no timeout cues it posts nothing", () => {
    const escort = hostagePage(true, timeoutCues(ESCORT_CUES, { 0: [msg('THE TERRORISTS FAILED TO ELIMINATE THE VIPS.'), msg('SEALS VICTORIOUS!', 0.9), { wait: 2 }, { sound: 'MUS_MP_SEAL_WIN_ALB', slot: true }] }));
    const e0 = escort.posted.length, eP = escort.plays.length;
    escort.server({ type: 'timedOut', winner: 'seal' } as ServerEvent);
    escort.at(2);
    expect(escort.posted.slice(e0)).toEqual(['THE TERRORISTS FAILED TO ELIMINATE THE VIPS.', 'SEALS VICTORIOUS!']);
    expect(escort.plays.slice(eP)).toEqual(['2 music MUS_MP_SEAL_WIN_ALB']);
    const breach = hostagePage(true, timeoutCues(BREACH_CUES, { 0: [{ sound: '^*PT_0021', slot: false }, msg('THE SEALS FAILED TO BREACH AND DESTROY THE ENEMY BASE.'), msg('TERRORISTS WIN!', 0.9), { wait: 2 }, { sound: 'MUS_MP_TERR_WIN_BRA', slot: true }] }));
    const b0 = breach.posted.length;
    breach.server({ type: 'timedOut', winner: 'terrorist' } as ServerEvent);
    expect(breach.posted.slice(b0)).toEqual(['THE SEALS FAILED TO BREACH AND DESTROY THE ENEMY BASE.', 'TERRORISTS WIN!']);
    // e3's condition 1: no timeout cues (an escort map's cues without them, an extraction map's, none) -- nothing posted,
    // and never the elimination's two lines.
    for (const [cues, winner] of [[ESCORT_CUES, 'seal'], [BREACH_CUES, 'terrorist'], [CUES, 'seal'], [CUES, 'terrorist']] as const) {
      const p = hostagePage(true, cues);
      const p0 = p.posted.length;
      p.server({ type: 'timedOut', winner } as ServerEvent);
      p.at(3);
      expect(p.posted.slice(p0), `${cues.map} ${winner}`).toEqual([]);
    }
    const bare = hostagePage(false);
    const bare0 = bare.posted.length;
    bare.server({ type: 'timedOut', winner: 'seal' } as ServerEvent);
    expect(bare.posted.slice(bare0)).toEqual([]);
  });

  // The review's F2: a timedOut on a map whose cues hold no `decided.timeout` (cues not yet loaded, a hand-built or forge
  // map of type 1 or 3) posts nothing, and still decides the round's audio -- a non-result bomb cue plays nothing in the
  // hold, as after an elimination (before LATER 127 / 138 the room's at-once `roundOver` closed the round).
  it("the review's F2: a timedOut with no timeout cues decides the round's audio -- a planted cue in the hold plays nothing", () => {
    const planted = { pickup: { seal: {}, terrorist: {} }, drop: { seal: {}, terrorist: {} }, defused: { seal: {}, terrorist: {} }, detonated: { seal: {}, terrorist: {} },
      planted: { seal: { 0: [{ sound: '^PLANT', slot: false }] }, terrorist: { 0: [{ sound: '^PLANT', slot: false }] } } };
    const cues = { ...BREACH_CUES, bomb: planted } as unknown as RoundCues;
    const live = hostagePage(true, cues);
    const l0 = live.plays.length;
    live.audio.bomb('planted', 'seal', 'seal');
    expect(live.plays.slice(l0)).toEqual(['0 voice ^PLANT']);            // a round in play: the cue plays
    const held = hostagePage(true, cues);
    const h0 = held.posted.length, hP = held.plays.length;
    held.server({ type: 'timedOut', winner: 'terrorist' } as ServerEvent);
    held.audio.bomb('planted', 'seal', 'seal');
    held.at(3);
    expect(held.posted.slice(h0)).toEqual([]);
    expect(held.plays.slice(hP)).toEqual([]);
  });

  // LATER 145: the bomb live in a decided hold -- `bomb_pickup` / `bomb_drop` are never stopped (the nine bomb maps), so
  // their cues play there; a plant's (`switch_timer`'s, stopped by every elimination branch) stays silent.
  it("LATER 145: a pickup's and a drop's cues play in a decided round; a plant's does not", () => {
    const steps = (s: string) => ({ seal: { 0: [{ sound: s, slot: false }] }, terrorist: { 0: [{ sound: s, slot: false }] } });
    const bomb = { pickup: steps('^PICK'), drop: steps('^DROP'), planted: steps('^PLANT'), defused: { seal: {}, terrorist: {} }, detonated: { seal: {}, terrorist: {} } };
    const p = hostagePage(true, { ...CUES, bomb } as unknown as RoundCues);
    p.server({ type: 'eliminated', winner: 'seal' });
    const p0 = p.plays.length;
    p.audio.bomb('pickup', 'seal', 'seal');
    p.audio.bomb('drop', 'seal', 'seal');
    p.audio.bomb('planted', 'seal', 'seal');
    expect(p.plays.slice(p0)).toEqual(['0 voice ^PICK', '0 voice ^DROP']);
  });

  it("hostageMarks gives the HUD a ret_hostage on each living hostage until its first 0x11 (a HOLD inside the fade keeps it off) and a ret_extraction at each kind-1 zone's centre; a new round shows them again", () => {
    const { net, server, state } = hostagePage();
    const sub = {
      index: 0, name: 'BaseMap', id: 0, flags: 0, min: [0, 0, 0], max: [2000, 0, 2000], cellsX: 200, cellsZ: 200, cellSize: [10, 10],
      param: 0.5, stamp: 0, rows: Array.from({ length: 200 }, (_, z) => ({ x0: 0, x1: 200, first: z * 200 })), cells: new Uint32Array(200 * 200), cellsB: new Uint32Array(0),
      points: [], markers: [], links: [], spawns: [], lines: [], zones: [{ name: 'Safety', corner: { map: 0, x: 6, z: 76 }, width: 8, height: 15, kind: 1 }],
    };
    const ai = { version: 2, maps: [sub], links: { words: 0, records: 0 }, spawns: [] } as unknown as AiMaps;
    const kinds = () => net.hostageMarks(ai).map((m) => `${m.bitmap}@${m.x},${m.z}`);
    expect(kinds()).toEqual(['ret_hostage.tif@0,50', 'ret_hostage.tif@100,50', 'ret_hostage.tif@200,50', 'ret_extraction.tif@105,835']);
    state(240, 0x11, 2);
    state(240, 0x17);                                                         // HOLD inside the fade: the anchor stays freed
    server({ type: 'kill', killer: 3, victim: 241, weapon: 'AK-47', how: 'weapon', clip: null, cause: 5, voiced: true, victimKind: 'hostage' });
    expect(kinds()).toEqual(['ret_hostage.tif@200,50', 'ret_extraction.tif@105,835']);
    server({ type: 'roundStart', round: 2, seconds: 360, wins: { seal: 1, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
    for (const id of [240, 241, 242]) server({ type: 'hostageState', id, alive: true, ai: 0x17, leader: null, rescuer: null, opacity: 1, unit: 17 });
    expect(kinds()).toHaveLength(4);
    expect(net.hostageMarks(undefined).filter((m) => m.bitmap === 'ret_extraction.tif')).toEqual([]);
  });
});

/**
 * NU-4 D1 (research 317 R317.8, §3, §5 D1): the page's drops go when the room's do -- `ENGINE_READ_S` after the result,
 * once a result. The page learns it by its own reckoning, no wire event: it already counts the round screens from the
 * `roundOver` (or a joiner's `join.result`) plus `ENGINE_READ_S` (`roundScreen`, `nextRoundIn`), and the room sweeps
 * `ENGINE_READ_S` x `TICK_HZ` after the tick it sent that `roundOver` on (`lastResult.at`) -- the original's client
 * sweeps likewise on the host's state's arrival (`FUN_002aa490` D:L151127-151131), one latency after the host.
 */
describe('NU-4 D1: the page sweeps its drops ENGINE_READ_S after the roundOver, as the room does (research 317 R317.8)', () => {
  const drop = (did: number): DropWire => ({ did, kind: 'weapon', item: HELD_RIFLE.id, at: [1, 2, 3], yaw: 0, from: 2 });
  const result = (matchOver: boolean) => ({
    round: 1, winner: 'seal' as const, wins: { seal: 1, terrorist: 0 }, matchOver,
    screens: matchOver
      ? [{ screen: 'finalRound' as const, seconds: FINAL_ROUND_S }, { screen: 'gameComplete' as const, seconds: GAME_COMPLETE_S }]
      : [{ screen: 'roundComplete' as const, seconds: ROUND_COMPLETE_S }],
  });

  it("the drops emptied once at ENGINE_READ_S after each roundOver -- not before, not again through the screens (FINAL ROUND, GAME COMPLETE), not after the next round starts; a joiner's standing result is reckoned the same", () => {
    let now = 1000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      const { net, server } = page();
      const deps = (net as unknown as { deps: NetPageDeps }).deps;
      const seen: unknown[][] = [];
      deps.drops = {
        place: (d) => { seen.push(['place', d.did]); },
        remove: (did) => { seen.push(['remove', did]); },
        replaceAll: (all) => { seen.push(['replaceAll', all.map((d) => d.did)]); },
      };
      // NET-RES-2d (NET-RES.R9): a live room speaks every tick (a snapshot each 33 ms, a pong each 2 s), so the
      // fake one speaks before each frame -- the link watch's 10 s bound kept.
      const frame = (): void => { server({ type: 'pong', t: now, tick: 0 } as ServerEvent); net.frame(1 / 60, {} as never, false); };
      const sweeps = (): number => seen.filter((s) => s[0] === 'replaceAll' && (s[1] as number[]).length === 0).length;
      server({ type: 'drop', ...drop(0) } as ServerEvent);
      server({ type: 'roundOver', ...result(false) } as ServerEvent);
      now += ENGINE_READ_S * 1000 - 1; frame();
      expect(seen).toEqual([['place', 0]]);                      // a millisecond short: still lying
      now += 1; frame();
      expect(seen).toEqual([['place', 0], ['replaceAll', []]]);   // the room's moment: emptied
      for (let i = 0; i < 10; i++) { now += 500; frame(); }
      expect(sweeps()).toBe(1);                                  // once
      server({ type: 'roundStart', round: 2, seconds: 360, wins: { seal: 1, terrorist: 0 }, rounds: 11, epoch: 2, startTick: 0 });
      server({ type: 'drop', ...drop(0) } as ServerEvent);
      for (let i = 0; i < 10; i++) { now += 1000; frame(); }
      expect(sweeps()).toBe(1);                                  // a round in play: no screens, no sweep
      // A match's last round: FINAL ROUND and GAME COMPLETE, one sweep at ENGINE_READ_S.
      server({ type: 'roundOver', ...result(true) } as ServerEvent);
      now += ENGINE_READ_S * 1000; frame();
      expect(sweeps()).toBe(2);
      for (let t = 0; t < FINAL_ROUND_S + GAME_COMPLETE_S + 10; t++) { now += 1000; frame(); }
      expect(sweeps()).toBe(2);
      // A joiner's standing result 2 s old (`applyJoinState`'s clock): its drops laid, swept 1 s later.
      const tick = 600;
      server({
        type: 'welcome', id: 1, version: 9, map: 'MP2', tick, role: 'player', team: 'seal', queue: 0, name: 'Tester',
        players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
        join: { v: JOIN_STATE_VERSION, result: { ...result(false), at: tick - 2 * TICK_HZ }, projectiles: [], corpses: [], ghosts: [], drops: [drop(3)] },
      } as ServerEvent);
      expect(seen.at(-1)).toEqual(['replaceAll', [3]]);
      now += 1000 - 1; frame();
      expect(sweeps()).toBe(2);
      now += 1; frame();
      expect(sweeps()).toBe(3);
      expect(seen.at(-1)).toEqual(['replaceAll', []]);
    } finally {
      clock.mockRestore();
    }
  });
});

/**
 * ROUND_END_EFFECTS_READING (research 283 §9-§10, the review's fold): the effects playing stop at the engine's read --
 * `ENGINE_READ_S` after the `roundOver`, before the round screen -- as the original's round end runs `FUN_002aa910`
 * 3 s after the result (`FUN_002a9b30` D:L150617-150670), on the page's own reckoning of that moment (`sweepDrops`').
 * The `roundStart`/`abandoned` clear stays the backstop (`./matchThrow` `roundStart`).
 */
describe('ROUND_END_EFFECTS_READING: the page stops its effects ENGINE_READ_S after the roundOver, once a result', () => {
  it('not a millisecond before; once at ENGINE_READ_S; not again through the screens; once more at the next result', () => {
    let now = 1000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      const { net, server } = page();
      const deps = (net as unknown as { deps: NetPageDeps }).deps;
      let cleared = 0;
      deps.roundEndEffects = () => { cleared++; };
      const frame = (): void => { server({ type: 'pong', t: now, tick: 0 } as ServerEvent); net.frame(1 / 60, {} as never, false); };
      const result = { round: 1, winner: 'seal' as const, wins: { seal: 1, terrorist: 0 }, matchOver: false,
        screens: [{ screen: 'roundComplete' as const, seconds: ROUND_COMPLETE_S }] };
      for (let i = 0; i < 5; i++) { now += 1000; frame(); }
      expect(cleared).toBe(0);                                   // a round in play: nothing
      server({ type: 'roundOver', ...result } as ServerEvent);
      now += ENGINE_READ_S * 1000 - 1; frame();
      expect(cleared).toBe(0);                                   // a millisecond short: still pouring
      now += 1; frame();
      expect(cleared).toBe(1);                                   // the engine's read: stopped
      for (let i = 0; i < 10; i++) { now += 500; frame(); }
      expect(cleared).toBe(1);                                   // once
      server({ type: 'roundStart', round: 2, seconds: 360, wins: { seal: 1, terrorist: 0 }, rounds: 11, epoch: 2, startTick: 0 });
      server({ type: 'roundOver', ...result, round: 2 } as ServerEvent);
      now += ENGINE_READ_S * 1000; frame();
      expect(cleared).toBe(2);
    } finally {
      clock.mockRestore();
    }
  });
});

/**
 * PAR-94c (issue #262; reading, pending review): the round start's banner is the round's. The original posts "STARTING
 * ROUND %d OF %d" in the HUD's round reset `FUN_001fb420` (D:L57632-57648), called by `FUN_002a7d40` (D:L149755-149758;
 * itself called from the level's init `FUN_001ec480` D:L50946 and an MP state D:L75935) and directly by `FUN_001ecb10`
 * (D:L51046-51052) -- posted at a round's or a level's (re)start, never at a show (research 87 §8, research 166 R166.2);
 * the HUD's show, `FUN_001f7a90` (D:L56366-56447), shows its parts and posts nothing, restarts no clock. Since PAR-94
 * B2/B3 a page's HUD comes on at the
 * room's spawn of the page, and in a room still in its launch countdown that is the waiting room's spawn, before any
 * round: the HUD shown there draws no round banner and keeps the countdown's line; the banner plays once, at the room's
 * `roundStart` (`NetPage.roundBanner` -> `Hud.startRound`), and a later show of the HUD does not play it again.
 */
describe('PAR-94c: the round start at the round\'s start, not at the waiting room\'s spawn (issue #262)', () => {
  /** A page whose welcome seats it in the room's launch countdown (`countdown`, the owner's 2026-10-01), on `hud`. */
  function countdownPage(hud: Hud) {
    let socket: WebSocketLike | null = null;
    const walk = {
      setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
      setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
      mode: () => 'walk',
    } as unknown as WalkMode;
    const remote = { setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined } as unknown as RemotePlayers;
    const deps: NetPageDeps = {
      walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
      respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
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
      players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, countdown: 10, env: { revision: 0, epoch: 0, states: [] },
    } as ServerEvent);
    return { net, server };
  }
  const lines = (hud: Hud): string[] => hud.state().model.banner.map((m) => m.lines.map((l) => l.text).join('/'));
  /** The page's frames for `seconds` (the HUD's `step`, as `render` calls it), each frame's lines. */
  const frames = (hud: Hud, seconds: number): string[][] => {
    const seen: string[][] = [];
    for (let i = 0; i < Math.round(seconds * 10); i++) { hud.step(0.1); seen.push(lines(hud)); }
    return seen;
  };
  const STARTING = 'STARTING ROUND 1 OF 11';
  const startings = (seen: string[][]): number => seen.filter((l) => l.includes(STARTING)).length;

  function play(hud: Hud): void {
    const { server } = countdownPage(hud);
    expect(lines(hud)).toEqual([]);                                     // posted, not yet drawn: the HUD is off
    frames(hud, 1);                                                     // the page's frames before the room's spawn
    server({ type: 'spawn', id: 1, at: [0, 0, 0], yaw: 0, after: 0 });  // the waiting room's spawn of the page
    hud.setVisible(true);                                               // PAR-94 B2/B3: the HUD comes on at it
    const waiting = frames(hud, 3);
    expect(waiting.at(-1)).toContain(countdownLine(10));                // the countdown's line kept, 3 s old
    expect(startings(waiting)).toBe(0);                                 // no round banner in the countdown
    // The room launches (`room.ts` `startRound(true)`): its `roundStart` is the round's start on the page.
    server({ type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
    const round = frames(hud, 9);
    expect(round[2]).not.toContain(STARTING);                           // 0.3 s: not yet posted (0.36 s)
    expect(round[5]).toContain(STARTING);                               // 0.6 s: in
    expect(round.at(-1)).not.toContain(STARTING);                       // 9 s: gone (7 s and its fade out)
    // A later show of the HUD (hidden and shown again inside the round) plays no round start of its own.
    hud.setVisible(false); frames(hud, 1); hud.setVisible(true);
    expect(startings(frames(hud, 3))).toBe(0);
  }

  it('the match page\'s HUD (`mountMatch`: a new HUD, on at the seat\'s spawn): no banner in the countdown, the countdown\'s line drawn; the banner at the roundStart only', () => {
    play(new Hud());
  });

  it('the test room\'s HUD (`/testroom`: the free walk drawn before the room, hidden at the connect): the same -- the countdown\'s line not lost to the walk\'s clock', () => {
    const hud = new Hud();
    hud.setVisible(true);
    frames(hud, 30);                                                    // the free walk, before going online
    hud.setVisible(false);                                              // `connectNet`: the new room has spawned nobody
    play(hud);
  });
});

/**
 * PAR-94d row 2 (research 322 D7; reading, pending review): a spectator's page starts the round too. The round's HUD
 * reset `FUN_001fb420` posts "STARTING ROUND %d OF %d" under the network flag and the game object alone
 * (D:L57632-57649), testing no seat; it runs on every console online -- from CoreState's Init through `FUN_002a7d40`
 * (D:L50946, unconditional; D:L149755-149758 under the network flag) and from `CMPExitState`'s round start (D:L75935),
 * which a client pushes on the game state alone (D:L151127-151134). So a spectator draws the banner once at each
 * round's start, and none in a room no round has started in. Was: `roundBanner` was the players' (PAR-48), the
 * spectator's view drawing the banner off the HUD's own clock instead.
 */
describe("PAR-94d: a spectator's page starts the round (research 322 D7)", () => {
  /** A spectator's page, welcomed into a room in `phase`, on `hud`. */
  function spectatorPage(hud: Hud, phase: 'waiting' | 'play') {
    let socket: WebSocketLike | null = null;
    const walk = {
      setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
      setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
      mode: () => 'fly',
    } as unknown as WalkMode;
    const remote = { setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined } as unknown as RemotePlayers;
    const deps: NetPageDeps = {
      walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
      respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
      socket: () => {
        socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
        return socket;
      },
    };
    const net = new NetPage(deps, 'ws://test/ws', 'MP2', 'Watcher', undefined, false, 'classic');
    socket!.onopen?.({} as Event);
    const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
    server({
      type: 'welcome', id: 9, version: 9, map: 'MP2', tick: 0, role: 'spectator', team: null, queue: 0, name: 'Watcher',
      players: [], rules: 'classic', round: 2, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
      phase, ...(phase === 'play' ? { startTick: 0 } : {}),
    } as ServerEvent);
    hud.setSpectator({ path: 'spectator', followed: null, stats: null });   // the frame's `spectatorHudView` (PAR-48)
    return { net, server };
  }
  const lines = (hud: Hud): string[] => hud.state().model.banner.map((m) => m.lines.map((l) => l.text).join('/'));
  const frames = (hud: Hud, seconds: number): string[][] => {
    const seen: string[][] = [];
    for (let i = 0; i < Math.round(seconds * 10); i++) { hud.step(0.1); seen.push(lines(hud)); }
    return seen;
  };
  /** How many separate runs of frames draw `text`. */
  const runs = (seen: string[][], text: string): number => {
    const on = seen.map((l) => l.includes(text));
    return on.filter((x, i) => x && !on[i - 1]).length;
  };

  it('a spectator in a room no round has started in draws no banner; at the room\'s roundStart, the round\'s banner once', () => {
    const hud = new Hud();
    const { server } = spectatorPage(hud, 'waiting');
    expect(runs(frames(hud, 3), 'STARTING ROUND')).toBe(0);
    server({ type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
    const round = frames(hud, 9);
    expect(round[5]).toContain('STARTING ROUND 1 OF 11');              // 0.6 s: in
    expect(runs(round, 'STARTING ROUND 1 OF 11')).toBe(1);
    expect(round.at(-1)).not.toContain('STARTING ROUND 1 OF 11');
    server({ type: 'roundStart', round: 2, seconds: 360, wins: { seal: 1, terrorist: 0 }, rounds: 11, epoch: 2, startTick: 0 });
    expect(runs(frames(hud, 9), 'STARTING ROUND 2 OF 11')).toBe(1);
  });

  it("a spectator welcomed into a round under way starts it as the level's init does (FUN_002a7d40 from D:L50946): the room's round", () => {
    const hud = new Hud();
    spectatorPage(hud, 'play');
    const seen = frames(hud, 9);
    expect(seen[5]).toContain('STARTING ROUND 2 OF 11');               // the room's round, not DEFAULT_ROUND's 1
    expect(runs(seen, 'STARTING ROUND 2 OF 11')).toBe(1);
    expect(seen.flat().filter((t) => t.startsWith('STARTING ROUND') && t !== 'STARTING ROUND 2 OF 11')).toEqual([]);
  });
});

/**
 * PAR-94d (the online seat's check 3): the replay's watcher at the recording's `roundStart`s. `roundStart` now starts a
 * spectator's round, the watcher's included (RE-3: what it draws is what the recorded room sent its spectators). A seek
 * lands as a joiner lands -- the fold tells the target's state in a welcome, a score and the seats' pairs
 * (`ReplayClient.seekTo`, `./fold` `foldedJoin`), never the `roundStart`s it skipped -- and the watcher's welcome posts
 * no banner (the welcome branch's `replayClock` guard): a seek draws no burst of banners, only play through a round's
 * start draws its one. REPLAY_ADAPTATION: the original plays no recording back; its spectator sees a round's banner at
 * that round's start only (`FUN_001fb420` D:L57632-57649), never one for a round it was not present at.
 */
describe("PAR-94d: the replay's watcher -- a banner at a round's start played, none for the rounds a seek skips", () => {
  const roundStart = (round: number, tick: number): ServerEvent => ({ type: 'roundStart', round, seconds: 600, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: round, startTick: tick });
  function records(): ReplayRecord[] {
    const out: ReplayRecord[] = [{ kind: 'header', header: header() }];
    const starts = new Map([[30, 1], [600, 2], [1200, 3]]);
    for (let tick = 0; tick <= 1500; tick++) {
      if (tick === 0) out.push({ kind: 'players', tick, players: [ALPHA, BRAVO] });
      const r = starts.get(tick);
      if (r !== undefined) out.push({ kind: 'event', tick, event: roundStart(r, tick) });
      if (tick % 2 === 0) out.push({ kind: 'snap', tick, bodies: [body(1, tick), body(2, -tick)] });
    }
    out.push({ kind: 'end', tick: 1500, reason: 'closed' });
    return out;
  }
  async function watcher() {
    let now = 0;
    const replay = new ReplayClient(Promise.resolve({ header: header(), records: records(), truncated: false }), { name: 'Watcher', map: 'MP2', now: () => now });
    const hud = new Hud();
    const walk = {
      setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setTrigger: () => undefined,
      setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'fly', setFlinchPose: () => undefined,
    } as unknown as WalkMode;
    const remote = {
      setTeam: () => undefined, setType: () => undefined, setKit: () => undefined, forget: () => undefined, died: () => undefined,
      clear: () => undefined, frame: () => undefined, bodies: () => [], flinch: () => undefined, setEscortee: () => undefined, setOpacity: () => undefined,
    } as unknown as RemotePlayers;
    const deps: NetPageDeps = {
      walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
      respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
      client: () => asNetClient(replay),
    };
    const net = new NetPage(deps, 'replay:', 'MP2', 'Watcher', undefined, true, 'classic');
    await replay.ready;
    hud.setSpectator({ path: 'spectator', followed: null, stats: null });
    /** `seconds` of the wall at 10 frames a second: the records pumped, the HUD stepped; each frame's banner texts. */
    const play = (seconds: number): string[][] => {
      const seen: string[][] = [];
      for (let i = 0; i < Math.round(seconds * 10); i++) {
        now += 100; replay.advance(); hud.step(0.1);
        seen.push(hud.state().model.banner.map((m) => m.lines.map((l) => l.text).join('/')));
      }
      return seen;
    };
    return { replay, hud, net, play };
  }
  const runs = (seen: string[][], text: string): number => {
    const on = seen.map((l) => l.some((t) => t.includes(text)));
    return on.filter((x, i) => x && !on[i - 1]).length;
  };

  it("play through round 1's start: its banner once; a seek over rounds 2 and 3 posts none of them; play through no round's start, none", async () => {
    const w = await watcher();
    const opened = w.hud.roundStarts();
    const first = w.play(9);                                             // to tick 540: round 1's start (30) and its banner's 7.36 s
    expect(w.hud.roundStarts()).toBe(opened + 1);
    expect(runs(first, 'STARTING ROUND 1 OF 11')).toBe(1);
    expect(first.at(-1)).toEqual([]);
    w.replay.seek(1300);                                                 // past round 2's (600) and round 3's (1200)
    expect(w.hud.roundStarts()).toBe(opened + 1);                        // no burst: the skipped rounds' starts not told
    expect(runs(w.play(1), 'STARTING ROUND')).toBe(0);                   // and none drawn after the landing
    w.net.close();
  });

  it("a seek back before a round's start, then play through it: that round's banner once", async () => {
    const w = await watcher();
    w.play(18);                                                          // to tick 1080: round 2's start (600) and its banner gone
    const before = w.hud.roundStarts();
    w.replay.seek(560);
    expect(w.hud.roundStarts()).toBe(before);
    const again = w.play(2);                                             // through tick 600
    expect(w.hud.roundStarts()).toBe(before + 1);
    expect(runs(again, 'STARTING ROUND 2 OF 11')).toBe(1);
    w.net.close();
  });
});

/**
 * PAR-94d (the online seat's check 1): a spectator handed on from the game lobby (LATE-WATCH's late watcher,
 * `frontEndMatch.test.ts`). The welcome's round is the room's at the welcome; a `roundStart` the lobby heard after it is
 * handed on and replayed after the welcome (`GameLobbyHost`'s hand-off), so the round's banner is that round's.
 */
describe('PAR-94d: a spectator handed on from the game lobby -- the banner is the round handed on', () => {
  function handedOn(events: ServerEvent[]): string[][] {
    let socket: WebSocketLike | null = null;
    const hud = new Hud();
    const walk = {
      setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
      setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'fly',
    } as unknown as WalkMode;
    const remote = { setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined } as unknown as RemotePlayers;
    const deps: NetPageDeps = {
      walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
      respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
      socket: () => {
        socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
        return socket;
      },
    };
    new NetPage(deps, 'ws://test/ws', 'MP2', 'Watcher', undefined, true, 'classic');
    socket!.onopen?.({} as Event);
    for (const ev of events) socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent);
    hud.setSpectator({ path: 'spectator', followed: null, stats: null });
    const seen: string[][] = [];
    for (let i = 0; i < 90; i++) { hud.step(0.1); seen.push(hud.state().model.banner.map((m) => m.lines.map((l) => l.text).join('/'))); }
    return seen;
  }
  const welcome = (phase: 'play' | 'over'): ServerEvent => ({
    type: 'welcome', id: 2, version: 9, map: 'MP2', tick: 0, queue: 0, name: 'socomc', players: [], rules: 'classic', round: 1, rounds: 11,
    role: 'spectator', team: null, phase, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
  } as unknown as ServerEvent);
  const shownRuns = (seen: string[][], text: string): number => seen.filter((l, i) => l.includes(text) && !seen[i - 1]?.includes(text)).length;

  it("the welcome (round 1) then round 2's roundStart handed on: round 2's banner, not round 1's", () => {
    const seen = handedOn([welcome('play'), { type: 'roundStart', round: 2, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 2, startTick: 0 }]);
    expect(shownRuns(seen, 'STARTING ROUND 2 OF 11')).toBe(1);
    expect(shownRuns(seen, 'STARTING ROUND 1 OF 11')).toBe(0);
  });

  it("a welcome in 'over' (the room's last round, its game decided): that round's banner, as the level's init posts one (D:L50946)", () => {
    expect(shownRuns(handedOn([welcome('over')]), 'STARTING ROUND 1 OF 11')).toBe(1);
  });
});
