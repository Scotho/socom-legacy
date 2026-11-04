import { describe, expect, it } from 'vitest';
import { ANNOUNCEMENT_QUERY, LOBBY_STATE, PARKED_ROWS, ROOM_LIST_QUERY, UiCommandHost, UiVarManager, ValveStore, VALVE_TYPE, WORLD_OF_SOCOM, type ZAnimUiCommand } from '@s2u/ui';
import { ROOM_LIST_PING_SAMPLES_ADAPTATION, ROOM_LIST_PING_WINDOW_ADAPTATION, ROOM_LIST_SESSION_LOST, announcementReplyOf, channelListOf, connectWorldOfSocom, roomDoorsOf, fetchAnnouncementService, fetchOwnerFieldsService, fetchPlayerInfoService, fetchRoomListService, sessionPlayerInfo, type PlayerInfoTransport, type WorldOfSocomMount } from '../src/worldOfSocomHost';

/**
 * ONL-09's page half (web research 158 §4): the announcement request sent to SVC-05's `POST /texts/announcement` on the
 * match server at ONL-04's base, its reply's shape checked before the client takes it, and the session's mount -- this
 * task's rows, SVC-09a's invitation rows, the lobby session's variables and the launch's valves. A refusal, no
 * endpoint or another shape is a request never answered (a rejection).
 */
type Call = { url: string; init: RequestInit };
const fetching = (status: number, body: unknown, calls: Call[] = []) =>
  (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(body), { status }); }) as unknown as typeof fetch;
const cmd = (fn: string, arg = 'NA'): ZAnimUiCommand => ({ anim: 'init_screen', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(16) });
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('fetchAnnouncementService', () => {
  const reply = { status: 0, announcementId: 3, announcement: 'Welcome.', endOfList: true };

  it('posts { applicationId: 10472 } as JSON to /texts/announcement and hands back the reply', async () => {
    const calls: Call[] = [];
    const r = await fetchAnnouncementService('http://localhost:8870', fetching(200, reply, calls)).announcement({ ...ANNOUNCEMENT_QUERY });
    expect(r).toEqual(reply);
    expect(calls.map((c) => [c.url, c.init.method, String(c.init.body)])).toEqual([['http://localhost:8870/texts/announcement', 'POST', '{"applicationId":10472}']]);
    expect((calls[0]!.init.headers as Record<string, string>)['content-type']).toBe('application/json');
    // TEXTS-OMIT (MU.R6's F1): no cookie rides on the request, as the account routes' clients send (`connectHost.ts`).
    expect([calls[0]!.init.credentials, calls[0]!.init.cache]).toEqual(['omit', 'no-store']);
  });

  it('a refusal, a server without the endpoint or a reply of another shape rejects', async () => {
    await expect(fetchAnnouncementService('http://x', fetching(403, {})).announcement({ applicationId: 1 })).rejects.toThrow();
    await expect(fetchAnnouncementService('http://x', fetching(404, {})).announcement({ applicationId: 1 })).rejects.toThrow();
    await expect(fetchAnnouncementService('http://x', fetching(200, { ...reply, announcement: 7 })).announcement({ applicationId: 1 })).rejects.toThrow();
    expect(() => announcementReplyOf({ ...reply, endOfList: 'yes' })).toThrow();
    expect(() => announcementReplyOf(null)).toThrow();
    expect(announcementReplyOf({ ...reply, extra: 1 })).toEqual(reply);
  });
});

