// @vitest-environment jsdom
// test/replayMode.test.ts -- PT-18: the replay mode as a match capability and NetPage's client seam (W35.R4, W35.R5;
// research 244 §1), and the test room's address for it (W35.R2)
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { decodeRecords } from '../../match/src/replay/format';
import { Hud } from '../src/hud';
import { FRONT_END_CAPABILITIES, TESTROOM_CAPABILITIES } from '../src/matchCore';
import { matchNetDeps, PART_DEPS, type MatchNetParts } from '../src/matchNet';
import { NetClient, type NetOptions, type WebSocketLike } from '../src/net/client';
import { NetPage, type NetPageDeps } from '../src/netPage';
import { replayKeyAction, REPLAY_KEYS } from '../src/replay/controls';
import { replayAsked, replayClient, replayMapAddress, replayServer } from '../src/replay/mount';
import { sharedServer } from '../src/online';
import { asNetClient, ReplayClient, REPLAY_WATCHER_ID } from '../src/replay/replayClient';
import { ReplayLoadError } from '../src/replay/load';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';
import { fakeFetch, fixtureBytes, gzip } from './replayFixture';

const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');

function parts(caps: MatchNetParts['caps']): MatchNetParts {
  return {
    caps, walk: {} as NetPageDeps['walk'], remote: {} as NetPageDeps['remote'], hud: {} as NetPageDeps['hud'], fly: { setPose: () => {} },
    loadouts: { picks: () => [], type: () => 0, seated: () => null, setType: () => true, unseated: () => {}, roomAnswer: () => {} },
    firearm: {
      records: () => [HELD_RIFLE, HELD_SIDEARM] as never, roundEffects: () => {}, roundImpact: () => {}, died: () => {}, spawnKit: () => {},
      fire: { undoReload: () => true, restoreReload: () => true, refundRound: () => true },
    },
    clips: () => null, map: () => null, side: () => 'seal', followTeam: () => {}, menuOpen: () => false,
  };
}
const frontRest = {
  remoteGrenade: () => {}, ownProjectiles: () => false, staleThrow: () => {}, tagOwnProjectile: () => {}, detonateProjectile: () => {}, whiteOut: () => {},   // P2: the room's white-out
  reloadSound: () => {}, deathVoice: () => {}, hurtVoice: () => {}, ring: () => {}, roundAudio: {} as never, objective: () => null, escorteeVoice: () => {},
  taunt: () => {}, communication: () => {}, hostageState: () => {},   // the front end's hostages since ACT (PR #71)
  voiceFloor: () => {}, voiceFrame: () => {},   // SVC-20b-page: both pages mount the voice; PART_DEPS checks it before the replay
  drops: null, kitChanged: () => {},   // PAR-4: the world drops on both pages since PARITY-1's wave 4
  armory: false, armoryOpen: () => false, joined: () => {}, newRound: () => {}, abandoned: () => {},   // PAR-2: the seat ARMORY on both pages
} satisfies Partial<NetPageDeps>;
/** PAR-1: WEAPON EXCHANGE's hook, owed by both pages since PARITY-1's wave 4 (`PART_HOOKS.exchange`). */
const hooks = { answered: () => {} };
const testroomRest = { ...frontRest } satisfies Partial<NetPageDeps>;   // PAR-2: the ARMORY's deps the same on both pages

