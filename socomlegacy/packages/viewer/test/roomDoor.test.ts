import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  askRoomPass, GAME_RETOKEN_WAIT_MS_ADAPTATION, hostedRoom, isPinnedRoomDoor, pinnedRoomDoor, roomKeyOf, ownOriginRoomSocket, roomPathOf, startRoomJoin,
  type RoomSeat, type RoomSeatProvider,
} from '../src/connectHost';

/**
 * SA-7h S5 (the server split, SA.R14, SA.R22 (3)-(4); product track, `ROOM_DOOR_ADAPTATION`): the test room's `?mp` page
 * joins a **host-run standing room** -- one central's `/rooms` lists with `hosted: true` -- through central's room pass
 * (`POST /lobby/room-pass`, the page's own origin): the door it hands is pinned (`pinnedRoomDoor`: the production
 * `wss://<host>.play.socom2legacy.com/r/<MAP>/classic` or the devmode loopback, the room asked), its token goes in the
 * hello, the login's bearer never to a door. Any other room, origin or server keeps today's path. Fake fetches; no server
 * is contacted. Doors, names and tokens invented.
 */

const ROOM = 'MP2/classic';
const DOOR = 'wss://firehuge.play.socom2legacy.com/r/MP2/classic';
const DEV_DOOR = 'ws://127.0.0.1:5344/r/MP2/classic';
/** A room token's form (three base64url parts), invented; joined so no literal reads as a credential. */
const TOKEN = ['aGVhZGVy', 'cm9vbQ', 'c2ln'].join('.');
const BEARER = ['bearer', 'of', 'the', 'login'].join('-');
const BASE = 'https://site.test';

type Call = { url: string; init: RequestInit };
function central(answers: ((c: Call) => { status: number; body?: unknown; raw?: string; type?: string } | 'throw' | 'hang')[]) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init: RequestInit = {}) => {
    const c = { url: String(url), init };
    calls.push(c);
    const a = answers[calls.length - 1]?.(c) ?? { status: 500 };
    if (a === 'throw') throw new TypeError('network');
    // A request that never answers until its signal aborts it (the page's bound).
    if (a === 'hang') return new Promise<Response>((_, no) => { init.signal?.addEventListener('abort', () => { no(new DOMException('aborted', 'AbortError')); }); });
    const text = a.raw ?? (a.body === undefined ? null : JSON.stringify(a.body));
    return new Response(text, { status: a.status, headers: { 'content-type': a.type ?? 'application/json' } });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}
const body = (c: Call): unknown => JSON.parse(String(c.init.body));
const auth = (c: Call): string | null => new Headers(c.init.headers).get('authorization');
const seat = { status: 200, body: { status: 0, door: DOOR, token: TOKEN, expiresAt: 1 } };

describe('SA-7h S5: the standing room\'s door (pinnedRoomDoor)', () => {
  it('takes the production door and, in devmode only, the loopback 5343-5349 -- for the room asked alone', () => {
    expect(pinnedRoomDoor(DOOR, ROOM, false)?.url).toBe(DOOR);
    expect(isPinnedRoomDoor(pinnedRoomDoor(DOOR, ROOM, false))).toBe(true);
    expect(pinnedRoomDoor(DEV_DOOR, ROOM, true)?.url).toBe(DEV_DOOR);
    expect(pinnedRoomDoor(DEV_DOOR, ROOM, false)).toBeNull();
    expect(pinnedRoomDoor('ws://127.0.0.1:5343/r/MP2/classic', ROOM, true)).not.toBeNull();
    expect(pinnedRoomDoor('ws://127.0.0.1:5349/r/MP2/classic', ROOM, true)).not.toBeNull();
    expect(pinnedRoomDoor(DOOR, 'MP5/classic', false)).toBeNull();
  });

  it('refuses every other scheme, host, port, path, query, credentials or room', () => {
    for (const raw of [
      'ws://firehuge.play.socom2legacy.com/r/MP2/classic', 'wss://firehuge.play.socom2legacy.com.evil.test/r/MP2/classic',
      'wss://FIREHUGE.play.socom2legacy.com/r/MP2/classic', 'wss://-x.play.socom2legacy.com/r/MP2/classic',
      'wss://firehuge.play.socom2legacy.com:444/r/MP2/classic', 'wss://firehuge.play.socom2legacy.com/r/MP2/classic?x=1',
      'wss://firehuge.play.socom2legacy.com/r/MP2/respawn', 'wss://firehuge.play.socom2legacy.com/g/7',
      ['wss://u:p', 'firehuge.play.socom2legacy.com/r/MP2/classic'].join(String.fromCharCode(64)), 'ws://127.0.0.1:5342/r/MP2/classic',
      'ws://127.0.0.1:5350/r/MP2/classic', 'ws://localhost:5344/r/MP2/classic', 'wss://127.0.0.1:5344/r/MP2/classic',
    ]) expect(pinnedRoomDoor(raw, ROOM, true), raw).toBeNull();
    expect(pinnedRoomDoor(7, ROOM, true)).toBeNull();
    expect(pinnedRoomDoor(DOOR, 'MP2', false)).toBeNull();
  });
});

