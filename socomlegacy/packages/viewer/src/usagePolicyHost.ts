import type { UsagePolicyChunk, UsagePolicyQuery, UsagePolicyService } from '@s2u/ui';

/**
 * ONL-08's page half (web research 156 §1.4): `GetUsagePolicy` (`@s2u/ui`'s `UsagePolicyCommands`) sends the policy
 * request through this service to the match server, which answers it from SVC-05's texts
 * (`packages/central/src/serverTexts.ts`, `POST /texts/policy` with `{ type }`, mounted when the server has a data
 * directory) in Lobby 0x48 chunks. The base is ONL-04's (`universeServiceBase`, `UNIVERSE_SERVICE_URL_READING`). The
 * transport is ours (a browser adaptation, as SVC-05's endpoint is); the request's word and the replies' fields are the
 * original's. Any failure is a request never answered: the promise rejects and "Retrieving Usage Policy....." stays,
 * as the console's would with no reply.
 */

const isStr = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

/** The server's `{ chunks }` checked field by field; anything else throws. */
export function usagePolicyReplyOf(raw: unknown): UsagePolicyChunk[] {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || !Array.isArray(r['chunks'])) throw new Error('policy reply: not the shape');
  return (r['chunks'] as unknown[]).map((c) => {
    const x = c as Record<string, unknown> | null;
    if (!x || typeof x !== 'object' || !isInt(x['status']) || !isStr(x['policy']) || !isBool(x['endOfText'])) throw new Error('policy chunk: a field of another type');
    return { status: x['status'] as number, policy: x['policy'] as string, endOfText: x['endOfText'] as boolean };
  });
}

/** The policy service over the match server's `POST <base>/texts/policy`. */
export function fetchUsagePolicyService(base: string, fetchFn: typeof fetch = (...a) => fetch(...a)): UsagePolicyService {
  return {
    policy: async (q: UsagePolicyQuery) => {
      // TEXTS-OMIT: no cookie and no cache, as the account routes' clients (a browser adaptation's hardening; the request word unchanged).
      const res = await fetchFn(`${base}/texts/policy`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q), credentials: 'omit', cache: 'no-store' });
      if (!res.ok) throw new Error(`policy request: HTTP ${res.status}`);
      return usagePolicyReplyOf(await res.json());
    },
  };
}