describe('the replay capability (W35.R5; spec 4.8)', () => {
  it('on in the test room, off in the front end; its dep is the client factory', () => {
    expect(TESTROOM_CAPABILITIES.replay).toBe(true);
    expect(FRONT_END_CAPABILITIES.replay).toBe(false);
    expect(PART_DEPS.replay).toEqual(['client']);
  });
  it('matchNetDeps refuses the replay\'s factory from a page whose switch has it off (the front end)', () => {
    const factory = (o: NetOptions): NetClient => { throw new Error(String(o)); };
    expect(() => matchNetDeps(parts(FRONT_END_CAPABILITIES), hooks, { ...frontRest, client: factory } as Partial<NetPageDeps>))
      .toThrow(/client is the replay's, which this page does not mount/);
    expect(matchNetDeps(parts(FRONT_END_CAPABILITIES), hooks, { ...frontRest }).client).toBeUndefined();
  });
  it('the test room owes it -- null outside the replay mode, the page\'s own NetClient then', () => {
    expect(() => matchNetDeps(parts(TESTROOM_CAPABILITIES), hooks, { ...testroomRest } as Partial<NetPageDeps>)).toThrow(/client is owed: the replay is mounted/);
    expect(matchNetDeps(parts(TESTROOM_CAPABILITIES), hooks, { ...testroomRest, client: null }).client).toBeNull();
  });
});

function pageDeps(over: Partial<NetPageDeps> = {}) {
  const sockets: WebSocketLike[] = [];
  const posted: string[] = [];
  const hud = new Hud();
  hud.postMessage = ((text: string | readonly string[]) => { posted.push(Array.isArray(text) ? text.join('/') : String(text)); }) as typeof hud.postMessage;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setTrigger: () => undefined,
    setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'walk',
  } as unknown as WalkMode;
  const framed: number[][] = [];
  const remote = {
    setTeam: () => undefined, setType: () => undefined, setKit: () => undefined, forget: () => undefined, died: () => undefined,
    clear: () => undefined, frame: (_dt: number, bodies: { id: number }[]) => { framed.push(bodies.map((b) => b.id)); },
  } as unknown as RemotePlayers;
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined, respawned: () => undefined,
    roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    socket: () => {
      const s = { binaryType: '', readyState: 0, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
      sockets.push(s);
      return s;
    },
    ...over,
  };
  return { deps, sockets, posted, framed, walk };
}

describe('NetPage\'s client seam (W35.R4): an additive factory, one branch in open()', () => {
  it('no factory -- absent or null: NetPage opens its own NetClient on its socket, as before', () => {
    for (const over of [{}, { client: null }] as Partial<NetPageDeps>[]) {
      const p = pageDeps(over);
      const net = new NetPage(p.deps, 'ws://test/ws', 'MP2', 'Tester', undefined, false, 'classic');
      expect(net.client).toBeInstanceOf(NetClient);
      expect(p.sockets).toHaveLength(1);
      net.close();
    }
  });
  it('a factory: called once with the options NetPage would have opened its NetClient with and the walk; no socket', () => {
    const made: [NetOptions, unknown][] = [];
    const replay = new ReplayClient(new Promise(() => {}), { name: 'W', map: 'MP2' });
    const p = pageDeps({ client: (o, w) => { made.push([o, w]); return asNetClient(replay); } });
    const net = new NetPage(p.deps, 'replay:', 'MP2', 'Watcher', undefined, true, 'classic');
    expect(made).toHaveLength(1);
    expect(made[0]![0]).toMatchObject({ url: 'replay:', map: 'MP2', name: 'Watcher', watch: true, rules: 'classic' });
    expect(made[0]![1]).toBe(p.walk);
    expect(net.client).toBe(replay);
    expect(p.sockets).toHaveLength(0);
    net.close();
  });
  it('on a recording: NetPage is online, watching, and draws the recording\'s bodies from the replay\'s clock', async () => {
    const { records, truncated } = decodeRecords(fixtureBytes());
    const h = records[0]!;
    if (h.kind !== 'header') throw new Error('no header');
    let now = 0;
    const replay = new ReplayClient(Promise.resolve({ header: h.header, records, truncated }), { name: 'W', map: 'MP2', now: () => now });
    const p = pageDeps({ client: () => asNetClient(replay) });
    const net = new NetPage(p.deps, 'replay:', 'MP2', 'Watcher', undefined, true, 'classic');
    await replay.ready;
    expect(net.status()).toMatchObject({ state: 'online', watching: true });
    expect(net.client.id).toBe(REPLAY_WATCHER_ID);
    now = 6000;                                         // tick 360: Bravo gone at 300
    replay.advance();
    net.frame(0.016, new (await import('three')).PerspectiveCamera(), false);
    expect(p.framed.at(-1)).toEqual([1]);
    net.close();
    expect(replay.state).toBe('closed');
  });
  it('a refused recording: the page says why in the message window and on its status, and does not retry', async () => {
    const reason = 'This recording was made with network protocol 999; this build plays protocols 10 and 11.';
    const replay = new ReplayClient(Promise.reject(new ReplayLoadError(reason)), { name: 'W', map: 'MP2' });
    const p = pageDeps({ client: () => asNetClient(replay) });
    const net = new NetPage(p.deps, 'replay:', 'MP2', 'Watcher', undefined, true, 'classic');
    await replay.ready;
    expect(p.posted).toContain(reason);
    expect(net.status()).toMatchObject({ state: 'refused', reason });
    net.close();
  });
});