describe('SA-7h S5: which rooms ask a pass (roomKeyOf, hostedRoom, ownOriginRoomSocket)', () => {
  it('a classic map room\'s key; none for respawn or a stem of another form', () => {
    expect(roomKeyOf('MP2', 'classic')).toBe(ROOM);
    expect(roomKeyOf('mp12', 'classic')).toBe('MP12/classic');
    expect(roomKeyOf('MP2', 'respawn')).toBeNull();
    expect(roomKeyOf('M01', 'classic')).toBeNull();
  });

  // LATER 229: the page keys by the rules the room will play (`playedRules`, LATER 153: respawn is SUPPRESSION's alone,
  // FUN_002a7560 D:L149405-149431), as the server keys its rooms (LATER 212) -- the map's type the page's own read of the
  // mission list (`kitGameType`). A respawn page on a type 1-4 map looks for the classic room it shares.
  it("LATER 229: a respawn page on a type 1-4 map asks the classic room's key; on SUPPRESSION (5), or a map off the list, none", () => {
    for (const type of [1, 2, 3, 4] as const) expect(roomKeyOf('MP2', 'respawn', type), String(type)).toBe(ROOM);
    expect(roomKeyOf('MP2', 'respawn', 5)).toBeNull();
    expect(roomKeyOf('MP2', 'respawn', undefined)).toBeNull();
    expect(roomKeyOf('MP2', 'classic', 5)).toBe(ROOM);
  });

  it('hosted only where /rooms lists that room with hosted: true', () => {
    expect(hostedRoom([{ map: 'MP2', rules: 'classic', players: 0, spectators: 0, round: 1, hosted: true }], ROOM)).toBe(true);
    expect(hostedRoom([{ map: 'MP2', rules: 'classic', players: 0, spectators: 0, round: 1 }], ROOM)).toBe(false);
    expect(hostedRoom([{ map: 'MP2', rules: 'classic', hosted: 'yes' }], ROOM)).toBe(false);
    expect(hostedRoom([{ map: 'MP5', rules: 'classic', hosted: true }], ROOM)).toBe(false);
    expect(hostedRoom({ rooms: [] }, ROOM)).toBe(false);
    expect(hostedRoom(null, ROOM)).toBe(false);
  });

  it('only the page\'s own origin\'s /ws (the bare ?mp) -- never shared, local or a server=', () => {
    const loc = { protocol: 'https:', host: 'site.test', origin: BASE };
    expect(ownOriginRoomSocket('wss://site.test/ws', loc)).toBe(true);
    expect(ownOriginRoomSocket('ws://site.test/ws', loc)).toBe(false);
    expect(ownOriginRoomSocket('wss://mp.socomunzipped.com/ws', loc)).toBe(false);
    expect(ownOriginRoomSocket('ws://localhost:8787/ws', loc)).toBe(false);
    expect(ownOriginRoomSocket('ws://site.test/ws', { protocol: 'http:', host: 'site.test' })).toBe(true);
  });
});

