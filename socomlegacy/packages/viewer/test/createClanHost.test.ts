import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CLAN_NAME_VAR, DIALOG_EVENTS, LobbyClan, UiCommandHost, UiVarManager, clanStatsRecord, type ZAnimUiCommand } from '@s2u/ui';
import { CREATE_CLAN_SESSION_LOST, connectCreateClan, fetchCreateClanService, sessionCreateClan } from '../src/createClanHost';

/**
 * ONL-26's page half (web research 271): CREATE CLAN's two requests -- SVC-08's `/clan/create` and `/clan/update-stats`
 * (`packages/central/src/clans.ts`, `CLAN_PATHS`) -- at the page's own origin with the session's ticket as the bearer; a
 * 401 the session lost, handed to the lobby client; any other refusal or shape a request never answered; no ticket, no
 * request. And the session's mount of `@s2u/ui`'s `CreateClanCommands` over the client's clan.
 */
type Call = { url: string; init: RequestInit };
const fetching = (status: number, body: unknown, calls: Call[] = []) =>
  (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(body), { status }); }) as unknown as typeof fetch;
const cmd = (fn: string, arg = 'NA'): ZAnimUiCommand => ({ anim: 'CreateClan', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(16) });
const flush = async (): Promise<void> => { for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0)); };

describe('fetchCreateClanService', () => {
  it('posts each request as JSON to its path with the bearer, no credentials, not cached; the stats as 512 hex digits', async () => {
    const calls: Call[] = [];
    const t = fetchCreateClanService('https://socom.example', fetching(200, { status: 0, clanId: 9 }, calls));
    expect(await t.create({ clanName: 'Tide' }, 'T1')).toEqual({ status: 0, clanId: 9 });
    expect(await t.updateStats({ clanId: 9, stats: clanStatsRecord(0, '') }, 'T1')).toEqual({ status: 0 });
    expect(calls.map((c) => [c.url, c.init.method, (c.init.headers as Record<string, string>)['authorization'], c.init.credentials, c.init.cache])).toEqual([
      ['https://socom.example/clan/create', 'POST', 'Bearer T1', 'omit', 'no-store'],
      ['https://socom.example/clan/update-stats', 'POST', 'Bearer T1', 'omit', 'no-store'],
    ]);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ clanName: 'Tide' });
    const stats = JSON.parse(String(calls[1]!.init.body)) as { clanId: number; stats: string };
    expect([stats.clanId, stats.stats.length, stats.stats.slice(0, 32)]).toEqual([9, 512, '303030303030303030303030303030' + '00']);
    expect(/^[0-9a-f]{512}$/.test(stats.stats)).toBe(true);
  });

  it('401 is the session lost; any other refusal or another shape is a request never answered (it rejects)', async () => {
    expect(await fetchCreateClanService('http://x', fetching(401, {})).create({ clanName: 'a' }, 'T')).toBe(CREATE_CLAN_SESSION_LOST);
    expect(await fetchCreateClanService('http://x', fetching(401, {})).updateStats({ clanId: 1, stats: clanStatsRecord(0, '') }, 'T')).toBe(CREATE_CLAN_SESSION_LOST);
    for (const status of [400, 403, 404, 429, 500]) await expect(fetchCreateClanService('http://x', fetching(status, { status: 0, clanId: 1 })).create({ clanName: 'a' }, 'T'), String(status)).rejects.toThrow();
    await expect(fetchCreateClanService('http://x', fetching(200, { status: 0 })).create({ clanName: 'a' }, 'T')).rejects.toThrow();
    await expect(fetchCreateClanService('http://x', fetching(200, { status: 'x' })).updateStats({ clanId: 1, stats: clanStatsRecord(0, '') }, 'T')).rejects.toThrow();
  });

  it('the session\'s service: the ticket read at each request; none, no request; a 401 handed to sessionLost', async () => {
    const calls: Call[] = [], lost: string[] = [];
    let ticket: string | null = null;
    const s = sessionCreateClan(fetchCreateClanService('http://own', fetching(401, {}, calls)), () => ticket, (t) => { lost.push(t); });
    await expect(s.create({ clanName: 'Tide' })).rejects.toThrow();
    expect(calls).toHaveLength(0);
    ticket = 'T9';
    await expect(s.create({ clanName: 'Tide' })).rejects.toThrow();
    expect([calls.length, lost]).toEqual([1, ['T9']]);
    expect('filter' in s).toBe(false);                                                  // CLAN_NAME_FILTER_PLACEHOLDER: no text filter on our services
  });
});