describe('the test room\'s replay address (W35.R2; research 244 §2)', () => {
  it('only ?devmode with replay= on a development build', () => {
    expect(replayAsked('?devmode&replay=http://localhost:5303/segments/0.s2r', true)).toBe(true);
    expect(replayAsked('?replay=http://localhost:5303/segments/0.s2r', true)).toBe(false);
    expect(replayAsked('?devmode&replay=http://localhost:5303/segments/0.s2r', false)).toBe(false);
    expect(replayAsked('?devmode', true)).toBe(false);
    expect(replayAsked('?devtools&replay=http://localhost:5303/segments/0.s2r', true)).toBe(true);
    expect(replayAsked('?served&replay=http://localhost:5303/segments/0.s2r', true)).toBe(false);
    expect(replayAsked('?flyok&replay=http://localhost:5303/segments/0.s2r', true)).toBe(false);
  });
  it('the map is the header\'s: another map shown reopens the page on it, once; the same map plays', () => {
    expect(replayMapAddress('?devmode&replay=u', 'MP5', 'MP2')).toEqual({ navigate: '?devmode&replay=u&map=MP5' });
    expect(replayMapAddress('?devmode&map=mp2&replay=u', 'MP5', 'MP2')).toEqual({ navigate: '?devmode&map=MP5&replay=u' });
    expect(replayMapAddress('?devmode&map=MP5&replay=u', 'MP5', 'MP2')).toEqual({ refuse: 'This recording is of map MP5, which the page could not open.' });
    expect(replayMapAddress('?devmode&replay=u', 'mp2', 'MP2')).toBeNull();
  });
  it('the factory: an address off this computer is refused in words; a recording of another map reopens the page on it, once', async () => {
    const replace = vi.fn();
    const off = '?devmode&replay=http://example.com/0.s2r';
    const frames: (() => void)[] = [];
    const make = replayClient(off, { document, location: { search: off, pathname: '/testroom', hash: '', replace }, frame: (run) => { frames.push(run); } });
    const refused = make({ url: 'replay:', map: 'MP2', name: 'W', watch: true }, {} as never) as unknown as ReplayClient;
    await refused.ready;
    expect(refused.state).toBe('refused');
    expect(replace).not.toHaveBeenCalled();
    refused.close();
    frames.shift()!();
    expect(document.querySelectorAll('[data-replay-bar]').length).toBe(0);
    const on = '?devmode&replay=http://localhost:5303/segments/9.s2r';
    const other = replayClient(on, { document, location: { search: on, pathname: '/testroom', hash: '', replace }, fetch: fakeFetch(fixtureBytes()), frame: (run) => { frames.push(run); } });
    const c = other({ url: 'replay:', map: 'MP5', name: 'W', watch: true }, {} as never) as unknown as ReplayClient;
    await c.ready;
    expect(c.state).toBe('refused');
    expect(replace).toHaveBeenCalledWith(`/testroom${on}&map=MP2`);
    const bars = document.querySelectorAll('[data-replay-bar]').length;
    c.close();
    frames.shift()!();                                          // the loop's next frame sees the page closed it: the bar goes
    expect(document.querySelectorAll('[data-replay-bar]').length).toBe(bars - 1);
  });
  it('the load is kept for the page only when it is a closed segment that loaded (N3): a failure or a live prefix is fetched again', async () => {
    const counted = (body: () => Uint8Array | null, status = 200) => {
      let n = 0;
      const f = (async () => { n++; const b = body(); return new Response(b ? (b as BodyInit) : null, { status }); }) as typeof fetch;
      return { f, n: () => n };
    };
    const build = async (url: string, f: typeof fetch): Promise<void> => {
      const search = `?devmode&replay=${url}`;
      const make = replayClient(search, { document, location: { search, pathname: '/testroom', hash: '', replace: () => {} }, fetch: f });
      const c = make({ url: 'replay:', map: 'MP2', name: 'W', watch: true }, {} as never) as unknown as ReplayClient;
      await c.ready;
      await new Promise((r) => setTimeout(r, 0));          // the cache's own settle
      c.close();
    };
    const closed = await gzip(fixtureBytes());
    const cases: [string, ReturnType<typeof counted>, number][] = [
      ['http://localhost:5303/segments/20.s2r', counted(() => closed), 1],         // closed (gzip): loaded once
      ['http://localhost:5303/segments/21.s2r', counted(() => fixtureBytes()), 2], // a live prefix (plain): again
      ['http://localhost:5303/segments/22.s2r', counted(() => null, 404), 2],      // a failure: again
    ];
    for (const [url, fetcher, want] of cases) {
      await build(url, fetcher.f);
      await build(url, fetcher.f);
      expect(fetcher.n(), url).toBe(want);
    }
    document.querySelectorAll('[data-replay-bar]').forEach((e) => e.remove());
  });
  it('PT-27 (W36.R5): a hosted /replays/<id> on the page\'s configured server plays, the ticket its bearer; with no server it is refused', async () => {
    const hosted = 'https://mp.example.test/replays/0123456789abcdef';
    const search = `?devmode&replay=${encodeURIComponent(hosted)}`;
    const seen: (string | null)[] = [];
    const f = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get('authorization'));
      return new Response(fixtureBytes() as BodyInit);
    }) as typeof fetch;
    const loc = { search, pathname: '/testroom', hash: '', replace: () => {} };
    try {
      const on = replayClient(search, { document, location: loc, fetch: f, server: 'wss://mp.example.test/ws', ticket: () => 'T1cket' });
      const c = on({ url: 'replay:', map: 'MP2', name: 'W', watch: true }, {} as never) as unknown as ReplayClient;
      await c.ready;
      expect(c.state).toBe('open');
      expect(seen).toEqual(['Bearer T1cket']);
      c.close();
      const off = replayClient(search, { document, location: loc, fetch: f });
      const r = off({ url: 'replay:', map: 'MP2', name: 'W', watch: true }, {} as never) as unknown as ReplayClient;
      await r.ready;
      expect(r.state).toBe('refused');
      expect(seen).toHaveLength(1);
      r.close();
    } finally {
      document.querySelectorAll('[data-replay-bar]').forEach((e) => e.remove());   // a failure here leaves no bar for the next test
    }
  });
  it('PT-27\'s nit: the server is read as each client is made -- an in-page Online change reaches the next replay client', async () => {
    // TRS-1: a deployed page's Shared is its own origin, so the hosted address is on it -- a deployed page, since a
    // loopback address is always allowed (W35.R2): Off refuses the hosted address, Shared opens it.
    const hosted = 'https://nightly.socom2legacy.com/replays/0123456789abcdef';
    const search = `?devmode&replay=${encodeURIComponent(hosted)}`;
    const seen: string[] = [];
    const f = (async (u: RequestInfo | URL) => { seen.push(String(u)); return new Response(fixtureBytes() as BodyInit); }) as typeof fetch;
    const loc = { search, pathname: '/testroom', hash: '', replace: () => {}, protocol: 'https:', host: 'nightly.socom2legacy.com', hostname: 'nightly.socom2legacy.com' };
    let stored: string | null = 'off';                                   // the page's stored Online, changed in the page below
    try {
      const make = replayClient(search, { document, location: loc, fetch: f, server: () => replayServer(search, loc, { multiplayer: true, stored: () => stored }) });
      const first = make({ url: 'replay:', map: 'MP2', name: 'W', watch: true }, {} as never) as unknown as ReplayClient;
      await first.ready;
      expect(first.state).toBe('refused');                               // Online Off: no configured server, a hosted address refused
      first.close();
      stored = 'shared';                                                 // the player turns Online to the shared server
      const second = make({ url: 'replay:', map: 'MP2', name: 'W', watch: true }, {} as never) as unknown as ReplayClient;
      await second.ready;
      expect(second.state).toBe('open');
      expect(seen).toEqual([hosted]);
      second.close();
    } finally {
      document.querySelectorAll('[data-replay-bar]').forEach((e) => e.remove());
    }
  });
  it('PT-27: the configured server is the page\'s own -- onlineTarget(resolveOnline) as main.ts joins it; none with multiplayer off', () => {
    const loc = { protocol: 'http:', host: 'localhost:5173', hostname: 'localhost' };
    expect(replayServer('?devmode&server=wss://mp.example.test/ws&replay=x', loc, { multiplayer: true, stored: () => null })).toBe('wss://mp.example.test/ws');
    expect(replayServer('?devmode&replay=x', loc, { multiplayer: true, stored: () => 'shared' })).toBe(sharedServer(loc));   // TRS-1: a local page's Shared, the local stack
    expect(replayServer('?devmode&online=shared&replay=x', loc, { multiplayer: true })).toBe(sharedServer(loc));   // main.ts's SHARE.online first
    expect(replayServer('?devmode&replay=x', loc, { multiplayer: true, stored: () => 'off' })).toBeNull();
    expect(replayServer('?devmode&server=wss://mp.example.test/ws&replay=x', loc, { multiplayer: false, stored: () => 'shared' })).toBeNull();
    // the default deps: the page's server, and no ticket -- the test room holds none (the login's is the lobby client's memory)
    const mount = src('replay/mount.ts');
    expect(mount).toMatch(/server: \(\) => replayServer\(search, location\)/);   // read as each client is made
    expect(mount).not.toMatch(/ticket: \(\) =>/);
  });
  it('main.ts: the replay branch is the capability\'s, a development build\'s and ?devmode\'s only, ahead of the server and the offline room', () => {
    const main = src('main.ts');
    expect(main).toMatch(/const replayOn = TESTROOM_CAPABILITIES\.replay && import\.meta.env\.DEV && DEV\.tools && new URLSearchParams\(SEARCH\)\.has\('replay'\);\n\s+if \(replayOn\) \{[\s\S]{0,900}?import\('\.\/replay\/mount'\)[\s\S]{0,900}?\} else if \(NET\.url && !campaignLoad\) \{/);   // EPH campaign stand: a campaign load plays offline
    expect(main).toMatch(/^\s+client: null,/m);                 // the part's dep, owed: the page's own NetClient outside the mode
    expect(main.match(/client: /g)?.length).toBe(2);             // that one and the replay branch's
  });
});