describe('SA-7h S5: the room pass (askRoomPass)', () => {
  it('a guest posts exactly { room, name } with no Authorization, on the page\'s origin; the seat pinned', async () => {
    const c = central([() => seat]);
    const r = await askRoomPass({ base: BASE, room: ROOM, name: 'Kilo', devDoors: false, fetch: c.fetch });
    expect(c.calls[0]!.url).toBe(`${BASE}/lobby/room-pass`);
    expect(c.calls[0]!.init.method).toBe('POST');
    expect(new Headers(c.calls[0]!.init.headers).get('content-type')).toBe('application/json');
    expect(auth(c.calls[0]!)).toBeNull();
    expect(body(c.calls[0]!)).toEqual({ room: ROOM, name: 'Kilo' });
    expect(r.kind).toBe('seat');
    if (r.kind === 'seat') { expect(r.seat.pinned.url).toBe(DOOR); expect(r.seat.token).toBe(TOKEN); }
  });

  it('signed in: the bearer and exactly { room }; a 401 asks once again as the typed-name guest', async () => {
    const c = central([() => seat]);
    await askRoomPass({ base: BASE, room: ROOM, name: 'Kilo', bearer: BEARER, devDoors: false, fetch: c.fetch });
    expect(auth(c.calls[0]!)).toBe(`Bearer ${BEARER}`);
    expect(body(c.calls[0]!)).toEqual({ room: ROOM });
    const d = central([() => ({ status: 401 }), () => seat]);
    const r = await askRoomPass({ base: BASE, room: ROOM, name: 'Kilo', bearer: BEARER, devDoors: false, fetch: d.fetch });
    expect(d.calls).toHaveLength(2);
    expect(auth(d.calls[1]!)).toBeNull();
    expect(body(d.calls[1]!)).toEqual({ room: ROOM, name: 'Kilo' });
    expect(r.kind).toBe('seat');
  });

  it('a guest\'s blank or unprintable name asks nothing (central would refuse it)', async () => {
    for (const name of ['', '   ', 'Kélo', 'x'.repeat(33)]) {
      const c = central([() => seat]);
      expect(await askRoomPass({ base: BASE, room: ROOM, name, devDoors: false, fetch: c.fetch })).toEqual({ kind: 'refused', why: 'name' });
      expect(c.calls).toHaveLength(0);
    }
  });

  it('the refusals to their kinds; a 5xx or a network failure is the backoff\'s', async () => {
    const cases: [{ status: number; body?: unknown } | 'throw', unknown][] = [
      [{ status: 409, body: { refused: 'already seated' } }, { kind: 'refused', why: 'already seated' }],
      [{ status: 404 }, { kind: 'refused', why: 'no room' }],
      [{ status: 503 }, { kind: 'refused', why: 'unavailable' }],
      [{ status: 400 }, { kind: 'refused', why: 'rejected' }],
      [{ status: 403 }, { kind: 'refused', why: 'rejected' }],
      [{ status: 401 }, { kind: 'refused', why: 'rejected' }],
      [{ status: 418 }, { kind: 'refused', why: 'rejected' }],
      [{ status: 429 }, { kind: 'failed' }],                     // rate limited: transient, the backoff's
      [{ status: 500 }, { kind: 'failed' }],
      ['throw', { kind: 'failed' }],
    ];
    for (const [a, want] of cases) {
      const c = central([() => a]);
      expect(await askRoomPass({ base: BASE, room: ROOM, name: 'Kilo', devDoors: false, fetch: c.fetch }), JSON.stringify(a)).toEqual(want);
    }
  });

  it('a 200 whose door is not one the page follows, or whose token is malformed, is refused -- never opened', async () => {
    for (const b of [
      { status: 0, door: 'wss://evil.test/r/MP2/classic', token: TOKEN }, { status: 0, door: DEV_DOOR, token: TOKEN },
      { status: 0, door: 'wss://firehuge.play.socom2legacy.com/r/MP5/classic', token: TOKEN },
      { status: 0, door: DOOR, token: 'not a token' }, { status: 1, door: DOOR, token: TOKEN }, { door: DOOR },
    ]) {
      const c = central([() => ({ status: 200, body: b })]);
      expect(await askRoomPass({ base: BASE, room: ROOM, name: 'Kilo', devDoors: false, fetch: c.fetch }), JSON.stringify(b)).toEqual({ kind: 'refused', why: 'rejected' });
    }
    const dev = central([() => ({ status: 200, body: { status: 0, door: DEV_DOOR, token: TOKEN } })]);
    expect((await askRoomPass({ base: BASE, room: ROOM, name: 'Kilo', devDoors: true, fetch: dev.fetch })).kind).toBe('seat');
  });
});

