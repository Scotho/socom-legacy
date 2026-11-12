// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LobbyService } from '@s2u/ui';
import { LOBBY_STATE, type DialogDesign } from '@s2u/ui';
import { pinnedMatchSocket } from '../src/connectHost';
import { FrontEndSession, type FrontEndDisc } from '../src/frontEnd';
import { LOBBY_PREPARE_ADAPTATION, LOBBY_PREPARE_MIN_DEVICE_MEMORY_GB, LobbyPrepareTrigger, lobbyPrepareAllowed, lobbyPrepareOverride } from '../src/lobbyPrepare';
import { matchLoaderSlot } from '../src/matchLoaderSlot';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';

/**
 * IP3's product half (card bbXnSJNH; `LOBBY_PREPARE_ADAPTATION`, a browser adaptation with no original, the owner's word
 * 2026-11-02): the match prepared while the player sits in the game lobby, so the hand-off finds it ready. The guard, the
 * session's trigger (fakes for the page's ports), and the page's wiring by its source. No server (R293), no browser.
 */

const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf8');

describe('IP3 lobby prepare: the guard (an adaptation, off under the Xbox preset until measured)', () => {
  it('is labelled as an adaptation, with its memory threshold named', () => {
    expect(LOBBY_PREPARE_ADAPTATION).toMatch(/adaptation/);
    expect(LOBBY_PREPARE_MIN_DEVICE_MEMORY_GB).toBe(4);
  });

  it('off under the Xbox preset, even with the address override', () => {
    expect(lobbyPrepareAllowed({ graphics: 'xbox', deviceMemory: 8, search: '' })).toBe(false);
    expect(lobbyPrepareAllowed({ graphics: 'xbox', deviceMemory: 8, search: '?lobbyprepare=1' })).toBe(false);
  });

  it('VS-7: off under the Xbox device class (the certain bar, VS.R1), even with the address override; on for another class', () => {
    expect(lobbyPrepareAllowed({ graphics: 'auto', deviceClass: 'xbox', deviceMemory: 8, search: '' })).toBe(false);
    expect(lobbyPrepareAllowed({ graphics: 'auto', deviceClass: 'xbox', deviceMemory: 8, search: '?lobbyprepare=1' })).toBe(false);
    expect(lobbyPrepareAllowed({ graphics: 'auto', deviceClass: 'standard', deviceMemory: 8, search: '' })).toBe(true);
    expect(lobbyPrepareAllowed({ graphics: 'auto', deviceClass: 'high', deviceMemory: 8, search: '' })).toBe(true);
  });

  it('off when the device memory is known and below the threshold; on when it is unknown or enough', () => {
    expect(lobbyPrepareAllowed({ graphics: 'auto', deviceMemory: 2, search: '' })).toBe(false);
    expect(lobbyPrepareAllowed({ graphics: 'auto', deviceMemory: 4, search: '' })).toBe(true);
    expect(lobbyPrepareAllowed({ graphics: 'webgl2', deviceMemory: 8, search: '' })).toBe(true);
    expect(lobbyPrepareAllowed({ graphics: 'auto', deviceMemory: undefined, search: '' })).toBe(true);
  });

  it('the address override: 0 always off, 1 on (past the memory threshold) except under the Xbox preset', () => {
    expect(lobbyPrepareOverride('?lobbyprepare=0')).toBe(false);
    expect(lobbyPrepareOverride('?lobbyprepare=1')).toBe(true);
    expect(lobbyPrepareOverride('?lobbyprepare=yes')).toBeNull();
    expect(lobbyPrepareOverride('')).toBeNull();
    expect(lobbyPrepareAllowed({ graphics: 'auto', deviceMemory: 8, search: '?lobbyprepare=0' })).toBe(false);
    expect(lobbyPrepareAllowed({ graphics: 'auto', deviceMemory: 2, search: '?lobbyprepare=1' })).toBe(true);
    expect(lobbyPrepareAllowed({ graphics: 'auto', deviceMemory: undefined, search: '?lobbyprepare=1' })).toBe(true);
  });
});

