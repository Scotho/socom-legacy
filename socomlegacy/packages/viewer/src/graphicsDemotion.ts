import { GRAPHICS_BACKEND_KEY, graphicsBackendOverride, readGraphicsBackend, saveGraphicsBackend } from './graphicsBackend';
import { onGraphicsEvent, showGraphicsDemoted, tellGraphicsDemoted, type GraphicsEventKind } from './graphicsLost';
import { pageSettings } from './pageStore';
import { readPreference, savePreference } from './startupSettings';

/**
 * WG-7, W5 -- the WebGPU auto-demotion (product track, **a browser adaptation with no original**: the renderer's backend
 * is not the game's; investigation B, 2026-11-07, §6 criterion 5). With Automatic asking WebGPU first
 * (`DEFAULT_GRAPHICS_BACKEND_ADAPTATION`, LATER 708), a WebGPU page that loses its device or reports its FIRST uncaptured
 * GPU error (`./graphicsLost`'s watchers) saves WebGL2 (`webgl2`) under the Graphics mode key, writes a one-line
 * reason beside it, puts a reload notice on the page and tells the graphics listeners (the client error beacon's) once --
 * so this browser's next load draws on WebGL2. Only Automatic is demoted: an address override (`?renderer=`) is never
 * overwritten, nor an explicit WebGPU choice (the player's own). Choosing a Graphics mode again clears the reason
 * (`console/adapters/options.ts`). It changes nothing the game does.
 */
export const GRAPHICS_DEMOTED_KEY = 's2u.viewer.graphicsDemoted';

/** The reason's cap: one line, short enough for a settings row's note and the beacon's message. */
const REASON_CAP = 200;

let armed = false;
let done = false;

/** The one-line reason: what failed, the UTC time, the browser's message on one line, capped. */
export function graphicsDemotionReason(kind: 'gpudevicelost' | 'gpuuncapturederror', info: { message: string; detail: string | null }, at: Date): string {
  const what = kind === 'gpudevicelost' ? 'WebGPU device lost' : `WebGPU ${info.detail || 'GPUError'}`;
  const message = info.message.replace(/\s*[|\r\n]+\s*/g, ' / ').trim();
  const line = `${what} at ${at.toISOString().slice(11, 19)}Z: ${message}`;
  return line.length > REASON_CAP ? `${line.slice(0, REASON_CAP)}...` : line;
}

/** The saved reason, while WebGL2 is still the saved choice; null otherwise. */
export function readGraphicsDemoted(): string | null {
  if (readPreference(GRAPHICS_BACKEND_KEY) !== 'webgl2') return null;
  const why = readPreference(GRAPHICS_DEMOTED_KEY);
  return why ? why : null;
}

/** The reason forgotten: the player chose a Graphics mode. */
export function clearGraphicsDemoted(): void {
  try { pageSettings.remove(GRAPHICS_DEMOTED_KEY); } catch { /* a refused store: nothing kept */ }
}

/**
 * Arms the demotion for this page (once; a page that makes several renderers arms it once). `search` is the address's
 * query, read at the event; `now` the clock for the reason. `createRenderer` calls it only when it built on WebGPU.
 */
export function armGraphicsDemotion(doc: Document | undefined = globalThis.document, search: string | (() => string) = () => globalThis.location?.search ?? '', now: () => Date = () => new Date()): void {
  if (armed) return;
  armed = true;
  const query = (): string => (typeof search === 'function' ? search() : search);
  onGraphicsEvent((kind: GraphicsEventKind, info) => {
    if (done || (kind !== 'gpudevicelost' && kind !== 'gpuuncapturederror')) return;
    done = true;   // the first WebGPU failure decides, whether or not it demotes
    const q = query();
    if (graphicsBackendOverride(q) !== null || readGraphicsBackend(q) !== 'auto') return;
    const reason = graphicsDemotionReason(kind, info, now());
    saveGraphicsBackend('webgl2');
    savePreference(GRAPHICS_DEMOTED_KEY, reason);
    if (doc) { try { showGraphicsDemoted(doc); } catch { /* a page being torn down */ } }
    tellGraphicsDemoted(reason);
  });
}

/** Tests only: disarmed (the listener itself goes with `resetGraphicsRecordForTest`). */
export function resetGraphicsDemotionForTest(): void { armed = false; done = false; }
