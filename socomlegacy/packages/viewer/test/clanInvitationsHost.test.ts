import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ClanInvitationCommands, LobbyClan, MyClanInvitations, PLAYER_INVITE_NAME_VAR, UiCommandHost, UiVarManager, type ZAnimUiCommand } from '@s2u/ui';
import { CLAN_INVITATIONS_SESSION_LOST, connectClanInvitations, fetchClanMembershipService, sessionClanMembership } from '../src/clanInvitationsHost';

/**
 * ONL-28's page half (web research 273 §5): the invitations' requests -- SVC-09a's `/clan/invitations` now with the
 * session's ticket, SVC-09's `/clan/invite`, `/clan/invitations-sent`, `/clan/revoke`, `/clan/respond`
 * (`packages/central/src/clans.ts`, `CLAN_MEMBERSHIP_PATHS`), NU-14's AccountGetID `/lobby/account-id` and SVC-18's `/lobby/chat` -- at the
 * page's own origin with the bearer; a 401 the session lost, handed to the lobby client; any other refusal or shape a
 * request never answered; no ticket, no request. And the session's mount of `@s2u/ui`'s rows over the client's clan
 * and the received list SOCOM II ONLINE's INVITATIONS row reads.
 */
type Call = { url: string; init: RequestInit };
const fetching = (status: number, body: unknown, calls: Call[] = []) =>
  (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(status === 204 ? null : JSON.stringify(body), { status }); }) as unknown as typeof fetch;
const cmd = (fn: string, arg = 'NA'): ZAnimUiCommand => ({ anim: 'test', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(16) });
const flush = async (): Promise<void> => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };
const SENT = { status: 0, accountId: 42, accountName: 'bob', responseMessage: '', responseStatus: 0, responseTime: 0, endOfList: true };
const INVITE = { status: 0, clanInvitationId: 7, clanId: 3, responseStatus: 0, message: 'Clan Tide invites you to join.', leaderAccountId: 2, leaderAccountName: 'lead', endOfList: true };

