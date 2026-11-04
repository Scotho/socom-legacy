import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import { VALVE_TYPE, ValveStore } from '../../src/valves';
import {
  CONNECT_FAILURE_LOC, KEEPALIVE_THROUGH_MATCH_ADAPTATION, LOBBY_KEEPALIVE_MS, LOBBY_STATE, LOGIN_FAILURE_TEXT, LobbyClient, MEDIUS_STATUS, SESSION_LOST_READING, SOCOM_ONLINE_STATE_VALVE,
  type LobbyClientOptions, type LobbyService,
} from '../../src/screens/lobbyClient';

/**
 * ONL-07's lobby client (web research 157 §2): the Medius lobby object at 0x44f370 as `dlgNetConnect.rdr` and the
 * persona form reach it -- the session flag, the state byte and its queue, the valve `socom_online_state`, the
 * handlers of the states the connect and the login pass through -- each against its transcription of the cited
 * function, over a fake service. Nothing here is measured on the original running.
 */

const HOST = 'lobby.test', PORT = 10075;
/** A typed password, made up for the tests. */
const TYPED = 'secret';
const TICKET = 't1';
const E = DIALOG_EVENTS;
/** The promises' callbacks run (a reply arrives between two frames). */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

interface Fake extends LobbyService { calls: string[] }
function fake(over: Partial<LobbyService> = {}): Fake {
  const calls: string[] = [];
  return {
    calls,
    login: (q) => { calls.push(`login ${q.name} ${q.password}`); return Promise.resolve({ status: 0, ticket: TICKET }); },
    register: (q) => { calls.push(`register ${q.name} ${q.password}`); return Promise.resolve({ status: 0 }); },
    ...over,
  };
}

function setup(service: LobbyService = fake(), over: Partial<LobbyClientOptions> = {}) {
  const valves = new ValveStore();
  const events: Array<[number, string | null]> = [];
  let settled = 0;
  const lobby = new LobbyClient({
    valves: () => valves, service, event: (kind, text) => { events.push([kind, text]); }, locText: (id) => `#${id}`, settled: () => { settled++; }, ...over,
  });
  const valve = (): number | undefined => valves.find(SOCOM_ONLINE_STATE_VALVE)?.value;
  /** `n` frames of the network update, a reply's turn before each. */
  const frames = async (n = 1): Promise<void> => { for (let i = 0; i < n; i++) { await flush(); lobby.step(); } };
  return { valves, lobby, events, valve, frames, settled: () => settled };
}

/** Connected as SELECT UNIVERSE's CROSS leaves it: the session up, state 12, MP_SUCCESS posted. */
async function connected(service: LobbyService = fake(), over: Partial<LobbyClientOptions> = {}) {
  const t = setup(service, over);
  expect(t.lobby.connect(HOST, PORT)).toBe(true);
  await t.frames(2);
  return t;
}