describe('connectWorldOfSocom (the session\'s mount)', () => {
  const mount = (o: { announcement?: boolean; invitations?: boolean } = {}) => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), valves = new ValveStore();
    const events: number[] = [], asked: string[] = [];
    const w = connectWorldOfSocom(host, {
      uiVars, valves: () => valves, event: (k) => { events.push(k); },
      announcement: o.announcement === false ? undefined : { announcement: (q) => { asked.push(`announcement ${JSON.stringify(q)}`); return Promise.resolve({ status: 0, announcementId: 1, announcement: 'News.', endOfList: true }); } },
      invitations: o.invitations === false ? undefined : {
        check: (q) => { asked.push(`invitations ${JSON.stringify(q)}`); return Promise.resolve([{ status: 1, clanInvitationId: 0, clanId: 0, responseStatus: 0, message: '', leaderAccountId: 0, leaderAccountName: '', endOfList: true }]); },
      },
    });
    return { host, uiVars, valves, events, asked, w };
  };

  it('registers this task\'s two rows and SVC-09a\'s two: none answers the table\'s default any more (GetClan and the clan reads are ONL-27\'s mount, ./manageRosterHost)', async () => {
    const m = mount();
    for (const n of ['GetMediusAnnouncements', 'RefreshRoomList', 'CheckMyInvites', 'HasClanInvitations']) expect(m.host.dispatch(cmd(n)).kind, n).toBe('table');
    for (const n of ['GetClan', 'IsMemberOfClan', 'IsLeaderOfClan']) expect(m.host.dispatch(cmd(n)).kind, n).toBe('not-implemented');
    expect(m.host.dispatch(cmd('HasClanInvitations')).answer).toBe(false);          // unregistered it answered the placeholder 1 and lit the row
    await flush();
    expect(m.asked).toEqual(['announcement {"applicationId":10472}', 'invitations {"start":0,"pageSize":999}']);
    expect(m.uiVars.find('MEDIUS_MOTD')!.value).toEqual({ type: 'array', value: [{ type: 'string', value: 'News.' }, { type: 'string', value: '\n' }] });
    expect(m.w.invitations.count).toBe(0);
  });

  it('adds the lobby session\'s variables at the mount: MY_CLAN_INVITES exists before any reply (D:L182219-182220), MEDIUS_MOTD is the empty string', () => {
    const m = mount();
    expect(m.uiVars.find('MY_CLAN_INVITES')).toMatchObject({ longevity: 1, value: { type: 'none' } });
    expect(m.uiVars.find('MEDIUS_MOTD')!.value).toEqual({ type: 'string', value: '' });
    expect(m.uiVars.find('ROOMLISTVAR')).toBeDefined();
  });

  it('seeds the launch\'s valves at the mount and again at launch(): PopupNewsOnce back at 0, GameSpeedFilter 65000', () => {
    const m = mount();
    expect([m.valves.find('PopupNewsOnce')!.value, m.valves.find('GameSpeedFilter')!.value]).toEqual([0, 65000]);
    m.valves.set('PopupNewsOnce', 1, VALVE_TYPE.TEMP);
    m.w.launch();
    expect(m.valves.find('PopupNewsOnce')!.value).toBe(0);
  });

  it('sets the parked rows\' gate: no row is parked since ONL-30 (W18.R13), so no CROSS animation is taken on this dialog', () => {
    const m = mount();
    const start = (animation: string) => ({ dialog: WORLD_OF_SOCOM, design: {} as never, animation, argument: null });
    expect(m.host.bindingStart(start('Goto_ClanLadder'))).toBe(false);        // CLAN RANKING, unparked by ONL-30 (W18.R13; was true)
    expect(m.host.bindingStart(start('Goto_Ladder'))).toBe(false);            // PLAYER RANKING, unparked by ONL-30a (research 269 §2)
    expect(PARKED_ROWS).toEqual([]);                                          // the gate kept for a later parked row
    expect(m.host.bindingStart(start('refresh_roomlist'))).toBe(false);
    // OPTIONS is no longer parked: the taunts (PR #59, 3ccc8b160) unparked it so the player reaches SETUP TAUNTS the
    // original's way, ONLINE > OPTIONS (dlgOnlineOptions) > SETUP TAUNTS (research 301 §6, research 158's row).
    expect(m.host.bindingStart(start('Goto_Options'))).toBe(false);
  });

  it('without a service the requests are never answered: the retrieving text stays, the invitations list stays empty', async () => {
    const m = mount({ announcement: false, invitations: false });
    m.host.dispatch(cmd('GetMediusAnnouncements'));
    m.host.dispatch(cmd('CheckMyInvites'));
    await flush();
    expect(m.uiVars.find('MEDIUS_MOTD')!.value).toEqual({ type: 'string', value: 'Retrieving messages from server...' });
    expect(m.host.dispatch(cmd('HasClanInvitations')).answer).toBe(false);
  });

  it('an invitation raises MP_MEDIUS_HAS_INVITES through the session\'s event sink', async () => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), valves = new ValveStore();
    const events: number[] = [];
    connectWorldOfSocom(host, {
      uiVars, valves: () => valves, event: (k) => { events.push(k); },
      invitations: { check: () => Promise.resolve([{ status: 0, clanInvitationId: 7, clanId: 3, responseStatus: 0, message: 'Join us', leaderAccountId: 2, leaderAccountName: 'lead', endOfList: true }]) },
    });
    host.dispatch(cmd('CheckMyInvites'));
    await flush();
    expect(events).toEqual([0x0c]);
    expect(host.dispatch(cmd('HasClanInvitations')).answer).toBe(true);
  });
});

