/**
 * The pages a spec opens (OT.R19, the owner, 2026-10-04: "remove the need now for &menuflow and make it the default.
 * make all the old params for matches only relevant to a new /testroom"): the page's base path is the front end alone,
 * and the map viewer and the match, with every parameter they read, are the page at `/testroom`
 * (`../src/pageEntry.ts`, `@s2u/ui` `TEST_ROOM_SEGMENT`). The run's dev server serves under `/` (`playwright.config.ts`
 * `baseURL`), so a spec of the viewer or the match opens `${TEST_ROOM}?...` and a spec of the front end opens
 * `${FRONT_END}?...`; the base is written here once. Since CX-9a the base path is the console launcher's and the old
 * page is at `SETUP`.
 */

/**
 * The old page -- the setup page, which boots the front end (with `?devmode` over the served tree, else over the disc
 * image chosen on it) -- at `/setup` since CX-9a (CX.R8, the owner, 2026-10-12: the console launcher "becomes the new
 * launcher default", so the base path `/` is the console's, `console.spec.ts`). A spec that boots the game through the
 * old page opens `${SETUP}?...`. Since CX-9b it is the plain game page -- the canvas, the loading screen, the test
 * room's chrome and the plain disc prompt, with no launcher layout; an image that opens mounts the front end at once
 * (`../src/pageEntry.ts`, which mounts it at the base, so the menu router reads no `setup` path).
 */
export const SETUP = '/setup';

/** The front end's page for a spec: the old page at `/setup` (CX-9a; it was the base path until the console took it). */
export const FRONT_END = SETUP;

/** The map viewer's and the match's page. */
export const TEST_ROOM = '/testroom';

/**
 * The test room with no parameter of its own, past the launch settings sheet (PTT-9, W37.R6; research 243 §9): on the
 * dev server these specs run on, a bare `/testroom` shows the sheet (`../src/pageEntry.ts` `wantsLaunchSheet`), so a
 * spec that wants the test room's disc page with nothing asked opens this; `launch=off` is read by nothing else.
 */
export const TEST_ROOM_PAST_SHEET = `${TEST_ROOM}?launch=off`;