describe('fetchClanMembershipService', () => {
  it('posts each request as JSON to its path with the bearer, no credentials, not cached', async () => {
    const calls: Call[] = [];
    const t = fetchClanMembershipService('https://socom.example', fetching(200, { status: 0, accountId: 42, replies: [SENT] }, calls));
    expect(await t.accountId({ name: 'bob' }, 'T1')).toEqual({ status: 0, accountId: 42 });
    expect(await t.invite({ playerAccountId: 42, message: 'Clan Tide invites you to join.' }, 'T1')).toEqual({ status: 0 });
    expect(await t.invitationsSent({ start: 0, pageSize: 999 }, 'T1')).toEqual([SENT]);
    expect(await t.revoke({ playerAccountId: 42 }, 'T1')).toEqual({ status: 0 });
    expect(await t.respond({ clanInvitationId: 7, response: 1, message: '' }, 'T1')).toEqual({ status: 0 });
    expect(calls.map((c) => [c.url, c.init.method, (c.init.headers as Record<string, string>)['authorization'], c.init.credentials, c.init.cache])).toEqual([
      ['https://socom.example/lobby/account-id', 'POST', 'Bearer T1', 'omit', 'no-store'],
      ['https://socom.example/clan/invite', 'POST', 'Bearer T1', 'omit', 'no-store'],
      ['https://socom.example/clan/invitations-sent', 'POST', 'Bearer T1', 'omit', 'no-store'],
      ['https://socom.example/clan/revoke', 'POST', 'Bearer T1', 'omit', 'no-store'],
      ['https://socom.example/clan/respond', 'POST', 'Bearer T1', 'omit', 'no-store'],
    ]);
    expect(calls.map((c) => JSON.parse(String(c.init.body)))).toEqual([
      { accountName: 'bob' }, { playerAccountId: 42, message: 'Clan Tide invites you to join.' }, { start: 0, pageSize: 999 }, { playerAccountId: 42 },
      { clanInvitationId: 7, response: 1, message: '' },
    ]);
  });

  it('the received list (/clan/invitations) now with the bearer; the whisper (/lobby/chat) answered 204', async () => {
    const calls: Call[] = [];
    expect(await fetchClanMembershipService('http://own', fetching(200, { replies: [INVITE] }, calls)).check({ start: 0, pageSize: 999 }, 'T2')).toEqual([INVITE]);
    expect(await fetchClanMembershipService('http://own', fetching(204, null, calls)).chat({ messageType: 1, targetId: 42, message: 'hi' }, 'T2')).toBeUndefined();
    expect(calls.map((c) => [c.url, (c.init.headers as Record<string, string>)['authorization'], JSON.parse(String(c.init.body))])).toEqual([
      ['http://own/clan/invitations', 'Bearer T2', { start: 0, pageSize: 999 }], ['http://own/lobby/chat', 'Bearer T2', { messageType: 1, targetId: 42, message: 'hi' }],
    ]);
  });

  it('401 is the session lost; any other refusal or another shape is a request never answered (it rejects)', async () => {
    const t401 = fetchClanMembershipService('http://x', fetching(401, {}));
    for (const p of [t401.invite({ playerAccountId: 1, message: 'm' }, 'T'), t401.check({ start: 0, pageSize: 999 }, 'T'), t401.chat({ messageType: 1, targetId: 1, message: 'm' }, 'T')]) {
      expect(await p).toBe(CLAN_INVITATIONS_SESSION_LOST);
    }
    for (const status of [400, 403, 404, 429, 500]) await expect(fetchClanMembershipService('http://x', fetching(status, { status: 0 })).revoke({ playerAccountId: 1 }, 'T'), String(status)).rejects.toThrow();
    await expect(fetchClanMembershipService('http://x', fetching(200, { status: 'x' })).invite({ playerAccountId: 1, message: 'm' }, 'T')).rejects.toThrow();
    await expect(fetchClanMembershipService('http://x', fetching(200, { replies: [{ ...SENT, accountName: 3 }] })).invitationsSent({ start: 0, pageSize: 999 }, 'T')).rejects.toThrow();
    await expect(fetchClanMembershipService('http://x', fetching(200, { status: 0, accountId: '1' })).accountId({ name: 'a' }, 'T')).rejects.toThrow();
  });

  it('the session\'s services: the ticket read at each request; none, no request; a 401 handed to sessionLost', async () => {
    const calls: Call[] = [], lost: string[] = [];
    let ticket: string | null = null;
    const s = sessionClanMembership(fetchClanMembershipService('http://own', fetching(401, {}, calls)), () => ticket, (t) => { lost.push(t); });
    await expect(s.invited.invite({ playerAccountId: 1, message: 'm' })).rejects.toThrow();
    await expect(s.invitations.check({ start: 0, pageSize: 999 })).rejects.toThrow();
    expect(calls).toHaveLength(0);
    ticket = 'T9';
    await expect(s.respond.respond({ clanInvitationId: 7, response: 2, message: '' })).rejects.toThrow();
    expect([calls.length, lost]).toEqual([1, ['T9']]);
    expect('addPlayer' in s.invited).toBe(false);                                    // INVITATION_LISTS_UNDECIDED_PLACEHOLDER: no AddPlayerToClan on our services
  });
});

