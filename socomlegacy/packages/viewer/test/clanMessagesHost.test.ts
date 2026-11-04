import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LobbyClan, SEND_CLAN_MESSAGE_VAR, UiCommandHost, UiVarManager, type ZAnimUiCommand } from '@s2u/ui';
import { CLAN_MESSAGES_SESSION_LOST, connectClanMessages, fetchClanMessagesService, sessionClanMessages } from '../src/clanMessagesHost';

/**
 * ONL-29's page half (web research 274 §4): the clan messages' requests -- SVC-10's `/clan/messages`,
 * `/clan/all-messages`, `/clan/send-message`, `/clan/modify-message` and `/clan/delete-message`
 * (`packages/central/src/clans.ts`, `CLAN_MESSAGE_PATHS`) -- at the page's own origin with the bearer; a 401 the session
 * lost, handed to the lobby client; any other refusal or shape a request never answered; no ticket, no request. And the
 * session's mount of `@s2u/ui`'s five rows over the client's clan.
 */
type Call = { url: string; init: RequestInit };
const fetching = (status: number, body: unknown, calls: Call[] = []) =>
  (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(body), { status }); }) as unknown as typeof fetch;
const cmd = (fn: string, arg = 'NA'): ZAnimUiCommand => ({ anim: 'test', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(16) });
const flush = async (): Promise<void> => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };
const MINE = { status: 0, clanId: 12, message: 'Practice at eight.', endOfList: true };
const ALL = { status: 0, clanMessageId: 3, message: 'Practice at eight.', clanMessageStatus: 3, endOfList: true };

describe('fetchClanMessagesService', () => {
  it('posts each request as JSON to its path with the bearer, no credentials, not cached', async () => {
    const calls: Call[] = [];
    const t = fetchClanMessagesService('https://socom.example', fetching(200, { status: 0, replies: [{ ...MINE, ...ALL }] }, calls));
    expect(await t.myMessages({ clanId: 12, start: 1, pageSize: 999 }, 'T1')).toEqual([MINE]);
    expect(await t.allMessages({ start: 1, pageSize: 999 }, 'T1')).toEqual([ALL]);
    expect(await t.send({ message: 'hi' }, 'T1')).toEqual({ status: 0 });
    expect(await t.modify({ clanMessageId: 3, newMessage: 'HI' }, 'T1')).toEqual({ status: 0 });
    expect(await t.delete({ clanMessageId: 3 }, 'T1')).toEqual({ status: 0 });
    expect(calls.map((c) => [c.url, c.init.method, (c.init.headers as Record<string, string>)['authorization'], c.init.credentials, c.init.cache])).toEqual([
      ['https://socom.example/clan/messages', 'POST', 'Bearer T1', 'omit', 'no-store'],
      ['https://socom.example/clan/all-messages', 'POST', 'Bearer T1', 'omit', 'no-store'],
      ['https://socom.example/clan/send-message', 'POST', 'Bearer T1', 'omit', 'no-store'],
      ['https://socom.example/clan/modify-message', 'POST', 'Bearer T1', 'omit', 'no-store'],
      ['https://socom.example/clan/delete-message', 'POST', 'Bearer T1', 'omit', 'no-store'],
    ]);
    expect(calls.map((c) => JSON.parse(String(c.init.body)))).toEqual([
      { clanId: 12, start: 1, pageSize: 999 }, { start: 1, pageSize: 999 }, { message: 'hi' }, { clanMessageId: 3, newMessage: 'HI' }, { clanMessageId: 3 },
    ]);
  });

  it('401 is the session lost; any other refusal or another shape is a request never answered (it rejects)', async () => {
    const t401 = fetchClanMessagesService('http://x', fetching(401, {}));
    for (const p of [t401.myMessages({ clanId: 1, start: 1, pageSize: 999 }, 'T'), t401.send({ message: 'm' }, 'T'), t401.delete({ clanMessageId: 1 }, 'T')]) {
      expect(await p).toBe(CLAN_MESSAGES_SESSION_LOST);
    }
    for (const status of [400, 403, 404, 429, 500]) await expect(fetchClanMessagesService('http://x', fetching(status, { status: 0 })).send({ message: 'm' }, 'T'), String(status)).rejects.toThrow();
    await expect(fetchClanMessagesService('http://x', fetching(200, { status: 'x' })).modify({ clanMessageId: 1, newMessage: 'm' }, 'T')).rejects.toThrow();
    await expect(fetchClanMessagesService('http://x', fetching(200, { replies: [{ ...MINE, message: 3 }] })).myMessages({ clanId: 1, start: 1, pageSize: 999 }, 'T')).rejects.toThrow();
    await expect(fetchClanMessagesService('http://x', fetching(200, { replies: [{ ...ALL, endOfList: 'yes' }] })).allMessages({ start: 1, pageSize: 999 }, 'T')).rejects.toThrow();
    await expect(fetchClanMessagesService('http://x', fetching(200, { status: 0 })).allMessages({ start: 1, pageSize: 999 }, 'T')).rejects.toThrow();
  });

  it('the session\'s service: the ticket read at each request; none, no request; a 401 handed to sessionLost', async () => {
    const calls: Call[] = [], lost: string[] = [];
    let ticket: string | null = null;
    const s = sessionClanMessages(fetchClanMessagesService('http://own', fetching(401, {}, calls)), () => ticket, (t) => { lost.push(t); });
    await expect(s.send({ message: 'm' })).rejects.toThrow();
    await expect(s.myMessages({ clanId: 1, start: 1, pageSize: 999 })).rejects.toThrow();
    expect(calls).toHaveLength(0);
    ticket = 'T9';
    await expect(s.allMessages({ start: 1, pageSize: 999 })).rejects.toThrow();
    expect([calls.length, lost]).toEqual([1, ['T9']]);
  });
});

