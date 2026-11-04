import { afterEach, describe, expect, it, vi } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { Hud } from '../src/hud';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import { PROTOCOL_VERSION, type ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';
import { layoutText } from '../src/hudFont';

/** FBA.R10: appearance keys cross NetPage's public socket/deps seam independently of the native type and weapon kit. */
const opened: NetPage[] = [];
afterEach(() => { for (const page of opened.splice(0)) page.close(); });

function page() {
  let socket: WebSocketLike | null = null;
  const remote = {
    setTeam: vi.fn(), setCharacter: vi.fn(), setType: vi.fn(), setKit: vi.fn(), clear: vi.fn(),
    forget: () => undefined, died: () => undefined, frame: () => undefined,
  };
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined,
    setMode: () => true, mode: () => 'walk',
  } as unknown as WalkMode;
  const respawned = vi.fn();
  const hud = new Hud();
  const deps: NetPageDeps = {
    walk, remote: remote as unknown as RemotePlayers, hud, clips: () => null, remoteGrenade: () => undefined,
    spectate: () => undefined, respawned, newRound: () => undefined, roundEffects: () => undefined,
    weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    socket: () => { socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike; return socket; },
  };
  const net = new NetPage(deps, 'ws://test/ws', 'MP2', 'Tester', undefined, false, 'classic');
  opened.push(net);
  socket!.onopen?.({} as Event);
  return { net, hud, remote, respawned, server: (event: ServerEvent) => socket!.onmessage?.({ data: JSON.stringify(event) } as MessageEvent) };
}

type Welcome = Extract<ServerEvent, { type: 'welcome' }>;
const welcome = (players: Welcome['players']): Welcome => ({
  type: 'welcome', id: 1, version: PROTOCOL_VERSION, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
  players, rules: 'classic', round: 1, rounds: 3, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
});
const JESTER = 'seal:scuba_B83', POLARIS = 'seal:arctic_C81';
const KIT = [8, 81, 36, 37, 0], NEXT_KIT = [5, 85, 36, 37, 0];
const spawn = (over: Partial<Extract<ServerEvent, { type: 'spawn' }>> = {}): Extract<ServerEvent, { type: 'spawn' }> => ({
  type: 'spawn', id: 2, at: [0, 0, 0], yaw: 0, after: 0, ...over,
});

