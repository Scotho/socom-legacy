// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Hud, spectatorHudView } from '../src/hud';
import { deadHelpLines } from '../src/weaponSelect';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import { PROTOCOL_VERSION, type Rules, type ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';

/**
 * The page in a match, by its rules: the round-start banner driven from the server's round (`FUN_001fb420`), the
 * classic round's messages and the dead's follow camera. A fake socket stands in for the server.
 */

/** Frostfire's objective lines (MP2 `objectives` `start`: WAIT 5, the raw names by `player_team`), as the page reads them with its cues. */
const FROSTFIRE_OBJECTIVE = {
  0: [{ text: 'OBJECTIVE:', locId: null, scale: 0.9, waitBefore: 5 }, { text: 'ELIMINATE THE TERRORISTS', locId: null, scale: 0.7, waitBefore: 0 }],
  8: [{ text: 'OBJECTIVE:', locId: null, scale: 0.9, waitBefore: 5 }, { text: 'ELIMINATE THE SEALS', locId: null, scale: 0.7, waitBefore: 0 }],
};

function page(rules: Rules, solo = false, extra: Partial<NetPageDeps> = {}) {
  const sent: string[] = [];
  let socket: WebSocketLike | null = null;
  const hud = new Hud();
  hud.setVisible(true);
  const modes: string[] = [];
  const poses: ({ x: number } | null)[] = [];
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: (m: string) => { modes.push(m); return true; },
    mode: () => 'walk',
  } as unknown as WalkMode;
  const bodies: { id: number; flags: number; feet: [number, number, number]; yaw: number }[] = [];
  const kits = new Map<number, number[]>();
  const types = new Map<number, number>();
  const remote = {
    setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined,
    setKit: (id: number, kit: number[]) => { kits.set(id, kit); }, setType: (id: number, type: number) => { types.set(id, type); },
  } as unknown as RemotePlayers;
  const respawns: number[] = [];
  const kitsSpawned: (readonly number[] | null)[] = [];
  const charsSpawned: (number | null)[] = [];
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: (p) => { poses.push(p); },
    respawned: (kit, char) => { respawns.push(respawns.length + 1); kitsSpawned.push(kit ?? null); charsSpawned.push(char ?? null); },
    roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM], objective: () => FROSTFIRE_OBJECTIVE,
    socket: () => {
      socket = { binaryType: '', readyState: 1, send: (d: string | Uint8Array) => { if (typeof d === 'string') sent.push(d); }, close: () => undefined } as unknown as WebSocketLike;
      return socket;
    },
  };
  const net = new NetPage({ ...deps, ...(solo ? { solo } : {}), ...extra }, 'ws://test/ws', 'MP2', 'Tester', undefined, false, rules);
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  // The client reads the bodies from its snapshots; the tests hand them in directly.
  (net.client as unknown as { bodies: () => unknown[] }).bodies = () => bodies;
  const banner = (): string[] => hud.state().model.banner.map((b) => b.lines.map((l) => l.text).join('/'));
  const welcome = (over: Partial<Extract<ServerEvent, { type: 'welcome' }>> = {}): void => server({
    type: 'welcome', id: 1, version: 4, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
    players: [], rules, round: 1, rounds: rules === 'respawn' ? 1 : 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] }, ...over,
  });
  const requests = (): unknown[] => sent.map((d) => JSON.parse(d) as { type: string }).filter((e) => e.type === 'loadout');
  const hello = (): Record<string, unknown> => JSON.parse(sent[0]!) as Record<string, unknown>;
  return { net, hud, sent, server, banner, welcome, bodies, modes, poses, respawns, kitsSpawned, charsSpawned, kits, types, requests, hello };
}

