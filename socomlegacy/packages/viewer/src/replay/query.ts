/**
 * LCM-RP (`REPLAY_QUERY_BY_HAND_ADAPTATION`): a query's pairs, read by hand as `URLSearchParams` reads them (empty parts
 * skipped, `+` a space, each side percent-decoded); null when a side does not decode. The public replay page's
 * `?match=` (`console/routes.ts` `replayPageOf`) and the door's `?grant=` (`replay/load.ts`) are read through it: the
 * page's address keys read through `URLSearchParams` are the launch table's (PTT-9, `test/launchSettingsTable.test.ts`),
 * and these are not launch parameters -- as the leaderboard's `queryValue` reads its own by hand. A browser adaptation.
 */
export const REPLAY_QUERY_BY_HAND_ADAPTATION = 'the replay page and door queries read by hand, apart from the launch table';

export function replayQueryPairs(search: string): [string, string][] | null {
  const s = search.startsWith('?') ? search.slice(1) : search;
  const out: [string, string][] = [];
  for (const part of s.split('&')) {
    if (part === '') continue;
    const at = part.indexOf('=');
    const raw = at < 0 ? [part, ''] : [part.slice(0, at), part.slice(at + 1)];
    try { out.push([decodeURIComponent(raw[0]!.replace(/\+/g, ' ')), decodeURIComponent(raw[1]!.replace(/\+/g, ' '))]); } catch { return null; }
  }
  return out;
}
