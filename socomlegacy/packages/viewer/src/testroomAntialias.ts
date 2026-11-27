/**
 * MAC-FLOOR (INTAKE I-3, tier 1 row 18; player report B-64; a test-room instrument, a browser adaptation that changes
 * nothing the game does): the test room's renderer antialias from the address -- `?antialias=off` (or `0`) draws with no
 * multisampling, `?antialias=on` (or `1`) with it; absent or anything else leaves `./renderer` `createRenderer`'s own
 * default. A tester's Mac run could not try WebGPU with antialiasing off in the normal picture (agent-mail
 * evidence/floor-flicker-mac-2026-11-21/RESULTS.md, check 4: "the test room creates its renderer with antialiasing on and has
 * no switch for it"). Read once, when the room makes its renderer (`./main` `boot`).
 */
export const TESTROOM_ANTIALIAS_PARAM = 'antialias';

/** The address's antialias for the test room's renderer: false, true, or undefined (the renderer's default). */
export function testroomAntialias(search: string): boolean | undefined {
  const value = new URLSearchParams(search).get(TESTROOM_ANTIALIAS_PARAM);
  if (value === 'off' || value === '0') return false;
  if (value === 'on' || value === '1') return true;
  return undefined;
}

/**
 * MAC-FLOOR: `?coplanaroffset=on` (or `1`) in the test room draws the detail and environment passes with the drop shadows'
 * polygon offset (`./world` `setCoplanarPassOffset`); absent or anything else, none (a match never reads it). A test-room
 * instrument, a browser adaptation: the fallback to try beside the invariant position on a Mac.
 */
export const TESTROOM_COPLANAR_OFFSET_PARAM = 'coplanaroffset';

/** The address's coplanar-pass offset for the test room's worlds. */
export function testroomCoplanarOffset(search: string): boolean {
  const value = new URLSearchParams(search).get(TESTROOM_COPLANAR_OFFSET_PARAM);
  return value === 'on' || value === '1';
}