describe('ONL-11: the room list over SVC-06\'s POST /lobby/channel-list, the session\'s ticket its bearer (research 161 §3)', () => {
  const entry = (lobbyName: string, endOfList = false) => ({ status: 0, mediusWorldId: 1, playerCount: 3, maxPlayers: 64, securityLevel: 0, genericField1: 0, lobbyName, endOfList });
  const body = { entries: [entry('Alpha'), entry('Bravo', true)] };

  it('posts { pageId: 1, pageSize: 999 } with Authorization: Bearer <ticket>, no credentials, not cached; hands back the entries', async () => {
    const calls: Call[] = [];
    const r = await fetchRoomListService('https://socom.example', fetching(200, body, calls)).channelList({ ...ROOM_LIST_QUERY }, 'T1');
    expect(r).toEqual(body.entries);
    expect(calls.map((c) => [c.url, c.init.method, String(c.init.body), c.init.credentials, c.init.cache])).toEqual([
      ['https://socom.example/lobby/channel-list', 'POST', '{"pageId":1,"pageSize":999}', 'omit', 'no-store'],
    ]);
    expect(calls[0]!.init.headers).toMatchObject({ 'content-type': 'application/json', authorization: 'Bearer T1' });
  });

  it('401 is the session lost; any other refusal, a server fault or another shape is a request never answered (it rejects)', async () => {
    expect(await fetchRoomListService('http://x', fetching(401, {})).channelList({ ...ROOM_LIST_QUERY }, 'T')).toBe(ROOM_LIST_SESSION_LOST);
    for (const status of [403, 404, 429, 500]) await expect(fetchRoomListService('http://x', fetching(status, body)).channelList({ ...ROOM_LIST_QUERY }, 'T'), String(status)).rejects.toThrow();
    await expect(fetchRoomListService('http://x', fetching(200, { entries: [{ ...entry('A'), lobbyName: 7 }] })).channelList({ ...ROOM_LIST_QUERY }, 'T')).rejects.toThrow();
    expect(() => channelListOf({ entries: 'no' })).toThrow();
    expect(channelListOf({ entries: [{ ...entry('A'), extra: 1 }] })).toEqual([entry('A')]);
  });

  const mounted = (ticket: string | null, status = 200) => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), valves = new ValveStore();
    const calls: Call[] = [], lost: string[] = [];
    connectWorldOfSocom(host, {
      uiVars, valves: () => valves, event: () => {},
      roomList: fetchRoomListService('http://own', fetching(status, body, calls)), ticket: () => ticket, sessionLost: (t) => { lost.push(t); },
    });
    return { host, uiVars, calls, lost, rooms: () => uiVars.find('ROOMLISTVAR')!.value };
  };

  it('RefreshRoomList with the session\'s ticket: the request carries it and the rows are drawn into ROOMLISTVAR', async () => {
    const m = mounted('TICKET-1');
    expect(m.host.dispatch(cmd('RefreshRoomList')).answer).toBe(true);
    await flush();
    expect(m.calls.map((c) => (c.init.headers as Record<string, string>)['authorization'])).toEqual(['Bearer TICKET-1']);
    const rows = m.rooms() as unknown as { value: { value: { value: unknown }[] }[] };
    expect(rows.value.map((r) => r.value.slice(0, 2).map((v) => v.value))).toEqual([['Alpha', 3], ['Bravo', 3]]);
  });

  it('no ticket (no login: a deep link): no request is sent, nothing drawn (ROOM_LIST_NO_TICKET_ADAPTATION)', async () => {
    const m = mounted(null);
    expect(m.host.dispatch(cmd('RefreshRoomList')).answer).toBe(true);
    await flush();
    expect([m.calls.length, m.rooms()]).toEqual([0, { type: 'none' }]);
  });

  it('a reply arriving after the logoff (the ticket dropped) writes nothing into ROOMLISTVAR', async () => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), valves = new ValveStore();
    let ticket: string | null = 'TICKET-3';
    let answer!: () => void;
    const slow = (async () => { await new Promise<void>((r) => { answer = r; }); return new Response(JSON.stringify(body), { status: 200 }); }) as unknown as typeof fetch;
    connectWorldOfSocom(host, { uiVars, valves: () => valves, event: () => {}, roomList: fetchRoomListService('http://own', slow), ticket: () => ticket });
    host.dispatch(cmd('RefreshRoomList'));
    await flush();
    ticket = null;
    answer();
    await flush(); await flush();
    expect(uiVars.find('ROOMLISTVAR')!.value).toEqual({ type: 'none' });
  });

  it('a 401 hands the ticket to the lobby\'s session-lost path (as the keep-alive\'s, SESSION_LOST_READING) and draws nothing', async () => {
    const m = mounted('TICKET-2', 401);
    m.host.dispatch(cmd('RefreshRoomList'));
    await flush();
    expect([m.lost, m.rooms()]).toEqual([['TICKET-2'], { type: 'none' }]);
  });
});

