import { describe, expect, it } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { Hud } from '../src/hud';
import { NetPage, REPLACED_LINE_READING, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import { newSessionToken, PageSession, SESSION_STORAGE_KEY, sessionKeyFor } from '../src/net/session';
import { isSessionToken, PROTOCOL_VERSION, SESSION_REPLACED_CLOSE, type ClientEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';

/**
 * S2 round 4: the page's session token -- one a tab, kept in session storage across a reload, sent with each hello --
 * the room's key for the page's record (the round's type lock, the picks) and for a takeover of a seat an unclean drop
 * left behind (`../../match/src/room` `Room.hello`, `takeOver`).
 */

/** A tab's session storage. */
const tabStorage = (): Pick<Storage, 'getItem' | 'setItem'> & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); } };
};

describe('the session token', () => {
  it('is 128 random bits, base64url: 22 characters of the hello\'s shape, a new one each time', () => {
    const a = newSessionToken(), b = newSessionToken();
    expect(a).toHaveLength(22);
    expect([isSessionToken(a), isSessionToken(b)]).toEqual([true, true]);
    expect(a).not.toBe(b);
    expect(newSessionToken((bytes) => bytes.fill(0xff))).toBe('_____________________w');
    expect(newSessionToken((bytes) => bytes.fill(0xfb))).toBe('-_v7-_v7-_v7-_v7-_v7-w');
  });

  it('is kept in the tab\'s session storage: a reload reads the same one, another tab makes its own', () => {
    const tab = tabStorage(), other = tabStorage();
    const first = new PageSession(() => tab).token();
    expect(tab.map.get(SESSION_STORAGE_KEY)).toBe(first);
    expect(new PageSession(() => tab).token()).toBe(first);              // F5: the same tab's storage
    expect(new PageSession(() => other).token()).not.toBe(first);        // a second window
  });

  it('a stored value without a token\'s shape is replaced; renew makes and keeps a new one', () => {
    const tab = tabStorage();
    tab.map.set(SESSION_STORAGE_KEY, 'not a token');
    const s = new PageSession(() => tab);
    const t = s.token();
    expect(isSessionToken(t)).toBe(true);
    const renewed = s.renew();
    expect(renewed).not.toBe(t);
    expect([s.token(), tab.map.get(SESSION_STORAGE_KEY)]).toEqual([renewed, renewed]);
  });

  it('without session storage (it throws, or there is none) the token lives in the page\'s memory', () => {
    const throwing = new PageSession(() => { throw new Error('SecurityError'); });
    const t = throwing.token();
    expect([isSessionToken(t), throwing.token()]).toEqual([true, t]);
    const broken = new PageSession(() => ({ getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } }));
    expect(broken.token()).toBe(broken.token());
    const none = new PageSession(() => null);
    expect(isSessionToken(none.token())).toBe(true);
  });
});

// ---- the page: each hello carries the token; a seat taken over renews it ------------------------------------------

const walkStub = (): WalkMode => ({
  setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, knock: () => true,
  setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
  mode: () => 'walk',
}) as unknown as WalkMode;
const remoteStub = (): RemotePlayers => new Proxy({}, { get: () => () => undefined }) as unknown as RemotePlayers;

function page(session: NetPageDeps['session']) {
  const sockets: { socket: WebSocketLike; sent: ClientEvent[] }[] = [];
  const factory = (): WebSocketLike => {
    const sent: ClientEvent[] = [];
    const socket = {
      binaryType: '', readyState: 1, close: () => undefined,
      send: (d: unknown) => { if (typeof d === 'string') sent.push(JSON.parse(d) as ClientEvent); },
      onopen: null, onclose: null, onmessage: null, onerror: null,
    } as unknown as WebSocketLike;
    sockets.push({ socket, sent });
    return socket;
  };
  const deps: NetPageDeps = {
    walk: walkStub(), remote: remoteStub(), hud: new Hud(), clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    socket: factory, ...(session ? { session } : {}),
  };
  const net = new NetPage(deps, 'ws://test/ws', 'MP2', '', undefined, false, 'classic');
  const hello = (i: number): Extract<ClientEvent, { type: 'hello' }> | undefined =>
    sockets[i]!.sent.find((e) => e.type === 'hello') as Extract<ClientEvent, { type: 'hello' }> | undefined;
  const serve = (i: number, ev: unknown): void => sockets[i]!.socket.onmessage?.({ data: JSON.stringify(ev) });
  const rejoin = (): void => {
    const inner = net as unknown as { reconnect: { at: number; stopped: boolean }; retry(): void };
    inner.retry();
    inner.reconnect.at = 1;
    inner.retry();
    sockets.at(-1)!.socket.onopen?.({});
  };
  return { net, sockets, hello, serve, rejoin, inner: net as unknown as { reconnect: { stopped: boolean } } };
}

