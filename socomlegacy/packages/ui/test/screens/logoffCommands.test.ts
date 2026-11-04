import { afterEach, describe, expect, it, vi } from 'vitest';
import { UI_COMMAND_TABLE, UiCommandHost, uiCommandRowByName } from '../../src/uiCommands';
import { ValveStore } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import { LOBBY_STATE, LOGOUT_TIMEOUT_MS, LOGOUT_UNANSWERED_ADAPTATION, LobbyClient, type LobbyService } from '../../src/screens/lobbyClient';
import {
  LOBBY_CLOSED_AT_LAUNCH_ADAPTATION, LOGOFF_COMMAND_ROWS, LogoffCommands, NETWORK_TEARDOWN_READING,
} from '../../src/screens/logoffCommands';

/**
 * ONL-10: the logoff's two rows (web research 160 §2): `LobbyLogout` (`FUN_0027dcc0` D:L126223-126238) over the lobby
 * client's state byte and its logout (`FUN_002fa560` D:L198270-198282, state 0x12), and `UnInitNetwork` (`FUN_0027e5c0`
 * D:L126505-126515: the lobby's event callback cleared, `FUN_002dfdd0`'s disconnect, the DME layer down). A fake account
 * service; a manual keep-alive timer; nothing measured on the original running.
 */