describe('MLS-PING browser adaptation: the existing room-list request supplies the table sample', () => {
  const entry = (lobbyName: string, playerCount: number, endOfList = false) => ({ status: 0, mediusWorldId: playerCount, playerCount, maxPlayers: 64, securityLevel: 0, genericField1: 0, lobbyName, endOfList });
  const values = (vars: UiVarManager): unknown[][] => {
    const rows = vars.find('ROOMLISTVAR')!.value;
    return rows.type === 'array' ? rows.value.map((r) => r.type === 'array' ? r.value.map((c) => 'value' in c ? c.value : null) : []) : [];
  };

  it('adds one rounded millisecond sample left of PLAYERS while preserving room order, counts and four rank icons', async () => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), valves = new ValveStore();
    let now = 100.25;
    const entries = [entry('Bravo', 7), entry('Alpha', 3, true)];
    const sent: unknown[] = [];
    const world = connectWorldOfSocom(host, {
      uiVars, valves: () => valves, event: () => {}, ticket: () => 'T1',
      roomListPing: { now: () => now },
      roomList: { channelList: async (q, ticket) => { sent.push([q, ticket]); now = 112.85; return entries; } },
    });
    host.dispatch(cmd('RefreshRoomList'));
    await flush();
    expect(values(uiVars)).toEqual([['Alpha', '13', 3, 1, 2, 3, 4], ['Bravo', '13', 7, 1, 2, 3, 4]]);
    expect(sent).toEqual([[ROOM_LIST_QUERY, 'T1']]);
    expect(world.commands.rooms()).toEqual([entries[1], entries[0]]);
    expect(entries[0]).not.toHaveProperty('ping');
  });

  it('before a valid sample and after a failed refresh shows -- without removing the original rows', async () => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), valves = new ValveStore();
    let now = 20, fail = false, calls = 0;
    const world = connectWorldOfSocom(host, {
      uiVars, valves: () => valves, event: () => {}, ticket: () => 'T1', roomListPing: { now: () => now },
      roomList: { channelList: async () => { calls++; if (fail) throw new Error('offline'); now += 8; return [entry('Alpha', 3, true)]; } },
    });
    world.commands.roomListReply([entry('Alpha', 3, true)]);
    expect(values(uiVars)).toEqual([['Alpha', '--', 3, 1, 2, 3, 4]]);
    host.dispatch(cmd('RefreshRoomList'));
    await flush();
    expect(values(uiVars)[0]![1]).toBe('8');
    fail = true;
    host.dispatch(cmd('RefreshRoomList'));
    await flush();
    expect(values(uiVars)).toEqual([['Alpha', '--', 3, 1, 2, 3, 4]]);
    for (let i = 0; i < 10; i++) world.frame();
    expect(calls).toBe(2); // only the existing RefreshRoomList requests; no ping polling
  });

  it.each(['success', 'failure', 'session-lost'] as const)('a superseded %s cannot overwrite or clear a newer sample', async (outcome) => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), valves = new ValveStore();
    let now = 0;
    const pending: { resolve: (entries: ReturnType<typeof entry>[] | typeof ROOM_LIST_SESSION_LOST) => void; reject: (error: Error) => void }[] = [];
    const lost: string[] = [];
    connectWorldOfSocom(host, {
      uiVars, valves: () => valves, event: () => {}, ticket: () => 'T1', roomListPing: { now: () => now }, sessionLost: (t) => { lost.push(t); },
      roomList: { channelList: () => new Promise((resolve, reject) => { pending.push({ resolve, reject }); }) },
    });
    host.dispatch(cmd('RefreshRoomList'));
    now = 10;
    host.dispatch(cmd('RefreshRoomList'));
    now = 21;
    pending[1]!.resolve([entry('Bravo', 7, true)]);
    await flush();
    expect(values(uiVars)).toEqual([['Bravo', '11', 7, 1, 2, 3, 4]]);
    now = 90;
    if (outcome === 'failure') pending[0]!.reject(new Error('late failure'));
    else pending[0]!.resolve(outcome === 'session-lost' ? ROOM_LIST_SESSION_LOST : [entry('Alpha', 3, true)]);
    await flush();
    expect(values(uiVars)).toEqual([['Bravo', '11', 7, 1, 2, 3, 4]]);
    expect(lost).toEqual([]);
  });

  it.each(['sign-out', 'new-session', 'new-service'] as const)('%s clears the sample and ignores work from its old context', async (change) => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), valves = new ValveStore();
    let ticket: string | null = 'T1', now = 1;
    let resolve!: (entries: ReturnType<typeof entry>[]) => void;
    let calls = 0;
    const mount: WorldOfSocomMount = {
      uiVars, valves: () => valves, event: () => {}, ticket: () => ticket, roomListPing: { now: () => now },
      roomList: { channelList: () => {
        calls++;
        if (calls === 1) { now = 6; return Promise.resolve([entry('Alpha', 3, true)]); }
        return new Promise((r) => { resolve = r; });
      } },
    };
    const world = connectWorldOfSocom(host, mount);
    host.dispatch(cmd('RefreshRoomList'));
    await flush();
    expect(values(uiVars)[0]![1]).toBe('5');
    host.dispatch(cmd('RefreshRoomList'));
    if (change === 'new-service') mount.roomList = { channelList: async () => [entry('New', 9, true)] };
    else ticket = change === 'sign-out' ? null : 'T2';
    world.frame();
    expect(values(uiVars)[0]![1]).toBe('--');
    now = 300;
    resolve([entry('Stale', 99, true)]);
    await flush();
    expect(values(uiVars)).toEqual([['Alpha', '--', 3, 1, 2, 3, 4]]);
    expect(calls).toBe(2);
  });

  it('missing ticket sends no request; a current 401 clears the sample and reports the held ticket', async () => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), valves = new ValveStore();
    let ticket: string | null = null;
    const lost: string[] = [];
    let calls = 0;
    const world = connectWorldOfSocom(host, {
      uiVars, valves: () => valves, event: () => {}, ticket: () => ticket, roomListPing: {}, sessionLost: (t) => { lost.push(t); },
      roomList: { channelList: async () => { calls++; return ROOM_LIST_SESSION_LOST; } },
    });
    world.commands.roomListReply([entry('Alpha', 3, true)]);
    host.dispatch(cmd('RefreshRoomList'));
    await flush();
    expect([calls, lost, values(uiVars)[0]![1]]).toEqual([0, [], '--']);
    ticket = 'T1';
    host.dispatch(cmd('RefreshRoomList'));
    await flush();
    expect([calls, lost, values(uiVars)[0]![1]]).toEqual([1, ['T1'], '--']);
  });

  it.each([NaN, Infinity, -1])('an invalid monotonic duration (%s) remains unknown', async (elapsed) => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), valves = new ValveStore();
    let now = 0;
    connectWorldOfSocom(host, {
      uiVars, valves: () => valves, event: () => {}, ticket: () => 'T1', roomListPing: { now: () => now },
      roomList: { channelList: async () => { now = elapsed; return [entry('Alpha', 3, true)]; } },
    });
    host.dispatch(cmd('RefreshRoomList'));
    await flush();
    expect(values(uiVars)[0]![1]).toBe('--');
  });
});