describe('the round-start banner online (FUN_001fb420 L57633-57648)', () => {
  it('the hello names the rules', () => {
    const { sent } = page('classic');
    expect(JSON.parse(sent[0]!)).toMatchObject({ type: 'hello', version: PROTOCOL_VERSION, map: 'MP2', rules: 'classic' });
  });

  it('respawn reads the server-carried one-round count at the join and at each match (research 348 §1)', () => {
    const { hud, server, banner, welcome } = page('respawn');
    hud.step(20);
    welcome();
    hud.step(1);
    expect(banner()).toEqual(['STARTING ROUND 1 OF 1']);
    hud.step(20);
    server({ type: 'roundStart', round: 1, seconds: 1200, wins: { seal: 0, terrorist: 0 }, rounds: 1, epoch: 1, startTick: 0 });
    hud.step(6);
    expect(banner()).toEqual(['STARTING ROUND 1 OF 1', 'OBJECTIVE:/ELIMINATE THE TERRORISTS']);
    // The count is received room data, including an explicit instrument's override; no respawn-only label branch.
    hud.step(20);
    server({ type: 'roundStart', round: 1, seconds: 2, wins: { seal: 0, terrorist: 0 }, rounds: 3, epoch: 2, startTick: 0 });
    hud.step(1);
    expect(banner()).toEqual(['STARTING ROUND 1 OF 3']);
    welcome({ rounds: 5 });
    hud.step(1);
    expect(banner()).toEqual(['STARTING ROUND 1 OF 5']);
  });

  it('classic shows the true round of 11, then PLAYING TIEBREAKER ROUND; the objective by side', () => {
    const { hud, server, banner, welcome } = page('classic');
    welcome({ team: 'terrorist' });
    hud.step(20);
    server({ type: 'roundStart', round: 3, seconds: 360, wins: { seal: 1, terrorist: 1 }, rounds: 11, epoch: 3, startTick: 0 });
    hud.step(6);
    expect(banner()).toEqual(['STARTING ROUND 3 OF 11', 'OBJECTIVE:/ELIMINATE THE SEALS']);
    hud.step(20);
    server({ type: 'roundStart', round: 12, seconds: 360, wins: { seal: 5, terrorist: 5 }, rounds: 11, epoch: 12, startTick: 0 });
    hud.step(1);
    expect(banner()).toEqual(['PLAYING TIEBREAKER ROUND']);
  });

  it('GHOST-BANNER (LATER 81): a ghost welcomed into a running round gets the round\'s banner, beside the game\'s ghost lines as WEAPON EXCHANGE\'s prompt (not the message window)', () => {
    // Research 322 section 5.2 (reading, pending review): the late console's load state makes the ghost first
    // (`FUN_001f5e70` D:L55680-55681 -> `FUN_002b7d60` D:L158633-158638), then CoreState's init posts the round's banner,
    // no seat tested (`FUN_001ec480` D:L50946 -> `FUN_002a7d40` D:L149758 -> `FUN_001fb420` D:L57632-57649); the ghost's
    // own view keeps the message window shown (`FUN_001f97b0` D:L57112 -> `FUN_001f7a90` D:L56423), its lines the help
    // lines (D:L57049-57060). Was: no banner (the pin of 2026-09-29, kept through S1g and NU-11; no source read).
    const { net, hud, banner, welcome } = page('classic');
    hud.step(20);
    welcome({ ghost: true, round: 3 });
    hud.step(1);
    expect(banner()).toEqual(['STARTING ROUND 3 OF 11']);
    expect(net.prompt()).toMatchObject({ ghost: true });
    expect(net.gate()).toEqual({ inMatch: true, alive: false, cameraOnSelf: true, spectator: false });
  });

  it("LATER 85 (the review's F1): a round's start that names the seat in `ghosts` (its console still loading, no body) keeps it a ghost; one that does not -- a room sending none, as before -- clears it", () => {
    // research 322 section 5.3: a late classic seat has no body until its console's load; the room's start passes it by and
    // names it (`roundStart.ghosts`), and the hand-off replays that start after the welcome.
    const start = (round: number, ghosts?: number[]): Extract<ServerEvent, { type: 'roundStart' }> => ({
      type: 'roundStart', round, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: round, startTick: 0, ...(ghosts ? { ghosts } : {}),
    });
    const a = page('classic');
    a.welcome({ ghost: true, round: 1 });
    a.server(start(2, [1, 4]));
    expect(a.net.prompt(), 'named: still a ghost').toMatchObject({ ghost: true });
    expect(a.net.gate().alive).toBe(false);
    a.server(start(3, [4]));
    expect(a.net.prompt(), 'another seat named: this one cleared, as before').toBeNull();
    // The launch's load hold: welcomed not a ghost, round 1's start passing it by -- a ghost of round 1.
    const b = page('classic');
    b.welcome({ ghost: false, round: 1 });
    b.server(start(1, [1]));
    expect(b.net.prompt()).toMatchObject({ ghost: true });
    // A room that sends no `ghosts` (the reverse order: a newer page, an older room): every start clears, exactly as today.
    const c = page('classic');
    c.welcome({ ghost: true, round: 1 });
    c.server(start(2));
    expect(c.net.prompt()).toBeNull();
  });

  it("PAR-48b: a ghost's HUD through the page, as both pages read it (`spectatorHudView(net, walk)`): 'own', then the teammate it cycles to, then none at the round", () => {
    // research 282 §7: the ghost is the dispatch's not-alive seat (FUN_001f7ff0 D:L56564, D:L56589-56595); its lines on
    // its own object (FUN_001f97b0 D:L57048-57060) and on a teammate (FUN_001f9f20 D:L57162-57165). The bench decides it (this
    // stand-in walk is alive; since NU-11b F1 the page makes a ghost's walk dead from its seat, nu11GhostWalk.test.ts).
    const walk = { mode: () => 'walk', isDead: () => false };
    const { net, server, welcome, bodies } = page('classic');
    welcome({ ghost: true });
    // LATER 118: a ghost's view carries the ghost's six help lines (`NetPage.ghost()`; research 282 §8).
    expect(spectatorHudView(net, walk)).toEqual({ path: 'own', followed: null, stats: null, help: deadHelpLines({ ghost: true, watching: false, device: 'pad' }) });
    server({ type: 'joined', id: 2, name: 'Mate', team: 'seal' });
    bodies.push({ id: 2, flags: 64, feet: [100, 0, 0], yaw: 0 });
    globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));    // the ghost cycles (deadCycleRuns)
    net.frame(0.016, {} as never, false);
    expect(spectatorHudView(net, walk)).toEqual({ path: 'teammate', followed: { name: 'Mate', health: null }, stats: null, help: deadHelpLines({ ghost: true, watching: true, device: 'pad' }) });
    server({ type: 'roundStart', round: 2, seconds: 360, wins: { seal: 0, terrorist: 1 }, rounds: 11, epoch: 2, startTick: 0 });
    expect(spectatorHudView(net, walk)).toBeNull();
    net.close();
    // Promoted from the line into a classic round in play (protocol 5, PL-8): the same ghost.
    const promoted = page('classic');
    promoted.welcome({ role: 'spectator', team: undefined, queue: 1 });
    promoted.server({ type: 'promoted', team: 'seal', ghost: true } as ServerEvent);
    expect(spectatorHudView(promoted.net, walk)).toEqual({ path: 'own', followed: null, stats: null, help: deadHelpLines({ ghost: true, watching: false, device: 'pad' }) });
    promoted.net.close();
  });
});