/**
 * RV2-03 (RV2.R2): the developer's mode gets the same hold from the page's own loading screen -- `main.ts` hands
 * `held: () => loadingJoin.blocked` with the page's hooks: the client opens held (the engine's `autoplay: false`), the
 * loop skips `advance` while the hook says the screen shows, and the first frame after it releases the client, which plays
 * from there. Without the hook, as before (byte-equal: the client plays at its open, the loop advances every frame).
 */
describe('RV2-03: the developer\'s mode holds while the page\'s loading screen shows', () => {
  const W = { url: 'replay:', map: 'MP2', name: 'W', watch: true } as NetOptions;
  const at = (search: string) => ({ search, pathname: '/testroom', hash: '', replace: () => {} });
  it('with the page\'s held hook: held while it is true, the loop never advancing; the next frame after releases and plays', async () => {
    const search = '?devmode&replay=http://localhost:5303/segments/30.s2r';
    const frames: (() => void)[] = [];
    let loading = true;
    const advance = vi.spyOn(ReplayClient.prototype, 'advance');
    try {
      const make = replayClient(search, { document, location: at(search), fetch: fakeFetch(fixtureBytes()), frame: (run) => { frames.push(run); } }, { held: () => loading });
      const c = make(W, {} as never) as unknown as ReplayClient;
      await c.ready;
      frames.shift()!();
      frames.shift()!();
      expect(advance).not.toHaveBeenCalled();
      expect([c.state, c.held(), c.playing(), c.serverTick()]).toEqual(['open', true, false, 0]);
      loading = false;                                        // the loading screen hides
      frames.shift()!();
      expect(advance).toHaveBeenCalledTimes(1);
      expect([c.held(), c.playing()]).toEqual([false, true]);
      frames.shift()!();
      expect(advance).toHaveBeenCalledTimes(2);
      c.close();
      frames.shift()!();
    } finally {
      advance.mockRestore();
      document.querySelectorAll('[data-replay-bar]').forEach((e) => e.remove());
    }
  });
  it('without it, as before: not held, playing from its open, the loop advancing every frame', async () => {
    const search = '?devmode&replay=http://localhost:5303/segments/31.s2r';
    const frames: (() => void)[] = [];
    const advance = vi.spyOn(ReplayClient.prototype, 'advance');
    try {
      const make = replayClient(search, { document, location: at(search), fetch: fakeFetch(fixtureBytes()), frame: (run) => { frames.push(run); } });
      const c = make(W, {} as never) as unknown as ReplayClient;
      expect(advance).toHaveBeenCalledTimes(1);               // the loop's first run, at the factory
      await c.ready;
      expect([c.held(), c.playing()]).toEqual([false, true]);
      frames.shift()!();
      frames.shift()!();
      expect(advance).toHaveBeenCalledTimes(3);
      c.close();
      frames.shift()!();
    } finally {
      advance.mockRestore();
      document.querySelectorAll('[data-replay-bar]').forEach((e) => e.remove());
    }
  });
});