describe('LATER 455 (OT.R84): each briefing room its own PING, a round trip to its host\'s door', () => {
  const entry = (lobbyName: string, playerCount: number, endOfList = false) => ({ status: 0, mediusWorldId: playerCount, playerCount, maxPlayers: 64, securityLevel: 0, genericField1: 0, lobbyName, endOfList });
  const values = (vars: UiVarManager): unknown[][] => {
    const rows = vars.find('ROOMLISTVAR')!.value;
    return rows.type === 'array' ? rows.value.map((r) => r.type === 'array' ? r.value.map((c) => 'value' in c ? c.value : null) : []) : [];
  };
  const DOOR_A = 'https://door-a.example', DOOR_B = 'https://door-b.example';
  type Probe = { door: string; answer: (ms: number | null) => void };
  const rig = (lists: { entries: ReturnType<typeof entry>[]; doors: Record<string, string> }[] | (() => Promise<{ entries: ReturnType<typeof entry>[]; doors: ReadonlyMap<string, string> }>)) => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), valves = new ValveStore();
    const probes: Probe[] = [];
    let now = 0, plain = 0;
    const next = Array.isArray(lists) ? (() => { const l = lists.shift()!; now += 9; return Promise.resolve({ entries: l.entries, doors: new Map(Object.entries(l.doors)) }); }) : lists;
    const world = connectWorldOfSocom(host, {
      uiVars, valves: () => valves, event: () => {}, ticket: () => 'T1',
      roomListPing: { now: () => now, probe: (door) => new Promise((answer) => { probes.push({ door, answer }); }) },
      roomList: { channelList: async () => { plain++; return []; }, channelListWithDoors: () => next() },
    });
    return { host, uiVars, probes, world, plain: () => plain };
  };
  // LATER 527: a door's probes go one after another, so answer whatever is pending, let the next go out, and repeat.
  const answered = new WeakSet<Probe>();
  const settle = async (probes: Probe[], reply: (door: string, n: number) => number | null): Promise<void> => {
    const counts = new Map<string, number>();
    for (let round = 0; round < 20; round++) {
      await flush();
      const open = probes.filter((p) => !answered.has(p));
      if (open.length === 0) return;
      for (const p of open) { answered.add(p); const n = counts.get(p.door) ?? 0; counts.set(p.door, n + 1); p.answer(reply(p.door, n)); }
    }
  };

  it('two rooms on two doors: one probe a door, each row its own number; a room with no door keeps the list\'s own time', async () => {
    const m = rig([{ entries: [entry('Bravo', 7), entry('Alpha', 3), entry('Charlie', 1, true)], doors: { Alpha: DOOR_A, Bravo: DOOR_B } }]);
    m.host.dispatch(cmd('RefreshRoomList'));
    await flush();
    expect(m.probes.map((p) => p.door).sort()).toEqual([DOOR_A, DOOR_B]);
    expect(values(m.uiVars).map((r) => r.slice(0, 2))).toEqual([['Alpha', '--'], ['Bravo', '--'], ['Charlie', '9']]);
    await settle(m.probes, (door) => door === DOOR_A ? 31 : 187);
    expect(values(m.uiVars)).toEqual([['Alpha', '31', 3, 1, 2, 3, 4], ['Bravo', '187', 7, 1, 2, 3, 4], ['Charlie', '9', 1, 1, 2, 3, 4]]);
    expect(m.plain()).toBe(0);
  });

  it('two rooms sharing a door: one probe, both rows its number', async () => {
    const m = rig([{ entries: [entry('Alpha', 3), entry('Bravo', 7, true)], doors: { Alpha: DOOR_A, Bravo: DOOR_A } }]);
    m.host.dispatch(cmd('RefreshRoomList'));
    await flush();
    expect(m.probes.map((p) => p.door)).toEqual([DOOR_A]);
    await settle(m.probes, () => 44);
    expect(values(m.uiVars).map((r) => r.slice(0, 2))).toEqual([['Alpha', '44'], ['Bravo', '44']]);
  });

  it('a failing door shows -- while the other keeps its number; the next refresh probes each door once more, no timer', async () => {
    const both = { entries: [entry('Alpha', 3), entry('Bravo', 7, true)], doors: { Alpha: DOOR_A, Bravo: DOOR_B } };
    const m = rig([both, both]);
    m.host.dispatch(cmd('RefreshRoomList'));
    await flush();
    await settle(m.probes, (door) => door === DOOR_A ? null : 62);
    expect(values(m.uiVars).map((r) => r.slice(0, 2))).toEqual([['Alpha', '--'], ['Bravo', '62']]);
    const first = m.probes.length;
    for (let i = 0; i < 10; i++) m.world.frame();
    await flush();
    expect(m.probes).toHaveLength(first);
    m.host.dispatch(cmd('RefreshRoomList'));
    await flush();
    expect(m.probes.slice(first).map((p) => p.door).sort()).toEqual([DOOR_A, DOOR_B]);
    // the last mean stays drawn until the new probe answers
    expect(values(m.uiVars).map((r) => r.slice(0, 2))).toEqual([['Alpha', '--'], ['Bravo', '62']]);
    await settle(m.probes, (door) => door === DOOR_A ? 35 : 58);
    // Alpha: no sample yet, so three now (35 each); Bravo: 62 x3 then 58 -> mean 61
    expect(values(m.uiVars).map((r) => r.slice(0, 2))).toEqual([['Alpha', '35'], ['Bravo', '61']]);
  });

  it('a superseded refresh\'s probe answer never lands: a newer refresh begun meanwhile wins', async () => {
    const pending: ((v: { entries: ReturnType<typeof entry>[]; doors: ReadonlyMap<string, string> }) => void)[] = [];
    const m = rig(() => new Promise((resolve) => { pending.push(resolve); }));
    m.host.dispatch(cmd('RefreshRoomList'));
    pending[0]!({ entries: [entry('Alpha', 3, true)], doors: new Map([['Alpha', DOOR_A]]) });
    await flush();
    expect(m.probes).toHaveLength(1);
    m.host.dispatch(cmd('RefreshRoomList'));                     // a newer refresh begins before the first probe answers
    m.probes[0]!.answer(999);
    await flush();
    expect(values(m.uiVars)[0]!.slice(0, 2)).toEqual(['Alpha', '--']);
    pending[1]!({ entries: [entry('Alpha', 3, true)], doors: new Map([['Alpha', DOOR_A]]) });
    await flush();
    answered.add(m.probes[0]!);
    await settle(m.probes, () => 40);
    expect(values(m.uiVars)[0]!.slice(0, 2)).toEqual(['Alpha', '40']);
  });

  it('a session change drops the samples and any probe in flight', async () => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), valves = new ValveStore();
    let ticket: string | null = 'T1';
    const probes: Probe[] = [];
    const world = connectWorldOfSocom(host, {
      uiVars, valves: () => valves, event: () => {}, ticket: () => ticket,
      roomListPing: { now: () => 0, probe: (door) => new Promise((answer) => { probes.push({ door, answer }); }) },
      roomList: { channelList: async () => [], channelListWithDoors: async () => ({ entries: [entry('Alpha', 3, true)], doors: new Map([['Alpha', DOOR_A]]) }) },
    });
    host.dispatch(cmd('RefreshRoomList'));
    await flush();
    ticket = 'T2';
    world.frame();
    probes[0]!.answer(25);
    await flush();
    expect(values(uiVars)[0]!.slice(0, 2)).toEqual(['Alpha', '--']);
  });

  it('a failed list refresh clears every room\'s number', async () => {
    let fail = false;
    const m = rig(async () => { if (fail) throw new Error('offline'); return { entries: [entry('Alpha', 3, true)], doors: new Map([['Alpha', DOOR_A]]) }; });
    m.host.dispatch(cmd('RefreshRoomList'));
    await flush();
    await settle(m.probes, () => 20);
    expect(values(m.uiVars)[0]![1]).toBe('20');
    const sent = m.probes.length;
    fail = true;
    m.host.dispatch(cmd('RefreshRoomList'));
    await flush();
    expect(values(m.uiVars)[0]![1]).toBe('--');
    expect(m.probes).toHaveLength(sent);
  });

  it('LATER 527: the constants are ours (3 samples to draw, a window of 5)', () => {
    expect([ROOM_LIST_PING_SAMPLES_ADAPTATION, ROOM_LIST_PING_WINDOW_ADAPTATION]).toEqual([3, 5]);
  });

  it('LATER 527 (a): on the FIRST refresh all SAMPLES probes go (each after the last answers) and the rounded mean appears, no second refresh', async () => {
    const m = rig([{ entries: [entry('Alpha', 3, true)], doors: { Alpha: DOOR_A } }]);
    m.host.dispatch(cmd('RefreshRoomList'));
    await flush();
    expect(m.probes).toHaveLength(1);                          // sequential: the second goes out only after the first answers
    m.probes[0]!.answer(10);
    await flush();
    expect(m.probes).toHaveLength(2);
    expect(values(m.uiVars)[0]![1]).toBe('--');
    m.probes[1]!.answer(11);
    await flush();
    expect(m.probes).toHaveLength(3);
    expect(values(m.uiVars)[0]![1]).toBe('--');
    m.probes[2]!.answer(11);
    await flush();
    expect(m.probes).toHaveLength(3);
    expect(values(m.uiVars)[0]![1]).toBe('11');               // (10 + 11 + 11) / 3 = 10.67
  });

  it('LATER 527 (b): a later refresh sends one probe and joins a rolling mean over the last WINDOW samples', async () => {
    const one = { entries: [entry('Alpha', 3, true)], doors: { Alpha: DOOR_A } };
    const m = rig([one, one, one, one, one, one]);
    const seen: string[] = [];
    m.host.dispatch(cmd('RefreshRoomList'));
    await settle(m.probes, (_d, n) => [10, 20, 30][n]!);
    seen.push(String(values(m.uiVars)[0]![1]));
    for (const ms of [40, 50, 60]) {
      const before = m.probes.length;
      m.host.dispatch(cmd('RefreshRoomList'));
      await flush();
      expect(m.probes).toHaveLength(before + 1);
      expect(values(m.uiVars)[0]![1]).toBe(seen[seen.length - 1]);   // the old mean stays until the new sample answers
      m.probes[before]!.answer(ms);
      await flush();
      seen.push(String(values(m.uiVars)[0]![1]));
    }
    expect(seen).toEqual(['20', '25', '30', '40']);            // 10,20,30 | +40 | +50 | 20..60 (10 left the window of 5)
  });

  it('LATER 527 (c): a failed probe is not averaged in; a door whose samples all failed stays --', async () => {
    const one = { entries: [entry('Alpha', 3, true)], doors: { Alpha: DOOR_A } };
    const m = rig([one, one, one]);
    m.host.dispatch(cmd('RefreshRoomList'));
    await settle(m.probes, (_d, n) => [10, null, 30][n] ?? null);
    expect(values(m.uiVars)[0]![1]).toBe('--');                // two samples of three: not yet drawn
    const before = m.probes.length;
    m.host.dispatch(cmd('RefreshRoomList'));
    await flush();
    expect(m.probes).toHaveLength(before + 1);                  // the one missing sample
    m.probes[before]!.answer(20);
    await flush();
    expect(values(m.uiVars)[0]![1]).toBe('20');                // (10 + 30 + 20) / 3, the null left out
    const after = m.probes.length;
    m.host.dispatch(cmd('RefreshRoomList'));
    await flush();
    m.probes[after]!.answer(null);
    await flush();
    expect(values(m.uiVars)[0]![1]).toBe('20');                // a failed later probe leaves the mean as it was
  });

  it('LATER 527 (d): a newer refresh or a session change makes old samples and an old sequence void', async () => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), valves = new ValveStore();
    let ticket: string | null = 'T1';
    const probes: Probe[] = [];
    const world = connectWorldOfSocom(host, {
      uiVars, valves: () => valves, event: () => {}, ticket: () => ticket,
      roomListPing: { now: () => 0, probe: (door) => new Promise((answer) => { probes.push({ door, answer }); }) },
      roomList: { channelList: async () => [], channelListWithDoors: async () => ({ entries: [entry('Alpha', 3, true)], doors: new Map([['Alpha', DOOR_A]]) }) },
    });
    host.dispatch(cmd('RefreshRoomList'));
    await flush();
    probes[0]!.answer(10);
    await flush();
    expect(probes).toHaveLength(2);
    host.dispatch(cmd('RefreshRoomList'));                       // a newer refresh: the first sequence must send nothing more
    await flush();
    probes[1]!.answer(99);
    await flush();
    expect(probes.map((p) => p.door)).toEqual([DOOR_A, DOOR_A, DOOR_A]);   // the newer refresh's own first probe, none from the old sequence
    expect(values(uiVars)[0]![1]).toBe('--');
    ticket = 'T2';                                               // a session change drops the held samples
    world.frame();
    probes[2]!.answer(5);
    await flush();
    expect(values(uiVars)[0]![1]).toBe('--');
    expect(probes).toHaveLength(3);
  });
});