describe('the classic round on the page', () => {
  it('posts the elimination lines', () => {
    const { hud, server, banner, welcome } = page('classic');
    welcome();
    hud.step(20);
    server({ type: 'eliminated', winner: 'seal' });
    hud.step(0.5);
    expect(banner()).toEqual(['ALL TERRORISTS ELIMINATED/SEALS VICTORIOUS!']);
  });

  it('dead: the game\'s lines, never the respawn prompt; Space follows the living teammates only', () => {
    const { net, hud, server, banner, welcome, bodies, modes, poses } = page('classic');
    welcome();
    server({ type: 'joined', id: 2, name: 'Mate', team: 'seal' });
    server({ type: 'joined', id: 3, name: 'Foe', team: 'terrorist' });
    server({ type: 'joined', id: 4, name: 'Down', team: 'seal' });
    bodies.push({ id: 2, flags: 64, feet: [100, 0, 0], yaw: 0 }, { id: 3, flags: 64, feet: [300, 0, 0], yaw: 0 }, { id: 4, flags: 0, feet: [500, 0, 0], yaw: 0 });
    hud.step(20);
    server({ type: 'kill', killer: 3, victim: 1, weapon: '552', how: 'weapon', clip: null });
    hud.step(6);
    const lines = banner();
    // The dead's lines are WEAPON EXCHANGE's prompt (`promptLines`, drawn by the page's overlay), never posted as well.
    expect(lines.some((l) => l.includes('You have died'))).toBe(false);
    expect(net.prompt()).toMatchObject({ ghost: false });
    expect(net.gate()).toEqual({ inMatch: true, alive: false, cameraOnSelf: true, spectator: false });
    expect(lines.some((l) => l.includes('respawn'))).toBe(false);
    globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    net.frame(0.016, {} as never, false);
    expect(modes).toContain('fly');
    expect(poses.at(-1)!.x).toBeCloseTo(100, 0);                // the living teammate, not the foe nor the dead one
    expect(net.prompt()).toBeNull();                           // the camera off oneself: no prompt, no menu (S6)
    expect(net.gate().cameraOnSelf).toBe(false);
    net.close();
  });

  it('DEAD_CYCLE_WHILE_MENU_READING: with WEAPON EXCHANGE open (HUD mode 1) Space cycles no teammate', () => {
    let open = true;
    const { net, server, welcome, bodies, modes } = page('classic', false, { menuOpen: () => open });
    welcome();
    server({ type: 'joined', id: 2, name: 'Mate', team: 'seal' });
    bodies.push({ id: 2, flags: 64, feet: [100, 0, 0], yaw: 0 });
    server({ type: 'kill', killer: 3, victim: 1, weapon: '552', how: 'weapon', clip: null });
    globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    expect(modes).not.toContain('fly');
    open = false;
    globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    expect(modes).toContain('fly');
    net.close();
  });
});