describe('the connection (FUN_002e0030, state 12 FUN_002ee830, its reply FUN_002ee910)', () => {
  it('a connection not up is started: the session flag set, the state byte 0, answer 1; one already up answers 0', () => {
    const t = setup();
    expect([t.lobby.up, t.lobby.state()]).toEqual([false, 0]);
    expect(t.lobby.connect(HOST, PORT)).toBe(true);
    expect([t.lobby.up, t.lobby.state()]).toEqual([true, 0]);
    expect(t.lobby.connect(HOST, PORT)).toBe(false);                 // D:L182631, D:L182758-182760
    expect(t.events).toEqual([]);                                    // nothing is posted inside LobbyConnect's own call
  });

  it("the next step enters state 12 and writes the valve socom_online_state (FUN_002dfe50); SessionBegin's success posts MP_SUCCESS (D:L190919)", async () => {
    const t = setup();
    t.lobby.connect(HOST, PORT);
    expect(t.valve()).toBeUndefined();
    t.lobby.step();
    expect([t.lobby.state(), t.valve()]).toEqual([LOBBY_STATE.SESSION_BEGIN, 12]);
    expect(t.valves.find(SOCOM_ONLINE_STATE_VALVE)!.type).toBe(VALVE_TYPE.PERM);   // FUN_00351ff0(0x3f3a40, 1), D:L182796
    await flush();
    expect(t.events).toEqual([[E.MP_SUCCESS, null]]);
    expect(t.lobby.state()).toBe(12);                                // the state stays 12 on the persona form
  });

  it('a SessionBegin the service refuses queues state 10 and posts nothing (D:L190909-190912)', async () => {
    const t = setup(fake({ sessionBegin: () => Promise.resolve({ status: MEDIUS_STATUS.BeginSessionFailed }) }));
    t.lobby.connect(HOST, PORT);
    await t.frames(3);
    expect([t.lobby.state(), t.valve(), t.events]).toEqual([LOBBY_STATE.ACCOUNT_NOT_FOUND, 10, []]);
  });

  it("a SessionBegin never answered leaves state 12 and no event (the screen's own handling of a silent server)", async () => {
    const t = setup(fake({ sessionBegin: () => new Promise(() => undefined) }));
    t.lobby.connect(HOST, PORT);
    await t.frames(5);
    expect([t.lobby.state(), t.events]).toEqual([12, []]);
  });

  it('the step does nothing while the session is down (D:L182526), and takes one queued state a call', async () => {
    const t = setup();
    t.lobby.step();
    expect(t.valve()).toBeUndefined();
    t.lobby.connect(HOST, PORT);
    t.lobby.queueState(LOBBY_STATE.REGISTRATION_FAILURE);
    t.lobby.step();
    expect(t.lobby.state()).toBe(12);
    t.lobby.step();
    expect([t.lobby.state(), t.valve()]).toEqual([6, 6]);
  });

  it('the valve is written through its watchers only when it differs (D:L182546-182556)', async () => {
    const t = await connected();
    let seen = 0;
    t.valves.watch(SOCOM_ONLINE_STATE_VALVE, 3, () => { seen++; });
    t.lobby.queueState(12);
    t.lobby.step();
    expect(seen).toBe(0);                                            // 12 over 12: no watcher
    t.valves.set(SOCOM_ONLINE_STATE_VALVE, 0, VALVE_TYPE.PERM);      // exit_connect_screen's VALVE socom_online_state = 0
    seen = 0;
    t.lobby.queueState(12);
    t.lobby.step();
    expect([seen, t.valve()]).toEqual([1, 12]);
  });

  it("LobbyDisconnect's FUN_002dfdd0: the flag cleared, the ticket dropped; the state byte stays until the next connect zeroes it", async () => {
    const t = await connected();
    t.lobby.disconnect();
    expect([t.lobby.up, t.lobby.state()]).toEqual([false, 12]);
    t.lobby.step();
    expect(t.lobby.state()).toBe(12);
    expect(t.lobby.connect(HOST, PORT)).toBe(true);
    expect(t.lobby.state()).toBe(0);                                 // D:L182647
  });
});