describe('connectClanInvitations: the rows on the session over the transport', () => {
  it('the INVITATIONS row\'s CheckMyInvites asks with the bearer over the session\'s received list; INVITE and RESPOND go over the same transport', async () => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), clan = new LobbyClan(), calls: Call[] = [], events: number[] = [];
    clan.clanId = 12; clan.leader = 'mine'; clan.name = 'Tide';
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const op = url.slice(url.lastIndexOf('/') + 1);
      const body = op === 'invitations' ? { replies: [INVITE] } : op === 'account-id' ? { status: 0, accountId: 42 } : op === 'invitations-sent' ? { replies: [SENT] } : { status: 0 };
      return new Response(op === 'chat' ? null : JSON.stringify(body), { status: op === 'chat' ? 204 : 200 });
    }) as unknown as typeof fetch;
    const invitations = new MyClanInvitations({ uiVars });
    const c = connectClanInvitations(host, {
      uiVars, clan, invitations, service: fetchClanMembershipService('http://own', fetchFn), ticket: () => 'T1', sessionLost: () => {},
      event: (k) => { events.push(k); }, inputString: () => '7',
    });
    host.dispatch(cmd('CheckMyInvites'));
    await flush();
    expect([invitations.count, (calls[0]!.init.headers as Record<string, string>)['authorization']]).toEqual([1, 'Bearer T1']);
    expect(host.dispatch(cmd('HasClanInvitations'))).toMatchObject({ kind: 'table', answer: true });
    uiVars.set(uiVars.add(PLAYER_INVITE_NAME_VAR, null, 1), { type: 'string', value: 'bob' });
    host.dispatch(cmd('InvitePlayerToClan'));
    await flush();
    host.dispatch(cmd('AcceptInvitation', 'INPUT_STRING'));
    await flush();
    expect(calls.map((x) => x.url.replace('http://own', ''))).toEqual([
      '/clan/invitations', '/lobby/account-id', '/clan/invite', '/lobby/chat', '/clan/invitations-sent', '/clan/respond', '/clan/invitations',
    ]);
    expect([events, c.invited.records().map((r) => r.name), clan.member]).toEqual([[], ['bob'], true]);                // an accept leaves the client's clan as it was
  });

  it('NU-14, the owner\'s case: a known player in no briefing room -- the services\' FindPlayer answers AccountNotFound for him, AccountGetID his account -- is invited: the lookup is AccountGetID, the invitation and its whisper sent, no MP_PLAYER_NOT_FOUND', async () => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), clan = new LobbyClan(), calls: Call[] = [], events: number[] = [];
    clan.clanId = 12; clan.leader = 'mine'; clan.name = 'Tide';
    // The services as the owner's playtest server answered: Lima logged in on SOCOM II ONLINE, in no room and no game seat.
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const op = url.slice(url.lastIndexOf('/') + 1);
      const body = op === 'find-player' ? { status: -998, accountId: 0, accountName: 'Lima' }              // chat.ts findPlayer: not on the lobby
        : op === 'account-id' ? { status: 0, accountId: 77 }                                                // accountGetId.ts: logged in, in no room
          : op === 'invitations-sent' ? { replies: [{ ...SENT, accountId: 77, accountName: 'Lima' }] } : { status: 0 };
      return new Response(op === 'chat' ? null : JSON.stringify(body), { status: op === 'chat' ? 204 : 200 });
    }) as unknown as typeof fetch;
    const c = connectClanInvitations(host, {
      uiVars, clan, invitations: new MyClanInvitations({ uiVars }), service: fetchClanMembershipService('http://own', fetchFn), ticket: () => 'T1',
      sessionLost: () => {}, event: (k) => { events.push(k); }, inputString: () => null,
    });
    uiVars.set(uiVars.add(PLAYER_INVITE_NAME_VAR, null, 1), { type: 'string', value: 'Lima' });
    host.dispatch(cmd('InvitePlayerToClan'));
    await flush();
    expect(calls.map((x) => [x.url.replace('http://own', ''), JSON.parse(String(x.init.body)) as unknown])).toEqual([
      ['/lobby/account-id', { accountName: 'Lima' }], ['/clan/invite', { playerAccountId: 77, message: 'Clan Tide invites you to join.' }],
      ['/lobby/chat', { messageType: 1, targetId: 77, message: 'Clan Tide invites you to join.' }], ['/clan/invitations-sent', { start: 0, pageSize: 999 }],
    ]);
    expect([events, c.invited.records().map((r) => r.name), c.invited.state]).toEqual([[], ['Lima'], 3]);
  });

  it('INVITE-TICKETLESS (research 273 §9): over the world\'s ticketless rows the mount takes both -- the ticketless service never asked; no ticket, no request at all; a ticket, the bearer', async () => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), calls: Call[] = [], ticketless: string[] = [];
    const invitations = new MyClanInvitations({ uiVars });
    // As connectWorldOfSocom registers them first (worldOfSocomHost.ts), over frontEnd.ts's fetchClanInvitationsService.
    new ClanInvitationCommands({ list: invitations, service: { check: (q) => { ticketless.push(JSON.stringify(q)); return Promise.resolve([]); } } }).register(host);
    let ticket: string | null = null;                                                // a deep link to SOCOM II ONLINE, or a session lost
    connectClanInvitations(host, {
      uiVars, clan: new LobbyClan(), invitations, service: fetchClanMembershipService('http://own', fetching(200, { replies: [INVITE] }, calls)),
      ticket: () => ticket, sessionLost: () => {}, event: () => {}, inputString: () => null,
    });
    host.dispatch(cmd('CheckMyInvites'));
    await flush();
    expect([calls.length, ticketless, host.dispatch(cmd('HasClanInvitations')).answer]).toEqual([0, [], false]);   // NO INVITATIONS, nothing sent
    ticket = 'T3';
    host.dispatch(cmd('CheckMyInvites'));
    await flush();
    expect(calls.map((c) => [c.url, (c.init.headers as Record<string, string>)['authorization']])).toEqual([['http://own/clan/invitations', 'Bearer T3']]);
    expect([ticketless, host.dispatch(cmd('HasClanInvitations')).answer]).toEqual([[], true]);
  });

  it('no transport: the rows registered, every request never answered; the received list keeps the world\'s registration', () => {
    const host = new UiCommandHost(), uiVars = new UiVarManager();
    host.setHandler('CheckMyInvites', () => false);                                   // the world's row, as connectWorldOfSocom leaves it
    connectClanInvitations(host, { uiVars, clan: new LobbyClan(), invitations: new MyClanInvitations({ uiVars }), ticket: () => null, sessionLost: () => {}, event: () => {}, inputString: () => null });
    expect(host.dispatch(cmd('CheckMyInvites'))).toMatchObject({ kind: 'table', answer: false });
    for (const name of ['InvitePlayerToClan', 'RevokeInvite', 'GetInvitedPlayers', 'ClanHasInvitations', 'CanInviteMorePlayersToClan', 'AcceptInvitation', 'DeclineInvitation']) {
      expect(host.dispatch(cmd(name)).kind, name).toBe('table');
    }
  });
});