/** Microtasks run out (the fetches' and the join's promise chains). */
const settle = async (): Promise<void> => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const LISTED = { status: 200, body: [{ map: 'MP2', rules: 'classic', players: 1, spectators: 0, round: 1, hosted: true }] };

/** The join's answers, recorded in order. */
function joined() {
  const got: string[] = [];
  let seat: RoomSeat | null = null, provider: RoomSeatProvider | null = null;
  const h = {
    today: () => { got.push('today'); },
    seat: (s: RoomSeat, p: RoomSeatProvider) => { got.push('seat'); seat = s; provider = p; },
    refused: (why: string) => { got.push(`refused ${why}`); },
    retrying: (ms: number) => { got.push(`retrying ${ms}`); },
  };
  return { h, got, seat: () => seat, provider: () => provider };
}
const delay = (n: number): number => 2000 * 2 ** n;

describe('SA-7h S5: the page\'s join (startRoomJoin; the review\'s F1)', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('a hosted room: /rooms on the page\'s origin, then the pass -- its seat and a provider that passes afresh', async () => {
    const c = central([() => LISTED, () => seat, () => seat]);
    const j = joined();
    startRoomJoin({ base: BASE, room: ROOM, name: () => 'Kilo', devDoors: false, fetch: c.fetch, delayMs: delay }, j.h);
    await settle();
    expect(c.calls[0]!.url).toBe(`${BASE}/rooms`);
    expect(j.got).toEqual(['seat']);
    expect(j.provider()!.room).toBe(ROOM);
    expect((await j.provider()!.pass()).kind).toBe('seat');
    expect(c.calls).toHaveLength(3);
  });

  it('not hosted, /rooms unreadable, or /rooms not answering within the bound: today\'s path, no pass asked', async () => {
    for (const a of [{ status: 200, body: [{ map: 'MP2', rules: 'classic', players: 1, spectators: 0, round: 1 }] }, { status: 500 }, 'throw' as const]) {
      const c = central([() => a]);
      const j = joined();
      startRoomJoin({ base: BASE, room: ROOM, name: () => 'Kilo', devDoors: false, fetch: c.fetch, delayMs: delay }, j.h);
      await settle();
      expect(j.got, JSON.stringify(a)).toEqual(['today']);
      expect(c.calls).toHaveLength(1);
    }
    vi.useFakeTimers();
    const c = central([() => 'hang']);
    const j = joined();
    startRoomJoin({ base: BASE, room: ROOM, name: () => 'Kilo', devDoors: false, fetch: c.fetch, delayMs: delay }, j.h);
    await settle();
    expect(j.got).toEqual([]);
    vi.advanceTimersByTime(GAME_RETOKEN_WAIT_MS_ADAPTATION);
    await settle();
    expect(j.got).toEqual(['today']);
  });

  it('hosted but the pass refused: the refusal, no retry and no fall back to /ws (the room gone between the list and the pass: 404)', async () => {
    for (const [a, why] of [[{ status: 404 }, 'no room'], [{ status: 409, body: { refused: 'already seated' } }, 'already seated'], [{ status: 503 }, 'unavailable']] as const) {
      const c = central([() => LISTED, () => a, () => seat]);
      const j = joined();
      startRoomJoin({ base: BASE, room: ROOM, name: () => 'Kilo', devDoors: false, fetch: c.fetch, delayMs: delay }, j.h);
      await settle();
      expect(j.got).toEqual([`refused ${why}`]);
      expect(c.calls).toHaveLength(2);
    }
  });

  it('F1: a failed first pass (a 5xx, the network, no answer within the bound) takes the backoff and asks again', async () => {
    vi.useFakeTimers();
    const c = central([() => LISTED, () => ({ status: 500 }), () => 'throw', () => 'hang', () => seat]);
    const j = joined();
    startRoomJoin({ base: BASE, room: ROOM, name: () => 'Kilo', devDoors: false, fetch: c.fetch, delayMs: delay }, j.h);
    await settle();
    expect(j.got).toEqual(['retrying 2000']);
    vi.advanceTimersByTime(1999); await settle();
    expect(c.calls).toHaveLength(2);
    vi.advanceTimersByTime(1); await settle();
    expect(c.calls).toHaveLength(3);
    expect(j.got).toEqual(['retrying 2000', 'retrying 4000']);
    vi.advanceTimersByTime(4000); await settle();
    expect(c.calls).toHaveLength(4);                             // the hung one
    vi.advanceTimersByTime(GAME_RETOKEN_WAIT_MS_ADAPTATION); await settle();
    expect(j.got).toEqual(['retrying 2000', 'retrying 4000', 'retrying 8000']);
    vi.advanceTimersByTime(8000); await settle();
    expect(j.got.at(-1)).toBe('seat');
    expect(c.calls).toHaveLength(5);
  });

  it('a superseded connect (cancel) answers nothing: not the list\'s, not the pass\'s, and no retry after it', async () => {
    vi.useFakeTimers();
    let release: (() => void) | null = null;
    const slow = central([() => LISTED, () => seat]);
    const held = (async (url: string, init?: RequestInit) => { await new Promise<void>((ok) => { release = ok; }); return slow.fetch(url, init); }) as typeof fetch;
    const a = joined();
    const ja = startRoomJoin({ base: BASE, room: ROOM, name: () => 'Kilo', devDoors: false, fetch: held, delayMs: delay }, a.h);
    ja.cancel();
    release!();
    await settle();
    expect(a.got).toEqual([]);
    const c = central([() => LISTED, () => ({ status: 500 }), () => seat]);
    const b = joined();
    const jb = startRoomJoin({ base: BASE, room: ROOM, name: () => 'Kilo', devDoors: false, fetch: c.fetch, delayMs: delay }, b.h);
    await settle();
    expect(b.got).toEqual(['retrying 2000']);
    jb.cancel();
    vi.advanceTimersByTime(60_000); await settle();
    expect(c.calls).toHaveLength(2);
    expect(b.got).toEqual(['retrying 2000']);
  });
});

