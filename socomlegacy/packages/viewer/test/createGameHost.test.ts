import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CreateGameRequest } from '@s2u/ui';
import { CREATE_GAME_SESSION_LOST, createGameReplyOf, fetchCreateGameService, missionsFromReaderc, sessionCreateGame } from '../src/createGameHost';

/**
 * ONL-13's page half (web research 163 §5): CREATE's request posted to SVC-06's `/lobby/create-game` at the page's own
 * origin with the session's ticket as its bearer; a 401 handed to the session lost; any other refusal a Fail, which the
 * dialog draws as #295 (`CREATE_GAME_HTTP_ADAPTATION`); no ticket, no request. And `missionlist.rdr` read off the disc's
 * `RUN/READERC.ZAR` for the PLAY LIST (the committed fixture in CI).
 */
type Call = { url: string; init: RequestInit };
const fetching = (status: number, body: unknown, calls: Call[] = []) =>
  (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(body), { status }); }) as unknown as typeof fetch;
const REQ: CreateGameRequest = {
  applicationId: 0x28e8, minPlayers: 2, maxPlayers: 24, gameLevel: 0, gameName: 'test$~Alpha', gamePassword: '', spectatorPassword: '',
  playerSkillLevel: 0, rulesSet: 0, genericField1: 1, genericField2: 65000, genericField3: 0, gameHostType: 0,
};

describe('fetchCreateGameService', () => {
  it('posts the request as JSON to /lobby/create-game with the bearer, no cookie, not cached; hands back { status, mediusWorldId }', async () => {
    const calls: Call[] = [];
    const r = await fetchCreateGameService('http://localhost:5303', fetching(200, { status: 0, mediusWorldId: 4 }, calls)).createGame(REQ, 'T1');
    expect(r).toEqual({ status: 0, mediusWorldId: 4 });
    expect(calls.map((c) => [c.url, c.init.method, JSON.parse(String(c.init.body))])).toEqual([['http://localhost:5303/lobby/create-game', 'POST', REQ]]);
    expect(calls[0]!.init.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer T1' });
    expect([calls[0]!.init.credentials, calls[0]!.init.cache]).toEqual(['omit', 'no-store']);
  });

  it('a refusal status in the body is the reply (-975, -966); a 401 is the session lost', async () => {
    expect(await fetchCreateGameService('http://x', fetching(200, { status: -975, mediusWorldId: -1 })).createGame(REQ, 'T')).toEqual({ status: -975, mediusWorldId: -1 });
    expect(await fetchCreateGameService('http://x', fetching(401, {})).createGame(REQ, 'T')).toBe(CREATE_GAME_SESSION_LOST);
  });

  it('CREATE_GAME_HTTP_ADAPTATION: 403, 429, 5xx, another shape or no answer is a Fail (-966)', async () => {
    for (const s of [403, 404, 429, 500]) expect(await fetchCreateGameService('http://x', fetching(s, {})).createGame(REQ, 'T')).toEqual({ status: -966, mediusWorldId: -1 });
    expect(await fetchCreateGameService('http://x', fetching(200, { status: 'ok' })).createGame(REQ, 'T')).toEqual({ status: -966, mediusWorldId: -1 });
    const down = (async () => { throw new TypeError('network'); }) as unknown as typeof fetch;
    expect(await fetchCreateGameService('http://x', down).createGame(REQ, 'T')).toEqual({ status: -966, mediusWorldId: -1 });
    expect(() => createGameReplyOf({ status: 0 })).toThrow();
  });
});

describe('sessionCreateGame', () => {
  it('the ticket read at the request; a 401 hands the ticket to sessionLost and the request is never answered (a rejection)', async () => {
    const lost: string[] = [];
    const s = sessionCreateGame({ createGame: async () => CREATE_GAME_SESSION_LOST }, () => 'T9', (t) => { lost.push(t); });
    await expect(s.createGame(REQ)).rejects.toThrow();
    expect(lost).toEqual(['T9']);
  });

  it('no ticket: no request', async () => {
    const asked: string[] = [];
    const s = sessionCreateGame({ createGame: async (_q, t) => { asked.push(t); return { status: 0, mediusWorldId: 1 }; } }, () => null, () => {});
    await expect(s.createGame(REQ)).rejects.toThrow();
    expect(asked).toEqual([]);
  });
});

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures');
const COMMON = [DISC, FIXTURES].map((root) => join(root, 'RUN/READERC.ZAR')).find((p) => p !== 'RUN/READERC.ZAR' && existsSync(p)) ?? null;

describe.skipIf(COMMON === null)('missionsFromReaderc', () => {
  it('the 22 multiplayer missions of RUN/READERC.ZAR\'s missionlist.rdr, Vigilance first, The Ruins last', () => {
    const m = missionsFromReaderc(new Uint8Array(readFileSync(COMMON!)));
    expect([m.length, m[0]!.name, m[21]!.name]).toEqual([22, 'VIGILANCE', 'THE RUINS']);
  });
});

describe('CLAN-ID-WIRE: frontEnd.ts hands the client\'s clan id to CREATE GAME, AUTOPLAY and the game lobby (source inspection; the seat\'s claim, HANDOFF §3)', () => {
  const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/frontEnd.ts'), 'utf8');
  /** The text of one call, from its head to the first `});` after it. */
  const call = (head: string): string => { const at = src.indexOf(head); expect(at).toBeGreaterThan(-1); return src.slice(at, src.indexOf('});', at)); };
  const READER = 'clanId: () => this.world.commands.clan.clanId';

  it('each of the three mounts reads DAT_0044f59c off the session\'s one client clan (GetMyClans\' LobbyClan, ONL-27)', () => {
    expect(call('mountCreateGame(this.host, {')).toContain(READER);              // GF3 (FUN_002e99f0 after FUN_002e9840)
    expect(call('this.briefing = connectBriefingRoom(this.host, {')).toContain(READER);   // AUTOPLAY's candidate test (FUN_002e9940)
    expect(call('this.gameLobby = connectGameLobby(this.host, {')).toContain(READER);     // ClanGameClosed (FUN_002f8c60)
  });
});
