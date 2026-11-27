import { asksForWebGPU, graphicsBackendOverride, readGraphicsBackend } from './graphicsBackend';
import { appleGraphics, classGraphics, pageAppleGpu, pageDeviceClass } from './deviceClass';
import { pageSoftwareProbe } from './softwareRenderer';
import { webgpuAnswers, type GpuLike } from './adapterWait';
import { frontRefusedWebgl2 } from './frontGpuVerdict';
/**
 * LATER 1265 part 2 (`MATCH_ENTRY_NO_WEBGL2_ADAPTATION`; the main controller's GO, 2026-11-20; product track, a browser
 * adaptation with no original -- the launch, the room and the match run as they would): a page whose renderer probe made no
 * WebGL2 (`./softwareRenderer` `SoftwareProbe.webgl2`), and that will not draw on WebGPU, is shown the reason again as its
 * match starts, with a choice: try anyway (the notice goes, the match loads as it was already doing) or leave the game (the
 * front end's own way out of a loading match, `LobbyMatch.leaveLoading`: the ABORT return). Never a hard block: a browser can still surprise us.
 * v0.4.27's field: an Apple M1 Max on Chromium with WebGL blocked went into four matches that each died at 3 s with no
 * backend, its front's notice dismissed or not seen.
 */
export const MATCH_ENTRY_NO_WEBGL2_ADAPTATION = 'a page with no WebGL2 that will not use WebGPU is asked at its match start: try anyway or leave' as const;

/** The notice's words: what is wrong, what fixes it, and that the choice is the player's. */
export const MATCH_ENTRY_NO_WEBGL2_TEXT = 'This browser is not giving the game WebGL2, so this match will probably have nothing to draw with. Closing the browser completely and opening it again usually lifts it.';
export const MATCH_ENTRY_TRY_LABEL = 'Try anyway';
export const MATCH_ENTRY_LEAVE_LABEL = 'Leave game';

const MARK = 'data-match-entry-confirm';

/**
 * Whether to ask: no WebGL2 -- the boot probe's verdict (not unknown), or the front's own surface refused it (its pair
 * review's F3) -- and WebGPU will not draw the match.
 */
export function entryNeedsConfirm(probe: { webgl2?: boolean }, willUseWebGPU: boolean, frontNoWebgl2 = false): boolean {
  return (probe.webgl2 === false || frontNoWebgl2) && !willUseWebGPU;
}

/** One notice on the page (replacing an earlier one): the reason and the two choices. Leave runs once. */
export function showMatchEntryConfirm(doc: Document, o: { leave: () => void }): HTMLElement {
  doc.querySelector(`[${MARK}]`)?.remove();
  const el = doc.createElement('div');
  el.setAttribute(MARK, '');
  el.setAttribute('role', 'alertdialog');
  // The design system's notice panel (`./matchNoBackend`'s placement, one layer under it).
  el.className = 's2u-notice';
  el.style.position = 'fixed';
  el.style.left = '50%';
  el.style.top = '168px';                                      // below the no-backend notice (12 px) and graphics-lost's 64/116 px slots
  el.style.transform = 'translateX(-50%)';
  el.style.zIndex = '2147483646';
  el.style.maxWidth = '90vw';
  el.style.margin = '0';
  el.style.textAlign = 'center';
  const line = doc.createElement('p');
  line.textContent = MATCH_ENTRY_NO_WEBGL2_TEXT;
  const tryIt = doc.createElement('button');
  tryIt.type = 'button';
  tryIt.className = 's2u-chip';
  tryIt.textContent = MATCH_ENTRY_TRY_LABEL;
  tryIt.addEventListener('click', () => { el.remove(); });
  const leave = doc.createElement('button');
  leave.type = 'button';
  leave.className = 's2u-chip';
  leave.textContent = MATCH_ENTRY_LEAVE_LABEL;
  leave.addEventListener('click', () => {
    if (leave.disabled) return;
    leave.disabled = true;
    el.remove();
    try { o.leave(); } catch { /* the leave's own failure: nothing more here */ }
  });
  el.append(line, tryIt, leave);
  (doc.body ?? doc.documentElement).append(el);
  return el;
}

/**
 * Whether the match will draw on WebGPU -- the decision `./renderer` `createRenderer` makes: the choice (Automatic read
 * against the device class, `asksForWebGPU`) AND the adapter's own answer (`./adapterWait` `webgpuAnswers`, bounded),
 * never `navigator.gpu`'s mere presence (its pair review's F1: a Chromium with its GPU blocked still has `navigator.gpu`).
 */
export async function willUseWebGPU(): Promise<boolean> {
  const chosen = readGraphicsBackend();
  const classed = chosen === 'auto' || chosen === 'webgpu' ? classGraphics(chosen, pageDeviceClass(), graphicsBackendOverride() !== null) : chosen;
  // Its review's F1 (pilot/kill/keyjob-later1265-review.md): MAC-FLOOR step 1, as `./renderer` `createRenderer` takes it
  // (renderer.ts, `appleGraphics`): on an Apple GPU a resolved Automatic draws WebGL2, so WebGPU is not used even where an
  // adapter would answer -- the row's own M1 Max. Keep this in step with the renderer's choice.
  const graphics = classed === 'auto' ? appleGraphics(classed, pageAppleGpu()) : classed;
  if (!asksForWebGPU(graphics)) return false;
  return webgpuAnswers((globalThis.navigator as Navigator & { gpu?: GpuLike } | undefined)?.gpu);
}

/** How often a shown confirm checks that its match still runs (its pair review's F4: gone when the match ends). */
const ACTIVE_CHECK_MS = 500;

/**
 * The front end's match start: asks when it should (`entryNeedsConfirm`), once WebGPU has answered, while the match still
 * runs (`active`); `leave` is the front end's way out (`LobbyMatch.leaveLoading`, the ABORT return). The confirm goes when
 * the match ends another way. True when it asked. Never stops a match by failing.
 */
export async function gateMatchEntry(
  doc: Document | undefined,
  o: { leave: () => void; active: () => boolean },
  deps: { probe?: () => { webgl2?: boolean }; front?: () => boolean; webgpu?: () => Promise<boolean> } = {},
): Promise<boolean> {
  if (!doc) return false;
  try {
    const probe = (deps.probe ?? pageSoftwareProbe)();
    const front = (deps.front ?? frontRefusedWebgl2)();
    if (probe.webgl2 !== false && !front) return false;          // nothing to ask: no adapter request at all
    const webgpu = await (deps.webgpu ?? willUseWebGPU)();
    if (!o.active() || !entryNeedsConfirm(probe, webgpu, front)) return false;
    const el = showMatchEntryConfirm(doc, { leave: o.leave });
    const timer = globalThis.setInterval(() => {
      if (!el.isConnected) { globalThis.clearInterval(timer); return; }
      if (!o.active()) { el.remove(); globalThis.clearInterval(timer); }
    }, ACTIVE_CHECK_MS);
    return true;
  } catch { return false; }
}