describe('protocol 9 on the page: the character types (web sprint 5 S2)', () => {
  it('the hello names the page\'s type for each side; without the dep it names none (the room\'s default)', () => {
    const typed = page('classic', false, { types: () => ({ seal: 2, terrorist: 1 }) });
    expect(typed.hello()).toMatchObject({ type: 'hello', version: PROTOCOL_VERSION, types: { seal: 2, terrorist: 1 } });
    const plain = page('classic');
    expect(plain.hello()).not.toHaveProperty('types');
    typed.net.close(); plain.net.close();
  });

  it('a loadout request names the type of the page\'s side; the answer hands on the type the room holds', () => {
    const answers: unknown[] = [];
    let types = { seal: 0, terrorist: 3 };
    const { net, server, welcome, requests } = page('classic', false, {
      types: () => types, loadoutAnswer: (_kit, _refused, _list, char) => { answers.push(char); },
    });
    welcome({ team: 'terrorist' });
    net.requestLoadout([]);
    expect(requests().at(-1)).toEqual({ type: 'loadout', picks: [], char: 3 });
    types = { seal: 0, terrorist: 1 };
    net.requestLoadout([{ slot: 0, id: 58 }]);
    expect(requests().at(-1)).toEqual({ type: 'loadout', picks: [{ slot: 0, id: 58 }], char: 1 });
    server({ type: 'loadout', kit: [58, 5, 121, 126, 255], refused: null, char: 1 });
    server({ type: 'loadout', kit: [58, 5, 121, 126, 255], refused: null });     // a room that names none
    expect(answers).toEqual([1, null]);
    net.close();
  });

  it('its own spawn hands on the type the room rebuilt it as; the others\' types reach their bodies before their kits', () => {
    const { net, server, welcome, charsSpawned, types } = page('classic');
    welcome({ players: [{ id: 2, name: 'Foe', team: 'terrorist', kit: [57, 5, 121, 126, 255], char: 2 }, { id: 3, name: 'Old', team: 'seal' }] });
    expect([...types]).toEqual([[2, 2]]);                                     // a player without one keeps the default
    server({ type: 'spawn', id: 1, at: [0, 0, 0], yaw: 0, after: 0, kit: [62, 15, 122, 126, 194], char: 3 });
    server({ type: 'spawn', id: 1, at: [0, 0, 0], yaw: 0, after: 0, kit: [62, 15, 122, 126, 194] });
    expect(charsSpawned).toEqual([3, null]);
    server({ type: 'spawn', id: 2, at: [0, 0, 0], yaw: 0, after: 0, kit: [58, 5, 121, 126, 255], char: 1 });
    expect(types.get(2)).toBe(1);
    net.close();
  });
});