describe('LATER 455: the room list\'s doors over /lobby/channel-list', () => {
  const entry = (lobbyName: string, endOfList = false) => ({ status: 0, mediusWorldId: 1, playerCount: 3, maxPlayers: 64, securityLevel: 0, genericField1: 0, lobbyName, endOfList });

  it('channelListWithDoors: the entries as channelList\'s, and each room\'s door origin by its name', async () => {
    const body = { entries: [entry('Alpha'), entry('EUROPE'), entry('Bravo', true)], doors: ['https://door-a.example', null, 'http://127.0.0.1:5343'] };
    const r = await fetchRoomListService('https://socom.example', fetching(200, body)).channelListWithDoors!({ ...ROOM_LIST_QUERY }, 'T1');
    if (r === ROOM_LIST_SESSION_LOST) throw new Error('lost');
    expect(r.entries).toEqual(body.entries);
    expect([...r.doors]).toEqual([['Alpha', 'https://door-a.example'], ['Bravo', 'http://127.0.0.1:5343']]);
    expect(await fetchRoomListService('https://socom.example', fetching(200, body)).channelList({ ...ROOM_LIST_QUERY }, 'T1')).toEqual(body.entries);
  });

  it('no doors, doors of another length, or a door that is no bare http(s) origin: no door for that room', () => {
    const entries = [entry('Alpha'), entry('Bravo', true)];
    expect([...roomDoorsOf({ entries }, entries)]).toEqual([]);
    expect([...roomDoorsOf({ entries, doors: ['https://door-a.example'] }, entries)]).toEqual([]);
    expect([...roomDoorsOf({ entries, doors: 'https://door-a.example' }, entries)]).toEqual([]);
    expect([...roomDoorsOf({ entries, doors: ['https://door-a.example/ping', 'javascript:alert(1)'] }, entries)]).toEqual([]);
    expect([...roomDoorsOf({ entries, doors: ['https://user@door-a.example', 'ftp://door-b.example'] }, entries)]).toEqual([]);
    expect([...roomDoorsOf({ entries, doors: [7, 'https://door-b.example'] }, entries)]).toEqual([['Bravo', 'https://door-b.example']]);
  });

  it('a 401 is still the session lost', async () => {
    expect(await fetchRoomListService('http://x', fetching(401, {})).channelListWithDoors!({ ...ROOM_LIST_QUERY }, 'T')).toBe(ROOM_LIST_SESSION_LOST);
  });
});

