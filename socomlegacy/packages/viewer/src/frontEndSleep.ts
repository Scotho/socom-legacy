/**
 * Browser adaptation (no original; product track, PR #631's Xbox memory work), scoped to the Xbox preset (#627's opt-in,
 * `./graphicsBackend`): what the front end lets rest while a lobby-mounted match is up over it (`./frontEnd`
 * `mountFrontEnd`, from the match's `leave` to its `returned`). A device with about 1 GB for the whole browser (the
 * Xbox's Edge) cannot carry the menus' work under a match:
 *
 * - the menus' raster -- two 640 x 448 RGBA frames made a tick (`./uiCompositorView`), ~69 MB/s of garbage into a canvas
 *   the match hides -- is skipped; the session still advances every tick (the lobby and the match tick through it), so
 *   the menus' state is current and the first tick after the return draws it;
 * - the movie worker (its WASM heap and frame pool) is ended when no movie is open (`./frontEndMovies`
 *   `FrontEndMovies.sleep`); the next movie's open makes a fresh one.
 *
 * Every other player keeps today's behaviour. Nothing the game does changes: the original's menus are not drawn under
 * its match either.
 */

/** The Xbox preset's word (`./graphicsBackend` `GraphicsBackendPreference`). */
const XBOX = 'xbox';

/** Whether the page rasterizes the menus this tick: always, but under the Xbox preset while a match is up over them. */
export function menuRasterWanted(matchUp: boolean, graphics: string): boolean {
  return !matchUp || graphics !== XBOX;
}

/** Whether the page ends the idle movie worker when a match takes over: under the Xbox preset only. */
export function movieWorkerSleeps(graphics: string): boolean {
  return graphics === XBOX;
}
