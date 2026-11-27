// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPrototypeLobbySession } from '../src/xboxPrototype/lobbySession';

const BASE = 'https://experiment.example';
const PASSWORD = '<test-password>', TICKET = 'invented-session-ticket';
// Public synthetic envelope: shape-only tests, never a signed credential.
const ENVELOPE = 'header.payload.signature';
const sessions: ReturnType<typeof createPrototypeLobbySession>[] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function entry(level = 71) {
  return { status: 0, mediusWorldId: 3, gameName: 'Test room$~US CENTRAL', gameLevel: level, playerCount: 1,
    minPlayers: 2, maxPlayers: 16, playerSkillLevel: 0, rulesSet: 1, genericField1: 1, genericField2: 65000,
    genericField3: 0, securityLevel: 0, worldStatus: 1, gameHostType: 0, gameStats: '', endOfList: true };
}
interface Call { path: string; init: RequestInit; body: Record<string, unknown> }
function rig(answer?: (call: Call) => Response | Promise<Response> | undefined, developmentDoors = false) {
  const calls: Call[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const path = new URL(String(url)).pathname;
    expect(new URL(String(url)).origin).toBe(BASE);
    const call = { path, init, body: JSON.parse(String(init.body)) as Record<string, unknown> }; calls.push(call);
    const overridden = answer?.(call);
    if (overridden) return overridden;
    if (path === '/account/login') return json({ status: 0, ticket: TICKET });
    if (path === '/lobby/game-list') return json({ entries: [entry()] });
    return json({ status: 0, mediusWorldId: path === '/lobby/join-game' ? 3 : 1 });
  }) as typeof fetch;
  const session = createPrototypeLobbySession(BASE, { fetch: fetchFn, developmentDoors }); sessions.push(session);
  return { session, calls };
}
async function listed(session: ReturnType<typeof createPrototypeLobbySession>) {
  await session.login('RendererTest', PASSWORD);
  await session.games();
}
afterEach(async () => { await Promise.all(sessions.splice(0).map(s => s.close())); vi.useRealTimers(); });