describe('the login (FUN_002fa5a0, state 7 FUN_002eede0, its reply FUN_002eefa0)', () => {
  it('with the session down the login answers 0 and asks nothing (D:L198291-198293)', () => {
    const s = fake();
    const t = setup(s);
    expect(t.lobby.login('socomc', TYPED)).toBe(false);
    expect(s.calls).toEqual([]);
  });

  it('queues state 7, whose entry sends AccountLogin once with the name and the password; success: state 16, then 11 with MP_JOIN_ROOM', async () => {
    const s = fake();
    const t = await connected(s);
    expect(t.lobby.login('socomc', TYPED)).toBe(true);
    expect(s.calls).toEqual([]);                                     // the request is the state's entry, at the next step
    t.lobby.step();
    expect([t.lobby.state(), t.valve(), s.calls]).toEqual([7, 7, [`login socomc ${TYPED}`]]);
    await t.frames(1);
    expect([t.lobby.state(), t.valve()]).toEqual([LOBBY_STATE.LOBBY_SERVER, 16]);   // D:L191275-191276
    await t.frames(1);
    expect([t.lobby.state(), t.valve()]).toEqual([LOBBY_STATE.LOGGED_IN, 11]);     // FUN_002efc80 D:L191651-191656
    expect(t.events.slice(1)).toEqual([[E.MP_JOIN_ROOM, null]]);
    expect([t.lobby.loggedIn(), t.lobby.ticket(), t.lobby.account()]).toEqual([true, TICKET, 'socomc']);
    expect(s.calls).toHaveLength(1);                                 // once (OT.R17)
  });

  const failure = async (status: number) => {
    const s = fake({ login: () => Promise.resolve({ status }) });
    const t = await connected(s);
    t.lobby.login('socomc', TYPED);
    await t.frames(3);
    return t;
  };

  it('-998 AccountNotFound queues state 10 (D:L191165-191168): no event, and the login is not yet settled', async () => {
    const t = await failure(MEDIUS_STATUS.AccountNotFound);
    expect([t.lobby.state(), t.valve(), t.events.slice(1), t.settled()]).toEqual([10, 10, [], 0]);
  });

  it('-997 AccountLoggedIn posts MP_PLAYER_LOGGED_IN and leaves the state 7 (D:L191169-191173)', async () => {
    const t = await failure(MEDIUS_STATUS.AccountLoggedIn);
    expect([t.lobby.state(), t.events.slice(1), t.settled()]).toEqual([7, [[E.MP_PLAYER_LOGGED_IN, null]], 1]);
  });

  it('-978 InvalidPassword posts MP_INVALID_PASSWORD and leaves the state 7 (D:L191174-191178)', async () => {
    const t = await failure(MEDIUS_STATUS.InvalidPassword);
    expect([t.lobby.state(), t.events.slice(1), t.settled()]).toEqual([7, [[E.MP_INVALID_PASSWORD, null]], 1]);
  });

  it('any other status posts MP_MEDIUS_ERROR with "Login Failure" (0x3f4aa8; D:L191179-191182)', async () => {
    for (const status of [MEDIUS_STATUS.LoginFailed, MEDIUS_STATUS.Fail, -1, 5]) {
      const t = await failure(status);
      expect([t.lobby.state(), t.events.slice(1)]).toEqual([7, [[E.MP_MEDIUS_ERROR, LOGIN_FAILURE_TEXT]]]);
    }
    expect(LOGIN_FAILURE_TEXT).toBe('Login Failure');
  });

  it("a login never answered posts nothing: the screen's 90 s watchdog is what ends it", async () => {
    const t = await connected(fake({ login: () => new Promise(() => undefined) }));
    t.lobby.login('socomc', TYPED);
    await t.frames(10);
    expect([t.lobby.state(), t.events.slice(1), t.settled()]).toEqual([7, [], 0]);
  });

  it("a success with no ticket is still a login (the ticket is the bridge's to issue): loggedIn, ticket null", async () => {
    const t = await connected(fake({ login: () => Promise.resolve({ status: 0 }) }));
    t.lobby.login('socomc', TYPED);
    await t.frames(3);
    expect([t.lobby.state(), t.lobby.loggedIn(), t.lobby.ticket()]).toEqual([11, true, null]);
  });

  it("the lobby server's join refused (FUN_002efc80's -1) queues state 2: MP_MEDIUS_ERROR with #450's text (FUN_002ee610)", async () => {
    const t = await connected(fake({ enterLobby: () => Promise.resolve(false) }));
    t.lobby.login('socomc', TYPED);
    await t.frames(4);
    expect([t.lobby.state(), t.valve()]).toEqual([LOBBY_STATE.CONNECT_FAILURE, 2]);
    expect(t.events.slice(1)).toEqual([[E.MP_MEDIUS_ERROR, `#${CONNECT_FAILURE_LOC}`]]);
    expect(CONNECT_FAILURE_LOC).toBe(450);                           // FUN_00361b40(0x1c2)
  });

  it('OT.R17: the client keeps no password once the login is answered, and says so (settled) on success and on a refusal', async () => {
    const s = fake();
    const t = await connected(s);
    t.lobby.login('socomc', TYPED);
    expect(t.lobby.holdsPassword()).toBe(true);
    await t.frames(2);
    expect([t.lobby.holdsPassword(), t.settled()]).toEqual([false, 1]);
    const r = await failure(MEDIUS_STATUS.InvalidPassword);
    expect([r.lobby.holdsPassword(), r.settled()]).toEqual([false, 1]);
    const n = await failure(MEDIUS_STATUS.AccountNotFound);
    expect(n.lobby.holdsPassword()).toBe(false);                     // LobbyRegister reads the form again (FUN_0027dde0)
  });
});