const cmd = (fn: string, arg = 'NA'): ZAnimUiCommand =>
  ({ anim: 'exit_lobby', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function rig(o: { ticket?: string; logout?: boolean; logoutReply?: 'reject' | 'never' } = {}) {
  const valves = new ValveStore();
  const logouts: string[] = [], logins: string[] = [], events: number[] = [];
  let timers = 0, running = 0;
  let n = 0;
  const service: LobbyService = {
    login: (q) => { logins.push(q.name); n++; return Promise.resolve({ status: 0, ticket: `${o.ticket ?? 'tkt'}${n}` }); },
    register: () => Promise.resolve({ status: 0 }),
    keepAlive: () => Promise.resolve(true),
    ...(o.logout === false ? {} : {
      logout: (t: string) => {
        logouts.push(t);
        if (o.logoutReply === 'reject') return Promise.reject(new TypeError('Failed to fetch'));   // the server unreachable at YES
        if (o.logoutReply === 'never') return new Promise<{ status: number }>(() => {});           // a request that never returns
        return Promise.resolve({ status: 0 });
      },
    }),
  };
  const lobby = new LobbyClient({ valves: () => valves, service, event: (k) => { events.push(k); }, every: () => { timers++; running++; return () => { running--; }; } });
  const downs: number[] = [];
  const c = new LogoffCommands({ lobby, networkDown: () => { downs.push(1); } });
  const host = new UiCommandHost();
  c.register(host);
  const steps = async (k: number): Promise<void> => { for (let i = 0; i < k; i++) { await flush(); lobby.step(); } };
  const logIn = async (): Promise<void> => {
    lobby.connect('localhost', 10075);
    await steps(2);
    lobby.login('socomc', 'pw');
    await steps(6);
  };
  return { valves, lobby, c, host, logouts, logins, events, downs, steps, logIn, timers: () => timers, running: () => running };
}

describe("the logoff's rows (W9.R4: PLAT-08's host is a registry; no table edit)", () => {
  it('LobbyLogout is row 47 (id 40, FUN_0027dcc0), UnInitNetwork row 33 (id 34, FUN_0027e5c0), both declared for ONL-10; LobbyBailout row 48 (id 84, FUN_0027dc90) declared for ONL-22', () => {
    expect(LOGOFF_COMMAND_ROWS.map((r) => `${r.id} ${r.name} 0x${r.fn.toString(16)}`)).toEqual(['40 LobbyLogout 0x27dcc0', '34 UnInitNetwork 0x27e5c0', '84 LobbyBailout 0x27dc90']);
    expect(LOGOFF_COMMAND_ROWS.map((r) => r.task)).toEqual(['ONL-10', 'ONL-10', 'ONL-22']);
    for (const r of LOGOFF_COMMAND_ROWS) {
      const row = uiCommandRowByName(r.name)!;
      expect([row.index, row.id, row.fn, row.task], r.name).toEqual([r.row, r.id, r.fn, r.task]);
      expect(UI_COMMAND_TABLE[r.row]!.name).toBe(r.name);
    }
    expect(uiCommandRowByName('LobbyBailout')!.answer).toBe(true);   // FUN_0027dc90's one return (D:L126219): 1 whatever FUN_002f4240 answers
  });
});

describe('LobbyBailout (FUN_0027dc90 D:L126213-126220 -> FUN_002f4240(0x44f370) D:L194312-194335)', () => {
  it('with the flag +0x7d set: the DME layer told, the lobby disconnected (FUN_002dfdd0) -- no logout sent, the state byte left -- answer 1', async () => {
    const r = rig();
    await r.logIn();
    const resets: number[] = [];
    r.lobby.onReset(() => { resets.push(1); });
    expect(r.host.dispatch(cmd('LobbyBailout'))).toMatchObject({ kind: 'table', answer: true });
    expect([r.lobby.up, r.lobby.ticket(), r.lobby.loggedIn(), r.lobby.keepingAlive(), r.running(), r.downs, resets]).toEqual([false, null, false, false, 0, [1], [1]]);
    expect([r.logouts, r.lobby.state()]).toEqual([[], LOBBY_STATE.LOGGED_IN]);   // no SessionEnd (FUN_002f4240 asks none); FUN_002dfdd0 leaves the byte
  });

  it('idempotent beside UnInitNetwork (OnMultiplayerDisconnect runs both): the lobby left once -- the flag cleared, FUN_002dfdd0 the second time does nothing', async () => {
    const r = rig();
    await r.logIn();
    const resets: number[] = [];
    r.lobby.onReset(() => { resets.push(1); });
    r.host.dispatch(cmd('LobbyBailout'));
    expect([r.lobby.up, resets]).toEqual([false, [1]]);               // left by the bailout
    expect(r.host.dispatch(cmd('UnInitNetwork'))).toMatchObject({ answer: true });
    expect([r.lobby.up, resets]).toEqual([false, [1]]);
    expect(r.downs).toEqual([1, 1]);   // the DME layer told by both rows: networkDown is FUN_0030d770 whole and ignores the repeat (NETWORK_TEARDOWN_READING)
    expect(r.lobby.connect('localhost', 10075)).toBe(true);          // a second ONLINE entry: FUN_002e0030 finds the flag clear
  });

  it('with the flag clear (FUN_002f4240 answers 0): nothing torn down, the DME layer not told -- LobbyBailout still answers 1; no lobby, 1', () => {
    const r = rig();
    expect(r.lobby.up).toBe(false);
    expect(r.host.dispatch(cmd('LobbyBailout'))).toMatchObject({ kind: 'table', answer: true });
    expect([r.lobby.up, r.downs]).toEqual([false, []]);
    const host = new UiCommandHost();
    new LogoffCommands({}).register(host);
    expect(host.dispatch(cmd('LobbyBailout'))).toMatchObject({ kind: 'table', answer: true });
  });

  it('the row is logged as it happens', async () => {
    const seen: string[] = [];
    const host = new UiCommandHost();
    new LogoffCommands({ log: (name, arg, answer) => { seen.push(`${name}(${arg}) ${answer}`); } }).register(host);
    host.dispatch(cmd('LobbyBailout'));
    expect(seen).toEqual(['LobbyBailout(NA) true']);
  });
});

describe('LobbyLogout (FUN_0027dcc0 D:L126223-126238)', () => {
  it('state 0 answers 1 and asks nothing; logged in, it queues state 0x12 (FUN_002fa560) and answers 0; at 0x12 it answers 0 without asking again', async () => {
    const r = rig();
    expect(r.host.dispatch(cmd('LobbyLogout'))).toMatchObject({ kind: 'table', answer: true });
    await r.logIn();
    expect([r.lobby.state(), r.lobby.ticket(), r.lobby.keepingAlive()]).toEqual([LOBBY_STATE.LOGGED_IN, 'tkt1', true]);
    expect(r.host.dispatch(cmd('LobbyLogout'))).toMatchObject({ answer: false });
    r.lobby.step();                                                   // the queued 0x12 entered: SessionEnd sent
    expect(r.lobby.state()).toBe(LOBBY_STATE.LOGGING_OUT);
    expect(r.host.dispatch(cmd('LobbyLogout'))).toMatchObject({ answer: false });
    await r.steps(2);                                                 // the reply (FUN_002ee7b0): the key cleared, state 0
    expect(r.logouts).toEqual(['tkt1']);
    expect([r.lobby.state(), r.lobby.ticket(), r.lobby.keepingAlive(), r.lobby.loggedIn()]).toEqual([0, null, false, false]);
    expect(r.host.dispatch(cmd('LobbyLogout'))).toMatchObject({ answer: true });
    expect(r.logouts).toEqual(['tkt1']);
  });

  it('a service with no logout ends the session here (D:L190833-190836): state 0 at once, the ticket dropped', async () => {
    const r = rig({ logout: false });
    await r.logIn();
    r.host.dispatch(cmd('LobbyLogout'));
    await r.steps(2);
    expect([r.lobby.state(), r.lobby.ticket(), r.lobby.keepingAlive()]).toEqual([0, null, false]);
  });
});

describe('LOGOUT_UNANSWERED_ADAPTATION: a logout the server does not answer ends here (FUN_002ee7b0 goes to 0 on either status)', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('a rejected logout (fetch fails at YES) is a failed status: state 0, the ticket dropped, the keep-alive stopped; LobbyLogout answers 1', async () => {
    const r = rig({ logoutReply: 'reject' });
    await r.logIn();
    expect(r.host.dispatch(cmd('LobbyLogout'))).toMatchObject({ answer: false });
    await r.steps(3);
    expect(r.logouts).toEqual(['tkt1']);
    expect([r.lobby.state(), r.lobby.ticket(), r.lobby.keepingAlive(), r.running()]).toEqual([0, null, false, 0]);
    expect(r.host.dispatch(cmd('LobbyLogout'))).toMatchObject({ answer: true });
  });

  it(`a logout never answered ends after LOGOUT_TIMEOUT_MS (${LOGOUT_TIMEOUT_MS} ms), not before`, async () => {
    const r = rig({ logoutReply: 'never' });
    await r.logIn();
    vi.useFakeTimers();
    r.host.dispatch(cmd('LobbyLogout'));
    r.lobby.step();                                                   // 0x12 entered: the request out, the bound started
    await vi.advanceTimersByTimeAsync(LOGOUT_TIMEOUT_MS - 1);
    r.lobby.step();
    expect([r.lobby.state(), r.lobby.ticket(), r.host.dispatch(cmd('LobbyLogout')).answer]).toEqual([LOBBY_STATE.LOGGING_OUT, 'tkt1', false]);
    await vi.advanceTimersByTimeAsync(1);
    r.lobby.step();
    expect([r.lobby.state(), r.lobby.ticket(), r.lobby.keepingAlive()]).toEqual([0, null, false]);
    expect(r.host.dispatch(cmd('LobbyLogout'))).toMatchObject({ answer: true });
    expect(LOGOUT_UNANSWERED_ADAPTATION).toMatch(/timeout|unanswered/i);
  });

  it('the bound does nothing once the logout was answered, or after a disconnect', async () => {
    const r = rig();
    await r.logIn();
    vi.useFakeTimers();
    r.host.dispatch(cmd('LobbyLogout'));
    r.lobby.step();
    await vi.advanceTimersByTimeAsync(0);
    r.lobby.step();
    expect(r.lobby.state()).toBe(0);
    r.host.dispatch(cmd('UnInitNetwork'));
    expect(r.lobby.connect('localhost', 10075)).toBe(true);
    await vi.advanceTimersByTimeAsync(LOGOUT_TIMEOUT_MS);
    r.lobby.step();
    expect(r.lobby.state()).toBe(LOBBY_STATE.SESSION_BEGIN);          // the new connection's state, untouched by the old bound
  });
});

describe('UnInitNetwork (FUN_0027e5c0 D:L126505-126515)', () => {
  it('the lobby disconnected (FUN_002dfdd0: the flag cleared, the transport closed), the DME layer told, answer 1', async () => {
    const r = rig();
    await r.logIn();
    r.host.dispatch(cmd('LobbyLogout'));
    await r.steps(3);
    expect(r.lobby.up).toBe(true);                                    // the logout alone keeps the connection (the flag +0x7d)
    expect(r.host.dispatch(cmd('UnInitNetwork'))).toMatchObject({ kind: 'table', answer: true });
    expect([r.lobby.up, r.lobby.ticket(), r.lobby.keepingAlive(), r.running(), r.downs]).toEqual([false, null, false, 0, [1]]);
    expect(NETWORK_TEARDOWN_READING).toMatch(/DME/);
  });

  it('the callback cleared: a reply that arrives after it posts nothing and queues nothing; the state byte stands until the next connect (FUN_002dfdd0 leaves it)', async () => {
    const r = rig();
    lobbyConnectOnly(r);
    r.host.dispatch(cmd('UnInitNetwork'));
    await r.steps(3);
    expect([r.events, r.lobby.state()]).toEqual([[], LOBBY_STATE.SESSION_BEGIN]);
  });

  it('a second ONLINE entry after the logoff: LobbyConnect starts a new connection, the login answers a new ticket, the keep-alive runs again', async () => {
    const r = rig();
    await r.logIn();
    r.host.dispatch(cmd('LobbyLogout'));
    await r.steps(3);
    r.host.dispatch(cmd('UnInitNetwork'));
    expect(r.lobby.connect('localhost', 10075)).toBe(true);           // with the flag still set, FUN_002e0030 would answer 0
    await r.steps(2);
    r.lobby.login('socomc', 'pw');
    await r.steps(6);
    expect([r.lobby.state(), r.lobby.ticket(), r.lobby.keepingAlive(), r.logins, r.logouts, r.timers()]).toEqual([LOBBY_STATE.LOGGED_IN, 'tkt2', true, ['socomc', 'socomc'], ['tkt1'], 2]);
  });
});

describe('LOBBY_CLOSED_AT_LAUNCH_ADAPTATION: a LoadExecPS2 ends what the console\'s new process would not carry', () => {
  it('a session still up at the launch is logged out (not awaited) and disconnected; after the logoff, nothing', async () => {
    const r = rig();
    await r.logIn();
    r.c.launch();
    expect([r.lobby.up, r.lobby.ticket(), r.lobby.keepingAlive(), r.logouts]).toEqual([false, null, false, ['tkt1']]);
    r.c.launch();
    expect(r.logouts).toEqual(['tkt1']);
    expect(LOBBY_CLOSED_AT_LAUNCH_ADAPTATION).toMatch(/LoadExecPS2/);
  });
});

function lobbyConnectOnly(r: ReturnType<typeof rig>): void {
  r.lobby.connect('localhost', 10075);                                // state 12 queued: its SessionBegin reply would post MP_SUCCESS
  r.lobby.step();
}