describe('frontEnd.ts mounts it (ONL-28; the seat\'s claim of the four lines, HANDOFF §3)', () => {
  const src = readFileSync(resolve(fileURLToPath(import.meta.url), '../../src/frontEnd.ts'), 'utf8');

  it('imports the host\'s mount and transport; the session option clanMembership is a ClanMembershipTransport', () => {
    expect(src).toContain("import { connectClanInvitations, fetchClanInvitationsService, fetchClanMembershipService, type ClanMembershipTransport } from './clanInvitationsHost';");
    expect(src).toMatch(/\n {2}clanMembership\?: ClanMembershipTransport;\n/);
  });

  it('the session mounts both pages over SOCOM II ONLINE\'s client clan and received list, the ticket, the lobby\'s events, the input string and its state, after connectCreateClan', () => {
    const call = 'connectClanInvitations(this.host, { uiVars: this.uiVars, clan: this.world.commands.clan, invitations: this.world.invitations, service: o.clanMembership, '
      + 'ticket: () => this.lobby?.ticket() ?? null, sessionLost: (t) => { this.lobby?.sessionLost(t); }, event: lobbyEventInto(() => this.machine, this.parts), '
      + 'inputString: (cmd) => this.machine.shell()?.inputString(cmd.anim) ?? null, lobby: this.connect?.lobby ?? null });';
    expect(src).toContain(call);
    expect(src.indexOf(call)).toBeGreaterThan(src.indexOf('connectCreateClan(this.host, {'));
    // INVITE-TICKETLESS: after the world's ticketless registration, so the ticketed rows are the ones the page dispatches
    expect(src.indexOf(call)).toBeGreaterThan(src.indexOf('this.world = connectWorldOfSocom(this.host, {'));
    expect(src.indexOf('this.world = connectWorldOfSocom(this.host, {')).toBeGreaterThan(0);
  });

  it('the page hands the transport at its own origin with the session\'s bearer, as the other online pages', () => {
    expect(src).toMatch(/clanMembership: fetchClanMembershipService\(accountServiceBase\(search, win\.location, devBuild\(\)\)\),/);
  });
});