describe('the registration (FUN_002fa320, state 3 FUN_002ee9b0 and its three replies)', () => {
  const notFoundThenFound = (over: Partial<LobbyService> = {}): Fake => {
    let n = 0;
    const s = fake({ ...over });
    const calls = s.calls;
    s.login = (q) => { calls.push(`login ${q.name} ${q.password}`); return Promise.resolve(n++ === 0 ? { status: MEDIUS_STATUS.AccountNotFound } : { status: 0, ticket: TICKET }); };
    if (!over.register) s.register = (q) => { calls.push(`register ${q.name} ${q.password}`); return Promise.resolve({ status: 0 }); };
    return s;
  };
  const atNotFound = async (s: LobbyService) => {
    const t = await connected(s);
    t.lobby.login('newname', TYPED);
    await t.frames(3);
    expect(t.lobby.state()).toBe(10);
    return t;
  };

  it('queues state 3: the name filter, the registration, then the login again; success: 16, 11', async () => {
    const s: Fake = notFoundThenFound({ filterName: (name) => { s.calls.push(`filter ${name}`); return Promise.resolve({ result: 0 }); } });
    const t = await atNotFound(s);
    expect(t.lobby.register('newname', TYPED)).toBe(true);
    t.lobby.step();
    expect([t.lobby.state(), t.valve()]).toEqual([3, 3]);
    await t.frames(5);
    expect(s.calls).toEqual([`login newname ${TYPED}`, 'filter newname', `register newname ${TYPED}`, `login newname ${TYPED}`]);
    expect([t.lobby.state(), t.lobby.loggedIn(), t.lobby.ticket(), t.settled(), t.lobby.holdsPassword()]).toEqual([11, true, TICKET, 1, false]);
  });

  it('with the session down the registration answers 0 (D:L198234-198236)', () => {
    const t = setup();
    expect(t.lobby.register('newname', TYPED)).toBe(false);
  });

  it('a name the filter scores below 0: MP_FILTER_FAILURE and state 6, no registration sent (FUN_002eea70 D:L190961-190966)', async () => {
    const s = notFoundThenFound({ filterName: () => Promise.resolve({ result: -1 }) });
    const t = await atNotFound(s);
    t.lobby.register('newname', TYPED);
    await t.frames(3);
    expect([t.lobby.state(), t.valve(), t.events.slice(1), t.settled()]).toEqual([6, 6, [[E.MP_FILTER_FAILURE, null]], 1]);
    expect(s.calls.filter((c) => c.startsWith('register'))).toEqual([]);
  });

  it('with no filter in the service the name passes (NAME_FILTER_PLACEHOLDER) and the registration is sent', async () => {
    const s = notFoundThenFound();
    const t = await atNotFound(s);
    t.lobby.register('newname', TYPED);
    await t.frames(5);
    expect(s.calls).toEqual([`login newname ${TYPED}`, `register newname ${TYPED}`, `login newname ${TYPED}`]);
    expect(t.lobby.state()).toBe(11);
  });

  it('a registration refused (any failure: -999 a taken name, -994 its fields) queues state 6, no event (FUN_002eeb50 D:L190996-190999)', async () => {
    for (const status of [MEDIUS_STATUS.AccountAlreadyExists, MEDIUS_STATUS.RegistrationFailed]) {
      const t = await atNotFound(notFoundThenFound({ register: () => Promise.resolve({ status }) }));
      t.lobby.register('newname', TYPED);
      await t.frames(3);
      expect([t.lobby.state(), t.events.slice(1), t.settled()]).toEqual([6, [], 1]);
    }
  });

  it('the login after the registration refused queues state 6, whatever its status (FUN_002eec10 D:L191029-191032)', async () => {
    const s = fake({ login: () => Promise.resolve({ status: MEDIUS_STATUS.InvalidPassword }) });
    const t = await connected(s);
    t.lobby.register('newname', TYPED);
    await t.frames(4);
    expect([t.lobby.state(), t.events.slice(1)]).toEqual([6, []]);
  });
});

