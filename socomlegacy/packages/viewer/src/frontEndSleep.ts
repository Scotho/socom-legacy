/**
 * Browser adaptation (no original; product track): what the front end lets rest while a lobby-mounted match is up over
 * it (`./frontEnd` `mountFrontEnd`, from the match's `leave` to its `returned`). Nothing the game does changes: the
 * original's menus are not running in a match, and are not drawn under it.
 *
 * - The menus' raster -- the software rasterizer's two 640 x 448 RGBA frames a tick (`./uiCompositorView`) into a canvas
 *   the match hides -- is skipped under every graphics preset. PR #631 rested it under the Xbox preset alone (#627's
 *   opt-in, `./graphicsBackend`: a device with about 1 GB for the whole browser, ~69 MB/s of garbage); CPS-1a (the
 *   client performance sprint's hypothesis H1, `test/lobbyTickCost.test.ts`, measured 2026-11-02 on an i7-14700K) found
 *   the full 16-seat game lobby's `render` at 11.0 ms p50 / 18.5 p95 / 34.2 max a tick, about 38% of one core at 29.97
 *   ticks a second, under every match on every other preset; resting it there too is the owner's call, H397 (GM-24 of
 *   the GPU menus plan). The session's `advance` -- the lobby's and the socket's frames and the dialog machine's frame
 *   (1.6 ms a tick in the same measure) -- still runs every tick (the lobby and the match tick through it), so the
 *   menus' state on the return is the same as had they been drawn (the raster reads the draw list, never writes the
 *   session: `test/frontEndSleep.test.ts`), and the first tick after the return draws it.
 * - The movie worker (its WASM heap and frame pool) is ended when no movie is open (`./frontEndMovies`
 *   `FrontEndMovies.sleep`), under the Xbox preset (PR #631) and on a page of the Xbox class (VS-10 F1, the video spec
 *   §4.4 item 2: the class takes the preset's set): a worker asleep is a cold start on the return to the menus, a
 *   separate call from the raster's; the next movie's open makes a fresh one.
 */
import { pageDeviceClass } from './deviceClass';
import { readGraphicsBackend } from './graphicsBackend';

/** The Xbox preset's word (`./graphicsBackend` `GraphicsBackendPreference`). */
const XBOX = 'xbox';

/**
 * Whether the page rasterizes the menus this tick: not while a match is up over them, under any preset (H397 / GM-24);
 * always otherwise. `graphics` is kept for the page's call (`./frontEnd`'s loop) and beside `movieWorkerSleeps`' rule.
 */
export function menuRasterWanted(matchUp: boolean, _graphics: string): boolean {
  return !matchUp;
}

/** Whether the page ends the idle movie worker when a match takes over: under the Xbox preset, or on a page of the Xbox class (VS-10 F1). */
export function movieWorkerSleeps(graphics: string): boolean {
  return graphics === XBOX || pageDeviceClass() === XBOX;
}

/**
 * VS-10 F1 (a browser adaptation, product track; the video spec §4.4 item 2): whether the page takes the Xbox preset's
 * memory measures (PR #631) -- the saved Xbox pick, or a page of the Xbox class with no pick saved (`./deviceClass`, VS.R1).
 * The front end passes it to the outputs it builds (`./audio` `WebAudioOut`'s `releaseLoopSamples`), so the sound module
 * reads no device class itself.
 */
export function xboxMemoryMeasures(): boolean {
  return readGraphicsBackend() === XBOX || pageDeviceClass() === XBOX;
}
