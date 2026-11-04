import { isSessionToken } from './protocol';

/**
 * The page's session token (web sprint 5 S2 round 4): the room's key for this page's seat across a reload or a
 * reconnect (the hello's `session`, protocol 9 additive). One a tab and a server (`sessionKeyFor`): made once from 128
 * random bits (`crypto.getRandomValues`, base64url) and kept in `sessionStorage`, so a reload of the tab (F5) sends the
 * same one and another tab or window sends its own. Without session storage (a private mode that throws, a page without it) the
 * token is kept in memory for the page's life: a reload is then a new joiner.
 *
 * Its honest limits (research 95 §8, `KEPT_RECONNECT_READING`): a new tab, or cleared session storage, is a new joiner;
 * a duplicated tab starts with a copy of the original's storage -- its hello replaces the original's seat, and the
 * original, told `kicked` 'replaced', renews its token and joins again as a new joiner (`renew`). The token is not a
 * credential for anything else; the server never logs it.
 */

/** The `sessionStorage` key's stem: each server origin's token is kept under `<stem>:<origin>` (`sessionKeyFor`). */
export const SESSION_STORAGE_KEY = 's2u.session';

/**
 * The key a server's token is kept under (the S2 review's round-4 lows): `s2u.session:<origin of the server's URL>`, so
 * a tab that joins another server (the address's `&server=wss://...`) sends that server a token of its own, never the
 * one this server knows it by. A URL that will not parse is its own origin.
 */
export function sessionKeyFor(serverUrl: string): string {
  let origin = serverUrl;
  try { origin = new URL(serverUrl).origin; } catch { /* not a URL: the text itself */ }
  if (origin === 'null') origin = serverUrl;
  return `${SESSION_STORAGE_KEY}:${origin}`;
}

/** Random bytes a token is made from: 16 (128 bits), 22 base64url characters. */
const TOKEN_BYTES = 16;

/** A fresh token: `TOKEN_BYTES` from `fill` (the platform's `crypto.getRandomValues` by default), base64url, unpadded. */
export function newSessionToken(fill: (bytes: Uint8Array) => Uint8Array = (b) => globalThis.crypto.getRandomValues(b)): string {
  const bytes = fill(new Uint8Array(TOKEN_BYTES));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The tab's token for one server, read from session storage or made and kept there; renewed on request. */
export class PageSession {
  private memory: string | null = null;

  /**
   * `storage`: the tab's `sessionStorage` (read lazily; a getter that throws, or null, means none); `key` the server's
   * (`sessionKeyFor`; the bare stem for a page that names none).
   */
  constructor(private readonly storage: () => Pick<Storage, 'getItem' | 'setItem'> | null | undefined = () => globalThis.sessionStorage,
    private readonly make: () => string = () => newSessionToken(), private readonly key: string = SESSION_STORAGE_KEY) {}

  /** The tab's token: the stored one when it has a token's shape, else a new one (stored when storage works). */
  token(): string {
    if (this.memory) return this.memory;
    let stored: string | null = null;
    try { stored = this.storage()?.getItem(this.key) ?? null; } catch { stored = null; }
    this.memory = isSessionToken(stored) ? stored : this.store(this.make());
    return this.memory;
  }

  /** A new token for this tab (the room gave this session's seat to a newer connection: a duplicated tab). */
  renew(): string {
    this.memory = this.store(this.make());
    return this.memory;
  }

  private store(token: string): string {
    try { this.storage()?.setItem(this.key, token); } catch { /* no storage: the page's memory keeps it */ }
    return token;
  }
}
