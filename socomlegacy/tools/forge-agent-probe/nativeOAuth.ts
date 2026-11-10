/** Product adaptation: validate copied setup and client-owned OAuth flow; secrets remain in memory. */
import type { BrowserContext } from '@playwright/test';
import type { ClientName } from './isolation';
import { PROBE_WORDS } from './browser';
/**
 * The page's copied setup (`./browser` `copiedInstructions`): the first-time disclosure's command for this gateway, then
 * the one connect line (AX-U, C6) -- `Connect to my SOCOM 2 Legacy page: <gateway>/join/<invitation>` on this gateway.
 */
export function copiedSetup(blurb: string, client: ClientName, gateway: string) {
  const endpoint = `${gateway}/mcp`;
  const command = client === 'codex' ? 'codex mcp add socom2legacy --url ' : 'claude mcp add --transport http --scope user socom2legacy ';
  const lines = blurb.split(/\r?\n/);
  const line = lines.find(value => value.startsWith(command));
  const match = blurb.match(/^Connect to my SOCOM 2 Legacy page: (\S+)\/join\/([A-Za-z0-9_.:-]{1,128})$/m);
  if (line !== command + endpoint || !match || match[1] !== gateway) throw Error('COPIED_SETUP_MISMATCH');
  return { endpoint, invitation: match[2]! };
}
/** OSC 8 carries its URI separately from the visible label. Recover that exact target before VT stripping.
 * https://iterm2.com/documentation-escape-codes.html (Anchor / OSC 8). No decoding or query repair.
 * A nonempty target is authoritative: discard its presentation text rather than searching a label for a URL.
 */
export function terminalAuthorizationText(line: string): string {
  const marker = '\x1b]8';
  const terminator = /\x07|\x1b\\/g;
  let cursor = 0, sawFrame = false, sawTarget = false, authorizationTarget: string | undefined;
  for (;;) {
    const start = line.indexOf(marker, cursor);
    if (start < 0) break;
    sawFrame = true;
    if (line[start + marker.length] !== ';') throw Error('NATIVE_OAUTH_URL_INVALID');
    const body = start + marker.length + 1;
    const separator = line.indexOf(';', body);
    terminator.lastIndex = body;
    const end = terminator.exec(line)?.index ?? -1;
    if (end < 0 || separator < 0 || separator > end
      || /[\x00-\x1f\x7f-\x9f]/.test(line.slice(body, separator))) throw Error('NATIVE_OAUTH_URL_INVALID');
    const target = line.slice(separator + 1, end);
    if (target) {
      sawTarget = true;
      if (target.includes('redirect_uri=')) {
        if (authorizationTarget !== undefined || !/^https?:\/\/[^\s<>"\x00-\x20\x7f-\x9f]+$/.test(target))
          throw Error('NATIVE_OAUTH_URL_INVALID');
        authorizationTarget = target;
      }
    }
    cursor = end + (line[end] === '\x07' ? 1 : 2);
  }
  // Even an empty closing-only frame cannot authorize its visible label. Malformed frames never reach here.
  if (sawFrame && sawTarget && authorizationTarget === undefined) throw Error('NATIVE_OAUTH_URL_INVALID');
  return sawFrame ? authorizationTarget ?? '' : line;
}
export function authorizationFromLine(line: string, gateway: string): URL | undefined {
  const text = terminalAuthorizationText(line);
  const match = text.match(/https?:\/\/[^\s<>"\x1b]+/);
  if (!match) return undefined;
  try {
    let candidate = match[0];
    const opener = text[(match.index ?? 0) - 1];
    if (opener === "'" || opener === '(') {
      // RFC 3986 sections 2.2/3.4 allow apostrophes, parentheses, commas and dots in query data.
      // Unwrap exactly one adjacent display pair; never trim bare punctuation or inner opaque data.
      const closer = opener === "'" ? "'" : ')';
      if (!candidate.endsWith(closer)) throw Error();
      candidate = candidate.slice(0, -1);
    }
    const url = new URL(candidate), redirect = new URL(url.searchParams.get('redirect_uri') ?? '');
    if (url.origin !== gateway || url.pathname !== '/authorize' || url.username || url.password || url.hash
      || url.searchParams.get('response_type') !== 'code' || url.searchParams.get('code_challenge_method') !== 'S256'
      || !url.searchParams.get('code_challenge') || !url.searchParams.get('state')
      || redirect.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(redirect.hostname) || !redirect.port
      || redirect.username || redirect.password || redirect.search || redirect.hash) throw Error();
    return url;
  } catch { throw Error('NATIVE_OAUTH_URL_INVALID'); }
}
export function validateCallback(auth: URL, value: string): string {
  try {
    const actual = new URL(value), expected = new URL(auth.searchParams.get('redirect_uri')!);
    if (actual.origin !== expected.origin || actual.pathname !== expected.pathname || actual.username || actual.password || actual.hash
      || actual.searchParams.get('state') !== auth.searchParams.get('state') || !actual.searchParams.get('code') || actual.searchParams.has('error')) throw Error();
    return actual.href;
  } catch { throw Error('NATIVE_OAUTH_CALLBACK_INVALID'); }
}
/** Only browser consent + redirect delivery; registration, verifier and token exchange belong to the installed CLI. */
export async function nativeGuestConsent(context: BrowserContext, auth: URL, signal: AbortSignal): Promise<string> {
  const page = await context.newPage();
  const expected = new URL(auth.searchParams.get('redirect_uri')!);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    const callback = new Promise<string>((resolve, reject) => {
      timer = setTimeout(() => reject(Error('NATIVE_OAUTH_CALLBACK_TIMEOUT')), 30_000);
      abort = () => reject(Error('INTERRUPTED')); signal.addEventListener('abort', abort, { once: true });
      page.on('request', request => {
        const url = new URL(request.url());
        if (request.isNavigationRequest() && url.origin === expected.origin && url.pathname === expected.pathname) {
          try { resolve(validateCallback(auth, url.href)); } catch (error) { reject(error); }
        }
      });
    });
    // Attach rejection handling before browser actions: early navigation failure must not orphan a rejection.
    const observed = callback.then(value => ({ value }), error => ({ error }));
    if (signal.aborted) throw Error('INTERRUPTED');
    await page.goto(auth.href);
    // FP-14's fold: the consent page's Approve, pressed or the run fails here (a miss was once swallowed).
    await page.getByRole('button', { name: PROBE_WORDS.consentApprove, exact: true }).click();
    const result = await observed;
    if ('error' in result) throw result.error;
    return result.value;
  } finally { clearTimeout(timer); if (abort) signal.removeEventListener('abort', abort); await page.close(); }
}
