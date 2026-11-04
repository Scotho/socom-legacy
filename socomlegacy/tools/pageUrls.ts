/**
 * The pages a tool opens (OT.R19, the owner, 2026-10-04: "make all the old params for matches only relevant to a new
 * /testroom"): at the page's base path the page is the front end alone; the map viewer and the match, with every
 * parameter they read (`map`, `mode`, `fly`, `kit`, `mp`, `server`, ...), are the page at `<base>/testroom`. A tool of
 * the viewer or the match opens `testRoomUrl(base)` (the segment is written here once, mirroring
 * `packages/viewer/e2e/urls.ts`); a tool of the front end stays at the base.
 */

/** The test room's path segment (`@s2u/ui` `TEST_ROOM_SEGMENT`). */
export const TEST_ROOM = 'testroom';

/**
 * The test room's address under `base` (an origin with or without its path, trailing slash or not, optionally with
 * a query, which is kept: `http://localhost:5173/?devmode`): `http://localhost:5173/testroom?devmode`. An address
 * already at the test room is returned as it is.
 */
export function testRoomUrl(base: string): string {
  const cut = base.search(/[?#]/);
  const head = cut < 0 ? base : base.slice(0, cut);
  const tail = cut < 0 ? '' : base.slice(cut);
  const path = head.replace(/\/+$/, '');
  return `${path.endsWith(`/${TEST_ROOM}`) ? path : `${path}/${TEST_ROOM}`}${tail}`;
}

/**
 * The front end's own entry under `base` -- the page at its base path, the menus' online flow -- with `query`
 * (`devmode&server=...`, kept as given, unencoded, as SETUP writes it): `http://127.0.0.1:5342/?devmode&server=...`.
 * OT.R19 moved the viewer and the match to `/testroom`; the front end stays at the base, so a tool that opens the
 * menus (LOCAL-STACK, issue #100: the two-window playtest's link) builds its address here, never by hand, and
 * `pageUrls.test.ts` exempts this function alone.
 */
export function frontEndUrl(base: string, query = ''): string {
  const cut = base.search(/[?#]/);
  const path = (cut < 0 ? base : base.slice(0, cut)).replace(/\/+$/, '');
  return `${path}/${query ? `?${query}` : ''}`;
}