/** The ports as fakes: each call recorded. */
function ports(o: { throws?: boolean } = {}) {
  const calls: string[] = [];
  return {
    calls,
    p: {
      lobbyPrepare: (m: string) => { calls.push(`prepare ${m}`); if (o.throws) throw new Error('prepare'); },
      lobbyRelease: () => { calls.push('release'); if (o.throws) throw new Error('release'); },
    },
  };
}

describe('IP3 lobby prepare: the trigger, once per change of the lobby\'s mission', () => {
  it('a game\'s lobby prepares its mission once; leaving releases; another mission releases then prepares', () => {
    const f = ports();
    const t = new LobbyPrepareTrigger(() => f.p);
    t.frame('', false);
    expect(f.calls).toEqual([]);
    t.frame('mp2', false); t.frame('mp2', false); t.frame('mp2', false);
    expect(f.calls).toEqual(['prepare mp2']);
    t.frame('mp3', false);
    expect(f.calls).toEqual(['prepare mp2', 'release', 'prepare mp3']);
    t.frame('', false); t.frame('', false);
    expect(f.calls).toEqual(['prepare mp2', 'release', 'prepare mp3', 'release']);
  });

  it('nothing while a match is up -- no release (the hand-off takes the prepared match) -- and prepares again after its return', () => {
    const f = ports();
    const t = new LobbyPrepareTrigger(() => f.p);
    t.frame('mp2', false);
    t.frame('mp2', true); t.frame('mp3', true); t.frame('', true);
    expect(f.calls).toEqual(['prepare mp2']);
    t.frame('mp2', false);
    expect(f.calls).toEqual(['prepare mp2', 'prepare mp2']);
  });

  it('a hand-off no frame saw (a match begun and ended between two frames) still forgets the mission: prepared again after', () => {
    const f = ports();
    const t = new LobbyPrepareTrigger(() => f.p);
    t.frame('mp2', false);
    t.handedOff();
    t.frame('mp2', false);
    expect(f.calls).toEqual(['prepare mp2', 'prepare mp2']);
  });

  it("5d's ruling (a): a side change while the mission stays prepared tells `lobbySide` once; a new mission's prepare reads the side itself", () => {
    const calls: string[] = [];
    const t = new LobbyPrepareTrigger(() => ({
      lobbyPrepare: (m) => { calls.push(`prepare ${m}`); }, lobbyRelease: () => { calls.push('release'); }, lobbySide: () => { calls.push('side'); },
    }));
    t.frame('', false, 'seal');
    expect(calls).toEqual([]);                                     // no game: no side to follow
    t.frame('mp2', false, '');
    t.frame('mp2', false, 'seal');                                 // the welcome seats it
    t.frame('mp2', false, 'seal');
    t.frame('mp2', false, 'terrorist');                            // SWITCH TEAMS
    expect(calls).toEqual(['prepare mp2', 'side', 'side']);
    t.frame('mp3', false, 'seal');                                 // another mission: its prepare reads the side
    expect(calls).toEqual(['prepare mp2', 'side', 'side', 'release', 'prepare mp3']);
    t.frame('mp3', true, 'terrorist');                             // a match up: nothing
    expect(calls).toHaveLength(5);
  });

  it('a port that throws never breaks the frame; absent ports are nothing', () => {
    const f = ports({ throws: true });
    const t = new LobbyPrepareTrigger(() => f.p);
    expect(() => { t.frame('mp2', false); t.frame('mp3', false); t.frame('', false); }).not.toThrow();
    expect(f.calls).toEqual(['prepare mp2', 'release', 'prepare mp3', 'release']);
    const none = new LobbyPrepareTrigger(() => undefined);
    expect(() => { none.frame('mp2', false); none.frame('', false); }).not.toThrow();
  });
});

// ---- the session: the trigger in its frame (`advance`), the game lobby's mission, the match's phase ----