describe('the logout (FUN_002fa560, state 0x12 FUN_002ee6e0, its reply FUN_002ee7b0)', () => {
  it('queues state 0x12 while the session is up; its entry ends the session at the service and the reply queues state 0', async () => {
    const ended: string[] = [];
    const s = fake({ logout: (ticket) => { ended.push(ticket); return Promise.resolve({ status: 0 }); } });
    const t = await connected(s);
    t.lobby.login('socomc', TYPED);
    await t.frames(3);
    expect(t.lobby.logout()).toBe(true);
    t.lobby.step();
    expect([t.lobby.state(), ended]).toEqual([0x12, [TICKET]]);
    await t.frames(1);
    expect([t.lobby.state(), t.valve(), t.lobby.ticket(), t.lobby.loggedIn()]).toEqual([0, 0, null, false]);
  });

  it('before any login there is no ticket to end: state 0 queued at once (the no-session branch, D:L190833-190836)', async () => {
    const t = await connected();
    t.lobby.logout();
    await t.frames(2);
    expect(t.lobby.state()).toBe(0);
  });

  it('a logout the service fails still queues state 0 (both branches of FUN_002ee7b0)', async () => {
    const t = await connected(fake({ logout: () => Promise.resolve({ status: MEDIUS_STATUS.LoginFailed }) }));
    t.lobby.login('socomc', TYPED);
    await t.frames(3);
    t.lobby.logout();
    await t.frames(2);
    expect([t.lobby.state(), t.lobby.ticket()]).toEqual([0, null]);
  });

  it('with the session down it answers false and queues nothing', () => {
    const t = setup();
    expect(t.lobby.logout()).toBe(false);
  });
});

describe('a reply after the connection it was sent on is gone', () => {
  it('is dropped: a disconnect between the login and its answer leaves no ticket and posts no event', async () => {
    let answer!: (r: { status: number; ticket?: string }) => void;
    const t = await connected(fake({ login: () => new Promise((r) => { answer = r; }) }));
    t.lobby.login('socomc', TYPED);
    t.lobby.step();
    t.lobby.disconnect();
    answer({ status: 0, ticket: TICKET });
    await t.frames(2);
    expect([t.lobby.ticket(), t.lobby.loggedIn(), t.events.slice(1), t.lobby.holdsPassword()]).toEqual([null, false, [], false]);
  });
});