describe('experiment-only authenticated lobby session', () => {
  it('uses a separate account session and the selected existing game, without creating a room', async () => {
    const { session, calls } = rig();
    await session.login('RendererTest', PASSWORD);
    expect(await session.games()).toEqual([{ id: 3, name: 'Test room', map: 'MP71', players: 1 }]);
    expect(await session.join(3, 'MP71')).toEqual({ url: 'wss://experiment.example/ws', name: 'RendererTest', map: 'MP71', game: { id: 3, ticket: TICKET } });
    expect(calls.some(c => c.path === '/lobby/create-game')).toBe(false);
    expect(calls[0]?.body).toEqual({ name: 'RendererTest', password: PASSWORD, savePassword: false });
    for (const call of calls) { expect(call.init.credentials).toBe('omit'); expect(call.init.cache).toBe('no-store'); }
    expect(JSON.stringify(session)).not.toContain(PASSWORD);
    expect(JSON.stringify(session)).not.toContain(TICKET);
    await session.close();
    expect(calls.slice(-2).map(c => c.path)).toEqual(['/lobby/leave-game', '/account/logout']);
    expect(calls.slice(-2).map(c => c.init.keepalive)).toEqual([true, true]);
    expect(calls.at(-1)?.body).toEqual({ ticket: TICKET });
  });

  it('only registers when explicitly requested, and preserves a refused account status without secrets', async () => {
    const { session, calls } = rig(c => c.path === '/account/create' ? json({ status: -989 }) : undefined);
    await expect(session.login('RendererTest', PASSWORD, true)).rejects.toThrow('status -989');
    expect(calls.map(c => c.path)).toEqual(['/account/create']);
  });

  it('uses a validated placed-game door with its seat token and no login ticket', async () => {
    const { session } = rig(c => c.path === '/lobby/join-game' ? json({ status: 0, mediusWorldId: 3,
      door: 'wss://us-test.play.socom2legacy.com/g/3', token: ENVELOPE }) : undefined);
    await listed(session);
    expect(await session.join(3, 'MP71')).toEqual({ url: 'wss://us-test.play.socom2legacy.com/g/3', map: 'MP71', name: 'RendererTest',
      game: { id: 3, token: ENVELOPE } });
  });

  it('allows only the existing loopback door form under the explicit development option', async () => {
    const answer = (c: Call) => c.path === '/lobby/join-game' ? json({ status: 0, mediusWorldId: 3,
      door: 'ws://127.0.0.1:5343/g/3', token: ENVELOPE }) : undefined;
    const ordinary = rig(answer).session;
    await listed(ordinary);
    await expect(ordinary.join(3, 'MP71')).rejects.toThrow('Invalid game door or token');
    const development = rig(answer, true).session;
    await listed(development);
    expect((await development.join(3, 'MP71')).url).toBe('ws://127.0.0.1:5343/g/3');
  });

  it.each([
    { door: 'wss://untrusted.example/g/3', token: ENVELOPE },
    { door: 'wss://us-test.play.socom2legacy.com/g/4', token: ENVELOPE },
    { door: 'wss://us-test.play.socom2legacy.com/g/3', token: 'none' },
    { door: 'wss://us-test.play.socom2legacy.com/g/3' },
    { token: ENVELOPE },
  ])('rejects an invalid placed seat and leaves its reservation on close: %j', async fields => {
    const { session, calls } = rig(c => c.path === '/lobby/join-game' ? json({ status: 0, mediusWorldId: 3, ...fields }) : undefined);
    await listed(session);
    await expect(session.join(3, 'MP71')).rejects.toThrow('Invalid game door or token');
    await session.close();
    expect(calls.slice(-2).map(c => c.path)).toEqual(['/lobby/leave-game', '/account/logout']);
  });

  it('rejects a stale map selection before reserving a game seat', async () => {
    let lists = 0;
    const { session, calls } = rig(c => c.path === '/lobby/game-list' ? json({ entries: [entry(++lists > 1 ? 2 : 71)] }) : undefined);
    await listed(session);
    await expect(session.join(3, 'MP71')).rejects.toThrow('Selected game changed');
    expect(calls.some(c => c.path === '/lobby/join-game')).toBe(false);
  });

  it('does not join an unlisted selection or accept a mismatched joined game id', async () => {
    const { session, calls } = rig(c => c.path === '/lobby/join-game' ? json({ status: 0, mediusWorldId: 4 }) : undefined);
    await listed(session);
    await expect(session.join(4, 'MP71')).rejects.toThrow('Choose a listed game');
    expect(calls.some(c => c.path === '/lobby/join-game')).toBe(false);
    await expect(session.join(3, 'MP71')).rejects.toThrow('Joined game does not match');
  });

  it('waits for a pending login on close, then logs out its newly issued ticket', async () => {
    let reply!: (response: Response) => void;
    const pending = new Promise<Response>(resolve => { reply = resolve; });
    const { session, calls } = rig(c => c.path === '/account/login' ? pending : undefined);
    const login = session.login('RendererTest', PASSWORD);
    const rejected = expect(login).rejects.toThrow('Session closed');
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    const closing = session.close();
    await expect(session.games()).rejects.toThrow('Session closed');
    reply(json({ status: 0, ticket: TICKET }));
    await rejected; await closing;
    expect(calls.map(c => c.path)).toEqual(['/account/login', '/account/logout']);
  });

  it('waits for a pending join before leave/logout, and never returns a late connection', async () => {
    let reply!: (response: Response) => void;
    const pending = new Promise<Response>(resolve => { reply = resolve; });
    const { session, calls } = rig(c => c.path === '/lobby/join-game' ? pending : undefined);
    await listed(session);
    const joining = session.join(3, 'MP71');
    const rejected = expect(joining).rejects.toThrow('Session closed');
    await vi.waitFor(() => expect(calls.at(-1)?.path).toBe('/lobby/join-game'));
    const closing = session.close();
    expect(calls.at(-1)?.path).toBe('/lobby/join-game');
    reply(json({ status: 0, mediusWorldId: 3 }));
    await rejected; await closing;
    expect(calls.slice(-3).map(c => c.path)).toEqual(['/lobby/join-game', '/lobby/leave-game', '/account/logout']);
  });

  it('renews only its own session and stops the timer when closed', async () => {
    vi.useFakeTimers();
    const { session, calls } = rig();
    await session.login('RendererTest', PASSWORD);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls.at(-1)?.path).toBe('/lobby/update-user-state');
    expect(new Headers(calls.at(-1)?.init.headers).get('authorization')).toBe(`Bearer ${TICKET}`);
    await session.close(); const count = calls.length;
    await vi.advanceTimersByTimeAsync(60_000); expect(calls).toHaveLength(count);
  });

  it.each(['503', 'timeout'])('retries an uncertain heartbeat (%s) instead of ending the match session', async failure => {
    vi.useFakeTimers();
    let renewals = 0;
    const { session, calls } = rig(c => {
      if (c.path !== '/lobby/update-user-state') return;
      if (++renewals > 1) return new Response(null, { status: 204 });
      if (failure === '503') return json({}, 503);
      return new Promise<Response>((_resolve, reject) => {
        c.init.signal?.addEventListener('abort', () => reject(new Error('timed out')), { once: true });
      });
    });
    await session.login('RendererTest', PASSWORD);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(renewals).toBe(2);
    expect(calls.some(c => c.path === '/account/logout')).toBe(false);
    expect(await session.games()).toHaveLength(1);
  });

  it.each([401, 403, 404])('ends the session on a definite heartbeat loss (%i)', async status => {
    vi.useFakeTimers();
    const { session, calls } = rig(c => c.path === '/lobby/update-user-state' ? json({}, status) : undefined);
    await session.login('RendererTest', PASSWORD);
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(session.games()).rejects.toThrow('Session closed');
    expect(calls.at(-1)?.path).toBe('/account/logout');
    expect(calls.at(-1)?.init.keepalive).toBe(true);
  });

  it('rejects authentication loss without exposing server body text', async () => {
    const { session } = rig(c => c.path === '/lobby/join-channel' ? json({ error: PASSWORD }, 401) : undefined);
    await session.login('RendererTest', PASSWORD);
    await expect(session.games()).rejects.toThrow('/lobby/join-channel: HTTP 401');
  });

  it('bounds stalled requests and does not repeat fetch error details', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error(`request containing ${PASSWORD}`)), { once: true });
    })) as typeof fetch;
    const session = createPrototypeLobbySession(BASE, { fetch: fetchFn, requestTimeoutMs: 50 }); sessions.push(session);
    const login = session.login('RendererTest', PASSWORD);
    const rejected = expect(login).rejects.toThrow('/account/login: request timed out');
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
  });

  it('makes close idempotent and never executes queued work after Stop', async () => {
    const { session, calls } = rig();
    const login = session.login('RendererTest', PASSWORD);
    const rejected = expect(login).rejects.toThrow('Session closed');
    const first = session.close(), second = session.close();
    expect(second).toBe(first);
    await rejected; await first;
    expect(calls).toEqual([]);
  });

  it.each(['file:///tmp/test', 'https://user:password@example.test', 'https://example.test?ticket=secret'])('rejects a non-origin server value %s', base => {
    expect(() => createPrototypeLobbySession(base)).toThrow('Use an HTTP(S) origin');
  });
});
