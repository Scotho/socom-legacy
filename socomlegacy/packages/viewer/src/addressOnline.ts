// src/addressOnline.ts -- the page's online rule on its address, one copy (ADDR-ONLINE, sprint 15; research 243 §8).

/**
 * Whether an address asks the page to play online: `server` or `mp` present (any value, an empty one included), or
 * `online` equal, in any case, to `shared` or `local`. Anything else is not online -- a bare `online`, `online=off`,
 * `online=<another value>`, no key, or a search that cannot be read. PLAYTEST_INSTRUMENT_ADAPTATION: the rule is the
 * page's own readers' (a browser adaptation, no original); no game value is read or changed here.
 *
 * It agrees with the page's three readers, key for key:
 * - `netSettings` (`./netPage`): a server is joined from the address when `mp` or `server` is present;
 * - `readShare` (`./shareUrl`): `online` is taken, lower-cased, only as `off`, `shared` or `local`;
 * - `resolveOnline` (`./online`): the address's server first; else the remembered choice.
 *
 * The difference it settles (research 243 §8, "A difference found"): the playtest's earlier copies -- the retest
 * placement's `addressOnline` in `./playtestSession`, the CLI retest's `onlineOf` (`packages/playtest/src/retest.ts`)
 * -- read a bare `online` and `online=<another value>` as online, while the recording's `online()` and the page itself
 * read them as offline. The page's way is the rule: `readShare` drops the value and `resolveOnline` falls back to the
 * remembered choice. That remembered choice (the player's stored Online setting) is not in the address, so whether a
 * page with no server named was online cannot be decided from its address: this function answers the address only,
 * and such an address is offline here. The CLI's own addresses always name `server=` beside their bare `online`
 * (`packages/playtest/src/launchUrl.ts`), so they read as before.
 *
 * Nothing is imported, by design: the Node CLI (`packages/playtest`) imports this file by a relative path, and the
 * page's modules would bring `three`, the scene, the net client, the page's storage and Vite's environment with them.
 */
export function addressOnline(search: string): boolean {
  try {
    const q = new URLSearchParams(search);
    if (q.has('server') || q.has('mp')) return true;
    const online = q.get('online')?.toLowerCase();
    return online === 'shared' || online === 'local';
  } catch {
    return false;
  }
}