const welcome = { type: 'welcome', id: 3, version: PROTOCOL_VERSION, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Player1234', players: [], rules: 'classic', round: 1, rounds: 11, ghost: false };

describe('the page\'s hello and its session (S2 round 4)', () => {
  it('each hello carries the tab\'s token -- the first and a rejoin\'s alike; without one, none', () => {
    const s = new PageSession(() => tabStorage());
    const p = page(s);
    p.sockets[0]!.socket.onopen?.({});
    expect(p.hello(0)).toMatchObject({ type: 'hello', name: '', session: s.token() });
    p.serve(0, welcome);
    p.sockets[0]!.socket.onclose?.({ code: 1006, reason: '' });
    p.rejoin();
    expect(p.hello(1)).toMatchObject({ session: s.token(), name: 'Player1234' });   // the room's name, for display
    const bare = page(undefined);
    bare.sockets[0]!.socket.onopen?.({});
    expect(bare.hello(0)).not.toHaveProperty('session');
  });

  it('a seat taken over by a newer connection of the token (a duplicated tab): a new token, and the page joins again as a new joiner', () => {
    const s = new PageSession(() => tabStorage());
    const p = page(s);
    p.sockets[0]!.socket.onopen?.({});
    const first = s.token();
    p.serve(0, welcome);
    p.serve(0, { type: 'kicked', reason: 'replaced' });
    p.sockets[0]!.socket.onclose?.({ code: SESSION_REPLACED_CLOSE.code, reason: SESSION_REPLACED_CLOSE.reason });
    expect(p.inner.reconnect.stopped).toBe(false);
    p.rejoin();
    expect(p.hello(1)!.session).not.toBe(first);
    expect(p.hello(1)!.session).toBe(s.token());
    // A vote's kick still ends it.
    p.serve(1, welcome);
    p.serve(1, { type: 'kicked', reason: 'vote' });
    expect(p.inner.reconnect.stopped).toBe(true);
  });
});

describe('the token is the server\'s: one a server origin a tab joins (the S2 review\'s round-4 lows)', () => {
  it('is kept under the server\'s origin, so a page that joins another server (`&server=`) never sends it this one\'s', () => {
    expect(sessionKeyFor('wss://mp.example.org/ws')).toBe(`${SESSION_STORAGE_KEY}:wss://mp.example.org`);
    expect(sessionKeyFor('ws://127.0.0.1:8787/ws?x=1')).toBe(`${SESSION_STORAGE_KEY}:ws://127.0.0.1:8787`);
    expect(sessionKeyFor('not a url')).toBe(`${SESSION_STORAGE_KEY}:not a url`);
    const tab = tabStorage();
    const ours = new PageSession(() => tab, undefined, sessionKeyFor('wss://mp.example.org/ws'));
    const theirs = new PageSession(() => tab, undefined, sessionKeyFor('wss://elsewhere.example.net/ws'));
    expect(ours.token()).not.toBe(theirs.token());
    expect(new PageSession(() => tab, undefined, sessionKeyFor('wss://mp.example.org/other')).token()).toBe(ours.token());
    expect(tab.map.get(`${SESSION_STORAGE_KEY}:wss://mp.example.org`)).toBe(ours.token());
  });
});

describe('the page replaced by its duplicate: its own line, not the lost connection\'s', () => {
  it('posts REPLACED_LINE_READING and joins again without "CONNECTION LOST"', () => {
    const lines: string[] = [];
    const s = new PageSession(() => tabStorage());
    const p = page(s);
    const hud = (p.net as unknown as { deps: NetPageDeps }).deps.hud;
    hud.postMessage = (text) => { lines.push(typeof text === 'string' ? text : text.map((t) => t.text).join('|')); };
    p.sockets[0]!.socket.onopen?.({});
    p.serve(0, welcome);
    p.serve(0, { type: 'kicked', reason: 'replaced' });
    p.sockets[0]!.socket.onclose?.({ code: SESSION_REPLACED_CLOSE.code, reason: SESSION_REPLACED_CLOSE.reason });
    (p.net as unknown as { retry(): void }).retry();
    expect(lines).toContain(REPLACED_LINE_READING);
    expect(lines.some((l) => l.startsWith('CONNECTION LOST'))).toBe(false);
    // PT195-4: a reached match's first reconnect is already due, so the next frame opens it.
    // `rejoin` would open a second socket on top of that due timer.
    (p.net as unknown as { retry(): void }).retry();
    const live = p.sockets.length - 1;
    p.sockets[live]!.socket.onopen?.({});
    p.serve(live, welcome);
    p.sockets[live]!.socket.onclose?.({ code: 1006, reason: '' });
    (p.net as unknown as { retry(): void }).retry();
    expect(lines.filter((l) => l.startsWith('CONNECTION LOST'))).toHaveLength(1);
  });
});

describe('the ARMORY\'s seat on the page (W5.R1; ARMORY_SEAT_READING)', () => {
  function armoryPage(screen = { open: false }) {
    let opened = 0;
    const sockets: { socket: WebSocketLike; sent: ClientEvent[] }[] = [];
    const factory = (): WebSocketLike => {
      const sent: ClientEvent[] = [];
      const socket = {
        binaryType: '', readyState: 1, close: () => undefined,
        send: (d: unknown) => { if (typeof d === 'string') sent.push(JSON.parse(d) as ClientEvent); },
        onopen: null, onclose: null, onmessage: null, onerror: null,
      } as unknown as WebSocketLike;
      sockets.push({ socket, sent });
      return socket;
    };
    const deps: NetPageDeps = {
      walk: walkStub(), remote: remoteStub(), hud: new Hud(), clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
      respawned: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
      socket: factory, armory: true, joined: () => { opened++; }, armoryOpen: () => screen.open,
    };
    const net = new NetPage(deps, 'ws://test/ws', 'MP2', '', undefined, false, 'respawn');
    sockets[0]!.socket.onopen?.({});
    const serve = (ev: unknown): void => sockets[0]!.socket.onmessage?.({ data: JSON.stringify(ev) });
    return { net, sent: sockets[0]!.sent, serve, opened: () => opened, sockets };
  }

  it('the S3 repair: a rejoin under the open screen says so in its hello, and the welcome\'s `armory` opens nothing again', () => {
    const screen = { open: false };
    const p = armoryPage(screen);
    expect(p.sent.find((e) => e.type === 'hello')).not.toHaveProperty('armoryOpen');
    p.serve({ ...welcome, rules: 'respawn', armory: true });
    expect(p.opened()).toBe(1);
    screen.open = true;                                                      // the screen opened; the socket drops
    p.sockets[0]!.socket.onclose?.({ code: 1006, reason: '' });
    const inner = p.net as unknown as { reconnect: { at: number }; retry(): void };
    inner.retry();
    inner.reconnect.at = 1;
    inner.retry();
    expect(p.sockets).toHaveLength(2);
    const again = p.sockets.at(-1)!;
    again.socket.onopen?.({});
    expect(again.sent.find((e) => e.type === 'hello')).toMatchObject({ armory: true, armoryOpen: true });
    again.socket.onmessage?.({ data: JSON.stringify({ ...welcome, rules: 'respawn', armory: true }) });
    expect(p.opened()).toBe(1);                                              // already open: not opened, not left
    expect(again.sent.filter((e) => e.type === 'ready')).toHaveLength(0);
    // The promotion's too.
    again.socket.onmessage?.({ data: JSON.stringify({ type: 'promoted', team: 'seal', ghost: false, char: 0, armory: true }) });
    expect(p.opened()).toBe(1);
  });

  it('the hello says the page opens it; a welcome that opens it opens it, one that does not leaves it shut', () => {
    const p = armoryPage();
    expect(p.sent.find((e) => e.type === 'hello')).toMatchObject({ armory: true });
    p.serve({ ...welcome, rules: 'respawn' });
    expect(p.opened()).toBe(0);                                              // a reconnect's seat (no `armory`)
    p.serve({ ...welcome, rules: 'respawn', armory: true });
    expect(p.opened()).toBe(1);
  });

  it('a promotion that opens it opens it; leaving it sends `ready` once a player is seated', () => {
    const p = armoryPage();
    p.serve({ ...welcome, role: 'spectator', team: null, queue: 1 });
    p.net.armoryDone();
    expect(p.sent.filter((e) => e.type === 'ready')).toHaveLength(0);       // a spectator has no seat to spawn
    p.serve({ type: 'promoted', team: 'seal', ghost: false, char: 0, armory: true });
    expect(p.opened()).toBe(1);
    p.net.armoryDone();
    expect(p.sent.filter((e) => e.type === 'ready')).toHaveLength(1);
  });

  it('a watcher never says it (the map viewer\'s Online setting watches)', () => {
    const sent: ClientEvent[] = [];
    const socket = {
      binaryType: '', readyState: 1, close: () => undefined, send: (d: unknown) => { if (typeof d === 'string') sent.push(JSON.parse(d) as ClientEvent); },
      onopen: null, onclose: null, onmessage: null, onerror: null,
    } as unknown as WebSocketLike;
    const deps: NetPageDeps = {
      walk: walkStub(), remote: remoteStub(), hud: new Hud(), clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
      respawned: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM], socket: () => socket, armory: true,
    };
    new NetPage(deps, 'ws://test/ws', 'MP2', '', undefined, true, 'respawn');
    socket.onopen?.({} as Event);
    expect(sent.find((e) => e.type === 'hello')).not.toHaveProperty('armory');
  });
});