describe("N3: the session kept alive while the client holds a ticket (LOBBY_KEEPALIVE_MS; research 159 §1; NU-16: a game socket holding it or not)", () => {
  /** A fake repeating timer: each `every` the client starts, and whether it was stopped. */
  function clock() {
    const timers: Array<{ ms: number; fn: () => void; stopped: boolean }> = [];
    const every = (ms: number, fn: () => void): (() => void) => { const t = { ms, fn, stopped: false }; timers.push(t); return () => { t.stopped = true; }; };
    const live = () => timers.filter((t) => !t.stopped);
    /** One period passes: every live timer fires. */
    const tick = (): void => { for (const t of live()) t.fn(); };
    return { timers, every, live, tick };
  }
  function keeping(answer: (ticket: string) => Promise<boolean> = () => Promise.resolve(true)) {
    const sent: string[] = [];
    return { sent, service: fake({ keepAlive: (ticket) => { sent.push(ticket); return answer(ticket); }, logout: () => Promise.resolve({ status: 0 }) }) };
  }
  async function loggedIn(k: ReturnType<typeof keeping>, c: ReturnType<typeof clock>) {
    const t = await connected(k.service, { every: c.every });
    t.lobby.login('socomc', TYPED);
    await t.frames(4);
    expect([t.lobby.loggedIn(), t.lobby.ticket(), t.lobby.state()]).toEqual([true, TICKET, LOBBY_STATE.LOGGED_IN]);
    return t;
  }

  it("the period is 30 s, under the server's idle end (300 s since NU-16b, 60 s before), so one lost request does not end the session", () => {
    expect(LOBBY_KEEPALIVE_MS).toBe(30_000);
    expect(LOBBY_KEEPALIVE_MS * 2).toBeLessThanOrEqual(60_000);
  });

  it('no timer before a ticket is held; with one, each period sends the keep-alive with the ticket', async () => {
    const c = clock(), k = keeping();
    const t = await connected(k.service, { every: c.every });
    expect(c.live()).toHaveLength(0);
    t.lobby.login('socomc', TYPED);
    await t.frames(4);
    expect(c.live().map((x) => x.ms)).toEqual([LOBBY_KEEPALIVE_MS]);
    expect(k.sent).toEqual([]);
    c.tick(); c.tick();
    expect(k.sent).toEqual([TICKET, TICKET]);
  });

  it('NU-16 (KEEPALIVE_THROUGH_MATCH_ADAPTATION): a game socket holding the ticket does not stop it -- the hold recorded, one timer throughout', async () => {
    const c = clock(), k = keeping();
    const t = await loggedIn(k, c);
    t.lobby.socketHolds(true);
    expect([t.lobby.socketHolding(), t.lobby.keepingAlive(), c.live().length]).toEqual([true, true, 1]);
    c.tick();
    expect(k.sent).toEqual([TICKET]);
    t.lobby.socketHolds(false);
    c.tick();
    expect([t.lobby.socketHolding(), k.sent, c.timers.length]).toEqual([false, [TICKET, TICKET], 1]);   // never stopped, never started again
    expect(KEEPALIVE_THROUGH_MATCH_ADAPTATION).toMatch(/a game socket holding it or not/);
  });

  it('stops at the logout (the ticket dropped) and at a disconnect', async () => {
    const c = clock(), k = keeping();
    const t = await loggedIn(k, c);
    t.lobby.logout();
    await t.frames(3);
    expect([t.lobby.ticket(), c.live().length]).toEqual([null, 0]);
    const c2 = clock();
    const u = await loggedIn(keeping(), c2);
    u.lobby.disconnect();
    expect(c2.live()).toHaveLength(0);
  });

  it("a 401 (the session gone) is a lobby disconnect: the ticket dropped, logged out, the timer stopped, state 2's MP_MEDIUS_ERROR with UIMnLOC 450 (FUN_002ee610)", async () => {
    const c = clock(), k = keeping(() => Promise.resolve(false));
    const t = await loggedIn(k, c);
    const before = t.events.length;
    c.tick();
    await t.frames(2);
    expect([t.lobby.ticket(), t.lobby.loggedIn(), c.live().length]).toEqual([null, false, 0]);
    expect(t.lobby.state()).toBe(LOBBY_STATE.CONNECT_FAILURE);
    expect(t.events.slice(before)).toEqual([[E.MP_MEDIUS_ERROR, `#${CONNECT_FAILURE_LOC}`]]);
    expect(SESSION_LOST_READING).toMatch(/450/);
  });

  it("ONL-11: another request's 401 (the room list's) is the same loss through sessionLost(ticket): state 2's MP_MEDIUS_ERROR; a stale ticket's or a logout's is ignored", async () => {
    const c = clock(), k = keeping();
    const t = await loggedIn(k, c);
    const before = t.events.length;
    t.lobby.sessionLost('an-older-ticket');                                   // a request sent under a ticket since replaced
    await t.frames(2);
    expect([t.lobby.ticket(), t.events.length]).toEqual([TICKET, before]);
    t.lobby.sessionLost(TICKET);
    await t.frames(2);
    expect([t.lobby.ticket(), t.lobby.loggedIn(), c.live().length, t.lobby.state()]).toEqual([null, false, 0, LOBBY_STATE.CONNECT_FAILURE]);
    expect(t.events.slice(before)).toEqual([[E.MP_MEDIUS_ERROR, `#${CONNECT_FAILURE_LOC}`]]);
    const u = await loggedIn(keeping(), clock());
    const n = u.events.length;
    u.lobby.logout();
    u.lobby.sessionLost(TICKET);                                              // LOGOUT_SILENCES_SESSION_LOST_ADAPTATION
    await u.frames(3);
    expect(u.events.slice(n).filter((e) => e[0] === E.MP_MEDIUS_ERROR)).toEqual([]);
  });

  it('a keep-alive never answered changes nothing (the next period tries again); a service with none starts no timer', async () => {
    const c = clock(), k = keeping(() => Promise.reject(new Error('no answer')));
    const t = await loggedIn(k, c);
    c.tick();
    await t.frames(2);
    expect([t.lobby.ticket(), t.lobby.loggedIn(), c.live().length]).toEqual([TICKET, true, 1]);
    const c2 = clock();
    const u = await connected(fake(), { every: c2.every });
    u.lobby.login('socomc', TYPED);
    await u.frames(4);
    expect([u.lobby.ticket(), c2.timers.length]).toEqual([TICKET, 0]);
  });

  it("an answer for a ticket since dropped is ignored (a 401 after a new login's ticket does not end the new session)", async () => {
    let answer!: (alive: boolean) => void;
    const c = clock(), k = keeping(() => new Promise((r) => { answer = r; }));
    const t = await loggedIn(k, c);
    c.tick();
    t.lobby.disconnect();
    answer(false);
    await t.frames(2);
    expect(t.events.filter(([kind]) => kind === E.MP_MEDIUS_ERROR)).toEqual([]);
  });

  /** A keep-alive whose answers the test gives, one per request, in order. */
  function deferred() {
    const answers: Array<(alive: boolean) => void> = [];
    return { answers, k: keeping(() => new Promise<boolean>((r) => { answers.push(r); })) };
  }

  it("review (2): a 401 for the old ticket after a logout and a new login (same connection) leaves the new session standing", async () => {
    const c = clock(), d = deferred();
    let n = 0;
    d.k.service.login = () => Promise.resolve({ status: 0, ticket: ++n === 1 ? TICKET : 't2' });
    const t = await loggedIn(d.k, c);
    c.tick();                                                        // the keep-alive for t1 goes out
    t.lobby.logout();
    await t.frames(3);
    expect([t.lobby.ticket(), t.lobby.state(), t.lobby.up]).toEqual([null, LOBBY_STATE.NONE, true]);
    t.lobby.login('socomc', TYPED);
    await t.frames(4);
    expect([t.lobby.ticket(), t.lobby.state()]).toEqual(['t2', LOBBY_STATE.LOGGED_IN]);
    d.answers[0]!(false);                                            // the old request answers 401
    await t.frames(2);
    expect([t.lobby.ticket(), t.lobby.loggedIn(), t.lobby.state(), c.live().length]).toEqual(['t2', true, LOBBY_STATE.LOGGED_IN, 1]);
    expect(t.events.filter(([kind]) => kind === E.MP_MEDIUS_ERROR)).toEqual([]);
  });

  it("review (4): a 401 answered while a logout is asked or in flight posts no MP_MEDIUS_ERROR -- the player chose to leave", async () => {
    for (const stepped of [false, true]) {
      const c = clock(), d = deferred();
      let ended!: (r: { status: number }) => void;
      d.k.service.logout = () => new Promise((r) => { ended = r; });
      const t = await loggedIn(d.k, c);
      c.tick();
      t.lobby.logout();
      if (stepped) t.lobby.step();                                   // state 0x12 entered: the logout's request out
      d.answers[0]!(false);
      await t.frames(2);
      ended({ status: 0 });                                          // the logout answered (entered by now either way)
      await t.frames(3);
      expect(t.events.filter(([kind]) => kind === E.MP_MEDIUS_ERROR), `stepped ${stepped}`).toEqual([]);
      expect([t.lobby.state(), t.lobby.ticket(), t.lobby.loggedIn()], `stepped ${stepped}`).toEqual([LOBBY_STATE.NONE, null, false]);
    }
  });

  it("review (5): close() -- the page leaving -- stops the keep-alive, sends the logout once without waiting, and takes the session down", async () => {
    const c = clock(), k = keeping();
    const ended: string[] = [];
    k.service.logout = (ticket) => { ended.push(ticket); return new Promise(() => {}); };   // never answered: the page is gone
    const t = await loggedIn(k, c);
    t.lobby.close();
    expect([ended, c.live().length, t.lobby.up, t.lobby.ticket(), t.lobby.loggedIn()]).toEqual([[TICKET], 0, false, null, false]);
    t.lobby.close();
    expect(ended).toEqual([TICKET]);
    const u = await connected(fake({ logout: () => { throw new Error('no logout without a ticket'); } }));
    u.lobby.close();
    expect(u.lobby.up).toBe(false);
  });
});