describe('the replay\'s keys (REPLAY_ADAPTATION)', () => {
  it('Space play/pause, , and . step, [ and ] speed, Home and End', () => {
    expect(REPLAY_KEYS).toEqual({ Space: 'toggle', Comma: 'back', Period: 'forward', BracketLeft: 'slower', BracketRight: 'faster', Home: 'start', End: 'end' });
    expect(replayKeyAction('KeyW')).toBeNull();
    const calls: string[] = [];
    const fake = new Proxy({}, { get: (_t, k) => (...a: unknown[]) => { calls.push(`${String(k)}(${a.join(',')})`); return 0; } }) as never;
    for (const code of Object.keys(REPLAY_KEYS)) replayKeyAction(code)!(fake);
    expect(calls).toEqual(['toggle()', 'step(-1)', 'step(1)', 'slower()', 'faster()', 'seekStart()', 'seekEnd()']);
  });
});

describe('the bar', () => {
  it('a small bar: the mode, play or pause, the speed, the tick of the end, partial when it is', async () => {
    const { mountReplayBar } = await import('../src/replay/controls');
    const { records, truncated } = decodeRecords(fixtureBytes(fixtureBytesRecordsNoEnd()));
    const h = records[0]!;
    if (h.kind !== 'header') throw new Error('no header');
    const replay = new ReplayClient(Promise.resolve({ header: h.header, records, truncated }), { name: 'W', map: 'MP2', now: () => 0 });
    await replay.ready;
    const bar = mountReplayBar(document, replay);
    bar.render();
    const el = [...document.querySelectorAll('[data-replay-bar]')].at(-1)!;
    expect(el.textContent).toMatch(/REPLAY/);
    expect(el.textContent).toMatch(/1x/);
    expect(el.textContent).toMatch(/0 \/ 500/);
    expect(el.textContent).toMatch(/partial/);
    bar.dispose();
    expect(document.querySelector('[data-replay-bar]')).toBeNull();
  });
});

function fixtureBytesRecordsNoEnd() {
  const { records } = decodeRecords(fixtureBytes());
  return records.filter((r) => r.kind !== 'end');
}