describe('OPT-15: ONLINE OPTIONS\' description over POST /lobby/owner-fields, the session\'s ticket its bearer (research 265 §1)', () => {
  it('posts { description } with Authorization: Bearer <ticket>, no credentials, not cached; hands back the stored text', async () => {
    const calls: Call[] = [];
    expect(await fetchOwnerFieldsService('https://socom.example', fetching(200, { description: 'stored' }, calls)).setDescription('typed', 'T1')).toEqual({ description: 'stored' });
    expect(calls.map((c) => [c.url, c.init.method, (c.init.headers as Record<string, string>).authorization, c.init.body, c.init.credentials, c.init.cache]))
      .toEqual([['https://socom.example/lobby/owner-fields', 'POST', 'Bearer T1', '{"description":"typed"}', 'omit', 'no-store']]);
  });

  it('401 is the session lost; any other refusal or another shape is a request never answered (it rejects)', async () => {
    expect(await fetchOwnerFieldsService('http://x', fetching(401, {})).setDescription('a', 'T')).toBe(ROOM_LIST_SESSION_LOST);
    for (const status of [400, 404, 500]) await expect(fetchOwnerFieldsService('http://x', fetching(status, { description: 'a' })).setDescription('a', 'T'), String(status)).rejects.toThrow();
    await expect(fetchOwnerFieldsService('http://x', fetching(200, { description: 7 })).setDescription('a', 'T')).rejects.toThrow();
  });

  it('the mount registers SetPlayerDescription: the variable sent with the ticket and set to the answer; no ticket, no request; a 401 the session lost', async () => {
    const run = async (ticket: string | null, status: number) => {
      const host = new UiCommandHost(), uiVars = new UiVarManager(), valves = new ValveStore(), calls: Call[] = [], lost: string[] = [];
      connectWorldOfSocom(host, {
        uiVars, valves: () => valves, event: () => {}, ownerFields: fetchOwnerFieldsService('http://own', fetching(status, { description: 'stored' }, calls)),
        ticket: () => ticket, sessionLost: (t) => { lost.push(t); },
      });
      uiVars.set(uiVars.add('PlayerDescription', null, 1), { type: 'string', value: 'typed' });
      expect(host.dispatch(cmd('SetPlayerDescription')).kind).toBe('table');
      await flush();
      return { sent: calls.length, lost, text: uiVars.find('PlayerDescription')!.value };
    };
    expect(await run('T1', 200)).toEqual({ sent: 1, lost: [], text: { type: 'string', value: 'stored' } });
    expect(await run(null, 200)).toEqual({ sent: 0, lost: [], text: { type: 'string', value: 'typed' } });
    expect(await run('T2', 401)).toEqual({ sent: 1, lost: ['T2'], text: { type: 'string', value: 'typed' } });
  });
});