const design = (): DialogDesign => ({
  libraries: [], usesMemcard: false, font: null, fontLib: true, background: null,
  bindings: [], controls: [], objects: [], scripts: [], models: [], dropped: [],
});
const DIALOGS = ['dlgGameLobby.rdr', 'dlgNetAbandoned.rdr', 'dlgNetError.rdr', 'dlgLoad.rdr', 'dlgMenu.rdr'];
const disc: FrontEndDisc = { dialog: (n) => (DIALOGS.includes(n) ? design() : null), sets: [], faces: [], captions: null, loader: {}, missing: [] };
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const PINNED = pinnedMatchSocket('', { protocol: 'https:', host: 'site.test', origin: 'https://site.test' }, false);
type Sock = WebSocketLike & { sent: string[]; closed: number[] };
/** A game on Frostfire ('D'[8] 2: "mp2"), or `n`'s map. */
const game = (n = 2) => {
  const b = new Uint8Array(256); b[0] = 0x44; b[1] = 5; b[2] = 6; b[4] = 8; b[8] = n;
  return { mediusWorldId: 7, gameName: 'g$~A', maxPlayers: 16, rulesSet: 2, gameStats: [...b].map((v) => v.toString(16).padStart(2, '0')).join('') };
};

/** `test/frontEndMatch.test.ts`'s session, its lobby match given the two new ports. */
async function session(o: { throws?: boolean } = {}) {
  const account: LobbyService = {
    login: () => Promise.resolve({ status: 0, ticket: 'tkt' }), register: () => Promise.resolve({ status: 0 }),
    logout: () => Promise.resolve({ status: 0 }), keepAlive: () => Promise.resolve(true),
  };
  const socks: Sock[] = [];
  const f = ports(o);
  const s = new FrontEndSession({
    disc, startDialog: 'dlgGameLobby.rdr', account, matchSocket: PINNED,
    gameSocket: () => {
      const sent: string[] = [], closed: number[] = [];
      const k = { binaryType: '', readyState: 1, sent, closed, send: (d: string) => { sent.push(d); }, close: (c?: number) => { closed.push(c ?? 0); } } as unknown as Sock;
      socks.push(k);
      return k;
    },
    lobbyMatch: { screen: { show: () => {}, hide: () => {} }, load: () => Promise.resolve(), ...f.p },
  });
  let now = 0;
  s.advance(now);
  const run = async (k: number): Promise<void> => { for (let i = 0; i < k; i++) { s.advance(now += 34); await flush(); } };
  s.lobby!.connect('localhost', 10075);
  await run(3);
  s.lobby!.login('socomc', 'pw');
  await run(6);
  expect(s.lobby!.state()).toBe(LOBBY_STATE.LOGGED_IN);
  const sock = (): Sock => socks.at(-1)!;
  const say = (ev: ServerEvent): void => { sock().onmessage?.({ data: JSON.stringify(ev) }); };
  const seat = (): void => {
    s.gameLobby.socket!.open(7);
    sock().onopen?.({});
    say({ type: 'welcome', id: 2, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'socomc', players: [], rules: 'classic', round: 0, rounds: 11, ghost: false } as unknown as ServerEvent);
  };
  const handOff = (): void => { s.gameLobby.socket!.handOff({ mediusWorldId: 7, gameName: 'g$~A', mission: 'mp2', lateJoiner: false }); };
  return { s, calls: f.calls, run, seat, handOff, say };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('IP3 lobby prepare on the session: the game lobby\'s mission, checked in the frame', () => {
  it('entering a game\'s lobby prepares its mission once; leaving it releases', async () => {
    const x = await session();
    expect(x.calls).toEqual([]);                                   // no game held: nothing
    x.s.gameLobby.commands.enterGameLobby(game(2));
    await x.run(3);
    expect(x.calls).toEqual(['prepare mp2']);
    x.s.gameLobby.commands.DisconnectFromGameServer({ arg: 'NA' } as never, {} as never, undefined);
    await x.run(2);
    expect(x.s.gameLobby.commands.missionName()).toBe('');
    expect(x.calls).toEqual(['prepare mp2', 'release']);
    x.s.close();
  });

  it('nothing during a match: the hand-off neither releases nor prepares again', async () => {
    const x = await session();
    x.s.gameLobby.commands.enterGameLobby(game(2));
    x.seat();
    await x.run(2);
    expect(x.calls).toEqual(['prepare mp2']);
    x.handOff();
    expect(x.s.match.phase).toBe('loading');
    x.say({ type: 'roundStart', round: 1, seconds: 360, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 1, startTick: 0 });
    await x.run(30);
    expect(x.s.match.phase).toBe('match');
    expect(x.calls).toEqual(['prepare mp2']);
    x.s.close();
  });

  it('after a return, not until it has settled (its dialog\'s ONSTART run: a DisconnectFromGameServer there lets the game go first)', async () => {
    const x = await session();
    x.s.gameLobby.commands.enterGameLobby(game(2));
    x.seat();
    await x.run(1);
    x.handOff();
    expect(x.s.match.phase).toBe('loading');
    x.say({ type: 'abandoned' } as unknown as ServerEvent);
    await x.run(1);                                                // the return's own frame: the hand-off unseen by any frame between
    expect(x.s.match.phase).toBe('ended');
    expect(x.calls).toEqual(['prepare mp2']);
    await x.run(8);                                                // settled: the game still held, prepared again
    expect(x.calls).toEqual(['prepare mp2', 'prepare mp2']);
    x.s.close();
  });

  it('a port that throws never breaks the session\'s frame', async () => {
    const x = await session({ throws: true });
    x.s.gameLobby.commands.enterGameLobby(game(2));
    await expect(x.run(3)).resolves.toBeUndefined();
    expect(x.calls).toEqual(['prepare mp2']);
    x.s.close();
  });
});

describe('IP3 lobby prepare: the page\'s wiring (by its source) and the slot\'s release', () => {
  it('the page\'s ports are guarded, never reject, and release only a loader already made', () => {
    const fe = src('frontEnd.ts');
    expect(fe).toMatch(/lobbyPrepare: \(mission\) => \{ if \(!lobbyPrepareAllowed\(\)\) return;/);
    expect(fe).toMatch(/lobbyRelease: \(\) => \{/);
    expect(fe).toMatch(/matchLoading\?\.held\(\)/);
    expect(fe).toMatch(/this\.lobbyPrepare\.frame\(this\.gameLobby\.commands\.missionName\(\), /);
  });

  it('N4: the hand-off\'s `unprepare` spread into LobbyMatch, its port (a held loader only), and no `hdPack` option (ML-6) -- pinned by text', () => {
    const fe = src('frontEnd.ts');
    expect(fe).toMatch(/\.\.\.\(lm\?\.unprepare \? \{ unprepare: lm\.unprepare \} : \{\}\),/);   // FrontEndSession: the port handed to LobbyMatch
    expect(fe).toMatch(/unprepare: \(\) => \{ \+\+lobbyAsk; void matchLoading\?\.held\(\)\?\.then\(\(l\) => \{ l\.dropPrepared\(\); \}, \(\) => undefined\); \},/);
    // B206 ML-6 (ML.R11): no picture asks for the HD pack, so the loader is given no `hdPack` (absent: never) -- a pack
    // chosen in MODS is registered from the map's decodes after the world (ML-3), so a prepared match is kept under it.
    expect(fe).toMatch(/m\.matchLoader\(from, undefined, \{\s*picture, \.\.\.\(win \?/);
    expect(fe).not.toMatch(/pictureExperimentalSettings|hdPack: \(\) =>/);
    // The prepare is the mount's own stage 1: its stage-1 inputs from the page, as the hand-off's mount is given them.
    expect(fe).toMatch(/audio: \(\) => matchSound\.audio\(\), side: \(\) => session_\?\.gameLobby\.socket\?\.link\(\)\?\.team \?\? null,/);
    expect(fe).toMatch(/lobbySide: \(\) => \{ void matchLoading\?\.held\(\)\?\.then\(\(l\) => \{ l\.reseat\(\); \}, \(\) => undefined\); \},/);
    expect(fe).toMatch(/this\.lobbyPrepare\.frame\([^\n]*this\.gameLobby\.socket\?\.link\(\)\?\.team \?\? ''\);/);
  });

  it('the slot\'s held loader: none before the first get, the same promise after, none after its release', async () => {
    const made: { disposed: number }[] = [];
    const slot = matchLoaderSlot(() => { const l = { disposed: 0, dispose() { this.disposed++; } }; made.push(l); return Promise.resolve(l); });
    expect(slot.held()).toBeNull();
    const a = slot.get();
    expect(slot.held()).toBe(a);
    slot.release();
    expect(slot.held()).toBeNull();
    await flush();
    expect(made[0]!.disposed).toBe(1);
  });
});