describe('protocol 7 on the page: the loadout request, its answer, the kits the spawns carry, the shots by id', () => {
  it('sends the side\'s picks, takes the answer; after a reconnect\'s welcome the list goes again (a pick survives it)', () => {
    const picks = [{ slot: 0, id: 62 }];
    const answers: unknown[] = [];
    const { net, server, welcome, requests } = page('classic', false, {
      picks: () => picks, loadoutAnswer: (kit, refused, request) => { answers.push({ kit, refused, request }); },
    });
    welcome();                                                  // a (re)join as a player: the list is sent again
    expect(requests()).toEqual([{ type: 'loadout', picks }]);
    net.requestLoadout([...picks, { slot: 2, id: 122 }]);
    expect(requests().at(-1)).toEqual({ type: 'loadout', picks: [...picks, { slot: 2, id: 122 }] });
    server({ type: 'loadout', kit: [62, 15, 122, 126, 194], refused: null });
    server({ type: 'loadout', kit: [62, 15, 122, 126, 194], refused: { reason: 'refused', at: 1 } });
    // Each answer is handed the request it answers (in order): the welcome's re-send, then the confirm's.
    expect(answers).toEqual([
      { kit: [62, 15, 122, 126, 194], refused: null, request: { list: picks } },
      { kit: [62, 15, 122, 126, 194], refused: { reason: 'refused', at: 1 }, request: { list: [...picks, { slot: 2, id: 122 }] } },
    ]);
    net.close();
  });

  it('no picks yet: the welcome sends nothing; a spectator never asks', () => {
    const { net, welcome, requests } = page('classic', false, { picks: () => [] });
    welcome();
    expect(requests()).toEqual([]);
    const s = page('classic', false, { picks: () => [{ slot: 0, id: 62 }] });
    s.welcome({ role: 'spectator', team: null });
    s.net.requestLoadout([{ slot: 0, id: 62 }]);
    expect(s.requests()).toEqual([]);
    net.close(); s.net.close();
  });

  it('its own spawn hands on the room\'s kit; another\'s is that body\'s kit, as the welcome\'s players are', () => {
    const { net, server, welcome, kitsSpawned, kits } = page('classic');
    welcome({ players: [{ id: 2, name: 'Foe', team: 'terrorist', kit: [57, 5, 121, 126, 255] }] });
    expect(kits.get(2)).toEqual([57, 5, 121, 126, 255]);
    server({ type: 'spawn', id: 1, at: [0, 0, 0], yaw: 0, after: 0, kit: [62, 15, 122, 126, 194] });
    expect(kitsSpawned).toEqual([[62, 15, 122, 126, 194]]);
    server({ type: 'spawn', id: 2, at: [0, 0, 0], yaw: 0, after: 0, kit: [58, 5, 121, 126, 255] });
    expect(kits.get(2)).toEqual([58, 5, 121, 126, 255]);
    net.close();
  });

  it('another player\'s shot is drawn and heard by the record of the item it names', () => {
    const effects: string[] = [];
    const r552 = { ...HELD_RIFLE, name: '552', id: 57 };
    const { net, server, welcome } = page('classic', false, {
      roundEffects: (e) => { effects.push(e.weapon.name); },
      recordOf: (id) => (id === 57 ? r552 : null),
    });
    welcome();
    server({ type: 'joined', id: 2, name: 'Foe', team: 'terrorist' });
    server({ type: 'shot', id: 2, weapon: 57, from: [0, 0, 0], to: [1, 0, 0], normal: null, material: null });
    server({ type: 'shot', id: 2, weapon: 15, from: [0, 0, 0], to: [1, 0, 0], normal: null, material: null });
    expect(effects).toEqual(['552', HELD_SIDEARM.name]);       // an item without a record here: the side's slot that holds it
    net.close();
  });
});

describe('the kit of the page at a spawn (research 91 §4.3: FUN_00598b90 -> FUN_00599b60 -> FUN_00599f00)', () => {
  it('its own spawn refreshes the kit as the server does; another player spawn never; each round spawn again', () => {
    const { net, server, welcome, respawns } = page('classic');
    welcome();
    server({ type: 'kill', killer: 3, victim: 1, weapon: '552', how: 'weapon', clip: null });
    expect(respawns).toHaveLength(0);
    server({ type: 'spawn', id: 1, at: [0, 0, 0], yaw: 0, after: 0 });
    expect(respawns).toHaveLength(1);
    server({ type: 'spawn', id: 2, at: [10, 0, 0], yaw: 0, after: 0 });
    expect(respawns).toHaveLength(1);                           // another player's spawn is theirs
    server({ type: 'roundStart', round: 2, seconds: 360, wins: { seal: 1, terrorist: 0 }, rounds: 11, epoch: 2, startTick: 0 });
    server({ type: 'spawn', id: 1, at: [0, 0, 0], yaw: 0, after: 0 });
    expect(respawns).toHaveLength(2);                           // a classic round's start is a spawn too
    net.close();
  });
});

describe('the Online line while the offline match runs (wave-3 carry-over: it read "single player: no server")', () => {
  it('the offline match (`./net/loopback`) reports offline, not off; a server match reports its connection', () => {
    expect(page('respawn', true).net.status().state).toBe('offline');
    expect(page('respawn').net.status().state).not.toMatch(/^off/);
  });
});
