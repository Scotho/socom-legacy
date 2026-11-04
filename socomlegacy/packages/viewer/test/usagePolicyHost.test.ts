import { describe, expect, it } from 'vitest';
import { CLAN_INVITATIONS_QUERY, USAGE_POLICY_QUERY } from '@s2u/ui';
import { fetchUsagePolicyService, usagePolicyReplyOf } from '../src/usagePolicyHost';
import { clanInvitationsReplyOf, fetchClanInvitationsService } from '../src/clanInvitationsHost';

/**
 * ONL-08's and SVC-09a's page halves (web research 156 §1.4, §2.4): the policy request sent to SVC-05's
 * `POST /texts/policy` and the invitations request to SVC-09a's `POST /clan/invitations`, both on the match server at
 * ONL-04's base (`universeServiceBase`), each reply's shape checked before the client takes it. A refusal, no endpoint
 * or another shape is a request never answered (a rejection).
 */
type Call = { url: string; init: RequestInit };
const fetching = (status: number, body: unknown, calls: Call[] = []) =>
  (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(body), { status }); }) as unknown as typeof fetch;

describe('fetchUsagePolicyService', () => {
  const chunks = [{ status: 0, policy: 'EULA', endOfText: true }];

  it('posts { type: 0 } as JSON to /texts/policy and hands back the chunks', async () => {
    const calls: Call[] = [];
    const r = await fetchUsagePolicyService('http://localhost:8860', fetching(200, { chunks }, calls)).policy({ ...USAGE_POLICY_QUERY });
    expect(r).toEqual(chunks);
    expect(calls.map((c) => [c.url, c.init.method, String(c.init.body)])).toEqual([['http://localhost:8860/texts/policy', 'POST', '{"type":0}']]);
    // TEXTS-OMIT (MU.R6's F1): no cookie rides on the request, as the account routes' clients send (`connectHost.ts`).
    expect([calls[0]!.init.credentials, calls[0]!.init.cache]).toEqual(['omit', 'no-store']);
    expect((calls[0]!.init.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  it('a refusal or a reply of another shape rejects', async () => {
    await expect(fetchUsagePolicyService('http://x', fetching(403, {})).policy({ type: 0 })).rejects.toThrow();
    await expect(fetchUsagePolicyService('http://x', fetching(200, { chunks: [{ status: 0, policy: 1, endOfText: true }] })).policy({ type: 0 })).rejects.toThrow();
    expect(() => usagePolicyReplyOf({ chunk: [] })).toThrow();
  });
});

describe('fetchClanInvitationsService', () => {
  const none = { status: 1, clanInvitationId: 0, clanId: 0, responseStatus: 0, message: '', leaderAccountId: 0, leaderAccountName: '', endOfList: true };

  it('posts { start: 0, pageSize: 999 } to /clan/invitations and hands back the replies', async () => {
    const calls: Call[] = [];
    const r = await fetchClanInvitationsService('http://localhost:8860', fetching(200, { replies: [none] }, calls)).check({ ...CLAN_INVITATIONS_QUERY });
    expect(r).toEqual([none]);
    expect(calls.map((c) => [c.url, c.init.method, String(c.init.body)])).toEqual([['http://localhost:8860/clan/invitations', 'POST', '{"start":0,"pageSize":999}']]);
    // TEXTS-OMIT (MU.R6's F1): no cookie rides on the request, as the account routes' clients send (`connectHost.ts`).
    expect([calls[0]!.init.credentials, calls[0]!.init.cache]).toEqual(['omit', 'no-store']);
  });

  it('a server without the endpoint or a reply of another shape rejects', async () => {
    await expect(fetchClanInvitationsService('http://x', fetching(404, {})).check({ start: 0, pageSize: 999 })).rejects.toThrow();
    expect(() => clanInvitationsReplyOf({ replies: [{ ...none, endOfList: 'yes' }] })).toThrow();
  });
});