describe('LATER 263: a 404 on /rooms -- the route not served (O29\'s tunnel rule) -- is its own answer', () => {
  afterEach(() => { vi.useRealTimers(); });
  const both = (j: ReturnType<typeof joined>) => ({
    ...j.h, unlisted: (ms: number) => { j.got.push(`unlisted ${ms}`); }, noRoute: () => { j.got.push('no route'); },
  });

  it('with a noRoute answer: noRoute once, no retry and no pass', async () => {
    vi.useFakeTimers();
    const c = central([() => ({ status: 404 }), () => LISTED, () => seat]);
    const j = joined();
    startRoomJoin({ base: BASE, room: ROOM, name: () => 'Kilo', devDoors: false, fetch: c.fetch, delayMs: delay }, both(j));
    await settle();
    expect(j.got).toEqual(['no route']);
    vi.advanceTimersByTime(120_000); await settle();
    expect(c.calls).toHaveLength(1);
    expect(j.got).toEqual(['no route']);
  });

  it('the review\'s finding 1: a 2xx that is not JSON (a static host\'s fallback page) is the route not served too -- by its type, so a JSON list cut short is still retried', async () => {
    vi.useFakeTimers();
    for (const page of [{ status: 200, raw: '<!doctype html><title>s2u</title>', type: 'text/html; charset=utf-8' }, { status: 200, raw: 'ok', type: 'text/plain' }]) {
      const c = central([() => page]);
      const j = joined();
      startRoomJoin({ base: BASE, room: ROOM, name: () => 'Kilo', devDoors: false, fetch: c.fetch, delayMs: delay }, both(j));
      await settle();
      expect(j.got, page.type).toEqual(['no route']);
      vi.advanceTimersByTime(120_000); await settle();
      expect(c.calls).toHaveLength(1);
    }
    const cut = central([() => ({ status: 200, raw: '[{"map":"MP2",', type: 'application/json; charset=utf-8' }), () => LISTED, () => seat]);
    const j = joined();
    startRoomJoin({ base: BASE, room: ROOM, name: () => 'Kilo', devDoors: false, fetch: cut.fetch, delayMs: delay }, both(j));
    await settle();
    expect(j.got).toEqual(['unlisted 2000']);
    vi.advanceTimersByTime(2000); await settle();
    expect(j.got.at(-1)).toBe('seat');
  });

  it('the review\'s finding 2: a 5xx then a 404 -- unlisted, then the route not served, and no third request; a cancel with the 404 in flight answers nothing', async () => {
    vi.useFakeTimers();
    const c = central([() => ({ status: 502 }), () => ({ status: 404 }), () => LISTED]);
    const j = joined();
    startRoomJoin({ base: BASE, room: ROOM, name: () => 'Kilo', devDoors: false, fetch: c.fetch, delayMs: delay }, both(j));
    await settle();
    expect(j.got).toEqual(['unlisted 2000']);
    vi.advanceTimersByTime(2000); await settle();
    expect(j.got).toEqual(['unlisted 2000', 'no route']);
    vi.advanceTimersByTime(120_000); await settle();
    expect(c.calls).toHaveLength(2);
    let release: (() => void) | null = null;
    const slow = central([() => ({ status: 404 })]);
    const held = (async (url: string, init?: RequestInit) => { await new Promise<void>((ok) => { release = ok; }); return slow.fetch(url, init); }) as typeof fetch;
    const k = joined();
    const run = startRoomJoin({ base: BASE, room: ROOM, name: () => 'Kilo', devDoors: false, fetch: held, delayMs: delay }, both(k));
    await settle();
    run.cancel();
    release!();
    await settle();
    expect(k.got).toEqual([]);
  });

  it('a 5xx or the network is still unlisted (retried); without a noRoute answer a 404 keeps its old answers (today\'s; unlisted)', async () => {
    for (const a of [{ status: 500 }, { status: 503 }, 'throw' as const]) {
      const c = central([() => a]);
      const j = joined();
      const run = startRoomJoin({ base: BASE, room: ROOM, name: () => 'Kilo', devDoors: false, fetch: c.fetch, delayMs: delay }, both(j));
      await settle();
      expect(j.got, JSON.stringify(a)).toEqual(['unlisted 2000']);
      run.cancel();
    }
    const c = central([() => ({ status: 404 })]);
    const j = joined();
    startRoomJoin({ base: BASE, room: ROOM, name: () => 'Kilo', devDoors: false, fetch: c.fetch, delayMs: delay }, j.h);
    await settle();
    expect(j.got).toEqual(['today']);
    const d = central([() => ({ status: 404 })]);
    const k = joined();
    const run = startRoomJoin({ base: BASE, room: ROOM, name: () => 'Kilo', devDoors: false, fetch: d.fetch, delayMs: delay }, { ...k.h, unlisted: (ms: number) => { k.got.push(`unlisted ${ms}`); } });
    await settle();
    expect(k.got).toEqual(['unlisted 2000']);
    run.cancel();
  });
});