describe('regional bot appearance replication through NetPage', () => {
  it('retains explicit bot flags through spawns, score rows and round changes, and replaces them on a new welcome', () => {
    const p = page();
    p.server(welcome([{ id: 2, name: 'Jester', team: 'seal', bot: true }]));
    p.server(spawn({ bot: true, character: JESTER, char: 2, kit: KIT }));
    expect(p.net.isBot(2)).toBe(true);
    p.server({ type: 'score', rows: [{ id: 2, name: 'Jester', team: 'seal', bot: true, kills: 1, deaths: 0, score: 3, alive: true, ping: 0 }], spectators: [], timeLeft: 60, wins: { seal: 0, terrorist: 0 } });
    expect(p.hud.state().model.scoreRows.rows?.[0]).toMatchObject({ name: 'Jester', bot: true });
    p.server({ type: 'roundStart', round: 2, seconds: 60, wins: { seal: 0, terrorist: 0 }, rounds: 3, epoch: 1, startTick: 0 });
    expect(p.net.isBot(2)).toBe(true);
    p.server(welcome([{ id: 2, name: 'Human', team: 'seal', character: JESTER }]));
    expect([p.net.isBot(2), p.net.displayNameOf(2)]).toEqual([false, 'Human']);
    p.server({ type: 'joined', id: 4, name: 'Polaris', team: 'seal', bot: true });
    expect(p.net.isBot(4)).toBe(true);
    p.server(spawn({ id: 4 }));
    expect(p.net.isBot(4)).toBe(false);
  });

  it('the socket kill feed labels both bot callsigns while keeping the authoritative names unchanged', () => {
    const p = page();
    p.server(welcome([{ id: 2, name: 'Jester', team: 'seal', bot: true }, { id: 3, name: 'Volkov', team: 'terrorist', bot: true }]));
    p.server({ type: 'kill', killer: 2, victim: 3, weapon: 'M4A1', how: 'weapon', clip: null });
    expect(p.hud.postsForDev().at(-1)?.text).toBe('Jester fragged Volkov with M4A1');
    expect([p.net.nameOf(2), p.net.nameOf(3)]).toEqual(['Jester', 'Volkov']);
  });
  it('keeps trusted bot identity separate from names and appearances, including renamed and reused seats', () => {
    const p = page();
    p.server(welcome([
      { id: 2, name: 'Jester', team: 'seal', bot: true, char: 2, kit: KIT },
      { id: 3, name: 'BOT Jester', team: 'seal', character: JESTER, char: 2, kit: KIT },
    ]));
    expect([p.net.isBot(2), p.net.isBot(3)]).toEqual([true, false]);
    expect(p.net.nameOf(2)).toBe('Jester');
    const glyphs = layoutText(p.net.displayNameOf(2), 0, 0, 1).glyphs;
    expect(glyphs.map((glyph) => glyph.char).join('')).toBe('Jester');
    expect(glyphs.slice(0, 1).map((glyph) => glyph.rgb)).toEqual(Array(1).fill([91, 72, 36]));
    expect(glyphs.slice(1).every((glyph) => glyph.rgb === undefined)).toBe(true);
    expect(p.net.displayNameOf(3)).toBe('BOT Jester');
    p.server({ type: 'renamed', id: 2, name: 'Polaris' });
    expect(p.net.nameOf(2)).toBe('Polaris');
    expect(layoutText(p.net.displayNameOf(2), 0, 0, 1).glyphs.map((glyph) => glyph.char).join('')).toBe('Polaris');
    p.server({ type: 'left', id: 2 });
    p.server({ type: 'joined', id: 2, name: 'Human', team: 'seal', character: JESTER });
    expect([p.net.isBot(2), p.net.displayNameOf(2)]).toEqual([false, 'Human']);
  });
  it('hydrates welcome appearances alongside native types and kits, clearing the appearance for an ordinary human', () => {
    const p = page();
    p.server(welcome([
      { id: 2, name: 'Jester', team: 'seal', character: JESTER, char: 2, kit: KIT },
      { id: 3, name: 'Human', team: 'terrorist', char: 1, kit: NEXT_KIT },
    ]));
    expect(p.remote.setCharacter.mock.calls).toEqual([[2, JESTER], [3, null]]);
    expect(p.remote.setType.mock.calls).toEqual([[2, 2], [3, 1]]);
    expect(p.remote.setKit.mock.calls).toEqual([[2, KIT], [3, NEXT_KIT]]);
    expect(p.remote.setTeam.mock.calls).toEqual([[2, 'seal'], [3, 'terrorist']]);
  });

  it('forwards joined and live botCharacter appearance changes or null without replacing the native type or kit', () => {
    const p = page();
    p.server(welcome([{ id: 2, name: 'Jester', team: 'seal', character: JESTER, char: 2, kit: KIT }]));
    p.server({ type: 'joined', id: 4, name: 'Polaris', team: 'seal', character: POLARIS });
    p.server({ type: 'botCharacter', id: 2, character: POLARIS });
    p.server({ type: 'botCharacter', id: 2, character: null });
    expect(p.remote.setCharacter.mock.calls).toEqual([[2, JESTER], [4, POLARIS], [2, POLARIS], [2, null]]);
    expect(p.remote.setType.mock.calls).toEqual([[2, 2]]);
    expect(p.remote.setKit.mock.calls).toEqual([[2, KIT]]);
  });

  it('forwards remote spawn appearances and native char/kit; an unadorned spawn clears stale appearance and own spawns keep their native path', () => {
    const p = page();
    p.server(welcome([]));
    p.server(spawn({ character: JESTER, char: 2, kit: KIT }));
    p.server(spawn({ char: 1, kit: NEXT_KIT }));
    p.server(spawn({ id: 1, char: 3, kit: KIT }));
    expect(p.remote.setCharacter.mock.calls).toEqual([[2, JESTER], [2, null]]);
    expect(p.remote.setType.mock.calls).toEqual([[2, 2], [2, 1]]);
    expect(p.remote.setKit.mock.calls).toEqual([[2, KIT], [2, NEXT_KIT]]);
    expect(p.respawned.mock.calls).toEqual([[KIT, 3]]);
  });
});