describe('connectClanMessages: the five rows on the session over the transport', () => {
  it('the leader\'s list, a post on "-1" and the list again, the member\'s pane through the seam -- each with the bearer', async () => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), clan = new LobbyClan(), calls: Call[] = [];
    clan.clanId = 12; clan.leader = 'mine';
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const op = url.slice(url.lastIndexOf('/') + 1);
      const body = op === 'messages' ? { replies: [MINE] } : op === 'all-messages' ? { replies: [ALL] } : { status: 0 };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    const c = connectClanMessages(host, {
      uiVars, clan, service: fetchClanMessagesService('http://own', fetchFn), ticket: () => 'T1', sessionLost: () => {}, event: () => {}, inputString: () => '-1',
    });
    host.dispatch(cmd('GetLeaderMessages'));
    await flush();
    uiVars.set(uiVars.add(SEND_CLAN_MESSAGE_VAR, null, 1), { type: 'string', value: 'hi' });
    expect(host.dispatch(cmd('ModifyClanMessage', 'INPUT_STRING'))).toMatchObject({ kind: 'table', answer: true });
    await flush();
    c.myClanMessages();
    await flush();
    expect(calls.map((x) => [x.url.replace('http://own', ''), (x.init.headers as Record<string, string>)['authorization']])).toEqual([
      ['/clan/all-messages', 'Bearer T1'], ['/clan/send-message', 'Bearer T1'], ['/clan/all-messages', 'Bearer T1'], ['/clan/messages', 'Bearer T1'],
    ]);
    expect(c.records().map((r) => r.clanMessageId)).toEqual([3]);
    expect(uiVars.find('MEDIUS_CLAN_MESSAGES')!.value).toEqual({ type: 'array', value: [{ type: 'string', value: '\n' }, { type: 'string', value: 'Practice at eight.' }] });
  });

  it('the lobby\'s state handed in: the post on "-1" waits for state 11; no transport: the rows registered, every request never answered', async () => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), calls: Call[] = [];
    connectClanMessages(host, {
      uiVars, clan: new LobbyClan(), service: fetchClanMessagesService('http://own', fetching(200, { status: 0 }, calls)), ticket: () => 'T1', sessionLost: () => {},
      event: () => {}, inputString: () => '-1', lobby: { up: true, state: () => 9 },
    });
    uiVars.set(uiVars.add(SEND_CLAN_MESSAGE_VAR, null, 1), { type: 'string', value: 'hi' });
    host.dispatch(cmd('ModifyClanMessage', 'INPUT_STRING'));
    await flush();
    expect(calls).toEqual([]);
    const bare = new UiCommandHost();
    connectClanMessages(bare, { uiVars: new UiVarManager(), clan: new LobbyClan(), ticket: () => null, sessionLost: () => {}, event: () => {}, inputString: () => null });
    for (const name of ['SendClanMessage', 'GetClanMessages', 'GetLeaderMessages', 'ModifyClanMessage', 'DeleteClanMessage']) {
      expect(bare.dispatch(cmd(name)), name).toMatchObject({ kind: 'table', answer: true });
    }
  });
});

describe('frontEnd.ts mounts it (ONL-29; the seat\'s claim of the four lines, HANDOFF §3)', () => {
  const src = readFileSync(resolve(fileURLToPath(import.meta.url), '../../src/frontEnd.ts'), 'utf8');

  it('imports the host\'s mount and transport after the invitations\' host; the session option clanMessages is a ClanMessagesTransport', () => {
    const line = "import { connectClanMessages, fetchClanMessagesService, type ClanMessagesTransport } from './clanMessagesHost';";
    expect(src).toContain(line);
    expect(src.indexOf(line)).toBeGreaterThan(src.indexOf("from './clanInvitationsHost';"));
    expect(src).toContain([
      '  clanMembership?: ClanMembershipTransport;',
      "  /** ONL-29: SVC-10's clan messages (./clanMessagesHost); absent, never answered. */",
      '  clanMessages?: ClanMessagesTransport;',
    ].join('\n'));
  });

  it('the session mounts the five rows over SOCOM II ONLINE\'s client clan, the ticket, the lobby\'s events, the input string and its state, after connectClanInvitations', () => {
    const call = 'connectClanMessages(this.host, { uiVars: this.uiVars, clan: this.world.commands.clan, service: o.clanMessages, '
      + 'ticket: () => this.lobby?.ticket() ?? null, sessionLost: (t) => { this.lobby?.sessionLost(t); }, event: lobbyEventInto(() => this.machine, this.parts), '
      + 'inputString: (cmd) => this.machine.shell()?.inputString(cmd.anim) ?? null, lobby: this.connect?.lobby ?? null });';
    expect(src).toContain(call);
    expect(src.indexOf(call)).toBeGreaterThan(src.indexOf('connectClanInvitations(this.host, {'));
  });

  it('the page hands the transport at its own origin with the session\'s bearer, after the invitations\' transport', () => {
    expect(src).toMatch(/clanMessages: fetchClanMessagesService\(accountServiceBase\(search, win\.location, devBuild\(\)\)\),/);
    expect(src.indexOf('clanMessages: fetchClanMessagesService(')).toBeGreaterThan(src.indexOf('clanMembership: fetchClanMembershipService('));
  });
});