describe('TRS-2: Shared lists again while /rooms is unreadable (the TRS review\'s F1)', () => {
  afterEach(() => { vi.useRealTimers(); });
  const relist = (j: ReturnType<typeof joined>) => ({ ...j.h, unlisted: (ms: number) => { j.got.push(`unlisted ${ms}`); } });

  it('with an unlisted answer: a 5xx, the network or no answer within the bound takes the backoff and lists again -- never today\'s path', async () => {
    vi.useFakeTimers();
    const c = central([() => ({ status: 500 }), () => 'throw', () => 'hang', () => LISTED, () => seat]);
    const j = joined();
    startRoomJoin({ base: BASE, room: ROOM, name: () => 'Kilo', devDoors: false, fetch: c.fetch, delayMs: delay }, relist(j));
    await settle();
    expect(j.got).toEqual(['unlisted 2000']);
    vi.advanceTimersByTime(1999); await settle();
    expect(c.calls).toHaveLength(1);
    vi.advanceTimersByTime(1); await settle();
    expect(c.calls).toHaveLength(2);
    expect(j.got).toEqual(['unlisted 2000', 'unlisted 4000']);
    vi.advanceTimersByTime(4000); await settle();
    expect(c.calls).toHaveLength(3);                             // the hung one
    vi.advanceTimersByTime(GAME_RETOKEN_WAIT_MS_ADAPTATION); await settle();
    expect(j.got).toEqual(['unlisted 2000', 'unlisted 4000', 'unlisted 8000']);
    vi.advanceTimersByTime(8000); await settle();
    expect(c.calls.map((x) => x.url === `${BASE}/rooms`)).toEqual([true, true, true, true, false]);
    expect(j.got.at(-1)).toBe('seat');
  });

  it('a list read without the room hosted is still today\'s answer; a cancel stops the relisting', async () => {
    const c = central([() => ({ status: 200, body: [] })]);
    const j = joined();
    startRoomJoin({ base: BASE, room: ROOM, name: () => 'Kilo', devDoors: false, fetch: c.fetch, delayMs: delay }, relist(j));
    await settle();
    expect(j.got).toEqual(['today']);
    vi.useFakeTimers();
    const d = central([() => ({ status: 500 }), () => LISTED, () => seat]);
    const k = joined();
    const jk = startRoomJoin({ base: BASE, room: ROOM, name: () => 'Kilo', devDoors: false, fetch: d.fetch, delayMs: delay }, relist(k));
    await settle();
    expect(k.got).toEqual(['unlisted 2000']);
    jk.cancel();
    vi.advanceTimersByTime(60_000); await settle();
    expect(d.calls).toHaveLength(1);
    expect(k.got).toEqual(['unlisted 2000']);
  });
});

