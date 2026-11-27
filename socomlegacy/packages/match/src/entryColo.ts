/**
 * The entry colo -- an operator's instrument, product track, no original (LAG-READ-20261117-v4 s6). It changes nothing
 * the game does and nothing a page is sent.
 *
 * Cloudflare's edge stamps each request it carries with `cf-ray: <hex id>-<COLO>` (the colo, the edge data centre the
 * player entered by), and the host's door forwards the header unchanged on the WebSocket upgrade
 * (`packages/host/src/door.ts`, `upstreamHead`). The match process writes the colo -- the suffix only, never the ray id
 * -- on each `joined` line: it splits a player's own line (to their nearest edge) from the route to us (the edge to the
 * box), so a lag report can be read against the entry point. It holds no address and nothing that names a person.
 *
 * Only a single string of the form `^[0-9a-f]+-([A-Z]{3,4})$`, at most `ENTRY_COLO_MAX_LENGTH` characters, is read;
 * anything else -- absent, an array (a repeated header), too long, lower-case, any other shape -- is null, never a throw.
 */

/** The longest `cf-ray` value read (operator's instrument, product track, no original): a ray is 16 hex, a dash, a colo. */
export const ENTRY_COLO_MAX_LENGTH = 64;

const RAY = /^[0-9a-f]+-([A-Z]{3,4})$/;

/** The colo of a `cf-ray` header, or null (operator's instrument, product track, no original). */
export function entryColo(header: string | string[] | undefined): string | null {
  if (typeof header !== 'string' || header.length > ENTRY_COLO_MAX_LENGTH) return null;
  return RAY.exec(header)?.[1] ?? null;
}