describe('SVC-15a: the own-stats read over POST /lobby/player-info at state 11\'s entry, the session\'s ticket its bearer (research 268 §1.7)', () => {
  const record = (description: string): string => {
    const b = new Uint8Array(256);
    b[0] = 0x45;
    for (let i = 0; i < description.length; i++) b[0x9f + i] = description.charCodeAt(i);
    return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  };

  it('posts { name } with Authorization: Bearer <ticket>, no credentials, not cached; hands back the status and the record', async () => {
    const calls: Call[] = [];
    expect(await fetchPlayerInfoService('https://socom.example', fetching(200, { status: 0, accountName: 'Alfa One', playerStatus: 0, stats: 'ab' }, calls)).playerInfo({ name: 'Alfa One' }, 'T1'))
      .toEqual({ status: 0, stats: 'ab' });
    expect(calls.map((c) => [c.url, c.init.method, (c.init.headers as Record<string, string>).authorization, c.init.body, c.init.credentials, c.init.cache]))
      .toEqual([['https://socom.example/lobby/player-info', 'POST', 'Bearer T1', '{"name":"Alfa One"}', 'omit', 'no-store']]);
  });

  it('401 is the session lost; any other refusal or another shape is a request never answered (it rejects)', async () => {
    expect(await fetchPlayerInfoService('http://x', fetching(401, {})).playerInfo({ name: 'a' }, 'T')).toBe(ROOM_LIST_SESSION_LOST);
    for (const status of [400, 404, 500]) await expect(fetchPlayerInfoService('http://x', fetching(status, { status: 0, stats: '' })).playerInfo({ name: 'a' }, 'T'), String(status)).rejects.toThrow();
    await expect(fetchPlayerInfoService('http://x', fetching(200, { status: 0, stats: 7 })).playerInfo({ name: 'a' }, 'T')).rejects.toThrow();
  });

  it('the mount hands state 11\'s entry to the read: PlayerDescription set from the own record; no ticket, no request; a 401 the session lost', async () => {
    const run = async (ticket: string | null, status: number, phase: 1 | 2 = 1) => {
      const host = new UiCommandHost(), uiVars = new UiVarManager(), valves = new ValveStore(), calls: Call[] = [], lost: string[] = [];
      const handlers = new Map<number, (phase: 1 | 2 | 3) => void>();
      const lobby = { state: () => 11, logout: () => true, disconnect: () => {}, close: () => {}, setHandler: (n: number, h: (phase: 1 | 2 | 3) => void) => { handlers.set(n, h); }, account: () => 'Alfa One' };
      connectWorldOfSocom(host, {
        uiVars, valves: () => valves, event: () => {}, lobby, ticket: () => ticket, sessionLost: (t) => { lost.push(t); },
        playerInfo: fetchPlayerInfoService('http://own', fetching(status, { status: 0, accountName: 'Alfa One', playerStatus: 0, stats: record('stored text') }, calls)),
      });
      handlers.get(LOBBY_STATE.LOGGED_IN)?.(phase);
      await flush();
      return { sent: calls.map((c) => c.init.body), lost, text: uiVars.find('PlayerDescription')?.value ?? null };
    };
    expect(await run('T1', 200)).toEqual({ sent: ['{"name":"Alfa One"}'], lost: [], text: { type: 'string', value: 'stored text' } });
    expect(await run('T1', 200, 2)).toEqual({ sent: [], lost: [], text: null });
    expect(await run(null, 200)).toEqual({ sent: [], lost: [], text: null });
    expect(await run('T2', 401)).toEqual({ sent: ['{"name":"Alfa One"}'], lost: ['T2'], text: null });
  });

  it('a reply that lands after a new login (the ticket changed) changes nothing; sessionPlayerInfo rejects it as never answered', async () => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), valves = new ValveStore();
    const handlers = new Map<number, (phase: 1 | 2 | 3) => void>();
    let ticket: string | null = 'ticket-A';
    let name = 'Alfa One';
    const lobby = { state: () => 11, logout: () => true, disconnect: () => {}, close: () => {}, setHandler: (n: number, h: (phase: 1 | 2 | 3) => void) => { handlers.set(n, h); }, account: () => name };
    const held: ((r: { status: number; stats: string }) => void)[] = [];
    const transport: PlayerInfoTransport = { playerInfo: () => new Promise((ok) => { held.push(ok); }) };
    connectWorldOfSocom(host, { uiVars, valves: () => valves, event: () => {}, lobby, ticket: () => ticket, playerInfo: transport });
    handlers.get(LOBBY_STATE.LOGGED_IN)?.(1);
    ticket = 'ticket-B';          // A logged off, B logged in before A's reply came
    name = 'Bravo One';
    held[0]!({ status: 0, stats: record('alfa text') });
    await flush();
    expect(uiVars.find('PlayerDescription')).toBeUndefined();
    let t: string | null = 'T1';
    const lookup = sessionPlayerInfo({ playerInfo: async () => { t = 'T2'; return { status: 0, stats: '' }; } }, () => t, () => {});
    await expect(lookup.playerInfo({ name: 'Alfa One' })).rejects.toThrow();
  });
});