describe('TRS-1: the room path (roomPathOf; the TRS review\'s F2)', () => {
  it('a room key with a room base: ask; Shared chosen without one (respawn, a stem not MP<n>): none, never /ws; else today\'s', () => {
    for (const shared of [true, false]) expect(roomPathOf({ shared, roomBase: BASE, room: roomKeyOf('MP2', 'classic') })).toBe('ask');
    for (const room of [roomKeyOf('MP2', 'respawn', 5), roomKeyOf('M01', 'classic')]) {
      expect(room).toBeNull();
      expect(roomPathOf({ shared: true, roomBase: BASE, room })).toBe('none');
      expect(roomPathOf({ shared: false, roomBase: BASE, room })).toBe('today');
    }
    expect(roomPathOf({ shared: true, roomBase: null, room: null })).toBe('none');
    expect(roomPathOf({ shared: false, roomBase: null, room: null })).toBe('today');
  });
});

describe('SA-7h S5: the provider\'s pass is bounded (the review\'s F1)', () => {
  afterEach(() => { vi.useRealTimers(); });
  it('a pass that does not answer within GAME_RETOKEN_WAIT_MS_ADAPTATION is aborted: failed', async () => {
    vi.useFakeTimers();
    const c = central([() => LISTED, () => seat, () => 'hang']);
    const j = joined();
    startRoomJoin({ base: BASE, room: ROOM, name: () => 'Kilo', devDoors: false, fetch: c.fetch, delayMs: delay }, j.h);
    await settle();
    let r: unknown = null;
    void j.provider()!.pass().then((x) => { r = x; });
    await settle();
    expect(r).toBeNull();
    vi.advanceTimersByTime(GAME_RETOKEN_WAIT_MS_ADAPTATION); await settle();
    expect(r).toEqual({ kind: 'failed' });
  });
});