describe('connectCreateClan: the row on the session over the transport', () => {
  it('CreateClan sends the typed name with the ticket; success raises MP_CREATE_CLAN_SUCCESS, the client\'s clan is the new one, the stats are posted', async () => {
    const host = new UiCommandHost(), uiVars = new UiVarManager(), clan = new LobbyClan(), calls: Call[] = [], events: number[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(url.endsWith('/clan/create') ? { status: 0, clanId: 5 } : { status: 0 }), { status: 200 });
    }) as unknown as typeof fetch;
    connectCreateClan(host, {
      uiVars, clan, service: fetchCreateClanService('http://own', fetchFn), ticket: () => 'T1', sessionLost: () => {}, event: (k) => { events.push(k); },
      lobby: { up: true, state: () => 11, account: () => 'socomc' },
    });
    uiVars.set(uiVars.add(CLAN_NAME_VAR, null, 1), { type: 'string', value: 'Tide' });
    expect(host.dispatch(cmd('CreateClan')).kind).toBe('table');
    await flush();
    expect(calls.map((c) => c.url.replace('http://own', ''))).toEqual(['/clan/create', '/clan/update-stats']);
    expect(events).toEqual([DIALOG_EVENTS.MP_CREATE_CLAN_SUCCESS]);
    expect([clan.clanId, clan.leaderIsMine(), clan.name]).toEqual([5, true, 'Tide']);
    expect(uiVars.find('PLAYER_NAME_AND_TAG')!.value).toEqual({ type: 'string', value: 'socomc' });
  });

  it('the lobby down: nothing sent; with no transport every request is never answered', async () => {
    const down = new UiCommandHost(), calls: Call[] = [];
    connectCreateClan(down, { uiVars: new UiVarManager(), clan: new LobbyClan(), service: fetchCreateClanService('http://own', fetching(200, {}, calls)), ticket: () => 'T1', sessionLost: () => {}, event: () => {}, lobby: { up: false, state: () => 0 } });
    expect(down.dispatch(cmd('CreateClan')).kind).toBe('table');
    const none = new UiCommandHost(), clan = new LobbyClan(), events: number[] = [];
    connectCreateClan(none, { uiVars: new UiVarManager(), clan, ticket: () => 'T1', sessionLost: () => {}, event: (k) => { events.push(k); } });
    expect(none.dispatch(cmd('CreateClan')).kind).toBe('table');
    await flush();
    expect([calls, events, clan.member]).toEqual([[], [], false]);
  });
});

describe('frontEnd.ts mounts it (ONL-26; the seat\'s claim of the four lines, HANDOFF §3)', () => {
  const src = readFileSync(resolve(fileURLToPath(import.meta.url), '../../src/frontEnd.ts'), 'utf8');

  it('imports the host; the session option createClan is a CreateClanTransport', () => {
    expect(src).toContain("import { connectCreateClan, fetchCreateClanService, type CreateClanTransport } from './createClanHost';");
    expect(src).toMatch(/\n {2}createClan\?: CreateClanTransport;\n/);
  });

  it('the session mounts the row over SOCOM II ONLINE\'s client clan, the ticket, the lobby\'s events and its state, after connectWorldOfSocom', () => {
    const call = 'connectCreateClan(this.host, { uiVars: this.uiVars, clan: this.world.commands.clan, service: o.createClan, ticket: () => this.lobby?.ticket() ?? null, '
      + 'sessionLost: (t) => { this.lobby?.sessionLost(t); }, event: lobbyEventInto(() => this.machine, this.parts), lobby: this.connect?.lobby ?? null });';
    expect(src).toContain(call);
    expect(src.indexOf(call)).toBeGreaterThan(src.indexOf('this.world = connectWorldOfSocom('));
  });

  it('the page hands the transport at its own origin with the session\'s bearer, as the other online pages', () => {
    expect(src).toMatch(/createClan: fetchCreateClanService\(accountServiceBase\(search, win\.location, devBuild\(\)\)\),/);
  });
});
